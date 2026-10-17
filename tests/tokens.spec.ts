import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// AC-4 (DES-02): every Figma variable in docs/specs/design.md has the CSS variable with the same values per mode.
const design = readFileSync('docs/specs/design.md', 'utf8');
const css = readFileSync('src/styles/tokens.css', 'utf8');

/** Declarations per CSS block selector; `@theme static` is the default (first) mode. */
function blocks(source: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const [, selector, body] of source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const key = selector.trim().replace(/\s+/g, ' ');
    const decls = out.get(key) ?? {};
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decls[name] = value.trim().toLowerCase();
    out.set(key, decls);
  }
  return out;
}

/** Rows of the design.md table that follows `heading`: [cssVariable, ...modeValues]. */
function table(heading: string): string[][] {
  const section = design.split(heading)[1]?.split(/\n###? /)[0] ?? '';
  return section
    .split('\n')
    .filter((l) => l.startsWith('| `'))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, '')))
    .map(([, cssVar, ...values]) => [cssVar, ...values]);
}

const b = blocks(css);
const px = (v: string) => `${v}px`;

test.describe('AC-4 CSS tokens match design.md (DES-02)', () => {
  test('AC-4 color: dark and light', () => {
    const rows = table('### Color');
    expect(rows.length).toBe(7);
    const dark = b.get('@theme static')!;
    const light = b.get(":root[data-theme='light']")!;
    for (const [name, d, l] of rows) {
      expect(dark[name], name).toBe(d.toLowerCase());
      expect(light[name], name).toBe(l.toLowerCase());
    }
  });

  test('AC-4 density: compact, comfortable, spacious', () => {
    const rows = table('### Density');
    expect(rows.length).toBe(8);
    const modes = [
      ["compact", b.get(":root[data-density='compact']")!],
      ["comfortable", { ...b.get(':root, :root[data-density=\'comfortable\']')! }],
      ["spacious", b.get(":root[data-density='spacious']")!],
    ] as const;
    for (const [name, ...values] of rows) {
      modes.forEach(([mode, decls], i) => expect(decls[name], `${name} ${mode}`).toBe(px(values[i])));
    }
  });

  test('AC-4 type and shape', () => {
    const rows = table('### Type and shape');
    expect(rows.length).toBe(9);
    const type = [...b.entries()].filter(([k]) => k === '@theme static').map(([, v]) => v)[0]!;
    for (const [name, value] of rows) {
      if (name.startsWith('--font-')) {
        expect(type[name] ?? '', name).toContain(value.split(' ')[0].toLowerCase());
      } else {
        expect(type[name], name).toBe(px(value));
      }
    }
  });
});
