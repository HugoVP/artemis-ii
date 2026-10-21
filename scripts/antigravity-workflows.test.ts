import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { parseRegistry, missingCapabilities, RUNNERS } from './agent-checks.ts';
import { AGY_VERSION } from './antigravity-runner.ts';
import { AGENT_CONFIG_PATHS } from './agent-review.ts';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('AGY-02: registry accepts Antigravity without a model but rejects auto or a malformed slug', () => {
  const entry = '- id: antigravity\n  key_secret: AGENT_KEY_ANTIGRAVITY\n  runner: antigravity-cli\n  capabilities: [git, node, browser, web]\n';
  assert.equal(parseRegistry(entry)[0].model, undefined);
  assert.throws(() => parseRegistry(`${entry}  model: auto\n`), /explicit Antigravity model/);
  assert.throws(() => parseRegistry(`${entry}  model: Model;rm\n`), /explicit Antigravity model/);
  assert.equal(parseRegistry(`${entry}  model: example-model-4\n`)[0].model, 'example-model-4');
});

test('AGY-01: Antigravity is registered without Figma, as the google family, and the image pins the exact build', async () => {
  assert.ok(RUNNERS.includes('antigravity-cli'));
  const agent = parseRegistry(await read('agents/registry.yaml')).find(entry => entry.id === 'antigravity')!;
  assert.equal(agent.runner, 'antigravity-cli');
  assert.equal(agent.key_secret, 'AGENT_KEY_ANTIGRAVITY');
  assert.equal(agent.family, 'google');
  assert.equal(agent.status, 'pending');
  assert.deepEqual(missingCapabilities(['git', 'node', 'browser', 'web'], agent.capabilities), []);
  assert.deepEqual(missingCapabilities(['figma-read'], agent.capabilities), []);
  assert.deepEqual(missingCapabilities(['figma-write'], agent.capabilities), ['figma-write']);
  const dockerfile = await read('Dockerfile');
  assert.ok(dockerfile.includes(`ARG AGY_VERSION=${AGY_VERSION}`));
  assert.match(dockerfile, new RegExp(`ARG AGY_URL=https://storage\\.googleapis\\.com/antigravity-public/antigravity-cli/${AGY_VERSION.replaceAll('.', '\\.')}-\\d+/linux-x64/cli_linux_x64\\.tar\\.gz`));
  assert.match(dockerfile, /ARG AGY_SHA512=[0-9a-f]{128}\n/);
  assert.match(dockerfile, /sha512sum -c -/);
  assert.match(dockerfile, /tar --no-same-owner/);
  assert.doesNotMatch(dockerfile, /antigravity\.google\/cli\/install\.sh|manifests\//);
  // The background updater cannot be turned off: the version check runs without network and the binary hash is re-checked.
  assert.match(dockerfile, /sha512sum \/opt\/agy\/antigravity > \/opt\/agy\/antigravity\.sha512/);
  assert.match(dockerfile, /RUN --network=none test "\$\(HOME=\$\(mktemp -d\) CI=true agy --version\)" = "\$\{AGY_VERSION\}" \\\n && sha512sum -c \/opt\/agy\/antigravity\.sha512/);
  assert.match(dockerfile, /COPY scripts\/antigravity-runner\.ts \/opt\/artemis\/antigravity-runner\.ts/);
  assert.match(await read('docs/agents/workflows/agent-runner-image.yml'), /paths:[\s\S]*scripts\/antigravity-runner\.ts/);
  const sandbox = await read('docs/agents/workflows/agent-sandbox-smoke.yml');
  assert.match(sandbox, /paths:[\s\S]*scripts\/antigravity-runner\.ts[\s\S]*test ! -w \/opt\/artemis\/antigravity-runner\.ts/);
  // A dummy key must end in an API error, never in a browser sign-in.
  assert.match(sandbox, /GEMINI_API_KEY=not-a-real-key[\s\S]*grep -q 'AGY_ERROR INVALID_ARGUMENT 400'[\s\S]*interactive sign-in/);
});

test('AGY-02/03: the proposed agent-run validates the model before the key and keeps Antigravity inside the boundary', async () => {
  const workflow = await read('docs/agents/workflows/agent-run.yml');
  const validation = workflow.indexOf('node scripts/antigravity-runner.ts validate "$OPENCODE_MODEL"');
  assert.ok(validation > 0 && validation < workflow.indexOf('AGENT_MODEL_KEY:'));
  assert.match(workflow, /antigravity-cli\)\n(\s+#.*\n)*\s+GEMINI_API_KEY="\$KEY" ANTIGRAVITY_MODEL="\$OPENCODE_MODEL" node \/opt\/artemis\/antigravity-runner\.ts run "\$KICKOFF All code must be TypeScript/);
  assert.doesNotMatch(workflow, /dangerously-skip-permissions|--mode auto|AGY_ADC_AUTH|GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(workflow, /-v "\$GITHUB_WORKSPACE\/\.git:\/work\/\.git:ro"/);
});

test('AGY-06: the proposed reviewer runs Antigravity read-only and lets the launcher write the review', async () => {
  const workflow = await read('docs/agents/workflows/agent-review.yml');
  assert.match(workflow, /antigravity-cli\)\n(\s+#.*\n)*\s+GEMINI_API_KEY="\$KEY" ANTIGRAVITY_MODEL="\$OPENCODE_MODEL" node \/opt\/artemis\/antigravity-runner\.ts review "\$PROMPT Do not write any file/);
  for (const path of ['.gemini', '.gemini/settings.json', '.agents/rules/x.md', 'GEMINI.md']) {
    assert.ok(AGENT_CONFIG_PATHS.some(pattern => pattern === path || (pattern.endsWith('/**') && path.startsWith(pattern.slice(0, -2)))), path);
  }
});

test('AGY-04: Antigravity smoke uses the agents environment on trusted main only and cannot publish', async () => {
  const source = await read('docs/agents/workflows/antigravity-smoke.yml');
  const workflow = parse(source) as { on: Record<string, unknown>; permissions: Record<string, string>; jobs: { smoke: { if: string; environment: string; permissions: Record<string, string>; steps: { name?: string; run?: string; env?: Record<string, string> }[] } } };
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, {});
  const job = workflow.jobs.smoke;
  assert.equal(job.environment, 'agents');
  assert.deepEqual(job.permissions, { contents: 'read', packages: 'read' });
  for (const guard of ["github.ref == 'refs/heads/main'", 'github.actor == vars.AGENT_TRUSTED_LOGIN', 'github.triggering_actor == vars.AGENT_TRUSTED_LOGIN']) assert.ok(job.if.includes(guard));
  const keySteps = job.steps.filter(step => JSON.stringify(step).includes('AGENT_KEY_ANTIGRAVITY'));
  assert.deepEqual(keySteps.map(step => step.name), ['Run Antigravity on the fixture']);
  const run = keySteps[0].run!;
  assert.match(run, /--cap-drop ALL --security-opt no-new-privileges/);
  assert.match(run, /agy-work\/\.git:\/work\/\.git:ro/);
  assert.match(run, /node \/opt\/artemis\/antigravity-runner\.ts run/);
  assert.doesNotMatch(source, /docker\.sock|--privileged|pull-requests|issues: write|contents: write|gh pr|git push|copilot/i);
  assert.match(source, /opencode-smoke-fixture\.ts verify/);
  const installed = [...(await read('.github/workflows/opencode-smoke.yml')).matchAll(/uses: (\S+)/g)].map(match => match[1]);
  assert.deepEqual([...source.matchAll(/uses: (\S+)/g)].map(match => match[1]), installed);
});

test('AGY-02: the PR sandbox smoke checks the registry model against the CLI catalog with no key, and no guide exports the key locally', async () => {
  const sandbox = await read('docs/agents/workflows/agent-sandbox-smoke.yml');
  const step = sandbox.slice(sandbox.indexOf("Check that the registry's Antigravity model"));
  assert.match(step, /check-model "\$MODEL"/);
  assert.doesNotMatch(step.split('\n      # ')[0], /GEMINI_API_KEY|AGENT_KEY|secrets\./);
  const guide = await read('docs/agents/antigravity.md');
  assert.doesNotMatch(guide, /read -rsp .*GEMINI_API_KEY|export GEMINI_API_KEY/);
  assert.match(guide, /never present on a local machine/);
});

test('AGY-02: a change to the registry runs the PR sandbox smoke, because the catalog check reads the model from it', async () => {
  const smoke = parse(await read('docs/agents/workflows/agent-sandbox-smoke.yml')) as { on: { pull_request: { paths: string[] } } };
  assert.ok(smoke.on.pull_request.paths.includes('agents/registry.yaml'));
});
