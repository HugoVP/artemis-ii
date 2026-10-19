// Trusted fixture and verifier for the manual OpenCode smoke; no provider or GitHub access.
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const initialReadme = 'OpenCode pipeline smoke\n';
const finalReadme = `${initialReadme}OpenCode smoke passed.\n`;
const instructions = 'Read this file first. Append exactly "OpenCode smoke passed." on a new line in README.md. Run npm test. Write PASS followed by a newline to .agent/result.txt. Change nothing else. Do not use GitHub or inspect credentials.\n';
const packageFile = JSON.stringify({ private: true, type: 'module', scripts: { test: 'node check.ts' } }, null, 2) + '\n';
const check = `import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(readFileSync('README.md', 'utf8'), ${JSON.stringify(finalReadme)});
writeFileSync('.agent/test-passed.txt', 'PASS\\n');
console.log('Fixture test passed.');
`;
const unchanged = new Map([['AGENTS.md', instructions], ['package.json', packageFile], ['check.ts', check]]);

export async function prepareSmoke(root: string): Promise<void> {
  await mkdir(join(root, '.agent'), { recursive: true });
  for (const [file, text] of [...unchanged, ['README.md', initialReadme]]) await writeFile(join(root, file), text);
}

export async function verifySmoke(root: string): Promise<void> {
  const expected = new Map([...unchanged, ['README.md', finalReadme], ['.agent/result.txt', 'PASS\n'], ['.agent/test-passed.txt', 'PASS\n']]);
  const files: string[] = [];
  async function visit(relative = ''): Promise<void> {
    for (const name of await readdir(join(root, relative))) {
      const path = relative ? `${relative}/${name}` : name;
      const info = await lstat(join(root, path));
      if (info.isSymbolicLink()) throw new Error('Smoke output contains a symbolic link.');
      if (path === '.git' && info.isDirectory()) continue;
      if (info.isDirectory()) {
        if (path !== '.agent') throw new Error('Smoke output contains an unexpected directory.');
        await visit(path);
      }
      else if (info.isFile()) files.push(path);
      else throw new Error('Smoke output contains a non-regular file.');
    }
  }
  await visit();
  if (files.length !== expected.size || files.some(path => !expected.has(path))) throw new Error('Smoke output contains unexpected or missing files.');
  for (const [path, text] of expected) {
    if (await readFile(join(root, path), 'utf8') !== text) throw new Error(`Smoke content did not match the fixture contract: ${path}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = process.argv[3];
    if (!root) throw new Error('A fixture directory is required.');
    if (process.argv[2] === 'prepare') await prepareSmoke(root);
    else if (process.argv[2] === 'verify') { await verifySmoke(root); console.log('OpenCode smoke passed; no repository changes were published.'); }
    else throw new Error('Usage: opencode-smoke-fixture.ts prepare|verify <directory>');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Smoke verification failed.');
    process.exitCode = 1;
  }
}
