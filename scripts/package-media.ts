// No credentials. Package the build and generated media as a single Pages deployment.
import { createHash } from 'node:crypto';
import { cp, lstat, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readManifest, validateStaticTree } from './pages-media.ts';

export async function packageMedia(mediaRoot: string, siteRoot: string): Promise<void> {
  await validateStaticTree(mediaRoot);
  const manifest = await readManifest(join(mediaRoot, 'manifest.json'));
  for (const photo of manifest.photos) {
    for (const path of [...photo.variants, ...(photo.original.kind === 'local' ? [photo.original.path] : [])]) {
      const file = join(mediaRoot, path);
      const info = await lstat(file);
      if (!info.isFile()) throw new Error(`Missing media file: ${path}`);
      if (photo.original.kind === 'local' && path === photo.original.path && info.size !== photo.original.sizeBytes) {
        throw new Error(`Original size mismatch: ${path}`);
      }
      if (photo.original.kind === 'local' && path === photo.original.path &&
          createHash('sha256').update(await readFile(file)).digest('hex') !== photo.original.sha256) {
        throw new Error(`Original checksum mismatch: ${path}`);
      }
    }
  }
  // Never merge generated files with stale public/media from an earlier build.
  await rm(join(siteRoot, 'media'), { recursive: true, force: true });
  await cp(mediaRoot, join(siteRoot, 'media'), { recursive: true, dereference: false });
  await readFile(join(siteRoot, 'index.html')); // Require a complete Astro site.
  const count = await validateStaticTree(siteRoot);
  console.log(`Pages artifact validated: ${count} files`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mediaRoot, siteRoot] = process.argv.slice(2);
  if (!mediaRoot || !siteRoot) throw new Error('usage: node scripts/package-media.ts <media-dir> <site-dir>');
  await packageMedia(mediaRoot, siteRoot);
}
