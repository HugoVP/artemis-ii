// Root-owned launcher in the digest-pinned image; no project dependencies or credential files.
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OPENCODE_VERSION = '1.19.3';

export function validateOpenCodeModel(value: unknown): string {
  if (typeof value !== 'string' || !/^opencode-go\/[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) {
    throw new Error('Select an explicit opencode-go/<model> identifier in the agent registry.');
  }
  return value;
}

export function openCodeConfig(model: string) {
  return {
    $schema: 'https://opencode.ai/config.json',
    model: validateOpenCodeModel(model),
    small_model: model,
    enabled_providers: ['opencode-go'],
    provider: { 'opencode-go': { options: { apiKey: '{env:OPENCODE_API_KEY}' } } },
    share: 'disabled', snapshot: false, autoupdate: false, username: 'agent',
    plugin: [], mcp: {}, lsp: false, formatter: false,
    default_agent: 'pipeline',
    agent: { pipeline: { mode: 'primary', steps: 100, description: 'Follow AGENTS.md for this pipeline work order.' } },
    permission: {
      '*': 'deny', read: 'allow', glob: 'allow', grep: 'allow', list: 'allow',
      edit: { '*': 'allow', '.git': 'deny', '.git/**': 'deny', '/work/.git': 'deny', '/work/.git/**': 'deny' },
      bash: {
        '*': 'deny', 'npm *': 'allow', 'npx *': 'allow', 'node *': 'allow',
        'git status*': 'allow', 'git diff*': 'allow', 'git log*': 'allow', 'git show*': 'allow',
        'git ls-files*': 'allow', 'ls*': 'allow', 'mkdir *': 'allow',
        'git push*': 'deny', 'rm *': 'deny',
      },
      webfetch: 'allow', websearch: 'allow', external_directory: 'deny', question: 'deny', task: 'deny', skill: 'deny',
    },
  };
}

export async function runOpenCode(prompt: string, env: NodeJS.ProcessEnv = process.env, binary = 'opencode'): Promise<void> {
  const model = validateOpenCodeModel(env.OPENCODE_MODEL);
  if (!env.OPENCODE_API_KEY) throw new Error('AGENT_KEY_OPENCODE is missing from the agents environment.');
  if (env.FIGMA !== 'none') throw new Error('OpenCode is not qualified for Figma stages.');
  if (!env.HOME) throw new Error('The isolated agent HOME is required.');
  const runtime = await mkdtemp(join(env.HOME, 'opencode-runtime-'));
  try {
  const configPath = join(runtime, 'opencode.json');
  // Only the environment placeholder is written; the key never enters this file.
  await writeFile(configPath, JSON.stringify(openCodeConfig(model)), { mode: 0o600 });
  const childEnv: NodeJS.ProcessEnv = {
    PATH: env.PATH, HOME: env.HOME, CI: 'true', GIT_OPTIONAL_LOCKS: '0',
    MEDIA_BASE_URL: '/media', CONTACT_URL: env.CONTACT_URL ?? '',
    PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH,
    XDG_CONFIG_HOME: `${env.HOME}/.config`, XDG_DATA_HOME: `${env.HOME}/.local/share`,
    XDG_CACHE_HOME: `${env.HOME}/.cache`, XDG_STATE_HOME: `${env.HOME}/.local/state`,
    OPENCODE_CONFIG: configPath,
    OPENCODE_DISABLE_PROJECT_CONFIG: 'true', OPENCODE_PURE: 'true',
    OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_TERMINAL_TITLE: 'true',
    OPENCODE_DISABLE_CLAUDE_CODE: 'true', OPENCODE_DISABLE_LSP_DOWNLOAD: 'true',
  };
  const version = spawnSync(binary, ['--version'], { env: childEnv, encoding: 'utf8', timeout: 30_000 });
  if (version.status !== 0 || version.stdout.trim() !== OPENCODE_VERSION) {
    throw new Error(`The runner image must contain OpenCode ${OPENCODE_VERSION}; rebuild it before running.`);
  }
  childEnv.OPENCODE_API_KEY = env.OPENCODE_API_KEY;
  const child = spawn(binary, ['run', '--format', 'json', '--model', model, '--agent', 'pipeline', '--pure', prompt], {
    env: childEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let failed = false;
  let completed = false;
  let httpStatus: number | undefined;
  // Raw output can contain private transcript data, identifiers or provider errors. Keep it out of files and logs.
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    if (line.length > 1_048_576) { failed = true; child.kill(); return; }
    try {
      const event = JSON.parse(line) as { type?: string; part?: { reason?: string }; error?: { data?: { statusCode?: number } } };
      if (event.type === 'error') {
        failed = true;
        const status = event.error?.data?.statusCode;
        if (Number.isInteger(status) && status! >= 400 && status! <= 599) httpStatus = status;
      }
      if (event.type === 'step_finish' && event.part?.reason === 'stop') completed = true;
    } catch { /* Startup messages are deliberately suppressed too. */ }
  });
  const status = await new Promise<number | null>((accept, reject) => {
    child.once('error', () => reject(new Error('OpenCode could not start.')));
    child.once('close', accept);
  });
  if (status !== 0 || failed || !completed) {
    throw new Error(`OpenCode did not complete successfully${httpStatus ? ` (HTTP ${httpStatus})` : ''}; raw provider output was suppressed for privacy.`);
  }
  console.log('OpenCode completed. The pipeline will validate its files before publication.');
  } finally { await rm(runtime, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'validate') validateOpenCodeModel(process.argv[3]);
    else if (process.argv[2] === 'run' && process.argv[3]) await runOpenCode(process.argv[3]);
    else throw new Error('Usage: opencode-runner.ts validate <model> | run <prompt>');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'OpenCode launcher failed.');
    process.exitCode = 1;
  }
}
