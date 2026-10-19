// Root-owned launcher for GitHub Copilot CLI in the digest-pinned image; no project dependencies or credential files.
// Contract: docs/specs/copilot-runner.md. Flags were checked against `copilot --help` of the pinned version.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COPILOT_VERSION = '1.0.92';

// Shell commands the agent may run. Everything else is not approved, and the deny list wins over any allow rule.
export const ALLOWED_TOOLS = [
  'write',
  'shell(npm:*)', 'shell(npx:*)', 'shell(node:*)',
  'shell(git status)', 'shell(git diff)', 'shell(git log)', 'shell(git show)', 'shell(git ls-files)',
  'shell(ls)', 'shell(mkdir)',
];
export const DENIED_TOOLS = [
  'shell(git push)', 'shell(git commit)', 'shell(git config)', 'shell(rm)', 'shell(gh:*)', 'shell(curl)', 'shell(wget)',
  'write(/work/.git)',
];
// Review mode (docs/specs/agent-review.md, REV-06): write only the review file and run only read-only git. No URL is
// allowed. The build denials still apply, and denials win over approvals.
export const REVIEW_ALLOWED_TOOLS = [
  'write(.agent/review.md)',
  'shell(git status)', 'shell(git diff)', 'shell(git log)', 'shell(git show)', 'shell(git ls-files)',
];
export const REVIEW_DENIED_TOOLS = [...DENIED_TOOLS, 'shell(npm:*)', 'shell(npx:*)', 'shell(node:*)'];
export type Mode = 'build' | 'review';
// The npm registry and the NASA domains of docs/SETUP.md, as for the other agents.
export const ALLOWED_URLS = [
  'registry.npmjs.org', 'eol.jsc.nasa.gov', 'pds-imaging.jpl.nasa.gov', 'www.nasa.gov',
  'images.nasa.gov', 'images-api.nasa.gov', 'images-assets.nasa.gov',
];

// An explicit model keeps the reviewer's model family known; 'auto' would let Copilot route to any vendor.
export function validateCopilotModel(value: unknown): string {
  if (typeof value !== 'string' || value === 'auto' || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) {
    throw new Error('Choose an explicit Copilot model id (not "auto") for the copilot agent in agents/registry.yaml.');
  }
  return value;
}

export function copilotArgs(model: string, prompt: string, mode: Mode = 'build'): string[] {
  const review = mode === 'review';
  return [
    '-p', prompt,
    '--model', validateCopilotModel(model),
    '--no-ask-user', '--no-auto-update', '--no-remote-export', '--disable-builtin-mcps',
    '--no-color', '--silent', '--log-level', 'none',
    // Stripped from shell and MCP environments and redacted from output. Joined with "=" so the list cannot swallow
    // the next flag.
    '--secret-env-vars=COPILOT_GITHUB_TOKEN',
    ...(review ? REVIEW_ALLOWED_TOOLS : ALLOWED_TOOLS).map(tool => `--allow-tool=${tool}`),
    ...(review ? REVIEW_DENIED_TOOLS : DENIED_TOOLS).map(tool => `--deny-tool=${tool}`),
    ...(review ? [] : ALLOWED_URLS).map(url => `--allow-url=${url}`),
  ];
}

export async function runCopilot(prompt: string, env: NodeJS.ProcessEnv = process.env, binary = 'copilot', mode: Mode = 'build'): Promise<void> {
  const model = validateCopilotModel(env.COPILOT_MODEL);
  if (!env.COPILOT_GITHUB_TOKEN) throw new Error('AGENT_KEY_COPILOT is missing from the agents environment.');
  if (env.FIGMA !== 'none') throw new Error('Copilot is not qualified for Figma stages.');
  if (!env.HOME) throw new Error('The isolated agent HOME is required.');
  const state = await mkdtemp(join(env.HOME, 'copilot-state-'));
  try {
    // A clean environment: no other credential, and no COPILOT_ALLOW_ALL or BYOK provider settings from outside.
    const childEnv: NodeJS.ProcessEnv = {
      PATH: env.PATH, HOME: env.HOME, CI: 'true', GIT_OPTIONAL_LOCKS: '0', NO_COLOR: '1',
      MEDIA_BASE_URL: '/media', CONTACT_URL: env.CONTACT_URL ?? '',
      PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH,
      COPILOT_HOME: state, COPILOT_AUTO_UPDATE: 'false',
    };
    const version = spawnSync(binary, ['--version'], { env: childEnv, encoding: 'utf8', timeout: 30_000 });
    if (version.status !== 0 || !version.stdout.includes(`GitHub Copilot CLI ${COPILOT_VERSION}.`)) {
      throw new Error(`The runner image must contain Copilot CLI ${COPILOT_VERSION}; rebuild it before running.`);
    }
    childEnv.COPILOT_GITHUB_TOKEN = env.COPILOT_GITHUB_TOKEN;
    const child = spawn(binary, copilotArgs(model, prompt, mode), { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    // The transcript and provider messages can hold private data; only a short, redacted error line is kept.
    child.stdout.resume();
    let firstError = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (firstError) return;
      const line = chunk.split('\n').find(text => /^Error:/.test(text.trim()));
      if (line) firstError = line.trim().split(env.COPILOT_GITHUB_TOKEN!).join('[redacted]').slice(0, 200);
    });
    const status = await new Promise<number | null>((accept, reject) => {
      child.once('error', () => reject(new Error('Copilot CLI could not start.')));
      child.once('close', accept);
    });
    if (status !== 0 || firstError) {
      throw new Error(`Copilot CLI did not complete successfully${firstError ? ` (${firstError})` : ''}; its transcript was suppressed.`);
    }
    console.log('Copilot CLI completed. The pipeline will validate its files before publication.');
  } finally { await rm(state, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'validate') validateCopilotModel(process.argv[3]);
    else if (process.argv[2] === 'run' && process.argv[3]) await runCopilot(process.argv[3]);
    else if (process.argv[2] === 'review' && process.argv[3]) await runCopilot(process.argv[3], process.env, 'copilot', 'review');
    else throw new Error('Usage: copilot-runner.ts validate <model> | run <prompt> | review <prompt>');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Copilot launcher failed.');
    process.exitCode = 1;
  }
}
