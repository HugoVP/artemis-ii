// Writes src/content/photos and the per-photo NASA record and credit sources from CURATION.md and media-lock.json.
// Existing editorial fields and supplemental sources are preserved when refreshing ingestion metadata; placeholders are seeded only for new entries.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCandidates, type MediaLock } from './ingest.ts';
import { pathKeyFor } from './pages-media.ts';

export const sourceIdFor = (nasaId: string): string => `nasa-${pathKeyFor(nasaId).toLowerCase().replaceAll('_', '-')}`;
export const creditSourceIdFor = (nasaId: string): string => `${sourceIdFor(nasaId)}-credit`;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

interface ExistingPhoto {
  title?: { es: string; en: string };
  alt?: { es: string; en: string };
  caption?: { es: string; en: string };
  date?: string;
  camera?: string;
  sourceIds?: string[];
}

interface ExistingSource {
  title?: string;
  url?: string;
  accessed?: string;
}

async function readJsonIfPresent<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export interface WritePhotoContentOptions {
  curationPath?: string;
  lockPath?: string;
  photosDir?: string;
  sourcesDir?: string;
  accessed?: string;
}

export async function writePhotoContent(options: WritePhotoContentOptions = {}): Promise<void> {
  const {
    curationPath = 'CURATION.md',
    lockPath = 'media-lock.json',
    photosDir = 'src/content/photos',
    sourcesDir = 'src/content/sources',
    accessed = '2026-10-20',
  } = options;
  const lock = JSON.parse(await readFile(lockPath, 'utf8')) as MediaLock;
  await mkdir(photosDir, { recursive: true });
  await mkdir(sourcesDir, { recursive: true });

  for (const [index, candidate] of (await readCandidates(curationPath)).entries()) {
    const entry = lock.photos[candidate.nasaId];
    if (!entry) throw new Error(`${candidate.nasaId} is not in media-lock.json`);
    const sourceId = sourceIdFor(candidate.nasaId);
    const sourcePath = join(sourcesDir, `${sourceId}.json`);
    const existingSource = await readJsonIfPresent<ExistingSource>(sourcePath);
    await writeFile(sourcePath, json({
      title: existingSource?.title ?? `NASA Image and Video Library: ${candidate.nasaId}`,
      url: candidate.record,
      accessed: existingSource?.accessed ?? accessed,
    }));

    const requiredSources = [sourceId];
    if (candidate.creditUrl) {
      const creditId = creditSourceIdFor(candidate.nasaId);
      const creditPath = join(sourcesDir, `${creditId}.json`);
      const existingCredit = await readJsonIfPresent<ExistingSource>(creditPath);
      const label = candidate.creditLabel ?? 'NASA credit';
      await writeFile(creditPath, json({
        title: existingCredit?.title ?? `NASA credit evidence (${candidate.nasaId}): ${label}`,
        url: candidate.creditUrl,
        accessed: existingCredit?.accessed ?? accessed,
      }));
      requiredSources.push(creditId);
    }

    const photoPath = join(photosDir, `${entry.pathKey}.json`);
    const existingPhoto = await readJsonIfPresent<ExistingPhoto>(photoPath);
    const mergedSourceIds = Array.from(new Set([...requiredSources, ...(existingPhoto?.sourceIds ?? [])]));
    await writeFile(photoPath, json({
      nasaId: candidate.nasaId,
      pathKey: entry.pathKey,
      chapter: candidate.chapter,
      title: existingPhoto?.title ?? { es: `Foto ${index + 1} (título pendiente)`, en: `Photo ${index + 1} (title pending)` },
      alt: existingPhoto?.alt ?? {
        es: 'Marcador de posición: el texto alternativo llega en la etapa de contenido.',
        en: 'Placeholder: alt text arrives in the content stage.',
      },
      caption: existingPhoto?.caption ?? {
        es: 'Pie de foto pendiente de redacción y revisión.',
        en: 'Caption pending drafting and review.',
      },
      ...(existingPhoto?.date !== undefined ? { date: existingPhoto.date } : {}),
      ...(existingPhoto?.camera !== undefined ? { camera: existingPhoto.camera } : {}),
      originalUrl: candidate.original,
      hash: entry.hash,
      sourceIds: mergedSourceIds,
    }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await writePhotoContent();
  console.log('Photo and source entries written');
}
