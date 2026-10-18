// Run with: node --test scripts/*.test.ts
// AGENTS.md, "Technical rules": the project is TypeScript only. No tracked file may be JavaScript.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);

test("no tracked file is JavaScript (.js, .mjs, .cjs or .jsx)", () => {
  assert.deepEqual(tracked.filter((f) => /\.(?:m|c)?jsx?$/i.test(f)), []);
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
