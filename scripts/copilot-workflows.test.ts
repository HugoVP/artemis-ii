import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { parseRegistry, missingCapabilities, RUNNERS } from './agent-checks.ts';
import { COPILOT_VERSION } from './copilot-runner.ts';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('CPL-02: registry accepts Copilot without a model but rejects auto or a malformed id', () => {
  const entry = '- id: copilot\n  key_secret: AGENT_KEY_COPILOT\n  runner: copilot-cli\n  capabilities: [git, node, browser, web]\n';
  assert.equal(parseRegistry(entry)[0].model, undefined);
  assert.throws(() => parseRegistry(`${entry}  model: auto\n`), /explicit Copilot model/);
  assert.throws(() => parseRegistry(`${entry}  model: Model;rm\n`), /explicit Copilot model/);
  assert.equal(parseRegistry(`${entry}  model: example-model-2\n`)[0].model, 'example-model-2');
});

test('CPL-01: Copilot is registered without Figma and the image pins its CLI and root-owned launcher', async () => {
  assert.ok(RUNNERS.includes('copilot-cli'));
  const agent = parseRegistry(await read('agents/registry.yaml')).find(entry => entry.id === 'copilot')!;
  assert.equal(agent.runner, 'copilot-cli');
  assert.equal(agent.key_secret, 'AGENT_KEY_COPILOT');
  assert.deepEqual(missingCapabilities(['git', 'node', 'browser', 'web'], agent.capabilities), []);
  assert.deepEqual(missingCapabilities(['figma-read'], agent.capabilities), []);
  assert.deepEqual(missingCapabilities(['figma-write'], agent.capabilities), ['figma-write']);
  const dockerfile = await read('Dockerfile');
  assert.ok(dockerfile.includes(`ARG COPILOT_VERSION=${COPILOT_VERSION}`));
  assert.ok(dockerfile.includes('@github/copilot@${COPILOT_VERSION}'));
  assert.ok(dockerfile.includes('grep -qx "GitHub Copilot CLI ${COPILOT_VERSION}\\."'));
  assert.match(dockerfile, /COPY scripts\/copilot-runner\.ts \/opt\/artemis\/copilot-runner\.ts/);
  assert.match(await read('docs/agents/workflows/agent-runner-image.yml'), /paths:[\s\S]*scripts\/copilot-runner\.ts/);
  assert.match(await read('docs/agents/workflows/agent-sandbox-smoke.yml'), /paths:[\s\S]*scripts\/copilot-runner\.ts[\s\S]*test ! -w \/opt\/artemis\/copilot-runner\.ts/);
});

test('CPL-02/03: the proposed agent-run validates the model before the key and keeps Copilot inside the boundary', async () => {
  const workflow = await read('docs/agents/workflows/agent-run.yml');
  const validation = workflow.indexOf('node scripts/copilot-runner.ts validate "$OPENCODE_MODEL"');
  assert.ok(validation > 0 && validation < workflow.indexOf('AGENT_MODEL_KEY:'));
  assert.match(workflow, /copilot-cli\)\n(\s+#.*\n)*\s+COPILOT_GITHUB_TOKEN="\$KEY" COPILOT_MODEL="\$OPENCODE_MODEL" node \/opt\/artemis\/copilot-runner\.ts run "\$KICKOFF All code must be TypeScript/);
  assert.doesNotMatch(workflow, /copilot login|--allow-all|--yolo|COPILOT_ALLOW_ALL|gh auth/);
  assert.doesNotMatch(workflow, /docker\.sock|--privileged|seccomp=unconfined/);
  assert.match(workflow, /-v "\$GITHUB_WORKSPACE\/\.git:\/work\/\.git:ro"/);
});

test('CPL-04: Copilot smoke uses the agents environment on trusted main only and cannot publish', async () => {
  const source = await read('docs/agents/workflows/copilot-smoke.yml');
  const workflow = parse(source) as { on: Record<string, unknown>; permissions: Record<string, string>; jobs: { smoke: { if: string; environment: string; permissions: Record<string, string>; steps: { name?: string; run?: string; env?: Record<string, string> }[] } } };
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, {});
  const job = workflow.jobs.smoke;
  assert.equal(job.environment, 'agents');
  assert.deepEqual(job.permissions, { contents: 'read', packages: 'read' });
  for (const guard of ["github.ref == 'refs/heads/main'", 'github.actor == vars.AGENT_TRUSTED_LOGIN', 'github.triggering_actor == vars.AGENT_TRUSTED_LOGIN']) assert.ok(job.if.includes(guard));
  const keySteps = job.steps.filter(step => JSON.stringify(step).includes('AGENT_KEY_COPILOT'));
  assert.deepEqual(keySteps.map(step => step.name), ['Run Copilot on the fixture']);
  const run = keySteps[0].run!;
  assert.match(run, /--cap-drop ALL --security-opt no-new-privileges/);
  assert.match(run, /copilot-work\/\.git:\/work\/\.git:ro/);
  assert.match(run, /node \/opt\/artemis\/copilot-runner\.ts run/);
  assert.doesNotMatch(source, /docker\.sock|--privileged|pull-requests|issues: write|contents: write|gh pr|git push/);
  assert.match(source, /opencode-smoke-fixture\.ts verify/);
});

test('CPL-03: the Copilot smoke proposal uses the action pins installed on main', async () => {
  const installed = [...(await read('.github/workflows/opencode-smoke.yml')).matchAll(/uses: (\S+)/g)].map(match => match[1]);
  const proposed = [...(await read('docs/agents/workflows/copilot-smoke.yml')).matchAll(/uses: (\S+)/g)].map(match => match[1]);
  assert.deepEqual(proposed, installed);
});
