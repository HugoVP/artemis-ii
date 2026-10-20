// Stage 06 ingestion (docs/ingestion.md). No credentials: it only reads public NASA files and writes `--out`.
//   node scripts/ingest.ts --build --out media-out   pipeline: verify against media-lock.json, never write the lock
//   node scripts/ingest.ts [--out media-out] [--update]   local: add new IDs to the lock; --update re-approves changes
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { parseCuration, type Candidate } from './curation.ts';
import { MAX_FILE_BYTES, assertNoKeyCollisions, parseManifest, pathKeyFor, selectOriginal,
  type MediaManifest, type MediaPhoto } from './pages-media.ts';

export const NASA_ORIGIN = 'https://images-assets.nasa.gov';
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export interface TransformSettings {
  readonly version: number;
  readonly widths: readonly number[];
  readonly avif: { readonly quality: number; readonly effort: number };
  readonly webp: { readonly quality: number; readonly effort: number };
  readonly thumbnail: { readonly width: number; readonly quality: number };
  readonly og: { readonly width: number; readonly height: number; readonly quality: number };
}

/** Output settings. Changing any of them (or the pinned sharp) changes every content hash. */
export const TRANSFORM: TransformSettings = {
  version: 1,
  widths: [480, 960, 1600, 2400],
  avif: { quality: 55, effort: 2 },
  webp: { quality: 78, effort: 4 },
  thumbnail: { width: 320, quality: 70 },
  og: { width: 1200, height: 630, quality: 82 },
} as const;

export interface LockEntry {
  pathKey: string;
  hash: string;
  /** Complete toolchain + settings fingerprint that produced this entry. */
  transform?: string;
  sourceUrl: string;
  sourceBytes: number;
  sourceSha256: string;
  /** SHA-256 of every generated file, relative to `photos/<path-key>/<hash>/`, including a local original. */
  files: Record<string, string>;
  variants: string[];
  original: 'local' | 'nasa';
}
export interface MediaLock { transform: string; photos: Record<string, LockEntry> }

export interface IngestOptions {
  candidates: readonly Candidate[];
  outDir: string;
  lockPath: string;
  /** `true` in the pipeline: the lock is read, never written. */
  build: boolean;
  /** Re-approve changed sources or outputs in the lock (local mode only). */
  update?: boolean;
  /** Where files are fetched from; the manifest always records the canonical NASA URL. Tests point it at a fixture server. */
  sourceOrigin?: string;
  /** Local originals are copied up to this size; tests keep the real limit. */
  localLimit?: number;
  /** Transform settings override for tests. */
  settings?: TransformSettings;
  /** Variant generator override for deterministic drift tests. */
  generateVariants?: (source: Uint8Array, settings: TransformSettings) => Promise<Map<string, Buffer>>;
  log?: (message: string) => void;
}

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

function toolchainId(settings: TransformSettings = TRANSFORM): string {
  return `v${settings.version}+sharp${sharp.versions.sharp}+vips${sharp.versions.vips}`;
}

export function transformFingerprint(settings: TransformSettings = TRANSFORM): string {
  return `${toolchainId(settings)}+${sha256(JSON.stringify(settings)).slice(0, 16)}`;
}

/** NASA source URL built from the exact ID, one `encodeURIComponent` per path segment. */
export function originalUrlFor(nasaId: string, origin = NASA_ORIGIN, extension: 'jpg' | 'JPG' = 'jpg'): string {
  const id = encodeURIComponent(nasaId);
  return `${origin}/image/${id}/${id}~orig.${extension}`;
}
/** NASA publishes two originals with an upper-case extension; the recorded URL must match one of the two exact forms. */
function extensionOf(recorded: string): 'jpg' | 'JPG' {
  return recorded.endsWith('~orig.JPG') ? 'JPG' : 'jpg';
}

/** Downloads one file, following only redirects that stay on the allowed origin, enforcing size bounds while streaming. */
export async function download(url: string, origin: string, maxBytes = MAX_DOWNLOAD_BYTES): Promise<Uint8Array> {
  const allowed = new URL(origin);
  let current = new URL(url);
  for (let hops = 0; ; hops++) {
    if (current.origin !== allowed.origin) throw new Error(`Refusing to download outside ${allowed.origin}: ${current.href}`);
    const response = await fetch(current, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || hops >= MAX_REDIRECTS) throw new Error(`Too many or invalid redirects for ${url}`);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Download failed (${response.status}): ${current.href}`);
    }
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) {
      await response.body?.cancel();
      throw new Error(`Download too large: ${current.href}`);
    }
    if (!response.body) return new Uint8Array(0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Download too large: ${current.href}`);
      }
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks, total));
  }
}

async function generate(source: Uint8Array, settings: TransformSettings = TRANSFORM): Promise<Map<string, Buffer>> {
  if (!(source[0] === 0xff && source[1] === 0xd8 && source[2] === 0xff)) throw new Error('Source is not a JPEG');
  const base = () => sharp(source, { failOn: 'error' }).rotate();
  const { width = 0 } = await base().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  const files = new Map<string, Buffer>();
  const widths = [...new Set(settings.widths.map((w) => Math.min(w, width)))];
  for (const w of widths) {
    const resized = () => base().resize({ width: w, withoutEnlargement: true });
    files.set(`w${w}.avif`, await resized().avif(settings.avif).toBuffer());
    files.set(`w${w}.webp`, await resized().webp(settings.webp).toBuffer());
  }
  files.set('thumb.webp', await base().resize({ width: settings.thumbnail.width, withoutEnlargement: true })
    .webp({ quality: settings.thumbnail.quality }).toBuffer());
  files.set('og.jpg', await base().resize({ width: settings.og.width, height: settings.og.height, fit: 'cover' })
    .jpeg({ quality: settings.og.quality, mozjpeg: true }).toBuffer());
  return files;
}

async function readLock(path: string, defaultTransform: string): Promise<MediaLock> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as MediaLock;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { transform: defaultTransform, photos: {} };
    throw error;
  }
}

async function fileSha(path: string): Promise<string | undefined> {
  try {
    return sha256(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function write(path: string, bytes: Uint8Array | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.partial`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

export async function ingest(options: IngestOptions): Promise<MediaManifest> {
  const {
    candidates,
    outDir,
    lockPath,
    build,
    update = false,
    sourceOrigin = NASA_ORIGIN,
    localLimit = MAX_FILE_BYTES,
    settings = TRANSFORM,
    generateVariants = generate,
  } = options;
  const log = options.log ?? (() => undefined);
  if (candidates.length === 0) throw new Error('No candidates to ingest');
  if (build && update) throw new Error('--update is not allowed with --build');
  assertNoKeyCollisions(candidates.map((c) => c.nasaId));
  const toolchain = toolchainId(settings);
  const transform = transformFingerprint(settings);
  const lock = await readLock(lockPath, transform);
  const existingEntries = Object.values(lock.photos);
  if (
    existingEntries.length > 0 &&
    !update &&
    (lock.transform !== transform || existingEntries.some((e) => e.transform !== transform))
  ) {
    throw new Error(`Toolchain drift: lock was approved with ${lock.transform}, this run uses ${transform}`);
  }
  // Saved after every new photo, so an interrupted local run keeps the work it finished without stamping unmigrated entries.
  const saveLock = async () => {
    const entries = Object.values(lock.photos);
    const allMigrated = entries.length === 0 || entries.every((e) => e.transform === transform);
    if (allMigrated) lock.transform = transform;
    const sorted = Object.fromEntries(Object.entries(lock.photos).sort(([a], [b]) => a.localeCompare(b)));
    await write(lockPath, `${JSON.stringify({ transform: lock.transform, photos: sorted }, null, 2)}\n`);
  };
  const photos: MediaPhoto[] = [];

  for (const candidate of candidates) {
    const { nasaId } = candidate;
    const pathKey = pathKeyFor(nasaId);
    const extension = extensionOf(candidate.original);
    const canonical = originalUrlFor(nasaId, NASA_ORIGIN, extension);
    if (candidate.original !== canonical) throw new Error(`${nasaId}: recorded original URL is not ${canonical}`);
    const fetchUrl = originalUrlFor(nasaId, sourceOrigin, extension);
    const approved = lock.photos[nasaId];
    if (build && !approved) throw new Error(`${nasaId}: not in the media lock; run "npm run ingest" locally and commit media-lock.json`);

    const place = (hash: string) => join(outDir, 'photos', pathKey, hash);
    let entry: LockEntry;
    let outputs = new Map<string, Uint8Array>();
    let reused = false;

    if (approved && !update && approved.transform === transform) {
      // Idempotent: untouched approved outputs on disk with matching transform fingerprint are verified, not downloaded or regenerated.
      const dir = place(approved.hash);
      const present = await Promise.all(Object.entries(approved.files).map(async ([name, sum]) => (await fileSha(join(dir, name))) === sum));
      reused = present.every(Boolean);
    }
    if (reused && approved) {
      entry = approved;
      log(`${nasaId}: unchanged`);
    } else {
      const source = await download(fetchUrl, sourceOrigin);
      const sourceSha256 = sha256(source);
      if (source.length !== candidate.bytes) {
        throw new Error(`${nasaId}: source drift, ${source.length} bytes downloaded but CURATION.md records ${candidate.bytes}`);
      }
      if (approved && !update && approved.sourceSha256 !== sourceSha256) throw new Error(`${nasaId}: source drift, SHA-256 differs from the approved lock`);
      const hash = sha256(Buffer.concat([source, Buffer.from(JSON.stringify([toolchain, settings]))])).slice(0, 16);
      const generated = await generateVariants(source, settings);
      outputs = new Map(generated);
      const kind = source.length <= localLimit ? 'local' : 'nasa';
      if (kind === 'local') outputs.set('original.jpg', source);
      const files = Object.fromEntries([...outputs].map(([name, bytes]) => [name, sha256(bytes)]));
      const variants = [...generated.keys()].sort();
      entry = { pathKey, hash, transform, sourceUrl: canonical, sourceBytes: source.length, sourceSha256, files, variants, original: kind };
      if (approved && !update) {
        if (approved.hash !== hash) throw new Error(`${nasaId}: output drift, hash ${hash} differs from the approved ${approved.hash}`);
        if (Object.keys(approved.files).length !== Object.keys(files).length) throw new Error(`${nasaId}: output drift in file set`);
        for (const [name, sum] of Object.entries(files)) {
          if (approved.files[name] !== sum) throw new Error(`${nasaId}: output drift in ${name}`);
        }
      } else if (build) {
        throw new Error(`${nasaId}: not in the media lock`);
      } else {
        // Reject changed file checksums for an unchanged content hash even under --update: bump TRANSFORM.version instead of replacing media at an approved URL.
        if (approved && approved.hash === hash) {
          if (Object.keys(approved.files).length !== Object.keys(files).length) {
            throw new Error(`${nasaId}: output drift for unchanged hash ${hash}; bump TRANSFORM.version`);
          }
          for (const [name, sum] of Object.entries(files)) {
            if (approved.files[name] !== sum) {
              throw new Error(`${nasaId}: output drift in ${name} for unchanged hash ${hash}; bump TRANSFORM.version`);
            }
          }
        }
        lock.photos[nasaId] = entry;
        await saveLock();
      }
      // Never overwrite an existing content-addressed file with different bytes, even with --update.
      for (const [name, bytes] of outputs) {
        const target = join(place(hash), name);
        const existing = await fileSha(target);
        if (existing !== undefined && existing !== sha256(bytes)) {
          throw new Error(`${nasaId}: refusing to overwrite approved file ${name}`);
        }
        await write(target, bytes);
      }
      log(`${nasaId}: ingested ${outputs.size} files`);
    }

    const prefix = `photos/${pathKey}/${entry.hash}/`;
    const original = entry.original === 'local'
      ? selectOriginal(canonical, entry.sourceBytes, `${prefix}original.jpg`, entry.files['original.jpg'])
      : selectOriginal(canonical, entry.sourceBytes, '');
    if (original.kind !== entry.original) throw new Error(`${nasaId}: original kind does not match its size`);
    photos.push({ nasaId, pathKey, hash: entry.hash, variants: entry.variants.map((name) => prefix + name), original });
  }

  const manifest = parseManifest({ photos });
  await write(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function readCandidates(path = 'CURATION.md'): Promise<Candidate[]> {
  const { mission, launch } = parseCuration(await readFile(path, 'utf8'));
  return [...mission.rows, ...launch.rows];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : 'media-out';
  if (!outDir) throw new Error('usage: node scripts/ingest.ts [--build] [--update] [--out <dir>]');
  const manifest = await ingest({
    candidates: await readCandidates(),
    outDir,
    lockPath: 'media-lock.json',
    build: flag('--build'),
    update: flag('--update'),
    log: console.log,
  });
  await stat(join(outDir, 'manifest.json'));
  console.log(`Ingested ${manifest.photos.length} photos into ${outDir}`);
}
