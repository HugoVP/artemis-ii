import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, truncate, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_FILE_BYTES, selectOriginal, parseManifest, validateStaticTree } from './pages-media.ts';
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
  const photo = { nasaId: 'example', hash: '123456789abc', variants: [prefix + '480.avif'],
    original: selectOriginal(nasa, MAX_FILE_BYTES + 1, prefix + 'original.jpg') };
  assert.equal(parseManifest({ photos: [photo] }).photos[0]!.original.kind, 'nasa');
  assert.throws(() => parseManifest({ photos: [{ ...photo, variants: [prefix + '../escape.jpg'] }] }));
  assert.throws(() => parseManifest({ photos: [{ ...photo, original: { ...photo.original, kind: 'local', path: prefix + 'original.jpg' } }] }));
  assert.throws(() => parseManifest({ photos: [{ ...photo, original: { kind: 'nasa', sourceUrl: nasa } }] }));
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
test('MEDIA-04: package requires referenced files and original size; packages HTML and media together', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pages-package-'));
  try {
    const media = join(dir, 'generated'); const site = join(dir, 'dist');
    await mkdir(join(media, prefix), { recursive: true }); await mkdir(site);
    await writeFile(join(site, 'index.html'), '<html></html>');
    const photo = { nasaId: 'example', hash: '123456789abc', variants: [prefix + '480.webp'], original: selectOriginal(nasa, 3, prefix + 'original.jpg') };
    await writeFile(join(media, 'manifest.json'), JSON.stringify({ photos: [photo] }));
    await assert.rejects(packageMedia(media, site));
    await writeFile(join(media, prefix, '480.webp'), 'image');
    await writeFile(join(media, prefix, 'original.jpg'), 'wrong size');
    await assert.rejects(packageMedia(media, site), /size mismatch/);
    await writeFile(join(media, prefix, 'original.jpg'), 'jpg');
    await packageMedia(media, site);
    assert.equal(await readFile(join(site, 'media', prefix, 'original.jpg'), 'utf8'), 'jpg');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
for (const folder of ['.github/workflows', 'pipeline/github/workflows']) {
  test(`MEDIA-04 AC-8: ${folder} has no R2 operations; every build packages /media and deploy revalidates data`, async () => {
    for (const name of ['media', 'ci', 'preview-build', 'deploy-preview', 'deploy-staging', 'deploy-production']) {
      const text = await readFile(`${folder}/${name}.yml`, 'utf8');
      assert.doesNotMatch(text, /R2_|s3 sync|s3 cp|cloudflarestorage|secrets: inherit/);
      if (['preview-build', 'deploy-staging', 'deploy-production'].includes(name)) {
        assert.match(text, /MEDIA_BASE_URL: \/media/);
        assert.match(text, /node scripts\/package-media.ts media-out dist/);
        assert.ok(text.indexOf('package-media.ts') < text.indexOf('actions/upload-artifact'));
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
