import type { MediaManifest } from './pages-media.ts';

// Fetch actual image bytes, so a 200 HTML fallback cannot pass the media smoke check.
export async function checkMedia(base: string, manifest: MediaManifest): Promise<void> {
  for (const photo of manifest.photos) {
    const variant = photo.variants[0]!;
    const response = await fetch(`${base}/media/${variant}`, { redirect: 'error' });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
    const image = (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') ||
      (ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32))) ||
      (bytes[0] === 0x89 && ascii(1, 4) === 'PNG');
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/') || !image) {
      throw new Error(`Invalid deployed image: ${variant}`);
    }
    if (photo.original.kind === 'local') {
      const original = await fetch(`${base}/media/${photo.original.path}`, { method: 'HEAD', redirect: 'error' });
      if (!original.ok || Number(original.headers.get('content-length')) !== photo.original.sizeBytes) {
        throw new Error(`Invalid deployed original: ${photo.original.path}`);
      }
    }
    // External originals are explicit visitor links, never embedded or fetched by this check.
  }
}
