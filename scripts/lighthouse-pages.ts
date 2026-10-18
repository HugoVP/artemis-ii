import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// QA-03: choose real built routes, including after Stage 07 replaces the sample photo.
export async function lighthousePages(dist: string): Promise<readonly [string, string][]> {
  const gallery = join(dist, 'es', 'galeria');
  for (const chapter of (await readdir(gallery, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!chapter.isDirectory()) continue;
    const chapterDir = join(gallery, chapter.name);
    if (!(await stat(join(chapterDir, 'index.html')).catch(() => undefined))?.isFile()) continue;
    for (const photo of (await readdir(chapterDir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!photo.isDirectory() || !(await stat(join(chapterDir, photo.name, 'index.html')).catch(() => undefined))?.isFile()) continue;
      const path = `/es/galeria/${encodeURIComponent(chapter.name)}/`;
      return [['home', '/es/'], ['chapter', path], ['photo', `${path}${encodeURIComponent(photo.name)}/`]];
    }
  }
  throw new Error('No built gallery chapter with a photo found for the QA-03 report.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, path] of await lighthousePages(process.argv[2] ?? 'dist')) console.log(`${name}\t${path}`);
}
