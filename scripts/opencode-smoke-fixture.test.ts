import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareSmoke, verifySmoke } from './opencode-smoke-fixture.ts';

test('OPC-04: smoke validates the exact edit, test execution marker and result file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opencode-smoke-'));
  try {
    await prepareSmoke(root);
    await assert.rejects(verifySmoke(root), /missing/);
    await writeFile(join(root, 'README.md'), (await readFile(join(root, 'README.md'), 'utf8')) + 'OpenCode smoke passed.\n');
    await writeFile(join(root, '.agent/result.txt'), 'PASS\n');
    execFileSync(process.execPath, ['check.ts'], { cwd: root });
    await verifySmoke(root);
    await writeFile(join(root, 'extra.txt'), 'Unexpected');
    await assert.rejects(verifySmoke(root), /unexpected/);
    await rm(join(root, 'extra.txt'));
    await writeFile(join(root, 'AGENTS.md'), 'Changed');
    await assert.rejects(verifySmoke(root), /content/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('OPC-04: smoke rejects symlinks before reading their target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opencode-smoke-link-'));
  try {
    await prepareSmoke(root);
    await symlink('/must-not-be-read', join(root, 'extra.txt'));
    await assert.rejects(verifySmoke(root), /symbolic link/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
