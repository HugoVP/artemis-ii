import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { MediaManifest } from './pages-media.ts';

// Fetch and decode actual image bytes, so a 200 HTML fallback cannot pass the media smoke check.
async function fetchImage(base: string, path: string, decode: 'full' | 'header'): Promise<void> {
  const response = await fetch(`${base}/media/${path}`, { redirect: 'error' });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Invalid deployed image: ${path}`);
  try {
    const image = sharp(bytes, { failOn: 'error' });
    const { width = 0, height = 0 } = await image.metadata();
    if (width < 1 || height < 1) throw new Error('empty image');
    if (decode === 'full') await image.raw().toBuffer();
  } catch {
    throw new Error(`Invalid deployed image: ${path}`);
  }
}

export async function checkMedia(base: string, manifest: MediaManifest): Promise<void> {
  if (manifest.photos.length === 0) throw new Error('Deployed media manifest has no photos');
  for (const [index, photo] of manifest.photos.entries()) {
    // The first photo is decoded in every format; every other photo is checked through its first variant.
    for (const variant of index === 0 ? photo.variants : photo.variants.slice(0, 1)) {
      await fetchImage(base, variant, index === 0 ? 'full' : 'header');
    }
    if (photo.original.kind === 'local') {
      const original = await fetch(`${base}/media/${photo.original.path}`, { redirect: 'error' });
      const bytes = Buffer.from(await original.arrayBuffer());
      if (!original.ok || bytes.length !== photo.original.sizeBytes ||
          createHash('sha256').update(bytes).digest('hex') !== photo.original.sha256) {
        throw new Error(`Invalid deployed original: ${photo.original.path}`);
      }
    }
    // External originals are explicit visitor links, never embedded or fetched by this check.
  }
}
