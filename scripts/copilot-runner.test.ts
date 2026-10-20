import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCopilotModel, copilotArgs, runCopilot, COPILOT_VERSION } from './copilot-runner.ts';

test('CPL-02: require an explicit Copilot model and reject auto or shell syntax', () => {
  assert.equal(validateCopilotModel('example-model-1.5'), 'example-model-1.5');
  for (const value of [undefined, '', 'auto', 'Model', 'a;true', 'a b', 'a/b', 'a\n']) {
    assert.throws(() => validateCopilotModel(value), /explicit Copilot model/);
  }
});

test('CPL-03: arguments are headless, offline from GitHub tools and deny writes to git and the network', () => {
  const args = copilotArgs('example-model', 'Prompt');
  assert.deepEqual(args.slice(0, 4), ['-p', 'Prompt', '--model', 'example-model']);
  for (const flag of ['--no-ask-user', '--no-auto-update', '--no-remote-export', '--disable-builtin-mcps', '--silent', '--secret-env-vars=COPILOT_GITHUB_TOKEN']) {
    assert.ok(args.includes(flag), flag);
  }
  for (const denied of ['shell(git push)', 'shell(git commit)', 'shell(gh:*)', 'shell(rm)', 'shell(curl)', 'write(/work/.git)']) {
    assert.ok(args.includes(`--deny-tool=${denied}`), denied);
  }
  assert.ok(args.includes('--allow-tool=shell(npm:*)'));
  assert.ok(!args.some(arg => /^--(allow-all|yolo|allow-all-tools|allow-all-paths|allow-all-urls|enable-all-github-mcp-tools|share|remote)\b/.test(arg)));
  assert.ok(!args.some(arg => /github\.com|api\.github/.test(arg)));
});

async function fixture(body: string) {
  const root = await mkdtemp(join(tmpdir(), 'copilot-launch-'));
  const binary = join(root, 'copilot.ts');
  await writeFile(binary, `#!/usr/bin/env node\nif (process.argv[2] === '--version') { if (process.env.COPILOT_GITHUB_TOKEN) process.exit(2); console.log('GitHub Copilot CLI ${COPILOT_VERSION}.'); } else { ${body} }\n`, { mode: 0o700 });
  return { root, binary, env: { HOME: root, PATH: process.env.PATH, FIGMA: 'none', COPILOT_MODEL: 'example-model', COPILOT_GITHUB_TOKEN: 'fixture-only', AGENT_MODEL_KEY: 'must-not-inherit', COPILOT_ALLOW_ALL: 'true', GH_TOKEN: 'must-not-inherit' } };
}

test('CPL-02/05: authenticate only the CLI run, isolate its state and suppress its transcript', async t => {
  const local = await fixture(`
    const env = process.env;
    if (env.COPILOT_GITHUB_TOKEN !== 'fixture-only' || env.AGENT_MODEL_KEY || env.GH_TOKEN || env.COPILOT_ALLOW_ALL || env.COPILOT_AUTO_UPDATE !== 'false' || !env.COPILOT_HOME.includes('copilot-state-')) process.exit(3);
    console.log('PRIVATE TRANSCRIPT');
    console.error('PRIVATE PROGRESS');
  `);
  const logs: string[] = [];
  t.mock.method(console, 'log', (message: string) => logs.push(message));
  try {
    await runCopilot('Complete the fixture', local.env, local.binary);
    assert.deepEqual(await readdir(local.root), ['copilot.ts']);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs.join('\n'), /PRIVATE|fixture-only|must-not-inherit/);
  } finally { await rm(local.root, { recursive: true, force: true }); }
});

test('CPL-05: a nonzero exit fails without echoing the transcript', async () => {
  const local = await fixture(`console.log('PRIVATE TRANSCRIPT'); process.exit(1);`);
  try { await assert.rejects(runCopilot('Prompt', local.env, local.binary), error => error instanceof Error && /did not complete/.test(error.message) && !error.message.includes('PRIVATE')); }
  finally { await rm(local.root, { recursive: true, force: true }); }
});

test('CPL-05: an error line is reported redacted even with a zero exit', async () => {
  const local = await fixture(`console.error('Error: No authentication information found for fixture-only'); process.exit(0);`);
  try {
    await assert.rejects(runCopilot('Prompt', local.env, local.binary), error => error instanceof Error && /No authentication information found/.test(error.message) && !error.message.includes('fixture-only'));
  } finally { await rm(local.root, { recursive: true, force: true }); }
});

test('CPL-05: an error line split across stderr chunks is still detected, and a split token is still redacted', async () => {
  // Two writes with a pause, so the launcher receives them as separate chunks; the last line has no newline.
  const local = await fixture(`
    process.stderr.write('progress\\nErr');
    setTimeout(() => { process.stderr.write('or: bad credentials fixture-'); setTimeout(() => { process.stderr.write('only rejected'); process.exit(0); }, 100); }, 100);
  `);
  try {
    await assert.rejects(runCopilot('Prompt', local.env, local.binary), error => error instanceof Error && /bad credentials \[redacted\] rejected/.test(error.message) && !/fixture-/.test(error.message));
  } finally { await rm(local.root, { recursive: true, force: true }); }
});

test('CPL-05: an error line on stdout fails a zero-exit run, split across chunks too, with the transcript still suppressed', async () => {
  const local = await fixture(`
    process.stdout.write('PRIVATE TRANSCRIPT\\nEr');
    setTimeout(() => { process.stdout.write('ror: authentication failed for fixture-'); setTimeout(() => { process.stdout.write('only'); process.exit(0); }, 100); }, 100);
  `);
  try {
    await assert.rejects(runCopilot('Prompt', local.env, local.binary), error => error instanceof Error && /authentication failed for \[redacted\]/.test(error.message) && !/fixture-|PRIVATE/.test(error.message));
  } finally { await rm(local.root, { recursive: true, force: true }); }
});

test('CPL-02/03: refuse a missing key, a Figma stage or the wrong CLI version before the run', async () => {
  const env = { HOME: '/unused', FIGMA: 'none', COPILOT_MODEL: 'example-model' };
  await assert.rejects(runCopilot('Prompt', env, '/must-not-exist'), /missing/);
  await assert.rejects(runCopilot('Prompt', { ...env, COPILOT_GITHUB_TOKEN: 'fixture-only', FIGMA: 'read' }, '/must-not-exist'), /Figma/);
  const local = await fixture('process.exit(0);');
  try {
    await writeFile(local.binary, `#!/usr/bin/env node\nconsole.log('GitHub Copilot CLI 0.0.1.');\n`, { mode: 0o700 });
    await assert.rejects(runCopilot('Prompt', local.env, local.binary), /must contain Copilot CLI/);
  } finally { await rm(local.root, { recursive: true, force: true }); }
});
