// Run with: node --test scripts/*.test.ts
// AGENTS.md, "Technical rules": the project is TypeScript only. No file of the project may be JavaScript.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

// Folders that hold dependencies, build output or tooling state, not the project's own files. The same names are in
// .gitignore; the walk does not use Git, so the guard also works in the Docker test image, which has no .git.
const SKIPPED = new Set([".git", "node_modules", "dist", ".astro", "playwright-report", "test-results", ".agent", ".obsidian"]);
const JAVASCRIPT = /\.(?:m|c)?jsx?$/i;

// Paths (relative to `dir`) of every JavaScript file below it, outside the skipped folders.
export async function findJavaScriptFiles(dir: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) found.push(...(await findJavaScriptFiles(dir, path)));
    } else if (JAVASCRIPT.test(entry.name)) {
      found.push(path);
    }
  }
  return found.sort();
}

test("no file of the project is JavaScript (.js, .mjs, .cjs or .jsx)", async () => {
  assert.deepEqual(await findJavaScriptFiles(fileURLToPath(root)), []);
});

test("the JavaScript guard finds files in any folder, skips dependency folders and needs no Git", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ts-only-"));
  try {
    for (const f of ["a.mjs", "src/b.js", "public/c.cjs", "tests/d.jsx", "src/ok.ts", "node_modules/x/e.js", "dist/f.js", ".astro/g.mjs"]) {
      await mkdir(join(dir, f, ".."), { recursive: true });
      await writeFile(join(dir, f), "");
    }
    assert.deepEqual(await findJavaScriptFiles(dir), ["a.mjs", "public/c.cjs", "src/b.js", "tests/d.jsx"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("TypeScript 7 checks the project, and TypeScript 6 is only the API that Astro's checker needs", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8")) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.match(pkg.devDependencies.typescript7 ?? "", /^npm:typescript@\^7\./);
  assert.match(pkg.devDependencies.typescript ?? "", /^npm:@typescript\/typescript6@/);
  assert.match(pkg.scripts.typecheck ?? "", /typescript7\/bin\/tsc --noEmit/);
  assert.match(pkg.scripts.check ?? "", /npm run typecheck/);
  assert.match(pkg.scripts.test ?? "", /npm run test:scripts/);
});

test("tsconfig refuses JavaScript and allows only syntax that Node's type stripping can run", async () => {
  // tsconfig.json allows comments, so they are removed before parsing.
  const text = (await readFile(new URL("tsconfig.json", root), "utf8")).replace(/^\s*\/\/.*$/gm, "");
  const options = (JSON.parse(text) as { compilerOptions: Record<string, unknown> }).compilerOptions;
  assert.equal(options.allowJs, false);
  assert.equal(options.erasableSyntaxOnly, true);
});
