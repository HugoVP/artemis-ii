import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { parseRegistry, missingCapabilities } from './agent-checks.ts';
import { OPENCODE_VERSION } from './opencode-runner.ts';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('OPC-02: registry rejects a missing OpenCode model or an invalid provider', () => {
  const entry = '- id: opencode\n  key_secret: AGENT_KEY_OPENCODE\n  runner: opencode-run\n  capabilities: [git, node, browser, web]\n';
  assert.throws(() => parseRegistry(entry), /explicit/);
  assert.throws(() => parseRegistry(`${entry}  model: other/glm-5.3\n`), /explicit/);
  assert.equal(parseRegistry(`${entry}  model: opencode-go/glm-5.3\n`)[0].model, 'opencode-go/glm-5.3');
});

test('OPC-01: OpenCode is registered without Figma and the image pins its CLI and root-owned launcher', async () => {
  const registry = parseRegistry(await read('agents/registry.yaml'));
  const agent = registry.find(entry => entry.id === 'opencode')!;
  assert.equal(agent.runner, 'opencode-run');
  assert.equal(agent.key_secret, 'AGENT_KEY_OPENCODE');
  assert.equal(agent.model, 'opencode-go/glm-5.3');
  assert.deepEqual(missingCapabilities(['git', 'node', 'browser', 'web'], agent.capabilities), []);
  assert.deepEqual(missingCapabilities(['figma-read'], agent.capabilities), ['figma-read']);
  const dockerfile = await read('Dockerfile');
  assert.ok(dockerfile.includes(`ARG OPENCODE_VERSION=${OPENCODE_VERSION}`));
  assert.ok(dockerfile.includes('opencode-ai@${OPENCODE_VERSION}'));
  assert.match(dockerfile, /COPY scripts\/opencode-runner\.ts \/opt\/artemis\/opencode-runner\.ts/);
  assert.match(dockerfile, /install -y --no-install-recommends git jq/);
  for (const path of ['docs/agents/workflows/agent-runner-image.yml']) {
    assert.match(await read(path), /paths:[\s\S]*scripts\/opencode-runner\.ts/);
  }
});

for (const path of ['docs/agents/workflows/agent-run.yml']) {
  test(`OPC-02/03: ${path} validates the explicit model and keeps OpenCode inside the existing boundary`, async () => {
    const workflow = await read(path);
    const validation = workflow.indexOf('node scripts/opencode-runner.ts validate "$OPENCODE_MODEL"');
    const key = workflow.indexOf('AGENT_MODEL_KEY:');
    assert.ok(validation > 0 && validation < key);
    assert.match(workflow, /OPENCODE_MODEL: \$\{\{ needs\.prepare\.outputs\.model \}\}/);
    assert.match(workflow, /OPENCODE_MODEL=\$\(node -p .*\.model/);
    assert.doesNotMatch(workflow, /opencode-go\/|AGENT_OPENCODE_MODEL/);
    assert.match(workflow, /opencode-run\)\n\s+OPENCODE_API_KEY="\$KEY" node \/opt\/artemis\/opencode-runner\.ts run "\$KICKOFF All code must be TypeScript/);
    assert.match(workflow, /-e AGENT_MODEL_KEY -e OPENCODE_MODEL/);
    assert.doesNotMatch(workflow, /opencode auth login|opencode github|--auto/);
    assert.doesNotMatch(workflow, /docker\.sock|--privileged|seccomp=unconfined/);
    assert.match(workflow, /-v "\$GITHUB_WORKSPACE\/\.git:\/work\/\.git:ro"/);
  });
}

test('OPC-04: smoke uses the agents environment on trusted main only and cannot publish', async () => {
  const source = await read('docs/agents/workflows/opencode-smoke.yml');
  const workflow = parse(source) as { on: Record<string, unknown>; permissions: Record<string, string>; jobs: { smoke: { if: string; environment: string; permissions: Record<string, string>; steps: { name?: string; run?: string; env?: Record<string, string> }[] } } };
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, {});
  const job = workflow.jobs.smoke;
  assert.equal(job.environment, 'agents');
  assert.deepEqual(job.permissions, { contents: 'read', packages: 'read' });
  for (const guard of ["github.ref == 'refs/heads/main'", 'github.actor == vars.AGENT_TRUSTED_LOGIN', 'github.triggering_actor == vars.AGENT_TRUSTED_LOGIN']) assert.ok(job.if.includes(guard));
  const keySteps = job.steps.filter(step => Object.values(step.env ?? {}).some(value => value.includes('secrets.')));
  assert.equal(keySteps.length, 1);
  assert.deepEqual(keySteps[0].env, { OPENCODE_API_KEY: '${{ secrets.AGENT_KEY_OPENCODE }}' });
  assert.match(keySteps[0].run!, /--cap-drop ALL --security-opt no-new-privileges/);
  assert.match(keySteps[0].run!, /-e OPENCODE_API_KEY/);
  assert.match(keySteps[0].run!, /opencode-work\/\.git:\/work\/\.git:ro/);
  assert.doesNotMatch(source, /AGENT_APP_|create-github-app-token|gh pr|gh issue|git push|docker\.sock|--privileged/);
  assert.match(source, /timeout-minutes: 10/);
  assert.match(source, /opencode-smoke-fixture\.ts verify/);
  for (const match of source.matchAll(/uses: (\S+)/g)) assert.match(match[1], /^actions\/[a-z-]+@[0-9a-f]{40}$/);
});

test('OPC-03: proposed workflows retain the installed action pins before Hugo copies them', async () => {
  for (const name of ['agent-run.yml', 'agent-runner-image.yml', 'agent-sandbox-smoke.yml']) {
    const installed = [...(await read(`.github/workflows/${name}`)).matchAll(/uses: (\S+)/g)].map(match => match[1]);
    const proposed = [...(await read(`docs/agents/workflows/${name}`)).matchAll(/uses: (\S+)/g)].map(match => match[1]);
    assert.deepEqual(proposed, installed, name);
  }
});

test('OPC-03: PR image qualification runs the real CLI with only a dummy credential and read-only source', async () => {
  const workflow = await read('docs/agents/workflows/agent-sandbox-smoke.yml');
  assert.match(workflow, /node scripts\/verify-opencode-cli\.ts/);
  assert.match(workflow, /test ! -w \/opt\/artemis\/opencode-runner\.ts/);
  assert.match(workflow, /-v "\$GITHUB_WORKSPACE:\/repo:ro"/);
  assert.doesNotMatch(workflow, /secrets\./);
});
