import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';

// GAL-01..04, PREF-04 (Stage 07). Titles and alt text are placeholders until Stage 09.
const chapters = {
  es: { launch: 'despegue', outbound: 'rumbo-a-la-luna', 'far-side': 'lado-oculto', eclipse: 'eclipse', return: 'regreso' },
  en: { launch: 'launch', outbound: 'outbound', 'far-side': 'far-side', eclipse: 'eclipse', return: 'return' },
} as const;
const photos = readdirSync('src/content/photos').map((f) => JSON.parse(readFileSync(`src/content/photos/${f}`, 'utf8')) as { pathKey: string; chapter: keyof typeof chapters.en });

test.describe('AC-1 chapters list every ingested photo exactly once (GAL-01)', () => {
  for (const lang of ['es', 'en'] as const) {
    test(`AC-1 ${lang}: each photo is in its own chapter and in no other`, async ({ page }) => {
      const seen: string[] = [];
      for (const [chapter, slug] of Object.entries(chapters[lang])) {
        await page.goto(`/${lang}/${lang === 'es' ? 'galeria' : 'gallery'}/${slug}/`);
        const hrefs = await page.locator('[data-testid="photo-grid"] a.photo-card-link').evaluateAll((a) => a.map((x) => (x as HTMLAnchorElement).getAttribute('href')!));
        const expected = photos.filter((p) => p.chapter === chapter).map((p) => p.pathKey);
        expect(hrefs.map((h) => h.split('/').filter(Boolean).pop())).toEqual(expect.arrayContaining(expected));
        expect(hrefs).toHaveLength(expected.length);
        seen.push(...hrefs);
      }
      expect(seen).toHaveLength(photos.length);
      expect(new Set(seen).size).toBe(photos.length);
    });
  }
});

test.describe('AC-2 three views follow the stored preference without a flash (GAL-02, GAL-03, GAL-04, PREF-04)', () => {
  for (const view of ['mosaic', 'gallery', 'immersive'] as const) {
    test(`AC-2 ${view} view is applied before first paint on a chapter page`, async ({ page }) => {
      await page.addInitScript((v) => localStorage.setItem('artemis-view', v), view);
      await page.goto('/en/gallery/far-side/');
      await expect(page.locator('html')).toHaveAttribute('data-view', view);
      const columns = await page.locator('.photo-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      const title = page.locator('.photo-card-title').first();
      if (view === 'mosaic') expect(columns).toBeGreaterThanOrEqual(2);
      if (view === 'immersive') expect(columns).toBe(1);
      if (view === 'mosaic') await expect(page.locator('.photo-card-caption').first()).toBeHidden();
      else await expect(page.locator('.photo-card-caption').first()).toBeVisible();
      await expect(title).toBeAttached();
    });
  }

  test('AC-2 switching the view in the preferences changes the layout', async ({ page }) => {
    await page.goto('/en/gallery/far-side/');
    await page.evaluate(() => { document.documentElement.dataset.view = 'immersive'; });
    expect(await page.locator('.photo-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
  });
});

test.describe('AC-6 keyboard use and focus on the views', () => {
  test('AC-6 photo links are reachable by keyboard and show a focus ring', async ({ page }) => {
    await page.goto('/en/gallery/far-side/');
    const link = page.locator('a.photo-card-link').first();
    await link.focus();
    await expect(link).toBeFocused();
    const outline = await link.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/en\/gallery\/far-side\/[A-Za-z0-9_-]+\/$/);
  });
});
