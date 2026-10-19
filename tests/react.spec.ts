import { test, expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}

async function inspect(page: Page, html: string) {
  // Use Chromium's parser independently of the build's parser, including HTML error recovery.
  return page.evaluate(markup => {
    const document = new DOMParser().parseFromString(markup, 'text/html');
    return {
      islands: [...document.querySelectorAll('astro-island')].map(island => island.getAttribute('component-url')),
      scripts: [...document.scripts].map(script => ({ src: script.getAttribute('src'), text: script.textContent?.trim() })),
    };
  }, html);
}

test('SEC-03 HTML inspection sees upper/mixed-case scripts and malformed closing tags', async ({ page }) => {
  const result = await inspect(page, '<SCRIPT>first()</SCRIPT><ScRiPt>second()</sCrIpT ignored="yes">');
  expect(result.scripts).toEqual([{ src: null, text: 'first()' }, { src: null, text: 'second()' }]);
});

test('AC-7 TECH-03 React is limited to the preferences island, with CSP-safe external scripts', async ({ page }) => {
  for (const file of htmlFiles('dist')) {
    const html = readFileSync(file, 'utf8');
    const result = await inspect(page, html);
    if (resolve(file) === resolve('dist/index.html')) expect(result.islands).toHaveLength(0);
    else {
      expect(result.islands, file).toHaveLength(1);
      expect(result.islands[0], file).toContain('Preferences');
    }
    for (const script of result.scripts) {
      expect(script.src, file).toBeTruthy();
      expect(new URL(script.src!, 'https://artemis.example').origin, file).toBe('https://artemis.example');
      expect(script.text, file).toBe('');
    }
    expect(result.scripts.some(script => script.src === '/preferences.js'), file).toBe(true);
  }
});
