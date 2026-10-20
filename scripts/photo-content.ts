// Writes src/content/photos and the per-photo NASA record sources from CURATION.md and media-lock.json.
// Titles, alt text and captions are placeholders until Stages 08-09; run again after `npm run ingest -- --update`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readCandidates, type MediaLock } from './ingest.ts';
import { pathKeyFor } from './pages-media.ts';

export const sourceIdFor = (nasaId: string): string => `nasa-${pathKeyFor(nasaId).toLowerCase().replaceAll('_', '-')}`;

const accessed = '2026-10-20';
const lock = JSON.parse(await readFile('media-lock.json', 'utf8')) as MediaLock;
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
await mkdir('src/content/photos', { recursive: true });
await mkdir('src/content/sources', { recursive: true });
for (const [index, candidate] of (await readCandidates()).entries()) {
  const entry = lock.photos[candidate.nasaId];
  if (!entry) throw new Error(`${candidate.nasaId} is not in media-lock.json`);
  const sourceId = sourceIdFor(candidate.nasaId);
  await writeFile(join('src/content/sources', `${sourceId}.json`),
    json({ title: `NASA Image and Video Library: ${candidate.nasaId}`, url: candidate.record, accessed }));
  await writeFile(join('src/content/photos', `${entry.pathKey}.json`), json({
    nasaId: candidate.nasaId,
    pathKey: entry.pathKey,
    chapter: candidate.chapter,
    title: { es: `Foto ${index + 1} (título pendiente)`, en: `Photo ${index + 1} (title pending)` },
    alt: { es: 'Marcador de posición: el texto alternativo llega en la etapa de contenido.', en: 'Placeholder: alt text arrives in the content stage.' },
    caption: { es: 'Pie de foto pendiente de redacción y revisión.', en: 'Caption pending drafting and review.' },
    originalUrl: candidate.original,
    hash: entry.hash,
    sourceIds: [sourceId],
  }));
}
console.log('Photo and source entries written');
