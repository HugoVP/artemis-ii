import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const csp = readFileSync('public/_headers', 'utf8').match(/Content-Security-Policy: (.+)/)![1];
test.beforeEach(async ({ page }) => {
  // Exercise the actual deployed CSP; the minimal local static server does not add headers.
  await page.route('**/*', async route => {
    if (!route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
});
async function open(page: Page) {
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  await page.getByRole('button', { name: /^(Settings|Menu|Ajustes|Menú)$/ }).filter({ visible: true }).click();
}
const choice = (page: Page, group: string, name: string) => page.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true });

test('Stage 04 AC-1 PREF-01 dark default, light and live system theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/en/'); await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await choice(page, 'Theme', 'Light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await choice(page, 'Theme', 'System').click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await choice(page, 'Theme', 'Dark').click();
  await page.emulateMedia({ colorScheme: 'dark' }); await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('Stage 04 AC-2 PREF-02 stored theme and density precede body parsing and first paint', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('artemis-theme', 'light'); localStorage.setItem('artemis-density', 'spacious');
    const samples: string[] = [];
    Object.assign(window, { preferenceSamples: samples });
    new MutationObserver(() => {
      if (document.body) samples.push(`${document.documentElement.dataset.theme}/${document.documentElement.dataset.density}`);
    }).observe(document, { childList: true, subtree: true });
    requestAnimationFrame(function sample() {
      if (document.body) samples.push(`${document.documentElement.dataset.theme}/${document.documentElement.dataset.density}`);
      requestAnimationFrame(sample);
    });
  });
  await page.goto('/en/'); await open(page);
  const samples = await page.evaluate(() => (window as unknown as { preferenceSamples: string[] }).preferenceSamples);
  expect(samples.length).toBeGreaterThan(0);
  expect([...new Set(samples)]).toEqual(['light/spacious']);
  await expect(choice(page, 'Theme', 'Light')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'Density', 'Spacious')).toHaveAttribute('aria-pressed', 'true');
});

for (const [density, size, space, width] of [['Compact', '15px', '16px', '880px'], ['Comfortable', '16px', '24px', '1040px'], ['Spacious', '18px', '32px', '1200px']]) {
  test(`Stage 04 AC-3 PREF-03 ${density} changes spacing, text and width on every page`, async ({ page }) => {
    await page.goto('/en/'); await open(page); await choice(page, 'Density', density!).click();
    for (const lang of ['es', 'en']) {
      const slugs = lang === 'es' ? ['', 'despegue/', 'mision/', 'por-que-importa/', 'acerca/', 'galeria/', 'galeria/despegue/', 'galeria/rumbo-a-la-luna/', 'galeria/lado-oculto/', 'galeria/eclipse/', 'galeria/regreso/', 'galeria/despegue/KSC-04012026-Artemis_II_Launch-1/'] : ['', 'launch/', 'mission/', 'why-it-matters/', 'about/', 'gallery/', 'gallery/launch/', 'gallery/outbound/', 'gallery/far-side/', 'gallery/eclipse/', 'gallery/return/', 'gallery/launch/KSC-04012026-Artemis_II_Launch-1/'];
      for (const slug of slugs) {
        await page.goto(`/${lang}/${slug}`);
        const actual = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement), main = getComputedStyle(document.querySelector('main')!);
          return [root.fontSize, main.paddingLeft, main.maxWidth];
        });
        expect(actual, `/${lang}/${slug}`).toEqual([size, space, width]);
      }
    }
  });
}

test('Stage 04 AC-4 PREF-04 gallery control is scoped, persistent and independent of density', async ({ page }) => {
  for (const path of ['/en/', '/en/launch/', '/en/mission/', '/en/why-it-matters/', '/en/about/']) {
    await page.goto(path); await expect(page.getByRole('group', { name: 'View', exact: true })).toHaveCount(0);
  }
  await page.goto('/en/gallery/'); await open(page);
  await expect(choice(page, 'View', 'Gallery')).toHaveAttribute('aria-pressed', 'true');
  for (const view of ['Mosaic', 'Immersive', 'Gallery']) {
    await choice(page, 'View', view).click();
    await choice(page, 'Density', 'Compact').click();
    await expect(choice(page, 'View', view)).toHaveAttribute('aria-pressed', 'true');
    await choice(page, 'Density', 'Spacious').click();
    await expect(choice(page, 'View', view)).toHaveAttribute('aria-pressed', 'true');
  }
  await choice(page, 'View', 'Immersive').click();
  for (const path of ['/en/gallery/launch/', '/en/gallery/launch/KSC-04012026-Artemis_II_Launch-1/', '/es/galeria/']) {
    await page.goto(path); await open(page);
    await expect(page.locator('html')).toHaveAttribute('data-view', 'immersive');
    await expect(page.locator('html')).toHaveAttribute('data-density', 'spacious');
  }
});

test('Stage 04 AC-5 PREF-05 persistence survives reloads and invalid values use defaults', async ({ page }) => {
  await page.goto('/en/'); await open(page);
  await choice(page, 'Theme', 'Light').click(); await choice(page, 'Density', 'Compact').click();
  await page.reload(); await open(page);
  await expect(choice(page, 'Theme', 'Light')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'Density', 'Compact')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => { for (const key of ['theme', 'density', 'view']) localStorage.setItem(`artemis-${key}`, 'invalid'); });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable');
  await expect(page.locator('html')).toHaveAttribute('data-view', 'gallery');
});

test('Stage 04 AC-5 PREF-05 blocked storage keeps all controls working under CSP', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await page.goto('/en/gallery/'); await open(page);
  await choice(page, 'Theme', 'Light').click(); await choice(page, 'Density', 'Spacious').click(); await choice(page, 'View', 'Mosaic').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'spacious');
  await expect(page.locator('html')).toHaveAttribute('data-view', 'mosaic');
  await page.getByRole('link', { name: 'Español', exact: true }).click();
  await expect(page).toHaveURL(/\/es\/galeria\/$/);
  expect(errors).toEqual([]);
});

test('Stage 04 AC-6 PREF-06 keyboard controls have labelled groups and visible focus', async ({ page }) => {
  await page.goto('/en/gallery/');
  const menu = page.getByRole('button', { name: /^(Settings|Menu)$/ }).filter({ visible: true });
  await menu.focus(); await page.keyboard.press('Enter');
  const light = choice(page, 'Theme', 'Light'); await light.focus(); await page.keyboard.press('Space');
  await expect(light).toHaveAttribute('aria-pressed', 'true');
  expect(await light.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('solid');
  const density = choice(page, 'Density', 'Compact'); await density.focus(); await page.keyboard.press('Enter');
  await expect(density).toHaveAttribute('aria-pressed', 'true');
  const view = choice(page, 'View', 'Mosaic'); await view.focus(); await page.keyboard.press('Space');
  await expect(view).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); await expect(page.locator('#prefs')).not.toBeVisible();
  await menu.focus(); await page.keyboard.press('Enter');
  const language = page.getByRole('link', { name: 'Español', exact: true }); await language.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/es\/galeria\/$/);
});
