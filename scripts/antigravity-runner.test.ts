import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAntigravityModel, antigravityArgs, antigravitySettings, runAntigravity, AGY_VERSION, AGY_BINARY, BUILD_ALLOW, REVIEW_ALLOW } from './antigravity-runner.ts';

test('AGY-02: require an explicit model slug and reject auto or shell syntax', () => {
  assert.equal(validateAntigravityModel('example-model-4'), 'example-model-4');
  for (const value of [undefined, '', 'auto', 'Model', 'a;true', 'a b', 'a/b', 'a\n']) {
    assert.throws(() => validateAntigravityModel(value), /explicit Antigravity model/);
  }
});

test('AGY-03: build and review arguments and settings use the Gemini API key and the narrowest mode', () => {
  const build = antigravityArgs('example-model', 'Prompt', 'build', '/tmp/log');
  assert.deepEqual(build.slice(0, 6), ['--print', 'Prompt', '--model', 'example-model', '--mode', 'accept-edits']);
  assert.ok(build.includes('--disable-slash-commands'));
  const review = antigravityArgs('example-model', 'Prompt', 'review', '/tmp/log');
  assert.deepEqual(review.slice(4, 6), ['--mode', 'plan']);
  // 1.4.3 ignores --mode plan when slash commands are disabled.
  assert.ok(!review.includes('--disable-slash-commands'));
  assert.equal(AGY_BINARY, '/opt/agy/antigravity');
  for (const args of [build, antigravityArgs('example-model', 'Prompt', 'review', '/tmp/log')]) {
    assert.ok(!args.some(arg => /dangerously|--sandbox|--remote-control|--continue|--conversation|--project|--new-project|--mode=auto|^auto$/.test(arg)));
  }
  assert.equal(antigravitySettings('build').modelProvider, 'gemini');
  assert.deepEqual(antigravitySettings('build').permission.allow.slice(0, BUILD_ALLOW.length), BUILD_ALLOW);
  assert.ok(antigravitySettings('build').permission.allow.includes('read_url(images-api.nasa.gov)'));
  assert.ok(!antigravitySettings('build').permission.allow.some(rule => rule.startsWith('mcp(')));
  assert.deepEqual(antigravitySettings('review').permission.allow, REVIEW_ALLOW);
  assert.ok(!REVIEW_ALLOW.some(rule => /npm|npx|node|mkdir/.test(rule)));
  assert.ok(![...BUILD_ALLOW, ...REVIEW_ALLOW].some(rule => /push|commit|config|rm|curl|wget|gh\b|^command\(\)$|\*/.test(rule)));
});

async function fixture(body: string) {
  const root = await mkdtemp(join(tmpdir(), 'agy-launch-'));
  const binary = join(root, 'agy.ts');
  await writeFile(binary, `#!/usr/bin/env node\nconst fs = require('fs');\nif (process.argv[2] === '--version') { if (process.env.GEMINI_API_KEY) process.exit(2); console.log('${AGY_VERSION}'); } else { ${body} }\n`, { mode: 0o700 });
  await mkdir(join(root, 'work', '.agent'), { recursive: true });
  return { root, binary, env: { HOME: root, PATH: process.env.PATH, FIGMA: 'none', ANTIGRAVITY_MODEL: 'example-model', GEMINI_API_KEY: 'fixture-only', AGENT_MODEL_KEY: 'must-not-inherit', GOOGLE_APPLICATION_CREDENTIALS: '/must-not-inherit', GOOGLE_GEMINI_BASE_URL: 'https://example.invalid' } };
}

test('AGY-02/05: authenticate only the CLI run, isolate its home and settings, and suppress its transcript', async t => {
  const local = await fixture(`
    const env = process.env;
    const settings = JSON.parse(fs.readFileSync(env.HOME + '/.gemini/antigravity-cli/settings.json', 'utf8'));
    if (env.GEMINI_API_KEY !== 'fixture-only' || env.AGENT_MODEL_KEY || env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_GEMINI_BASE_URL || !env.HOME.includes('agy-home-') || settings.modelProvider !== 'gemini' || !process.argv.includes('accept-edits')) process.exit(3);
    console.log('PRIVATE TRANSCRIPT');
    console.error('PRIVATE PROGRESS');
  `);
  const logs: string[] = [];
  t.mock.method(console, 'log', (message: string) => logs.push(message));
  try {
    await runAntigravity('Complete the fixture', local.env, local.binary);
    assert.deepEqual((await readdir(local.root)).sort(), ['agy.ts', 'work']);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(logs.join('\n'), /PRIVATE|fixture-only|must-not-inherit/);
  } finally { await rm(local.root, { recursive: true, force: true }); }
});

test('AGY-06: review mode runs in plan mode and the launcher writes the printed review, redacted', async () => {
  const local = await fixture(`
    if (!process.argv.includes('plan')) process.exit(3);
    const settings = JSON.parse(fs.readFileSync(process.env.HOME + '/.gemini/antigravity-cli/settings.json', 'utf8'));
    if (settings.permission.allow.some(rule => rule.includes('npm'))) process.exit(4);
    console.log('No blocking findings. fixture-only');
    console.log('<!-- agent-review: {"verdict": "pass", "findings": 0} -->');
  `);
  const file = join(local.root, 'work', '.agent', 'review.md');
  try {
    await runAntigravity('Review', local.env, local.binary, 'review', file);
    const review = await readFile(file, 'utf8');
    assert.match(review, /agent-review: \{"verdict": "pass"/);
    assert.doesNotMatch(review, /fixture-only/);
  } finally { await rm(local.root, { recursive: true, force: true }); }
});

for (const [name, body, expected] of [
  ['a nonzero exit', `console.log('PRIVATE TRANSCRIPT'); process.exit(1);`, /exit 1/],
  ['a structured AGY_ERROR line with a zero exit', `console.error('AGY_ERROR: {"short_error": "PRIVATE fixture-only", "status": "RESOURCE_EXHAUSTED", "error_code": 429, "code_kind": "http", "retryable": false, "error_id": "x"}'); process.exit(0);`, /AGY_ERROR RESOURCE_EXHAUSTED 429/],
  ['an interactive sign-in prompt', `console.log('Authentication required. Please visit the URL to log in:'); process.exit(1);`, /interactive sign-in/],
  ['an Error line', `console.error('Error: quota exceeded for fixture-only'); process.exit(0);`, /quota exceeded for \[redacted\]/],
] as const) {
  test(`AGY-05: fail on ${name} without echoing the transcript or the key`, async () => {
    const local = await fixture(body);
    try {
      await assert.rejects(runAntigravity('Prompt', local.env, local.binary), error => error instanceof Error && expected.test(error.message) && !/PRIVATE|fixture-only/.test(error.message));
    } finally { await rm(local.root, { recursive: true, force: true }); }
  });
}

test('AGY-02/03: refuse a missing key, a Figma stage or the wrong CLI version before the run', async () => {
  const env = { HOME: '/unused', FIGMA: 'none', ANTIGRAVITY_MODEL: 'example-model' };
  await assert.rejects(runAntigravity('Prompt', env, '/must-not-exist'), /missing/);
  await assert.rejects(runAntigravity('Prompt', { ...env, GEMINI_API_KEY: 'fixture-only', FIGMA: 'write' }, '/must-not-exist'), /Figma read/);
  await assert.rejects(runAntigravity('Prompt', { ...env, GEMINI_API_KEY: 'fixture-only', FIGMA: 'read' }, '/must-not-exist', 'review'), /reviews get no Figma/);
  const local = await fixture('process.exit(0);');
  try {
    await writeFile(local.binary, `#!/usr/bin/env node\nconsole.log('0.0.1');\n`, { mode: 0o700 });
    await assert.rejects(runAntigravity('Prompt', local.env, local.binary), /must contain Antigravity CLI/);
  } finally { await rm(local.root, { recursive: true, force: true }); }
});

test('AGY-05: a structured error is redacted before it is cut, like an Error line', async () => {
  const local = await fixture(`console.error('AGY_ERROR: {"status": "RESOURCE_EXHAUSTED fixture-only", "error_code": "x-fixture-only-y"}'); process.exit(3);`);
  try {
    await assert.rejects(runAntigravity('Prompt', local.env, local.binary), error => error instanceof Error && /AGY_ERROR RESOURCE_EXHAUSTED \[redacted\] x-\[redacted\]-y/.test(error.message) && !error.message.includes('fixture-only'));
  } finally { await rm(local.root, { recursive: true, force: true }); }
});

for (const mode of ['build', 'review'] as const) {
  test(`AGY-05: a sign-in prompt without a newline stops the CLI at once in ${mode} mode`, async () => {
    const local = await fixture(`process.stdout.write('Authentication required. Please visit the URL to log in:'); setTimeout(() => {}, 120000);`);
    const started = Date.now();
    try {
      await assert.rejects(runAntigravity('Prompt', local.env, local.binary, mode, join(local.root, 'work', '.agent', 'review.md')), /interactive sign-in/);
      assert.ok(Date.now() - started < 20_000, 'the launcher waited for the CLI instead of stopping it');
    } finally { await rm(local.root, { recursive: true, force: true }); }
  });
}

test('AGY-06: a review that quotes an error or a stack trace is still a review', async () => {
  const local = await fixture(`
    console.log('Finding 1: the script fails with:');
    console.log('Error: ENOENT: no such file or directory, open x');
    console.log('AGY_ERROR: {"status": "QUOTED", "error_code": 500}');
    console.log('Authentication required, says the log the PR adds.');
    console.log('<!-- agent-review: {"verdict": "blocking", "findings": 1} -->');
  `);
  const file = join(local.root, 'work', '.agent', 'review.md');
  try {
    await runAntigravity('Review', local.env, local.binary, 'review', file);
    assert.match(await readFile(file, 'utf8'), /Error: ENOENT[\s\S]*"verdict": "blocking"/);
  } finally { await rm(local.root, { recursive: true, force: true }); }
  // The same lines in build mode, where stdout is a diagnostic channel, are a failure.
  const build = await fixture(`console.log('Error: ENOENT: no such file or directory'); process.exit(0);`);
  try { await assert.rejects(runAntigravity('Prompt', build.env, build.binary), /did not complete/); }
  finally { await rm(build.root, { recursive: true, force: true }); }
});

test('AGY-02: the registry model must be in the pinned CLI catalog, which needs no real key', async () => {
  const { checkModel, catalogSlugs } = await import('./antigravity-runner.ts');
  assert.deepEqual(catalogSlugs('Fetching available models...\ngemini-a-high\tGemini A (High)\n\ngemini-b-low\tGemini B (Low)\n'), ['gemini-a-high', 'gemini-b-low']);
  const local = await fixture(`
    const env = process.env;
    if (env.GEMINI_API_KEY !== 'catalog-only' || env.AGENT_MODEL_KEY || process.argv[2] !== 'models') process.exit(3);
    console.log('Fetching available models...');
    console.log('gemini-a-high\tGemini A (High)');
  `);
  const originalLog = console.log;
  console.log = () => {};
  try {
    await checkModel('gemini-a-high', local.env, local.binary);
    await assert.rejects(checkModel('gemini-z-high', local.env, local.binary), /not in the model catalog/);
    await assert.rejects(checkModel('auto', local.env, local.binary), /explicit Antigravity model/);
  } finally { console.log = originalLog; await rm(local.root, { recursive: true, force: true }); }
});

test('AGY-08: a figma-read build gets the gateway, only the read tools of agent-run.yml, and nothing else', async () => {
  const { figmaMcpConfig, FIGMA_READ_TOOLS, FIGMA_GATEWAY } = await import('./antigravity-runner.ts');
  const workflow = await readFile(new URL('../docs/agents/workflows/agent-run.yml', import.meta.url), 'utf8');
  assert.deepEqual(FIGMA_READ_TOOLS, /TOOLS=\((get_metadata[^)]*)\)/.exec(workflow)![1].split(' '));
  assert.equal(FIGMA_GATEWAY, /GATEWAY="([^"]+)"/.exec(workflow)![1]);
  assert.deepEqual(figmaMcpConfig(), { mcpServers: { figma: { disabled: false, serverUrl: FIGMA_GATEWAY } } });
  const allow = antigravitySettings('build', true).permission.allow;
  assert.deepEqual(allow.filter(rule => rule.startsWith('mcp(')), FIGMA_READ_TOOLS.map(tool => `mcp(figma/${tool})`));
  assert.ok(!allow.some(rule => /use_figma|mcp\(\*\)|mcp\(figma\/\*\)/.test(rule)));
  assert.throws(() => antigravitySettings('review', true), /no Figma/);
  const local = await fixture(`
    const config = JSON.parse(fs.readFileSync(process.env.HOME + '/.gemini/config/mcp_config.json', 'utf8'));
    const settings = JSON.parse(fs.readFileSync(process.env.HOME + '/.gemini/antigravity-cli/settings.json', 'utf8'));
    if (config.mcpServers.figma.serverUrl !== '${FIGMA_GATEWAY}' || !settings.permission.allow.includes('mcp(figma/get_metadata)')) process.exit(3);
  `);
  try { await runAntigravity('Prompt', { ...local.env, FIGMA: 'read' }, local.binary); }
  finally { await rm(local.root, { recursive: true, force: true }); }
});

test('AGY-08: the design file URL reaches the CLI only on a figma-read build', async () => {
  const URL_ = 'https://www.figma.com/design/FILEKEY/Artemis';
  const withUrl = await fixture(`if (process.env.FIGMA_FILE_URL !== '${URL_}') process.exit(3);`);
  const without = await fixture(`if (process.env.FIGMA_FILE_URL !== undefined) process.exit(3);`);
  try {
    await runAntigravity('Prompt', { ...withUrl.env, FIGMA: 'read', FIGMA_FILE_URL: URL_ }, withUrl.binary);
    await runAntigravity('Prompt', { ...without.env, FIGMA: 'none', FIGMA_FILE_URL: URL_ }, without.binary);
  } finally { await rm(withUrl.root, { recursive: true, force: true }); await rm(without.root, { recursive: true, force: true }); }
});

for (const mode of ['build', 'review'] as const) {
  test(`AGY-05: a sign-in prompt split across several writes still stops the CLI in ${mode} mode`, async () => {
    const local = await fixture(`
      const parts = ['Authenti', 'cation', ' requ', 'ired. Please visit the URL to log in:'];
      let i = 0;
      const next = () => { if (i < parts.length) { process.stdout.write(parts[i++]); setTimeout(next, 100); } };
      next();
      setTimeout(() => {}, 120000);
    `);
    const started = Date.now();
    try {
      await assert.rejects(runAntigravity('Prompt', local.env, local.binary, mode, join(local.root, 'work', '.agent', 'review.md')), /interactive sign-in/);
      assert.ok(Date.now() - started < 20_000, 'the launcher waited for the CLI instead of stopping it');
    } finally { await rm(local.root, { recursive: true, force: true }); }
  });
}
