import { test, expect } from '@playwright/test';

for (const [locale, expected] of [['es-MX', 'es'], ['en-GB', 'en'], ['fr-FR', 'es']]) {
  test(`Stage 04 AC-7 I18N-02 first visit ${locale} selects ${expected}, later visits keep choice`, async ({ browser }) => {
    const context = await browser.newContext({ locale }); const page = await context.newPage();
    await page.goto('/'); await expect(page).toHaveURL(new RegExp(`/${expected}/$`));
    const other = expected === 'es' ? 'en' : 'es';
    await page.goto(`/${other}/mission/`.replace('/es/mission/', '/es/mision/'));
    await page.goto('/'); await expect(page).toHaveURL(new RegExp(`/${other}/$`));
    await context.close();
  });
}

test('Stage 04 AC-7 I18N-02 blocked storage and unsupported language fall back to Spanish', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-DE' });
  await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked'); } }));
  const page = await context.newPage(); await page.goto('/'); await expect(page).toHaveURL(/\/es\/$/); await context.close();
});

test('Stage 04 AC-7 I18N-03 switching language preserves section, chapter and photo', async ({ page }) => {
  for (const [es, en] of [['mision/', 'mission/'], ['por-que-importa/', 'why-it-matters/'], ['galeria/rumbo-a-la-luna/', 'gallery/outbound/'], ['galeria/despegue/KSC-04012026-Artemis_II_Launch-1/', 'gallery/launch/KSC-04012026-Artemis_II_Launch-1/']]) {
    await page.goto(`/es/${es}`);
    await page.getByRole('button', { name: /^(Ajustes|Menú)$/ }).filter({ visible: true }).click();
    await page.getByRole('link', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${en}$`));
    await page.getByRole('button', { name: /^(Settings|Menu)$/ }).filter({ visible: true }).click();
    await page.getByRole('link', { name: 'Español', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/es/${es}$`));
  }
});
