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

// Shell commands approved in build mode, in the `permission.allow` form of settings.json (`command(<words>)`); file
// edits are approved by `--mode accept-edits`. Anything else is not approved, and in print mode an action that is not
// approved is denied without failing the run.
export const BUILD_ALLOW = [
  'command(npm)', 'command(npx)', 'command(node)',
  'command(git status)', 'command(git diff)', 'command(git log)', 'command(git show)', 'command(git ls-files)',
  'command(ls)', 'command(mkdir)',
];
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
export function antigravitySettings(mode: Mode) {
  return { modelProvider: 'gemini', permission: { allow: mode === 'review' ? REVIEW_ALLOW : BUILD_ALLOW } };
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
  if (env.FIGMA !== 'none') throw new Error('Antigravity is not qualified for Figma stages.');
  if (!env.HOME) throw new Error('The isolated agent HOME is required.');
  // A home of its own for the CLI: settings, conversations, logs and any updater state disappear after the run.
  const home = await mkdtemp(join(env.HOME, 'agy-home-'));
  try {
    const settingsDir = join(home, '.gemini', 'antigravity-cli');
    await mkdir(settingsDir, { recursive: true, mode: 0o700 });
    await writeFile(join(settingsDir, 'settings.json'), JSON.stringify(antigravitySettings(mode)), { mode: 0o600 });
    // A clean environment: no other credential, and no ADC or custom endpoint settings from outside.
    const childEnv: NodeJS.ProcessEnv = {
      PATH: env.PATH, HOME: home, CI: 'true', GIT_OPTIONAL_LOCKS: '0', NO_COLOR: '1', TERM: 'dumb',
      MEDIA_BASE_URL: '/media', CONTACT_URL: env.CONTACT_URL ?? '',
      PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH,
    };
    const version = spawnSync(binary, ['--version'], { env: childEnv, encoding: 'utf8', timeout: 30_000 });
    if (version.status !== 0 || version.stdout.trim() !== AGY_VERSION) {
      throw new Error(`The runner image must contain Antigravity CLI ${AGY_VERSION}; rebuild it before running.`);
    }
    childEnv.GEMINI_API_KEY = key;
    const child = spawn(binary, antigravityArgs(model, prompt, mode, join(home, 'cli.log')), { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    // Transcripts and provider messages can hold private data. Only one short, redacted problem line is kept; the review
    // mode keeps stdout, which is the printed answer, for the review file.
    let problem = '';
    let answer = '';
    let tooLong = false;
    const redact = (text: string) => text.split(key).join('[redacted]');
    const scan = (raw: string) => {
      const text = raw.trim();
      if (problem) return;
      const structured = /^AGY_ERROR:\s*(\{.*\})\s*$/.exec(text);
      if (structured) {
        try {
          const error = JSON.parse(structured[1]) as Record<string, unknown>;
          // Fields of 1.4.3: status, error_code, code_kind, retryable, error_id; the free-text short_error is never shown.
          const parts = ['status', 'error_code'].map(name => error[name]).filter(value => typeof value === 'string' || typeof value === 'number');
          problem = `AGY_ERROR ${parts.join(' ')}`.trim();
        } catch { problem = 'AGY_ERROR'; }
      } else if (/^Error:/.test(text)) problem = redact(text).slice(0, 200);
      else if (/^Authentication required/.test(text)) {
        problem = 'interactive sign-in requested: the Gemini API key was not used';
        // Without the key path the CLI waits for a browser sign-in; stop at once instead of waiting for its timeout.
        child.kill();
      }
    };
    const watch = (stream: NodeJS.ReadableStream, keep: boolean) => {
      let pending = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        if (keep) {
          if (answer.length + chunk.length > MAX_REVIEW) tooLong = true;
          else answer += chunk;
        }
        const lines = (pending + chunk).split('\n');
        pending = lines.pop() ?? '';
        lines.forEach(scan);
        if (pending.length > 65_536) pending = pending.slice(0, 65_536);
      });
      return () => scan(pending);
    };
    const endStdout = watch(child.stdout, mode === 'review');
    const endStderr = watch(child.stderr, false);
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'validate') validateAntigravityModel(process.argv[3]);
    else if (process.argv[2] === 'run' && process.argv[3]) await runAntigravity(process.argv[3]);
    else if (process.argv[2] === 'review' && process.argv[3]) await runAntigravity(process.argv[3], process.env, AGY_BINARY, 'review');
    else throw new Error('Usage: antigravity-runner.ts validate <model> | run <prompt> | review <prompt>');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Antigravity launcher failed.');
    process.exitCode = 1;
  }
}
