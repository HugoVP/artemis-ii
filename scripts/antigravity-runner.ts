// Root-owned launcher for Google's Antigravity CLI (`agy`) in the digest-pinned image; no project dependencies.
// Contract: docs/specs/antigravity-runner.md. Flags were checked against `agy --help` and the changelog bundled in
// the pinned binary (`agy changelog`).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGY_VERSION = '1.4.3';
// The root-owned binary of the image. An absolute path, so a newer build that the CLI's background updater might leave in
// the agent's home or on its PATH is never the one launched.
export const AGY_BINARY = '/opt/agy/antigravity';
export type Mode = 'build' | 'review';

// Shell commands approved in build mode, in the `permissions.allow` form of settings.json (`command(<words>)`); file
// edits are approved by `--mode accept-edits`. Anything else is not approved, and in print mode an action that is not
// approved is denied without failing the run.
export const BUILD_ALLOW = [
  'command(npm)', 'command(npx)', 'command(node)',
  'command(git status)', 'command(git diff)', 'command(git log)', 'command(git show)', 'command(git ls-files)',
  'command(ls)', 'command(mkdir)',
];
// Web pages the build may read (`read_url(<domain>)` rules): the npm registry and the NASA domains of docs/SETUP.md, as
// for the other agents. Without them the `web` capability would be denied in print mode.
export const ALLOWED_URLS = [
  'registry.npmjs.org', 'eol.jsc.nasa.gov', 'pds-imaging.jpl.nasa.gov', 'www.nasa.gov',
  'images.nasa.gov', 'images-api.nasa.gov', 'images-assets.nasa.gov',
];
// Figma read access (figma-read stages), only through the pipeline's gateway, with the read tools of agent-run.yml.
export const FIGMA_GATEWAY = 'http://figma-gateway:8787/mcp';
export const FIGMA_READ_TOOLS = ['get_metadata', 'get_screenshot', 'get_variable_defs', 'get_design_context'];
// Format written by `agy mcp add figma <url>` in ~/.gemini/config/mcp_config.json.
export function figmaMcpConfig() {
  return { mcpServers: { figma: { disabled: false, serverUrl: FIGMA_GATEWAY } } };
}
// Review mode runs in `--mode plan` and may only read; the launcher, not the agent, writes the review file.
export const REVIEW_ALLOW = ['command(git status)', 'command(git diff)', 'command(git log)', 'command(git show)', 'command(git ls-files)'];

// An explicit Gemini model slug from `agy models`; 'auto' is refused so the model is the one reviewed.
export function validateAntigravityModel(value: unknown): string {
  if (typeof value !== 'string' || value === 'auto' || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) {
    throw new Error('Choose an explicit Antigravity model slug (not "auto") for the antigravity agent in agents/registry.yaml.');
  }
  return value;
}

// The CLI reads GEMINI_API_KEY only when settings.json selects the Gemini API; without it, it starts a browser sign-in.
export function antigravitySettings(mode: Mode, figma = false) {
  if (mode === 'review' && figma) throw new Error('A review has no Figma access.');
  const allow = mode === 'review' ? REVIEW_ALLOW : [
    ...BUILD_ALLOW,
    ...ALLOWED_URLS.map(domain => `read_url(${domain})`),
    ...(figma ? FIGMA_READ_TOOLS.map(tool => `mcp(figma/${tool})`) : []),
  ];
  return { modelProvider: 'gemini', permissions: { allow } };
}

export function antigravityArgs(model: string, prompt: string, mode: Mode, logFile: string): string[] {
  return [
    '--print', prompt,
    '--model', validateAntigravityModel(model),
    '--mode', mode === 'review' ? 'plan' : 'accept-edits',
    '--output-format', 'text',
    // In 1.4.3, disabling slash commands also disables plan mode ("--mode plan has no effect while slash command expansion
    // is disabled"), so only build mode, whose accept-edits mode is unaffected, turns them off.
    ...(mode === 'review' ? [] : ['--disable-slash-commands']),
    '--log-file', logFile,
  ];
}

const MAX_REVIEW = 262_144;

export async function runAntigravity(prompt: string, env: NodeJS.ProcessEnv = process.env, binary = AGY_BINARY, mode: Mode = 'build', reviewFile = '.agent/review.md'): Promise<void> {
  const model = validateAntigravityModel(env.ANTIGRAVITY_MODEL);
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('AGENT_KEY_ANTIGRAVITY is missing from the agents environment.');
  // figma-read stages only: the registry gives Antigravity no figma-write, and a review never gets Figma.
  if (env.FIGMA !== 'none' && !(env.FIGMA === 'read' && mode === 'build')) throw new Error('Antigravity is qualified only for Figma read stages, and reviews get no Figma.');
  const figma = env.FIGMA === 'read';
  if (!env.HOME) throw new Error('The isolated agent HOME is required.');
  // A home of its own for the CLI: settings, conversations, logs and any updater state disappear after the run.
  const home = await mkdtemp(join(env.HOME, 'agy-home-'));
  try {
    const settingsDir = join(home, '.gemini', 'antigravity-cli');
    await mkdir(settingsDir, { recursive: true, mode: 0o700 });
    await writeFile(join(settingsDir, 'settings.json'), JSON.stringify(antigravitySettings(mode, figma)), { mode: 0o600 });
    if (figma) {
      const configDir = join(home, '.gemini', 'config');
      await mkdir(configDir, { recursive: true, mode: 0o700 });
      await writeFile(join(configDir, 'mcp_config.json'), JSON.stringify(figmaMcpConfig()), { mode: 0o600 });
    }
    // A clean environment: no other credential, and no ADC or custom endpoint settings from outside.
    const childEnv: NodeJS.ProcessEnv = {
      PATH: env.PATH, HOME: home, CI: 'true', GIT_OPTIONAL_LOCKS: '0', NO_COLOR: '1', TERM: 'dumb',
      MEDIA_BASE_URL: '/media', CONTACT_URL: env.CONTACT_URL ?? '',
      PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH,
    };
    // The gateway requires the design file's key in every call, and agent-run.yml gives the agent that file's URL (not a
    // secret) in FIGMA_FILE_URL: forward it on a Figma read build, so the CLI targets the configured file and not whatever
    // a checked-in link says.
    if (figma && env.FIGMA_FILE_URL) childEnv.FIGMA_FILE_URL = env.FIGMA_FILE_URL;
    const version = spawnSync(binary, ['--version'], { env: childEnv, encoding: 'utf8', timeout: 30_000 });
    if (version.status !== 0 || version.stdout.trim() !== AGY_VERSION) {
      throw new Error(`The runner image must contain Antigravity CLI ${AGY_VERSION}; rebuild it before running.`);
    }
    childEnv.GEMINI_API_KEY = key;
    const child = spawn(binary, antigravityArgs(model, prompt, mode, join(home, 'cli.log')), { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    // Transcripts and provider messages can hold private data. Only one short problem line is kept, always redacted and then
    // cut (never the other way round, so a cut cannot leave a part of the key). In review mode stdout is the printed answer,
    // kept for the review file, and is not a diagnostic channel: a review that quotes "Error: ENOENT..." or an AGY_ERROR
    // line is still a review. Diagnostics are read from stderr, and, in build mode, from stdout too.
    let problem = '';
    let answer = '';
    let tooLong = false;
    const redact = (text: string) => text.split(key).join('[redacted]');
    const fail = (message: string) => { if (!problem) problem = redact(message).slice(0, 200); };
    const SIGN_IN_PROMPT = 'Authentication required';
    const SIGN_IN = /^\s*Authentication required/;
    const stopForSignIn = () => {
      fail('interactive sign-in requested: the Gemini API key was not used');
      // Without the key path the CLI waits for a browser sign-in; stop at once instead of waiting for its timeout.
      child.kill();
    };
    const scan = (raw: string) => {
      const text = raw.trim();
      if (problem) return;
      const structured = /^AGY_ERROR:\s*(\{.*\})\s*$/.exec(text);
      if (structured) {
        try {
          const error = JSON.parse(structured[1]) as Record<string, unknown>;
          // Fields of 1.4.3: status, error_code, code_kind, retryable, error_id; the free-text short_error is never shown.
          const parts = ['status', 'error_code'].map(name => error[name]).filter(value => typeof value === 'string' || typeof value === 'number');
          fail(`AGY_ERROR ${parts.join(' ')}`.trim());
        } catch { fail('AGY_ERROR'); }
      } else if (/^Error:/.test(text)) fail(text);
      else if (SIGN_IN.test(text)) stopForSignIn();
    };
    const watch = (stream: NodeJS.ReadableStream, role: 'diagnostics' | 'answer') => {
      let pending = '';
      // The answer is checked for the prompt until it is as long as the prompt itself.
      let undecided = true;
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        if (role === 'answer') {
          if (answer.length + chunk.length > MAX_REVIEW) tooLong = true;
          else answer += chunk;
          // The sign-in prompt is the whole of what the CLI prints when it waits, and it has no newline until a person
          // answers, so it is recognised on the first characters, not on a finished line, and on what has accumulated,
          // since a pipe can split it across chunks. Later text is review content.
          if (undecided) {
            if (SIGN_IN.test(answer)) stopForSignIn();
            if (answer.trim().length >= SIGN_IN_PROMPT.length) undecided = false;
          }
          return;
        }
        pending += chunk;
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        lines.forEach(scan);
        // The sign-in prompt waits without a newline: look at the unfinished line too. Error lines stay buffered, so the
        // key is redacted before anything is cut.
        if (SIGN_IN.test(pending)) stopForSignIn();
        if (pending.length > 65_536) pending = pending.slice(0, 65_536);
      });
      return () => { if (role === 'diagnostics') scan(pending); };
    };
    // Build mode reads stdout for diagnostics too; review mode keeps it as the answer.
    const endStdout = watch(child.stdout, mode === 'review' ? 'answer' : 'diagnostics');
    const endStderr = watch(child.stderr, 'diagnostics');
    const status = await new Promise<number | null>((accept, reject) => {
      child.once('error', () => reject(new Error('Antigravity CLI could not start.')));
      child.once('close', accept);
    });
    endStdout();
    endStderr();
    if (status !== 0 || problem) {
      throw new Error(`Antigravity CLI did not complete successfully (exit ${status}${problem ? `, ${problem}` : ''}); its transcript was suppressed.`);
    }
    if (mode === 'review') {
      if (tooLong || !answer.trim()) throw new Error('Antigravity CLI printed no review, or a review longer than the limit.');
      await writeFile(reviewFile, redact(answer));
    }
    console.log('Antigravity CLI completed. The pipeline will validate its files before publication.');
  } finally { await rm(home, { recursive: true, force: true }); }
}

// The model must be in the pinned CLI's catalog. `agy models` prints the catalog (`slug<TAB>name` lines) whatever the key,
// so any value stands in for it: no credential is needed to choose or check a model (checked on 1.4.3 with a dummy value),
// and the pipeline's key never has to be exported to a shell for this. Whether a real key may use the model is what the
// manual smoke shows.
export function catalogSlugs(output: string): string[] {
  return output.split("\n").map(line => line.split("\t")[0].trim()).filter(slug => /^[a-z0-9][a-z0-9._-]{0,79}$/.test(slug));
}

export async function checkModel(model: string, env: NodeJS.ProcessEnv = process.env, binary = AGY_BINARY): Promise<void> {
  validateAntigravityModel(model);
  if (!env.HOME) throw new Error('The isolated agent HOME is required.');
  const home = await mkdtemp(join(env.HOME, 'agy-catalog-'));
  try {
    const settingsDir = join(home, '.gemini', 'antigravity-cli');
    await mkdir(settingsDir, { recursive: true, mode: 0o700 });
    await writeFile(join(settingsDir, 'settings.json'), JSON.stringify(antigravitySettings('review')), { mode: 0o600 });
    const out = spawnSync(binary, ['models'], {
      env: { PATH: env.PATH, HOME: home, CI: 'true', TERM: 'dumb', NO_COLOR: '1', GEMINI_API_KEY: 'catalog-only' },
      encoding: 'utf8', timeout: 60_000, maxBuffer: 1_048_576,
    });
    if (out.status !== 0) throw new Error(`The model catalog of the pinned Antigravity CLI could not be read (exit ${out.status}).`);
    if (!catalogSlugs(out.stdout).includes(model)) throw new Error(`${model} is not in the model catalog of the pinned Antigravity CLI ${AGY_VERSION}.`);
    console.log(`${model} is in the model catalog of the pinned Antigravity CLI ${AGY_VERSION}.`);
  } finally { await rm(home, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'validate') validateAntigravityModel(process.argv[3]);
    else if (process.argv[2] === 'check-model' && process.argv[3]) await checkModel(process.argv[3]);
    else if (process.argv[2] === 'run' && process.argv[3]) await runAntigravity(process.argv[3]);
    else if (process.argv[2] === 'review' && process.argv[3]) await runAntigravity(process.argv[3], process.env, AGY_BINARY, 'review');
    else throw new Error('Usage: antigravity-runner.ts validate <model> | check-model <model> | run <prompt> | review <prompt>');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Antigravity launcher failed.');
    process.exitCode = 1;
  }
}
