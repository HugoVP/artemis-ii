import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateOpenCodeModel, openCodeConfig, runOpenCode } from './opencode-runner.ts';

test('OPC-02: require an explicit Go model and reject another provider or shell syntax', () => {
  assert.equal(validateOpenCodeModel('opencode-go/minimax-m3'), 'opencode-go/minimax-m3');
  for (const value of [undefined, '', 'minimax-m3', 'opencode/model', 'opencode-go/', 'opencode-go/a;true', 'opencode-go/a/b', 'opencode-go/a\n']) {
    assert.throws(() => validateOpenCodeModel(value), /explicit/);
  }
});

test('OPC-03: pipeline config disables sharing, fallback providers, Figma and interactive tools', () => {
  const config = openCodeConfig('opencode-go/minimax-m3');
  assert.equal(config.share, 'disabled');
  assert.deepEqual(config.enabled_providers, ['opencode-go']);
  assert.deepEqual(config.mcp, {});
  assert.equal(config.small_model, config.model);
  assert.equal(config.permission['*'], 'deny');
  assert.equal(config.permission.bash['git push*'], 'deny');
  assert.equal(config.permission.edit['/work/.git/**'], 'deny');
  assert.equal(config.permission.external_directory, 'deny');
  assert.equal(config.permission.question, 'deny');
  assert.equal(config.permission.task, 'deny');
  assert.equal(config.provider['opencode-go'].options.apiKey, '{env:OPENCODE_API_KEY}');
});

async function fixture(body: string) {
  const root = await mkdtemp(join(tmpdir(), 'opencode-launch-'));
  const binary = join(root, 'opencode.ts');
  await writeFile(binary, `#!/usr/bin/env node\nif (process.argv[2] === '--version') { if (process.env.OPENCODE_API_KEY) process.exit(2); console.log('1.19.3'); } else { ${body} }\n`, { mode: 0o700 });
  return { root, binary, env: { HOME: root, PATH: process.env.PATH, FIGMA: 'none', OPENCODE_MODEL: 'opencode-go/minimax-m3', OPENCODE_API_KEY: 'fixture-only', AGENT_MODEL_KEY: 'must-not-inherit' } };
}

test('OPC-02/05: authenticate only the CLI run, isolate config and suppress its raw output', async t => {
  const local = await fixture(`
    const cfg = JSON.parse(require('fs').readFileSync(process.env.OPENCODE_CONFIG, 'utf8'));
    if (process.env.OPENCODE_API_KEY !== 'fixture-only' || process.env.AGENT_MODEL_KEY || process.env.OPENCODE_DISABLE_PROJECT_CONFIG !== 'true' || process.env.OPENCODE_PURE !== 'true' || cfg.share !== 'disabled' || !process.argv.includes('--pure')) process.exit(2);
    console.error('PRIVATE PROVIDER OUTPUT');
    console.log(JSON.stringify({ type: 'text', part: { text: 'PRIVATE TRANSCRIPT' } }));
    console.log(JSON.stringify({ type: 'step_finish', part: { reason: 'stop' } }));
  `);
  const logs: string[] = [];
  t.mock.method(console, 'log', (message: string) => logs.push(message));
  try {
    await runOpenCode('Complete the fixture', local.env, local.binary);
    assert.deepEqual(await readdir(local.root), ['opencode.ts']);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs.join('\n'), /PRIVATE|fixture-only|must-not-inherit/);
  } finally { await rm(local.root, { recursive: true, force: true }); }
});

for (const [name, output, exit] of [
  ['error event with a zero exit', { type: 'error', error: { message: 'PRIVATE ERROR' } }, 0],
  ['nonzero exit', { type: 'step_finish', part: { reason: 'stop' } }, 1],
  ['missing final completion', { type: 'text', part: { text: 'Incomplete' } }, 0],
] as const) {
  test(`OPC-05: reject ${name} without echoing provider output`, async () => {
    const local = await fixture(`console.log(${JSON.stringify(JSON.stringify(output))}); process.exit(${exit});`);
    try { await assert.rejects(runOpenCode('Complete the fixture', local.env, local.binary), error => error instanceof Error && /did not complete/.test(error.message) && !error.message.includes('PRIVATE')); }
    finally { await rm(local.root, { recursive: true, force: true }); }
  });
}

test('OPC-02/03: refuse a missing model key or Figma stage before launching the CLI', async () => {
  const env = { HOME: '/unused', FIGMA: 'none', OPENCODE_MODEL: 'opencode-go/minimax-m3' };
  await assert.rejects(runOpenCode('Prompt', env, '/must-not-exist'), /missing/);
  await assert.rejects(runOpenCode('Prompt', { ...env, OPENCODE_API_KEY: 'fixture-only', FIGMA: 'read' }, '/must-not-exist'), /Figma/);
});
