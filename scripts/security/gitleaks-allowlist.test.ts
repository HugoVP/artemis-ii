// Runs the real Gitleaks binary against the NASA path-key allowlist in `.gitleaks.toml`.
// It is not part of `npm run test:scripts` (which only globs `scripts/*.test.ts`) because it needs the pinned
// binary: run it with `npm run test:gitleaks`. The Security workflow does, after verifying the download's checksum.
// Without the binary this file fails on purpose: a skipped scanner check would look like a passing one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PINNED_VERSION = '8.28.0';
const bin = process.env.GITLEAKS_BIN ? resolve(process.env.GITLEAKS_BIN) : 'gitleaks';
const configPath = fileURLToPath(new URL('../../.gitleaks.toml', import.meta.url));

// Field names and credential-shaped values are assembled at runtime so this file never contains a literal
// that the secret scan (which reads this file too) could report.
const fieldName = ['path', 'Key'].join('');
const nasaId = 'KSC-20260410-PH-JNV01_0001';
const credentialShaped = ['sk', 'live', '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c'].join('_');

function scan(cwd: string) {
  return spawnSync(bin, ['dir', '.', '--config', configPath, '--no-banner'], { cwd, encoding: 'utf8' });
}

test('SEC-01: the pinned Gitleaks binary is available', () => {
  const version = spawnSync(bin, ['version'], { encoding: 'utf8' });
  assert.equal(
    version.status,
    0,
    `Gitleaks ${PINNED_VERSION} is required (put it on PATH or set GITLEAKS_BIN): ${version.error?.message ?? version.stderr}`,
  );
  assert.equal(version.stdout.trim(), PINNED_VERSION, 'the scanner version matches the one CI pins');
});

test('SEC-01: Gitleaks suppresses a NASA image ID only in allowed photo files and reports credential-shaped path keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gitleaks-nasa-'));
  try {
    const photos = join(dir, 'src', 'content', 'photos');
    const target = join(photos, `${nasaId}.json`);
    await mkdir(photos, { recursive: true });

    await writeFile(target, `{\n  "${fieldName}": "${nasaId}"\n}\n`);
    assert.equal(scan(dir).status, 0, 'a verified NASA ID in an allowed path and field is suppressed');

    const elsewhere = join(dir, 'src', 'lib', 'media.ts');
    await mkdir(join(dir, 'src', 'lib'), { recursive: true });
    await writeFile(elsewhere, `export const sample = { "${fieldName}": "${nasaId}" };\n`);
    assert.equal(scan(dir).status, 1, 'the same assignment outside the allowed paths is reported');
    await rm(elsewhere);

    await writeFile(target, `{\n  "${fieldName}": "${credentialShaped}"\n}\n`);
    assert.equal(scan(dir).status, 1, 'a credential-shaped value in the same allowed path and field is reported');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
