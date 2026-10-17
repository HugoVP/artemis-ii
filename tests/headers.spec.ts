import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// SEC-05: security headers are shipped in public/_headers and copied into dist/ by the build.
const file = readFileSync('dist/_headers', 'utf8');
const header = (name: string) => file.match(new RegExp(`^\\s+${name}:\\s*(.+)$`, 'm'))?.[1] ?? '';

test('SEC-05 AC-4: dist/_headers applies the security headers to every path', () => {
  expect(file.trimStart().startsWith('/*')).toBe(true);
  for (const name of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
    expect(header(name), name).not.toBe('');
  }
  expect(header('X-Content-Type-Options')).toBe('nosniff');
});

test('SEC-05 AC-4: the CSP allows only own scripts and fonts, no framing or plugins', () => {
  const csp = header('Content-Security-Policy');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toMatch(/script-src[^;]*('unsafe-inline'|'unsafe-eval'|\*)/);
  expect(csp).toContain("font-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
});

test('SEC-05 AC-4: built pages load no scripts or fonts from other origins', () => {
  const html = readFileSync('dist/es/index.html', 'utf8');
  expect(html).not.toMatch(/<script[^>]+src="https?:/);
  expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
});
