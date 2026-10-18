import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lighthousePages } from './lighthouse-pages.ts';

test('QA-03: choose existing Home, chapter and photo routes without assuming the sample photo exists', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'lighthouse-pages-'));
  try {
    for (const path of ['es/index.html', 'es/galeria/empty/index.html', 'es/galeria/return/index.html', 'es/galeria/return/nasa-real-id/index.html']) {
      await mkdir(join(dist, path, '..'), { recursive: true });
      await writeFile(join(dist, path), '<html></html>');
    }
    assert.deepEqual(await lighthousePages(dist), [
      ['home', '/es/'], ['chapter', '/es/galeria/return/'], ['photo', '/es/galeria/return/nasa-real-id/'],
    ]);
    await rm(join(dist, 'es/galeria/return/nasa-real-id'), { recursive: true });
    await assert.rejects(lighthousePages(dist), /No built gallery/);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});
