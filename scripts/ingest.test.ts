import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ingest, originalUrlFor, download, NASA_ORIGIN } from './ingest.ts';
import { parseCuration, type Candidate } from './curation.ts';
import { MAX_FILE_BYTES, readManifest } from './pages-media.ts';

const SPACED = 'KSC-04012026-Artemis II_Launch-1';
const SAFE = 'art002e000192';

async function jpeg(seed: number): Promise<Buffer> {
  const raw = Buffer.alloc(64 * 48 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7 + seed * 31) % 251;
  return sharp(raw, { raw: { width: 64, height: 48, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}
const candidate = (nasaId: string, bytes: number): Candidate => ({
  nasaId, chapter: 'launch', record: 'https://images.nasa.gov/details/x', original: originalUrlFor(nasaId), bytes, why: 'fixture',
});

interface Fixture { origin: string; files: Map<string, Buffer>; requests: string[]; close: () => Promise<void>; server: Server }
async function fixture(): Promise<Fixture> {
  const files = new Map<string, Buffer>(); const requests: string[] = [];
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    requests.push(url);
    if (url.startsWith('/redirect-out/')) { res.writeHead(302, { location: `http://localhost:${(server.address() as { port: number }).port}/elsewhere` }); res.end(); return; }
    if (url.startsWith('/redirect-in/')) { res.writeHead(302, { location: url.replace('/redirect-in/', '/image/') }); res.end(); return; }
    const body = files.get(url);
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': body.length }); res.end(body);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { origin, files, requests, server, close: async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); } };
}
const urlPath = (id: string) => `/image/${encodeURIComponent(id)}/${encodeURIComponent(id)}~orig.jpg`;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function withFixture(run: (f: Fixture, dir: string) => Promise<void>): Promise<void> {
  const f = await fixture(); const dir = await mkdtemp(join(tmpdir(), 'ingest-'));
  try { await run(f, dir); } finally { await f.close(); await rm(dir, { recursive: true, force: true }); }
}

test('MEDIA-02 SEC-08 AC-1: ingest generates AVIF/WebP widths, thumbnail, 1200x630 OG and a manifest, with no credentials', async () => {
  await withFixture(async (f, dir) => {
    const source = await jpeg(1); f.files.set(urlPath(SAFE), source);
    const manifest = await ingest({ candidates: [candidate(SAFE, source.length)], outDir: join(dir, 'out'), lockPath: join(dir, 'lock.json'),
      build: false, sourceOrigin: f.origin });
    const photo = manifest.photos[0]!;
    const names = photo.variants.map((v) => v.split('/').pop());
    assert.ok(names.some((n) => n?.endsWith('.avif')) && names.some((n) => n?.endsWith('.webp')) && names.includes('thumb.webp') && names.includes('og.jpg'));
    const og = await sharp(await readFile(join(dir, 'out', photo.variants.find((v) => v.endsWith('og.jpg'))!))).metadata();
    assert.deepEqual([og.width, og.height], [1200, 630]);
    // The tiny fixture is never upscaled: no variant is wider than the source.
    for (const v of photo.variants.filter((v) => v.endsWith('.avif'))) {
      assert.ok((await sharp(await readFile(join(dir, 'out', v))).metadata()).width! <= 64);
    }
    assert.deepEqual(await readManifest(join(dir, 'out', 'manifest.json')), manifest);
  });
});

test('SEC-08 AC-1: downloads outside the allowed origin are refused, including after a redirect', async () => {
  await withFixture(async (f) => {
    await assert.rejects(download('https://example.com/a.jpg', f.origin), /Refusing to download/);
    await assert.rejects(download(`${f.origin}/redirect-out/x`, f.origin), /Refusing to download/);
    f.files.set('/image/ok.jpg', Buffer.from('ok'));
    assert.equal(Buffer.from(await download(`${f.origin}/redirect-in/ok.jpg`, f.origin)).toString(), 'ok');
    assert.equal(NASA_ORIGIN, 'https://images-assets.nasa.gov');
    await assert.rejects(download('http://images-assets.nasa.gov/image/a/a~orig.jpg', NASA_ORIGIN), /Refusing to download/);
    await assert.rejects(download('https://images-assets.nasa.gov.evil.test/a', NASA_ORIGIN), /Refusing to download/);
  });
});

test('MEDIA-03 AC-2: second run downloads nothing; changed source or tool output fails without overwriting', async () => {
  await withFixture(async (f, dir) => {
    const source = await jpeg(2); f.files.set(urlPath(SAFE), source);
    const options = { candidates: [candidate(SAFE, source.length)], outDir: join(dir, 'out'), lockPath: join(dir, 'lock.json'), sourceOrigin: f.origin };
    const first = await ingest({ ...options, build: false });
    assert.match(first.photos[0]!.variants[0]!, new RegExp(`^photos/${SAFE}/[a-f0-9]{16}/`));
    const downloads = f.requests.length;
    const second = await ingest({ ...options, build: true });
    assert.equal(f.requests.length, downloads, 'no new download');
    assert.deepEqual(second, first);
    // A changed source (same length, different bytes) is drift, never a silent new identity.
    const changed = Buffer.from(source); changed[changed.length - 20] ^= 0xff; f.files.set(urlPath(SAFE), changed);
    await rm(join(dir, 'out'), { recursive: true });
    await assert.rejects(ingest({ ...options, build: true }), /source drift/);
    // Tampered lock output checksum: output drift.
    f.files.set(urlPath(SAFE), source);
    const lock = JSON.parse(await readFile(options.lockPath, 'utf8'));
    lock.photos[SAFE].files['thumb.webp'] = '0'.repeat(64);
    await writeFile(options.lockPath, JSON.stringify(lock));
    await assert.rejects(ingest({ ...options, build: true }), /output drift/);
    // The pipeline never writes the lock and refuses IDs it does not list.
    const other = await jpeg(3); f.files.set(urlPath('other-id'), other);
    await assert.rejects(ingest({ ...options, candidates: [candidate('other-id', other.length)], build: true }), /not in the media lock/);
    await assert.rejects(ingest({ ...options, build: true, update: true }), /--update/);
  });
});

test('MEDIA-05 AC-3: originals up to the limit are byte-identical local copies; larger ones are external records', async () => {
  await withFixture(async (f, dir) => {
    const small = await jpeg(4); f.files.set(urlPath(SAFE), small);
    const large = Buffer.concat([await jpeg(5), Buffer.alloc(MAX_FILE_BYTES + 1 - (await jpeg(5)).length)]);
    assert.equal(large.length, MAX_FILE_BYTES + 1);
    f.files.set(urlPath('large-id'), large);
    const manifest = await ingest({ candidates: [candidate(SAFE, small.length), candidate('large-id', large.length)],
      outDir: join(dir, 'out'), lockPath: join(dir, 'lock.json'), build: false, sourceOrigin: f.origin });
    const [local, external] = manifest.photos;
    assert.equal(local!.original.kind, 'local');
    assert.ok(local!.original.kind === 'local');
    assert.deepEqual(await readFile(join(dir, 'out', local!.original.path)), small);
    assert.equal(local!.original.sha256, sha(small));
    assert.deepEqual(external!.original, { kind: 'nasa', sourceUrl: originalUrlFor('large-id'), sizeBytes: MAX_FILE_BYTES + 1 });
    const files = await readdir(join(dir, 'out', 'photos', 'large-id', external!.hash));
    assert.ok(!files.includes('original.jpg'), 'no local binary for an oversized original');
    for (const name of files) assert.ok((await stat(join(dir, 'out', 'photos', 'large-id', external!.hash, name))).size < MAX_FILE_BYTES);
  });
});

test('MEDIA-03 MEDIA-04 SEC-08 AC-3b: IDs with spaces keep their exact ID, use a safe key and encoded URLs; colliding keys fail', async () => {
  await withFixture(async (f, dir) => {
    const source = await jpeg(6); f.files.set(urlPath(SPACED), source);
    const manifest = await ingest({ candidates: [candidate(SPACED, source.length)], outDir: join(dir, 'out'), lockPath: join(dir, 'lock.json'),
      build: false, sourceOrigin: f.origin });
    const photo = manifest.photos[0]!;
    assert.equal(photo.nasaId, SPACED);
    assert.equal(photo.pathKey, 'KSC-04012026-Artemis_II_Launch-1');
    for (const path of photo.variants) assert.match(path, /^photos\/KSC-04012026-Artemis_II_Launch-1\/[a-f0-9]{16}\/[A-Za-z0-9_-]+\.[a-z]+$/);
    assert.equal(photo.original.sourceUrl, 'https://images-assets.nasa.gov/image/KSC-04012026-Artemis%20II_Launch-1/KSC-04012026-Artemis%20II_Launch-1~orig.jpg');
    assert.ok(f.requests.includes('/image/KSC-04012026-Artemis%20II_Launch-1/KSC-04012026-Artemis%20II_Launch-1~orig.jpg'));
    await assert.rejects(ingest({ candidates: [candidate('a b', 1), candidate('a_b', 1)], outDir: join(dir, 'x'), lockPath: join(dir, 'lock2.json'),
      build: false, sourceOrigin: f.origin }), /collision/);
    // A recorded URL that is not the encoded exact ID is refused.
    await assert.rejects(ingest({ candidates: [{ ...candidate(SPACED, source.length), original: 'https://images-assets.nasa.gov/image/x/x~orig.jpg' }],
      outDir: join(dir, 'y'), lockPath: join(dir, 'lock3.json'), build: false, sourceOrigin: f.origin }), /recorded original URL/);
  });
});

test('MEDIA-03 AC-3b: every URL recorded in CURATION.md equals the URL built from its exact ID', async () => {
  const { mission, launch } = parseCuration(await readFile('CURATION.md', 'utf8'));
  const rows = [...mission.rows, ...launch.rows];
  assert.equal(rows.length, 33);
  for (const row of rows) assert.equal(row.original, originalUrlFor(row.nasaId, NASA_ORIGIN, row.original.endsWith('.JPG') ? 'JPG' : 'jpg'), row.nasaId);
});
