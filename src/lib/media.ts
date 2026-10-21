/** Joins the media base URL and a path; trailing and leading slashes are normalized. */
export function buildMediaUrl(base: string, path: string): string {
  if (!base) throw new Error('MEDIA_BASE_URL is not set');
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * URL of a photo variant: `<MEDIA_BASE_URL>/photos/<path-key>/<hash>/<file>` (docs/STRUCTURE.md).
 * The base comes from the environment at build time, so every environment is its own build;
 * `/media` (the preview layout in docs/DELIVERY.md) is only the fallback for local builds.
 */
export function photoUrl(pathKey: string, hash: string, file: string): string {
  // Exported variables win; otherwise the value Astro loaded from a `.env` file (`import.meta.env`).
  const base = process.env.MEDIA_BASE_URL || import.meta.env?.MEDIA_BASE_URL || '/media';
  return buildMediaUrl(base, `photos/${pathKey}/${hash}/${file}`);
}
