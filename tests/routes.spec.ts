import { test, expect } from '@playwright/test';

// docs/SITEMAP.md: every page exists in both languages with localized slugs.
const pages = [
  ['/es/', '/en/'],
  ['/es/despegue/', '/en/launch/'],
  ['/es/mision/', '/en/mission/'],
  ['/es/por-que-importa/', '/en/why-it-matters/'],
  ['/es/galeria/', '/en/gallery/'],
  ['/es/galeria/despegue/', '/en/gallery/launch/'],
  ['/es/galeria/rumbo-a-la-luna/', '/en/gallery/outbound/'],
  ['/es/galeria/lado-oculto/', '/en/gallery/far-side/'],
  ['/es/galeria/eclipse/', '/en/gallery/eclipse/'],
  ['/es/galeria/regreso/', '/en/gallery/return/'],
  ['/es/galeria/despegue/sample-photo-01/', '/en/gallery/launch/sample-photo-01/'],
  ['/es/acerca/', '/en/about/'],
];

test.describe('AC-2 routes exist in es and en, / redirects to /es/ (NAV-01, I18N-01)', () => {
  for (const [es, en] of pages) {
    for (const [lang, path] of [['es', es], ['en', en]] as const) {
      test(`AC-2 ${path}`, async ({ page }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(page.locator('h1')).toHaveCount(1);
      });
    }

    test(`AC-2 language link on ${es} goes to ${en}`, async ({ page }) => {
      await page.goto(es);
      await expect(page.locator('#prefs a[hreflang="en"]')).toHaveAttribute('href', en);
      await page.goto(en);
      await expect(page.locator('#prefs a[hreflang="es"]')).toHaveAttribute('href', es);
    });
  }

  test('AC-2 / redirects to /es/', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/es/');
    expect(new URL(page.url()).pathname).toBe('/es/');
  });
});
