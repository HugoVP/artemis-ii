import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { copilotArgs, REVIEW_ALLOWED_TOOLS } from './copilot-runner.ts';
import { openCodeConfig, openCodeReviewConfig } from './opencode-runner.ts';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

interface Step { name?: string; uses?: string; run?: string; env?: Record<string, string>; if?: string }
interface Job { if?: string; environment?: string; permissions?: Record<string, string>; needs?: string | string[]; steps: Step[] }
const source = await read('docs/agents/workflows/agent-review.yml');
const workflow = parse(source) as { on: Record<string, { types?: string[] }>; permissions: Record<string, string>; concurrency: { group: string; 'cancel-in-progress': boolean }; jobs: Record<string, Job> };
const { prepare, review, publish, report } = workflow.jobs;

test('REV-01: started only by label on a PR or by hand, with no permissions by default', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request_target', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.pull_request_target.types, ['labeled']);
  assert.deepEqual(workflow.permissions, {});
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
});

test('REV-01: the trusted login is checked twice, from the default branch, in prepare and again in later jobs', () => {
  for (const guard of ['github.actor == vars.AGENT_TRUSTED_LOGIN', 'github.triggering_actor == vars.AGENT_TRUSTED_LOGIN', 'github.event.repository.default_branch']) {
    assert.ok(prepare.if!.includes(guard), guard);
  }
  assert.ok(prepare.if!.includes("startsWith(github.event.label.name, 'review:')"));
  assert.ok(prepare.if!.includes('github.event.pull_request.head.repo.full_name == github.repository'));
  assert.ok(prepare.if!.includes("startsWith(github.event.pull_request.head.ref, 'agent/stage-')"));
  for (const job of [review, publish, report]) assert.ok(job.if!.includes('github.triggering_actor == vars.AGENT_TRUSTED_LOGIN'));
  const script = prepare.steps.map(step => step.run ?? '').join('\n');
  assert.match(script, /agent-checks\.ts trusted "\$ACTOR" "\$TRUSTED"/);
  assert.match(script, /agent-checks\.ts trusted "\$TRIGGERING_ACTOR" "\$TRUSTED"/);
  assert.doesNotMatch(source, /repository_owner\s*==|owner\.login/);
});

test('REV-01: prepare and the checks always run from main', () => {
  assert.deepEqual(prepare.permissions, { contents: 'read', 'pull-requests': 'read' });
  assert.equal(prepare.environment, undefined);
  for (const step of prepare.steps.filter(s => s.uses?.startsWith('actions/checkout'))) {
    assert.match(JSON.stringify(step), /default_branch/);
  }
  assert.doesNotMatch(JSON.stringify(prepare.steps), /secrets\./);
});

test('REV-05: the review job reads the key in one step and has no write permission or App credential', () => {
  assert.equal(review.environment, 'agents');
  // id-token writes nothing: it lets the refresher step ask GitHub for an OIDC token (docs/specs/claude-wif.md).
  assert.deepEqual(review.permissions, { contents: 'read', packages: 'read', 'id-token': 'write' });
  const keySteps = review.steps.filter(step => JSON.stringify(step).includes('secrets['));
  assert.deepEqual(keySteps.map(step => step.name), ['Run the reviewer']);
  assert.doesNotMatch(JSON.stringify(review), /AGENT_APP_|create-github-app-token|checks|issues: write|pull-requests/);
  assert.match(source, /push --dry-run/);
  assert.equal([...source.matchAll(/secrets\[needs\.prepare\.outputs\.key_secret\]/g)].length, 1);
});

test('REV-05: the checkout is the recorded head SHA and the container sees it read-only, with only .agent writable', () => {
  const checkouts = review.steps.filter(s => s.uses?.startsWith('actions/checkout'));
  assert.equal(checkouts.length, 2);
  assert.match(JSON.stringify(checkouts[1]), /needs\.prepare\.outputs\.head/);
  for (const step of checkouts) assert.match(JSON.stringify(step), /"persist-credentials":false/);
  const run = review.steps.find(s => s.name === 'Run the reviewer')!.run!;
  assert.match(run, /--cap-drop ALL --security-opt no-new-privileges/);
  assert.match(run, /-v "\$GITHUB_WORKSPACE\/pr:\/work:ro"/);
  assert.match(run, /-v "\$GITHUB_WORKSPACE\/pr\/\.git:\/work\/\.git:ro"/);
  assert.match(run, /-v "\$GITHUB_WORKSPACE\/pr\/\.agent:\/work\/\.agent"/);
  assert.doesNotMatch(run, /docker\.sock|--privileged|seccomp=unconfined/);
  assert.doesNotMatch(run.replace(/^\s*#.*$/gm, ''), /\bnpm (ci|run|install)\b|figma-mcp-gateway/);
  assert.ok(source.includes('rev-parse HEAD)" = "$HEAD_SHA"'));
});

test('REV-06: Codex and Claude Code are invoked inline and read-only', () => {
  const run = review.steps.find(s => s.name === 'Run the reviewer')!.run!;
  assert.match(run, /CODEX_API_KEY="\$KEY" codex exec \\\n\s+--sandbox read-only/);
  assert.match(run, /--output-last-message \.agent\/review\.md/);
  assert.doesNotMatch(run, /workspace-write|danger-full-access|--dangerously|--yolo/);
  assert.match(run, /export ANTHROPIC_API_KEY="\$KEY"\n\s+fi\n\s+claude -p/);
  assert.match(run, /--setting-sources user/);
  assert.match(run, /--permission-mode dontAsk/);
  assert.match(run, /ALLOWED=\(Read Glob Grep "Bash\(git status\*\)" "Bash\(git diff\*\)" "Bash\(git log\*\)" "Bash\(git show\*\)" "Bash\(git ls-files\*\)" "Write\(\/\/work\/\.agent\/review\.md\)"\)/);
  assert.doesNotMatch(/ALLOWED=.*/.exec(run)![0], /Edit|WebFetch|WebSearch|Bash\(npm|Bash\(node/);
  assert.doesNotMatch(run, /WebFetch|WebSearch/);
  assert.match(run, /opencode-runner\.ts review/);
  assert.match(run, /copilot-runner\.ts review/);
  assert.match(run, /FIGMA=none/);
});

test('WIF-07: a Claude reviewer uses federation like the builder: refresher on the runner, read-only token folder, no key, redacted output', () => {
  const steps = review.steps.map(s => s.name);
  const at = (n: string) => steps.indexOf(n);
  assert.ok(at('Pull the runner image') < at('Start the Anthropic OIDC token refresher'));
  assert.ok(at('Start the Anthropic OIDC token refresher') < at('Run the reviewer'));
  assert.ok(at('Run the reviewer') < at('Stop the Anthropic OIDC token refresher'));
  assert.ok(at('Stop the Anthropic OIDC token refresher') < at('Check and scan the review'));
  const start = review.steps.find(s => s.name === 'Start the Anthropic OIDC token refresher')!;
  assert.equal(start.if, "needs.prepare.outputs.auth == 'federation'");
  assert.match(start.run!, /anthropic-oidc\.ts" validate\n[\s\S]*anthropic-oidc\.ts" start "\$OIDC_DIR"/);
  for (const v of ['ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID', 'ANTHROPIC_SERVICE_ACCOUNT_ID', 'ANTHROPIC_WORKSPACE_ID']) {
    assert.equal(start.env![v], `\${{ secrets.${v} }}`, v);
    assert.doesNotMatch(source, new RegExp(`vars\\.${v}`), v);
  }
  const stop = review.steps.find(s => s.name === 'Stop the Anthropic OIDC token refresher')!;
  assert.equal(stop.if, "always() && needs.prepare.outputs.auth == 'federation'");
  assert.match(stop.run!, /rm -rf -- "\$RUNNER_TEMP\/anthropic-oidc"/);
  assert.match(start.run!, /start "\$OIDC_DIR" "\$RUNNER_TEMP\/anthropic-oidc-issued"/);
  assert.match(stop.run!, /echo "::add-mask::\$t"; fi; done < "\$RUNNER_TEMP\/anthropic-oidc-issued"/);
  const agent = review.steps.find(s => s.name === 'Run the reviewer')!;
  assert.equal(agent.env!.AGENT_MODEL_KEY, "${{ needs.prepare.outputs.auth == 'api-key' && secrets[needs.prepare.outputs.key_secret] || '' }}");
  assert.match(agent.run!, /-v "\$RUNNER_TEMP\/anthropic-oidc:\/run\/anthropic-oidc:ro"/);
  assert.match(agent.run!, /unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN/);
  assert.match(agent.run!, /< \/dev\/null 2>&1 \\\n\s+\| node "\$RUNNER_TEMP\/trusted\/scripts\/anthropic-oidc\.ts" redact/);
  // The request variables, which can mint tokens, are never named, so they never reach the container.
  assert.doesNotMatch(source.replace(/^\s*#.*$/gm, ''), /ACTIONS_ID_TOKEN_REQUEST/);
  assert.equal(prepare.steps.length > 0 && JSON.stringify(workflow.jobs.prepare).includes('outputs.auth'), true);
});

test('REV-08: the review is copied once, scanned from the trusted copy and uploaded alone', () => {
  const scan = review.steps.find(s => s.name === 'Check and scan the review')!.run!;
  assert.match(scan, /\[ ! -L pr\/\.agent\/review\.md \]/);
  assert.match(scan, /RUNNER_TEMP\/trusted\/scripts\/agent-review\.ts" scan/);
  const upload = review.steps.find(s => s.uses?.startsWith('actions/upload-artifact'))!;
  assert.match(JSON.stringify(upload), /review\.md/);
  assert.doesNotMatch(JSON.stringify(upload), /pr\.diff|\.agent\/\*/);
  assert.match(source, /config-touched/);
});

test('REV-09: the publisher has only comment and check write access, no environment, no project code', () => {
  assert.deepEqual(publish.permissions, { contents: 'read', 'pull-requests': 'write', checks: 'write' });
  assert.equal(publish.environment, undefined);
  const text = JSON.stringify(publish);
  assert.doesNotMatch(text, /secrets\./);
  assert.match(text, /default_branch/);
  const code = publish.steps.map(s => s.run ?? '').join('\n').replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(code, /\bnpm\b|\bnpx\b|\bpnpm\b|\byarn\b/);
  assert.match(code, /agent-review\.ts bind/);
  assert.match(code, /agent-review\.ts check-run/);
  assert.match(code, /issues\/\$PR\/comments/);
  assert.match(code, /repos\/\$REPO\/check-runs/);
  assert.ok(code.indexOf('issues/$PR/comments') < code.indexOf('repos/$REPO/check-runs'), 'the check run records the comment id');
});

test('REV-10: report only comments and edits labels', () => {
  assert.deepEqual(report.permissions, { 'pull-requests': 'write' });
  assert.match(report.steps.map(s => s.run ?? '').join('\n'), /--remove-label/);
});

test('REV-11: nothing merges, approves, pushes or escalates, and no job but publish can write checks', () => {
  assert.doesNotMatch(source, /gh pr (merge|review)|gh api[^\n]*(merge|reviews)|--approve|--auto|enable_pr_auto_merge|needs-hugo|git push origin|extraheader/);
  assert.doesNotMatch(source, /(contents|workflows|administration|issues|statuses|deployments|actions): *write/);
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (name !== 'publish') assert.notEqual(job.permissions?.checks, 'write', name);
  }
  assert.deepEqual(Object.keys(workflow.jobs), ['prepare', 'review', 'publish', 'report']);
});

test('REV-01: actions are pinned like the ones installed on main', async () => {
  const installed = [...(await read('.github/workflows/agent-run.yml')).matchAll(/uses: (\S+)/g)].map(match => match[1]);
  for (const match of source.matchAll(/uses: (\S+)/g)) {
    assert.match(match[1], /^actions\/[a-z-]+@[0-9a-f]{40}$/);
    assert.ok(installed.includes(match[1]), `${match[1]} is pinned on main`);
  }
});

test('REV-06: OpenCode review mode edits only .agent/review.md and runs only read-only git', () => {
  const build = openCodeConfig('opencode-go/glm-5.3');
  const config = openCodeReviewConfig('opencode-go/glm-5.3');
  assert.equal(config.permission['*'], 'deny');
  assert.deepEqual(config.permission.edit, { '*': 'deny', '.agent/review.md': 'allow', '/work/.agent/review.md': 'allow' });
  assert.equal(config.permission.bash['*'], 'deny');
  const allowed = Object.entries(config.permission.bash).filter(([, v]) => v === 'allow').map(([k]) => k);
  assert.deepEqual(allowed, ['git status*', 'git diff*', 'git log*', 'git show*', 'git ls-files*']);
  for (const tool of ['webfetch', 'websearch', 'external_directory', 'question', 'task', 'skill'] as const) assert.equal(config.permission[tool], 'deny', tool);
  // The isolation of a build run is unchanged.
  assert.equal(config.share, 'disabled');
  assert.deepEqual(config.mcp, {});
  assert.deepEqual(config.enabled_providers, build.enabled_providers);
  assert.equal(config.provider['opencode-go'].options.apiKey, '{env:OPENCODE_API_KEY}');
  assert.equal(build.permission.edit['*'], 'allow', 'build mode is untouched');
});

test('REV-06: Copilot review mode approves one write and read-only git, and allows no URL or build command', () => {
  const args = copilotArgs('example-model', 'Prompt', 'review');
  assert.deepEqual(args.filter(a => a.startsWith('--allow-tool=')), REVIEW_ALLOWED_TOOLS.map(t => `--allow-tool=${t}`));
  assert.ok(args.includes('--allow-tool=write(.agent/review.md)'));
  assert.ok(!args.includes('--allow-tool=write'));
  assert.equal(args.filter(a => a.startsWith('--allow-url=')).length, 0);
  for (const denied of ['shell(npm:*)', 'shell(node:*)', 'shell(git push)', 'shell(git commit)', 'shell(rm)', 'shell(curl)', 'write(/work/.git)']) {
    assert.ok(args.includes(`--deny-tool=${denied}`), denied);
  }
  for (const flag of ['--no-ask-user', '--disable-builtin-mcps', '--secret-env-vars=COPILOT_GITHUB_TOKEN']) assert.ok(args.includes(flag), flag);
  assert.ok(!args.some(a => /allow-all|yolo/.test(a)));
  // Build mode keeps its lists.
  assert.ok(copilotArgs('example-model', 'Prompt').includes('--allow-tool=write'));
  assert.ok(copilotArgs('example-model', 'Prompt').includes('--allow-url=registry.npmjs.org'));
});
