// Credential-free qualification of the pinned CLI against a local scripted model, never a paid provider.
// Run explicitly with OpenCode on PATH: node scripts/verify-opencode-cli.ts
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { openCodeConfig } from './opencode-runner.ts';
import { prepareSmoke, verifySmoke } from './opencode-smoke-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'opencode-cli-'));
const work = join(root, 'work');
const home = join(root, 'home');
await mkdir(home);
await prepareSmoke(work);
// A project config must not be loaded, even though the CLI sees repository instructions.
await writeFile(join(work, 'opencode.json'), '{ invalid project config');
let authenticated = 0;
let requestedRead = false;
let requestedBash = false;
const server = createServer(async (req, res) => {
  if (req.headers.authorization !== 'Bearer fixture-only') { res.writeHead(401).end(); return; }
  authenticated++;
  let text = '';
  for await (const chunk of req) text += chunk;
  const body = JSON.parse(text) as { messages?: { role: string; tool_call_id?: string }[]; tools?: { function: { name: string } }[] };
  const completed = new Set(body.messages?.filter(message => message.role === 'tool').map(message => message.tool_call_id));
  let call: { name: string; arguments: string; id: string } | undefined;
  if (body.tools?.length) {
    if (!completed.has('read-fixture')) {
      assert.ok(body.tools.some(tool => tool.function.name === 'read'));
      requestedRead = true;
      call = { name: 'read', arguments: JSON.stringify({ filePath: join(work, 'AGENTS.md') }), id: 'read-fixture' };
    } else if (!completed.has('bash-fixture')) {
      assert.ok(body.tools.some(tool => tool.function.name === 'bash'));
      requestedBash = true;
      const command = `node -e 'require("fs").appendFileSync("README.md", "OpenCode smoke passed.\\n")' && npm test && node -e 'require("fs").writeFileSync(".agent/result.txt", "PASS\\n")'`;
      call = { name: 'bash', arguments: JSON.stringify({ command, description: 'Complete the controlled fixture and run its test' }), id: 'bash-fixture' };
    }
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const delta = call ? { role: 'assistant', tool_calls: [{ index: 0, id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } }] } : { role: 'assistant', content: 'Fixture complete.' };
  for (const chunk of [
    { choices: [{ index: 0, delta, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } },
  ]) res.write(`data: ${JSON.stringify({ id: 'fixture-response', object: 'chat.completion.chunk', created: 1, model: 'fixture', ...chunk })}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const config = {
  ...openCodeConfig('opencode-go/fixture'),
  provider: { 'opencode-go': {
    npm: '@ai-sdk/openai-compatible', name: 'Local fixture',
    options: { apiKey: '{env:OPENCODE_API_KEY}', baseURL: `http://127.0.0.1:${address.port}/v1` },
    models: { fixture: { name: 'Fixture', limit: { context: 100_000, output: 4096 }, tool_call: true } },
  } },
};
let cliError = false;
let final = false;
try {
  const configPath = join(home, 'opencode.json');
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  const child = spawn('opencode', ['run', '--format', 'json', '--model', 'opencode-go/fixture', '--agent', 'pipeline', '--pure', 'Read AGENTS.md and complete the fixed fixture task.'], {
    cwd: work,
    env: {
      PATH: process.env.PATH, HOME: home, CI: 'true',
      XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local/share'), XDG_CACHE_HOME: join(home, '.cache'), XDG_STATE_HOME: join(home, '.local/state'),
      OPENCODE_API_KEY: 'fixture-only', OPENCODE_CONFIG: configPath,
      OPENCODE_DISABLE_PROJECT_CONFIG: 'true', OPENCODE_PURE: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const timeout = setTimeout(() => child.kill(), 120_000);
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
    let newline: number;
    while ((newline = stdout.indexOf('\n')) >= 0) {
      const line = stdout.slice(0, newline); stdout = stdout.slice(newline + 1);
      try {
        const event = JSON.parse(line) as { type?: string; part?: { reason?: string } };
        if (event.type === 'error') cliError = true;
        if (event.type === 'step_finish' && event.part?.reason === 'stop') final = true;
      } catch { /* Never print raw CLI output. */ }
    }
  });
  child.stderr.resume();
  const status = await new Promise<number | null>((accept, reject) => { child.once('error', reject); child.once('close', accept); });
  clearTimeout(timeout);
  assert.equal(status, 0, 'Pinned CLI did not exit successfully');
  assert.equal(cliError, false, 'Pinned CLI emitted an error event');
  assert.ok(final && requestedRead && requestedBash && authenticated >= 3, 'Pinned CLI did not complete the scripted tools');
  assert.equal(await readFile(join(work, 'opencode.json'), 'utf8'), '{ invalid project config');
  await rm(join(work, 'opencode.json'));
  await verifySmoke(work);
  async function checkNoPersistedKey(folder: string): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await checkNoPersistedKey(path);
      else if (entry.isFile()) assert.ok(!(await readFile(path)).includes(Buffer.from('fixture-only')), 'CLI persisted the fixture key');
    }
  }
  await checkNoPersistedKey(home);
  console.log('Pinned OpenCode CLI verified: headless tools, environment authentication, ignored project config and exact fixture output. No real provider key was used.');
} finally {
  server.closeAllConnections();
  await new Promise<void>(accept => server.close(() => accept()));
  await rm(root, { recursive: true, force: true });
}
