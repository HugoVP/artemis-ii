import { test, expect } from '@playwright/test';

const sections = {
  es: ['/es/', '/es/despegue/', '/es/mision/', '/es/por-que-importa/', '/es/galeria/', '/es/acerca/'],
  en: ['/en/', '/en/launch/', '/en/mission/', '/en/why-it-matters/', '/en/gallery/', '/en/about/'],
};

for (const lang of ['es', 'en'] as const) {
  for (const path of sections[lang]) {
    test(`AC-3 top bar links to every section and footer has credit and AI notice link: ${path} (NAV-02)`, async ({ page }) => {
      await page.goto(path);
      // On phones the links live in the Menu panel; open it (a native popover, no JavaScript).
      const menu = page.getByRole('button', { name: /^(Menu|Menú|Settings|Ajustes)$/ }).filter({ visible: true });
      await menu.click();
      for (const href of sections[lang]) {
        await expect(page.locator(`#prefs a[href="${href}"], header nav a[href="${href}"]`).filter({ visible: true }).first()).toBeVisible();
      }
      const footer = page.locator('footer');
      await expect(footer).toContainText(lang === 'es' ? 'Crédito: NASA' : 'Credit: NASA');
      await expect(footer.locator(`a[href="/${lang}/${lang === 'es' ? 'acerca' : 'about'}/#ai"]`)).toBeVisible();
      // The link must lead somewhere: the About page has the AI notice section with that id.
      await footer.locator('a[href$="#ai"]').click();
      await expect(page).toHaveURL(new RegExp(`/${lang === 'es' ? 'acerca' : 'about'}/#ai$`));
      await expect(page.locator('#ai')).toBeVisible();
    });
  }
}
