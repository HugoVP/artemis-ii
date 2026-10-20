import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { once } from 'node:events';
import { checkMedia } from './smoke-media.ts';
import type { MediaManifest } from './pages-media.ts';

// A real decodable PNG; a successful HTML fallback must never pass as an image.
const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#336699' } }).png().toBuffer();
test('OPS-07 MEDIA-05 AC-6: deployed image smoke decodes images, rejects HTML fallback, wrong local originals and an empty manifest', async () => {
  let fallback = false; let originalBytes = png;
  const server = createServer((req, res) => {
    if (req.url?.endsWith('original.png')) { res.setHeader('content-type', 'image/png'); res.end(originalBytes); return; }
    res.setHeader('content-type', fallback ? 'text/html' : 'image/png');
    res.end(fallback ? '<html>not an image</html>' : png);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const manifest: MediaManifest = { photos: [{ nasaId: 'fixture', pathKey: 'fixture', hash: '123456789abc', variants: ['photos/fixture/123456789abc/480.png'],
    original: { kind: 'local', path: 'photos/fixture/123456789abc/original.png', sourceUrl: 'https://images.nasa.gov/example', sizeBytes: png.length, sha256: createHash('sha256').update(png).digest('hex') } }] };
  try {
    await checkMedia(base, manifest);
    await assert.rejects(checkMedia(base, { photos: [] }), /no photos/);
    fallback = true; await assert.rejects(checkMedia(base, manifest), /Invalid deployed image/);
    fallback = false; originalBytes = Buffer.concat([png, Buffer.from([0])]); await assert.rejects(checkMedia(base, manifest), /Invalid deployed original/);
    originalBytes = png; manifest.photos[0]!.original = { kind: 'local', path: 'photos/fixture/123456789abc/original.png', sourceUrl: 'https://images.nasa.gov/example', sizeBytes: png.length, sha256: '0'.repeat(64) };
    await assert.rejects(checkMedia(base, manifest), /Invalid deployed original/); // Checksum mismatch.
    manifest.photos[0]!.original = { kind: 'nasa', sourceUrl: 'https://images.nasa.gov/example', sizeBytes: 26_214_401 };
    await checkMedia(base, manifest); // The external NASA source is not requested.
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
