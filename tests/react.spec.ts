import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}

test('AC-7 TECH-03 React is limited to the preferences island, with CSP-safe external scripts', () => {
  for (const file of htmlFiles('dist')) {
    const html = readFileSync(file, 'utf8');
    if (file === 'dist/index.html') expect(html).not.toContain('<astro-island');
    else {
      expect(html.match(/<astro-island /g), file).toHaveLength(1);
      expect(html, file).toMatch(/component-url="[^"]*Preferences/);
    }
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      expect(script[1], file).toMatch(/\bsrc=/);
      expect(script[2].trim(), file).toBe('');
    }
    expect(html, file).toContain('src="/preferences.js"');
  }
});
