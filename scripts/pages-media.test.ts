import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, truncate, symlink, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { MAX_FILE_BYTES, selectOriginal, parseManifest, validateStaticTree, pathKeyFor, assertNoKeyCollisions } from './pages-media.ts';
import { parseCuration } from './curation.ts';
import { packageMedia } from './package-media.ts';
import { extractRunScripts } from './workflow-security.ts';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const nasa = 'https://images-assets.nasa.gov/image/example/example~orig.jpg';
const prefix = 'photos/example/123456789abc/';
test('GAL-05 MEDIA-05: original download switches only above 25 MiB, preserving NASA URL and measured bytes', () => {
  assert.equal(selectOriginal(nasa, MAX_FILE_BYTES, prefix + 'original.jpg').kind, 'local');
  const large = selectOriginal(nasa, MAX_FILE_BYTES + 1, prefix + 'original.jpg');
  assert.deepEqual(large, { kind: 'nasa', sourceUrl: nasa, sizeBytes: MAX_FILE_BYTES + 1 });
  for (const url of ['http://images.nasa.gov/a', 'https://nasa.gov.evil.test/a', 'https://user@nasa.gov/a']) {
    assert.throws(() => selectOriginal(url, 1, prefix + 'original.jpg'));
  }
  assert.throws(() => selectOriginal(nasa, -1, 'original.jpg'));
  assert.deepEqual(selectOriginal('https://images-assets.nasa.gov/image/NHQ202604110008/NHQ202604110008~orig.jpg', 33_976_190, 'unused'), {
    kind: 'nasa', sourceUrl: 'https://images-assets.nasa.gov/image/NHQ202604110008/NHQ202604110008~orig.jpg', sizeBytes: 33_976_190,
  });
});
test('MEDIA-03/05: manifest refuses traversal, missing metadata and mislabelled originals', () => {
  const photo = { nasaId: 'example', pathKey: 'example', hash: '123456789abc', variants: [prefix + '480.avif'],
    original: selectOriginal(nasa, MAX_FILE_BYTES + 1, prefix + 'original.jpg') };
  assert.equal(parseManifest({ photos: [photo] }).photos[0]!.original.kind, 'nasa');
  assert.throws(() => parseManifest({ photos: [{ ...photo, variants: [prefix + '../escape.jpg'] }] }));
  assert.throws(() => parseManifest({ photos: [{ ...photo, original: { ...photo.original, kind: 'local', path: prefix + 'original.jpg' } }] }));
  assert.throws(() => parseManifest({ photos: [{ ...photo, original: { kind: 'nasa', sourceUrl: nasa } }] }));
});
test('MEDIA-03 MEDIA-04 SEC-08 AC-3b: exact NASA IDs with spaces keep their ID, get a safe key, and unsafe paths stay rejected', async () => {
  const doc = await readFile('CURATION.md', 'utf8');
  const { mission, launch } = parseCuration(doc);
  const ids = [...mission.rows, ...launch.rows].map((r) => r.nasaId);
  const spaced = ids.filter((id) => id.includes(' '));
  assert.deepEqual(spaced, ['Artemis II at the pad Moon 01292026_4', 'KSC-04012026-Artemis II_Launch-1']);
  assert.doesNotThrow(() => assertNoKeyCollisions(ids));
  for (const id of ids) if (!id.includes(' ')) assert.equal(pathKeyFor(id), id);
  assert.equal(pathKeyFor('KSC-04012026-Artemis II_Launch-1'), 'KSC-04012026-Artemis_II_Launch-1');
  assert.throws(() => assertNoKeyCollisions(['a b', 'a_b']), /collision/);
  for (const bad of ['', ' lead', 'trail ', 'a  b\u00a0c', '../x', 'a%20b', 'a/b', 'a\nb']) {
    // Slashes, dots and percent signs are replaced, never passed through; whitespace oddities and traversal-only IDs fail.
    if (/^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/.test(bad)) assert.match(pathKeyFor(bad), /^[A-Za-z0-9_-]+$/);
    else assert.throws(() => pathKeyFor(bad));
  }
  for (const id of spaced) {
    const key = pathKeyFor(id); const dir = `photos/${key}/123456789abc/`;
    const photo = { nasaId: id, pathKey: key, hash: '123456789abc', variants: [dir + 'w480.avif'], original: selectOriginal(nasa, MAX_FILE_BYTES + 1, '') };
    assert.equal(parseManifest({ photos: [photo] }).photos[0]!.nasaId, id);
    assert.throws(() => parseManifest({ photos: [{ ...photo, pathKey: id }] }), /Path key/);
    assert.throws(() => parseManifest({ photos: [{ ...photo, variants: [`photos/${id}/123456789abc/w480.avif`] }] }));
    assert.throws(() => parseManifest({ photos: [{ ...photo, variants: [dir + '../w480.avif'] }] }));
    assert.throws(() => parseManifest({ photos: [{ ...photo, variants: [dir + 'w 480.avif'] }] }));
    assert.throws(() => parseManifest({ photos: [{ ...photo, variants: [dir + 'w%20.avif'] }] }));
  }
  assert.throws(() => parseManifest({ photos: [
    { nasaId: 'a b', pathKey: 'a_b', hash: '123456789abc', variants: ['photos/a_b/123456789abc/w1.avif'], original: selectOriginal(nasa, MAX_FILE_BYTES + 1, '') },
    { nasaId: 'a_b', pathKey: 'a_b', hash: '123456789abc', variants: ['photos/a_b/123456789abc/w1.avif'], original: selectOriginal(nasa, MAX_FILE_BYTES + 1, '') },
  ] }), /Duplicate media path key/);
});
test('TECH-04 QA-06 AC-8: complete artifact accepts exactly 25 MiB and 20000 files; rejects excess and symlinks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pages-limits-'));
  try {
    const large = join(dir, 'large');
    await writeFile(large, '');
    await truncate(large, MAX_FILE_BYTES);
    assert.equal(await validateStaticTree(dir), 1);
    await truncate(large, MAX_FILE_BYTES + 1);
    await assert.rejects(validateStaticTree(dir), /25 MiB/);
    await truncate(large, 0);
    // Batch filesystem work; include nested and hidden files in the total.
    await mkdir(join(dir, 'nested'));
    for (let start = 0; start < 19999; start += 200) {
      await Promise.all(Array.from({ length: Math.min(200, 19999 - start) }, (_, i) => writeFile(join(dir, 'nested', `.f${start + i}`), '')));
    }
    assert.equal(await validateStaticTree(dir), 20000);
    await writeFile(join(dir, 'extra'), '');
    await assert.rejects(validateStaticTree(dir), /20000/);
    await rm(join(dir, 'extra'));
    await symlink('missing', join(dir, 'link'));
    await assert.rejects(validateStaticTree(dir), /Non-regular/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('MEDIA-04 MEDIA-05 AC-3b: package requires referenced files and original size; packages both spaced IDs and oversized NASA records without a local oversized original', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pages-package-'));
  try {
    const media = join(dir, 'generated'); const site = join(dir, 'dist');
    const id1 = 'Artemis II at the pad Moon 01292026_4';
    const key1 = pathKeyFor(id1);
    const prefix1 = `photos/${key1}/123456789abc/`;
    const url1 = 'https://images-assets.nasa.gov/image/Artemis%20II%20at%20the%20pad%20Moon%2001292026_4/Artemis%20II%20at%20the%20pad%20Moon%2001292026_4~orig.jpg';
    const id2 = 'KSC-04012026-Artemis II_Launch-1';
    const key2 = pathKeyFor(id2);
    const prefix2 = `photos/${key2}/abcdef012345/`;
    const url2 = 'https://images-assets.nasa.gov/image/KSC-04012026-Artemis%20II_Launch-1/KSC-04012026-Artemis%20II_Launch-1~orig.jpg';

    await mkdir(join(media, prefix1), { recursive: true });
    await mkdir(join(media, prefix2), { recursive: true });
    await mkdir(site);
    await writeFile(join(site, 'index.html'), '<html></html>');
    const photo1 = {
      nasaId: id1,
      pathKey: key1,
      hash: '123456789abc',
      variants: [prefix1 + 'w480.webp'],
      original: selectOriginal(url1, 3, prefix1 + 'original.jpg', createHash('sha256').update('jpg').digest('hex')),
    };
    const photo2 = {
      nasaId: id2,
      pathKey: key2,
      hash: 'abcdef012345',
      variants: [prefix2 + 'w480.avif'],
      original: selectOriginal(url2, MAX_FILE_BYTES + 1, ''),
    };
    await writeFile(join(media, 'manifest.json'), JSON.stringify({ photos: [photo1, photo2] }));
    await assert.rejects(packageMedia(media, site));
    await writeFile(join(media, prefix1, 'w480.webp'), 'image-1');
    await writeFile(join(media, prefix2, 'w480.avif'), 'image-2');
    await writeFile(join(media, prefix1, 'original.jpg'), 'wrong size');
    await assert.rejects(packageMedia(media, site), /size mismatch/);
    await writeFile(join(media, prefix1, 'original.jpg'), 'jpg');
    await packageMedia(media, site);
    assert.equal(await readFile(join(site, 'media', prefix1, 'original.jpg'), 'utf8'), 'jpg');
    assert.equal(await readFile(join(site, 'media', prefix1, 'w480.webp'), 'utf8'), 'image-1');
    assert.equal(await readFile(join(site, 'media', prefix2, 'w480.avif'), 'utf8'), 'image-2');
    await assert.rejects(stat(join(site, 'media', prefix2, 'original.jpg')));
    const packagedManifest = parseManifest(JSON.parse(await readFile(join(site, 'media', 'manifest.json'), 'utf8')));
    assert.deepEqual(packagedManifest.photos.map((p) => p.nasaId), [id1, id2]);
    assert.deepEqual(packagedManifest.photos.map((p) => p.pathKey), [key1, key2]);
    assert.deepEqual(packagedManifest.photos[1]!.original, { kind: 'nasa', sourceUrl: url2, sizeBytes: MAX_FILE_BYTES + 1 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
for (const folder of ['.github/workflows', 'pipeline/github/workflows']) {
  test(`MEDIA-04 AC-8: ${folder} has no R2 operations; every build packages /media and deploy revalidates data`, async () => {
    for (const name of ['media', 'ci', 'preview-build', 'deploy-preview', 'deploy-staging', 'deploy-production']) {
      const text = await readFile(`${folder}/${name}.yml`, 'utf8');
      assert.doesNotMatch(text, /R2_|s3 sync|s3 cp|cloudflarestorage|secrets: inherit/);
      if (['preview-build', 'deploy-staging', 'deploy-production'].includes(name)) {
        assert.match(text, /MEDIA_BASE_URL: \/media/);
        assert.match(text, /node scripts\/package-media\.ts media-out dist/);
        assert.ok(text.indexOf('package-media.ts') < text.indexOf('actions/upload-artifact'));
      }
      if (['deploy-staging', 'deploy-production'].includes(name)) {
        assert.match(text, /npm ci --ignore-scripts/);
        assert.ok(text.indexOf('npm ci --ignore-scripts') < text.indexOf('node scripts/smoke.ts'));
      }
      if (name.startsWith('deploy-')) {
        const validation = extractRunScripts(text).find(s => s.includes('Pages file exceeds 25 MiB'));
        assert.ok(validation);
        const dir = await mkdtemp(join(tmpdir(), 'pages-deploy-'));
        try {
          await mkdir(join(dir, 'site')); await writeFile(join(dir, 'site/index.html'), 'html');
          const run = () => execFileSync('bash', ['-eu', '-c', validation], { cwd: dir, stdio: 'pipe' });
          assert.doesNotThrow(run);
          if (folder === '.github/workflows' && name === 'deploy-staging') {
            await mkdir(join(dir, 'site/nested'));
            for (let start = 0; start < 19999; start += 200) {
              await Promise.all(Array.from({ length: Math.min(200, 19999 - start) }, (_, i) => writeFile(join(dir, 'site/nested', `.f${start + i}`), '')));
            }
            assert.doesNotThrow(run, 'deployer accepts exactly 20000 files');
            await writeFile(join(dir, 'site/extra'), '');
            assert.throws(run, 'deployer rejects 20001 files');
            await rm(join(dir, 'site/extra'));
            await rm(join(dir, 'site/nested'), { recursive: true });
          }
          await writeFile(join(dir, 'site/oversized'), ''); await truncate(join(dir, 'site/oversized'), MAX_FILE_BYTES);
          assert.doesNotThrow(run, 'deployer accepts exactly 25 MiB');
          await truncate(join(dir, 'site/oversized'), MAX_FILE_BYTES + 1);
          assert.throws(run);
          await rm(join(dir, 'site/oversized'));
          await symlink('missing', join(dir, 'site/link'));
          assert.throws(run, 'deployer rejects symlinks');
          await rm(join(dir, 'site/link'));
          await mkdir(join(dir, 'site/functions'));
          assert.throws(run, 'Functions cannot be enabled');
        } finally { await rm(dir, { recursive: true, force: true }); }
      }
    }
  });
}
