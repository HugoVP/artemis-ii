/** Joins the media base URL and a path; trailing and leading slashes are normalized. */
export function buildMediaUrl(base: string, path: string): string {
  if (!base) throw new Error('MEDIA_BASE_URL is not set');
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * URL of a photo variant: `<MEDIA_BASE_URL>/photos/<nasa-id>/<hash>/<file>` (docs/STRUCTURE.md).
 * The base comes from the environment at build time, so every environment is its own build;
 * `/media` (the preview layout in docs/DELIVERY.md) is only the fallback for local builds.
 */
export function photoUrl(nasaId: string, hash: string, file: string): string {
  return buildMediaUrl(process.env.MEDIA_BASE_URL || '/media', `photos/${nasaId}/${hash}/${file}`);
}
