import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeOriginal, formatBytes, heightAt, widthsOf } from '../src/lib/gallery-media.ts';

// AC-3 (GAL-05, LEGAL-01): the download control for both original kinds.
const src = (file: string) => `/media/photos/p/h/${file}`;

test('AC-3 a local original is a same-origin download with its size', () => {
  const link = describeOriginal({ src, original: { kind: 'local', path: 'photos/p/h/original.jpg', sourceUrl: 'https://images-assets.nasa.gov/x', sizeBytes: 5_242_880, sha256: 'a'.repeat(64) } }, 'en');
  assert.deepEqual(link, { href: '/media/photos/p/h/original.jpg', external: false, size: '5 MB' });
});

test('AC-3 an original above the limit (kind "nasa" fixture) is an explicit external NASA link with its size', () => {
  const link = describeOriginal({ src, original: { kind: 'nasa', sourceUrl: 'https://images-assets.nasa.gov/image/big/big~orig.jpg', sizeBytes: 31_457_280 } }, 'es');
  assert.deepEqual(link, { href: 'https://images-assets.nasa.gov/image/big/big~orig.jpg', external: true, size: '30 MB' });
});

test('sizes and ratios', () => {
  assert.equal(formatBytes(1_572_864, 'es'), '1,5 MB');
  assert.equal(heightAt({ width: 2400, height: 1600 }, 480), 320);
  assert.deepEqual(widthsOf({ variants: ['photos/p/h/w960.avif', 'photos/p/h/w480.webp', 'photos/p/h/w960.webp', 'photos/p/h/og.jpg'] }), [480, 960]);
});
