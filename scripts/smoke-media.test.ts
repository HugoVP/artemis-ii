import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { checkMedia } from './smoke-media.ts';
import type { MediaManifest } from './pages-media.ts';

// Actual one-pixel PNG bytes; a successful HTML fallback must never pass as an image.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=', 'base64');
test('OPS-07 MEDIA-05: deployed image smoke rejects HTML fallback and wrong local original lengths', async () => {
  let fallback = false; let originalLength = png.length;
  const server = createServer((req, res) => {
    if (req.url?.endsWith('original.png')) { res.setHeader('content-length', originalLength); res.end(); return; }
    res.setHeader('content-type', fallback ? 'text/html' : 'image/png');
    res.end(fallback ? '<html>not an image</html>' : png);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const manifest: MediaManifest = { photos: [{ nasaId: 'fixture', hash: '123456789abc', variants: ['photos/fixture/123456789abc/480.png'],
    original: { kind: 'local', path: 'photos/fixture/123456789abc/original.png', sourceUrl: 'https://images.nasa.gov/example', sizeBytes: png.length } }] };
  try {
    await checkMedia(base, manifest);
    fallback = true; await assert.rejects(checkMedia(base, manifest), /Invalid deployed image/);
    fallback = false; originalLength++; await assert.rejects(checkMedia(base, manifest), /Invalid deployed original/);
    manifest.photos[0]!.original = { kind: 'nasa', sourceUrl: 'https://images.nasa.gov/example', sizeBytes: 26_214_401 };
    await checkMedia(base, manifest); // The external NASA source is not requested.
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
