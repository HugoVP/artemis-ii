// Stage 03 contract; Stage 06 supplies ingestion, byte verification and image generation.
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_FILE_BYTES = 26_214_400;
export const MAX_FILES = 20_000;
export type OriginalDownload =
  | { kind: 'local'; path: string; sourceUrl: string; sizeBytes: number }
  | { kind: 'nasa'; sourceUrl: string; sizeBytes: number };
export interface MediaPhoto {
  nasaId: string;
  hash: string;
  variants: string[];
  original: OriginalDownload;
}
export interface MediaManifest { photos: MediaPhoto[] }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function nasaUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Missing verified NASA source URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !(url.hostname === 'nasa.gov' || url.hostname.endsWith('.nasa.gov'))) {
    throw new Error('Original source must be an HTTPS NASA URL');
  }
  return url.href;
}
export function selectOriginal(sourceUrl: string, sizeBytes: number, path: string): OriginalDownload {
  const source = nasaUrl(sourceUrl);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error('Invalid original byte size');
  return sizeBytes <= MAX_FILE_BYTES
    ? { kind: 'local', sourceUrl: source, sizeBytes, path }
    : { kind: 'nasa', sourceUrl: source, sizeBytes };
}

export function parseManifest(value: unknown): MediaManifest {
  const input = record(value);
  if (!Array.isArray(input.photos)) throw new Error('Manifest needs photos');
  const ids = new Set<string>();
  const photos = input.photos.map((entry: unknown): MediaPhoto => {
    const photo = record(entry);
    if (typeof photo.nasaId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(photo.nasaId) || ids.has(photo.nasaId)) {
      throw new Error('Invalid or duplicate NASA ID');
    }
    ids.add(photo.nasaId);
    if (typeof photo.hash !== 'string' || !/^[a-f0-9]{12,64}$/.test(photo.hash)) throw new Error('Invalid media hash');
    const prefix = `photos/${photo.nasaId}/${photo.hash}/`;
    const path = (value: unknown): string => {
      if (typeof value !== 'string' || !value.startsWith(prefix) ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(value.slice(prefix.length))) throw new Error('Invalid hashed media path');
      return value;
    };
    if (!Array.isArray(photo.variants) || photo.variants.length === 0) throw new Error('Missing optimized variants');
    const variants = photo.variants.map(path);
    const original = record(photo.original);
    if (typeof original.sizeBytes !== 'number') throw new Error('Missing original byte size');
    const selected = selectOriginal(nasaUrl(original.sourceUrl), original.sizeBytes,
      original.kind === 'local' ? path(original.path) : '');
    if (selected.kind !== original.kind || (selected.kind === 'nasa' && 'path' in original)) {
      throw new Error('Original download kind does not match its byte size');
    }
    return { nasaId: photo.nasaId, hash: photo.hash, variants, original: selected };
  });
  return { photos };
}

export async function readManifest(path: string): Promise<MediaManifest> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  return parseManifest(value);
}

export async function validateStaticTree(root: string): Promise<number> {
  const entries = await readdir(root);
  if (entries.includes('_worker.js') || entries.includes('functions')) throw new Error('Worker entrypoints and Pages Functions are forbidden');
  let count = 0;
  const walk = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const info = await lstat(path);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error(`Non-regular entry: ${path}`);
      if (info.isDirectory()) await walk(path);
      else {
        if (info.size > MAX_FILE_BYTES) throw new Error(`Pages file exceeds 25 MiB: ${path}`);
        if (++count > MAX_FILES) throw new Error('Pages file count exceeds 20000');
      }
    }
  };
  await walk(root);
  return count;
}
