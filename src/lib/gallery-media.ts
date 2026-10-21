import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { parseManifest, type MediaPhoto, type OriginalDownload } from '../../scripts/pages-media.ts';
import { photoUrl } from './media.ts';

export const OG_SIZE = { width: 1200, height: 630 } as const;

export interface PhotoMedia {
  nasaId: string;
  pathKey: string;
  /** Size of the largest variant, which fixes the aspect ratio of the photo. */
  width: number;
  height: number;
  /** Available variant widths, ascending (a variant is skipped when the original was smaller). */
  widths: number[];
  src: (file: string) => string;
  srcset: (format: 'avif' | 'webp') => string;
  original: OriginalDownload;
}

/** Directory where `npm run ingest` writes `manifest.json` and the variants (git-ignored). */
export function mediaDir(): string {
  return process.env.MEDIA_OUT_DIR || 'media-out';
}

export function widthsOf(photo: Pick<MediaPhoto, 'variants'>): number[] {
  const found = new Set<number>();
  for (const file of photo.variants) {
    const match = /\/w(\d+)\.(?:avif|webp)$/.exec(file);
    if (match) found.add(Number(match[1]));
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Reads the generated manifest and checks it against the photo entries, in both directions.
 * A missing manifest fails the build with the command that creates it: the site never ships a gallery without its media.
 */
export async function loadPhotoMedia(entries: { nasaId: string; pathKey: string; hash: string }[]): Promise<Map<string, PhotoMedia>> {
  const path = join(mediaDir(), 'manifest.json');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Media manifest not found at ${path}. Run "npm run ingest" first (npm run build does it for you).`);
  }
  const manifest = parseManifest(JSON.parse(raw));
  const byId = new Map(manifest.photos.map((p) => [p.nasaId, p]));
  for (const entry of entries) {
    const record = byId.get(entry.nasaId);
    if (!record) throw new Error(`Photo "${entry.nasaId}" has no record in ${path}`);
    if (record.pathKey !== entry.pathKey || record.hash !== entry.hash) {
      throw new Error(`Photo "${entry.nasaId}": path key or hash differs from ${path}; re-run "npm run ingest" and update the entry`);
    }
  }
  const known = new Set(entries.map((e) => e.nasaId));
  for (const record of manifest.photos) {
    if (!known.has(record.nasaId)) throw new Error(`Manifest photo "${record.nasaId}" has no entry in the photos collection`);
  }

  const result = new Map<string, PhotoMedia>();
  for (const record of manifest.photos) {
    const widths = widthsOf(record);
    if (!widths.length) throw new Error(`Photo "${record.nasaId}" has no AVIF/WebP variants`);
    const largest = widths[widths.length - 1]!;
    const meta = await sharp(join(mediaDir(), `photos/${record.pathKey}/${record.hash}/w${largest}.webp`)).metadata();
    if (!meta.width || !meta.height) throw new Error(`Photo "${record.nasaId}": cannot read the image size`);
    const src = (file: string) => photoUrl(record.pathKey, record.hash, file);
    result.set(record.pathKey, {
      nasaId: record.nasaId,
      pathKey: record.pathKey,
      width: meta.width,
      height: meta.height,
      widths,
      src,
      srcset: (format) => widths.map((w) => `${src(`w${w}.${format}`)} ${w}w`).join(', '),
      original: record.original,
    });
  }
  return result;
}

/** Height that keeps the photo's ratio at a given width. */
export function heightAt(media: Pick<PhotoMedia, 'width' | 'height'>, width: number): number {
  return Math.round((width * media.height) / media.width);
}

export function formatBytes(bytes: number, lang: 'es' | 'en'): string {
  const text = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(bytes / 1_048_576);
  return `${text} MB`;
}

export interface OriginalLink {
  href: string;
  /** External links leave the site: they open the verified NASA file and say so. */
  external: boolean;
  size: string;
}

/** The download of the unchanged original: same-origin for `local`, an explicit NASA link for `nasa`. */
export function describeOriginal(photo: Pick<PhotoMedia, 'src' | 'original'>, lang: 'es' | 'en'): OriginalLink {
  const size = formatBytes(photo.original.sizeBytes, lang);
  if (photo.original.kind === 'nasa') return { href: photo.original.sourceUrl, external: true, size };
  return { href: photo.src(photo.original.path.split('/').pop()!), external: false, size };
}
