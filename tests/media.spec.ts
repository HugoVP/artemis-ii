import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from 'vite';
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
    // The same lookup the build uses: `.env` files first, exported variables on top.
    const base = (loadEnv('production', process.cwd(), '').MEDIA_BASE_URL || '/media').replace(/\/+$/, '');
    const pages = htmlFiles('dist');
    expect(pages.length).toBeGreaterThan(20);
    const photoPage = readFileSync('dist/en/gallery/outbound/art002e000192/index.html', 'utf8');
    expect(photoPage).toContain(`${base}/photos/art002e000192/`);
    for (const file of pages) {
      const html = readFileSync(file, 'utf8');
      // Loaded resources only (src, srcset, stylesheets, preloads); "view original" links may point to NASA.
      const loaded = [...html.matchAll(/<(?:img|script|source|iframe|video|audio)[^>]*\s(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]);
      const links = [...html.matchAll(/<link[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
      for (const url of [...loaded, ...links]) expect(url, file).not.toMatch(/nasa\.gov|nasa\.org/i);
    }
  });
});

test.describe('AC-5 gallery images are same-origin with dimensions and alt text (MEDIA-01, QA-02)', () => {
  test('AC-5 every <img> has width, height and an alt attribute and loads from the media base', () => {
    const base = (loadEnv('production', process.cwd(), '').MEDIA_BASE_URL || '/media').replace(/\/+$/, '');
    let images = 0;
    for (const file of htmlFiles('dist')) {
      const html = readFileSync(file, 'utf8');
      for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
        images += 1;
        expect(tag, file).toMatch(/\swidth="\d+"/);
        expect(tag, file).toMatch(/\sheight="\d+"/);
        expect(tag, file).toMatch(/\salt(?:=|\s|>)/);
        const src = /\ssrc="([^"]+)"/.exec(tag)?.[1] ?? '';
        expect(src, file).toMatch(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/photos/`));
      }
    }
    expect(images).toBeGreaterThan(33);
  });
});
