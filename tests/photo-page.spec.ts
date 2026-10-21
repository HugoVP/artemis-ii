import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

// GAL-05, GAL-06, LEGAL-01 (Stage 07).
const photos = readdirSync('src/content/photos').map((f) => JSON.parse(readFileSync(`src/content/photos/${f}`, 'utf8')) as { nasaId: string; pathKey: string; chapter: string; hash: string });
const slug = { launch: ['despegue', 'launch'], outbound: ['rumbo-a-la-luna', 'outbound'], 'far-side': ['lado-oculto', 'far-side'], eclipse: ['eclipse', 'eclipse'], return: ['regreso', 'return'] } as Record<string, string[]>;
const sample = photos.find((p) => p.pathKey === 'art002e000192')!;
const spaced = photos.find((p) => p.nasaId.includes(' '));

test.describe('AC-3 photo page content (GAL-05, LEGAL-01)', () => {
  for (const lang of ['es', 'en'] as const) {
    test(`AC-3 ${lang}: image, NASA ID, record, credit and original download`, async ({ page }) => {
      const [es, en] = slug[sample.chapter]!;
      await page.goto(lang === 'es' ? `/es/galeria/${es}/${sample.pathKey}/` : `/en/gallery/${en}/${sample.pathKey}/`);
      await expect(page.locator('h1')).toHaveCount(1);
      const hero = page.locator('img.photo-hero');
      await expect(hero).toHaveAttribute('alt', /.+/);
      await expect(page.getByText(sample.nasaId, { exact: true })).toBeVisible();
      await expect(page.locator('a[data-record]')).toHaveAttribute('href', `https://images.nasa.gov/details/${sample.nasaId}`);
      await expect(page.locator('a[data-credit]')).toHaveAttribute('href', /^https:\/\/images-assets\.nasa\.gov\//);
      const download = page.locator('a[data-original="local"]');
      await expect(download).toHaveAttribute('href', new RegExp(`/photos/${sample.pathKey}/${sample.hash}/original\\.jpg$`));
      await expect(download).toContainText(/\d+(?:[.,]\d)? MB/);
      await expect(download).toHaveAttribute('download', '');
      await expect(page.locator('a[href$="/"]', { hasText: lang === 'es' ? 'Volver al capítulo' : 'Back to chapter' })).toBeVisible();
    });
  }

  test('AC-3 the route key is the safe path key, never the raw NASA ID', async ({ page }) => {
    test.skip(!spaced, 'no spaced ID');
    const [, en] = slug[spaced!.chapter]!;
    const response = await page.goto(`/en/gallery/${en}/${spaced!.pathKey}/`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText(spaced!.nasaId, { exact: true })).toBeVisible();
  });
});

test.describe('AC-4 Open Graph image per photo (GAL-06)', () => {
  test('AC-4 each photo page has og:image and twitter:image of 1200x630 that exist in the build', async () => {
    for (const photo of photos) {
      const html = readFileSync(`dist/en/gallery/${slug[photo.chapter]![1]}/${photo.pathKey}/index.html`, 'utf8');
      const og = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
      expect(og, photo.pathKey).toMatch(new RegExp(`/photos/${photo.pathKey}/${photo.hash}/og\\.jpg$`));
      expect(html).toContain(`<meta name="twitter:image" content="${og}"`);
      expect(html).toContain('<meta property="og:image:width" content="1200"');
      expect(html).toContain('<meta property="og:image:height" content="630"');
      const file = `dist/media/${new URL(og!).pathname.replace(/^\/media\//, '')}`;
      expect(existsSync(file) || existsSync(`media-out/${new URL(og!).pathname.replace(/^\/media\//, '')}`), file).toBe(true);
    }
  });
});

test.describe('AC-6 keyboard use on the photo page', () => {
  test('AC-6 the download link is reachable by keyboard with a visible focus ring', async ({ page }) => {
    await page.goto(`/en/gallery/outbound/${sample.pathKey}/`);
    const download = page.locator('a[data-original]');
    await download.focus();
    await expect(download).toBeFocused();
    expect(await download.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  });
});
