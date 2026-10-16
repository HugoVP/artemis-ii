import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildMediaUrl } from '../src/lib/media';

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}

test.describe('AC-6 media URLs come from MEDIA_BASE_URL (MEDIA-01)', () => {
  test('AC-6 buildMediaUrl joins the base and the path', () => {
    expect(buildMediaUrl('https://m.example/media/', '/photos/a/1/640.webp')).toBe('https://m.example/media/photos/a/1/640.webp');
    expect(() => buildMediaUrl('', 'x')).toThrow();
  });

  test('AC-6 built pages use MEDIA_BASE_URL and load nothing from NASA hosts', () => {
    const base = (process.env.MEDIA_BASE_URL || '/media').replace(/\/+$/, '');
    const pages = htmlFiles('dist');
    expect(pages.length).toBeGreaterThan(20);
    const photoPage = readFileSync('dist/en/gallery/launch/sample-photo-01/index.html', 'utf8');
    expect(photoPage).toContain(`${base}/photos/sample-photo-01/00000000/original.jpg`);
    for (const file of pages) {
      const html = readFileSync(file, 'utf8');
      // Loaded resources only (src, srcset, stylesheets, preloads); "view original" links may point to NASA.
      const loaded = [...html.matchAll(/<(?:img|script|source|iframe|video|audio)[^>]*\s(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]);
      const links = [...html.matchAll(/<link[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
      for (const url of [...loaded, ...links]) expect(url, file).not.toMatch(/nasa\.gov|nasa\.org/i);
    }
  });
});
