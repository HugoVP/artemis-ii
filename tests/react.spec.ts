import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}

test('AC-7 no React or JavaScript is shipped on pages without an island (TECH-03)', () => {
  for (const file of htmlFiles('dist')) {
    const html = readFileSync(file, 'utf8');
    expect(html, file).not.toContain('<astro-island');
    expect(html, file).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html, file).not.toMatch(/react/i);
  }
});
