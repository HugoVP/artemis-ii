// Run with: node --test scripts/*.test.mjs
// Reads the proposed workflows in docs/agents/workflows/ and checks the security properties of the design
// (docs/MULTI-AGENT-PHASES.md, Phase 2). These are text checks: they catch regressions in the YAML, they do not run it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (n) => readFile(new URL(`../docs/agents/workflows/${n}`, import.meta.url), "utf8");
const run = await read("agent-run.yml");
const image = await read("agent-runner-image.yml");

// The text of one job, from its key to the next top-level job.
function job(text, name) {
  const m = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, "m").exec(text);
  assert.ok(m, `job ${name} not found`);
  return m[1];
}

test("every action is pinned to a full commit SHA, and is a GitHub-created action", () => {
  for (const text of [run, image]) {
    for (const m of text.matchAll(/^\s*- uses: (\S+)/gm)) {
      assert.match(m[1], /^actions\/[a-z-]+@[0-9a-f]{40}$/, m[1]);
    }
  }
});

test("P2-2: the work job has read-only permissions and no App credential", () => {
  const work = job(run, "work");
  const perms = /permissions:\n((?:      .+\n)+)/.exec(work)[1];
  assert.doesNotMatch(perms, /write/);
  assert.doesNotMatch(work, /AGENT_APP_/);
  assert.match(work, /git push --dry-run/);
});

test("the model key is read in exactly one step of one job, and the App key only in publish", () => {
  assert.equal([...run.matchAll(/secrets\[needs\.prepare\.outputs\.key_secret\]/g)].length, 1);
  const agentStep = /- name: Run the agent\n([\s\S]*?)(?=\n      - )/.exec(run)[1];
  assert.match(agentStep, /CODEX_API_KEY: \$\{\{ secrets\[needs\.prepare\.outputs\.key_secret\] \}\}/);
  for (const name of ["prepare", "work", "escalate"]) assert.doesNotMatch(job(run, name), /AGENT_APP_PRIVATE_KEY/);
  assert.equal([...run.matchAll(/secrets\.AGENT_APP_PRIVATE_KEY/g)].length, 1);
  assert.doesNotMatch(image, /secrets\./);
});

test("P2-1: prepare compares the actor with the AGENT_TRUSTED_LOGIN variable, never with the repository owner", () => {
  const prepare = job(run, "prepare");
  assert.match(prepare, /TRUSTED: \$\{\{ vars\.AGENT_TRUSTED_LOGIN \}\}/);
  assert.match(prepare, /agent-checks\.mjs trusted/);
  assert.doesNotMatch(run, /repository_owner\s*==|owner\.login/);
});

test("P2-6: one repository-wide concurrency group, never cancelling a run in progress", () => {
  assert.match(run, /^concurrency:\n  group: .*'agent-run'.*\n  cancel-in-progress: false/m);
  for (const name of ["prepare", "work", "publish"]) assert.doesNotMatch(job(run, name), /concurrency:/);
});

test("publish runs no project code and no npm, and takes its scripts from main", () => {
  const publish = job(run, "publish");
  assert.doesNotMatch(publish.replace(/^\s*#.*$/gm, ""), /\bnpm\b|\bnpx\b|\bpnpm\b|\byarn\b/);
  assert.match(publish, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(publish, /RUNNER_TEMP\/trusted\/scripts\/agent-checks\.mjs/);
  // After the agent's branch is checked out, only the trusted copy of the scripts may run.
  const afterCheckout = publish.split('git checkout "$BRANCH"')[1];
  assert.ok(afterCheckout, "publish checks out the branch to add the PLAN.md link");
  assert.doesNotMatch(afterCheckout, /node scripts\/|\.\/scripts\//);
});

test("publish pushes only after the destination ref check, and never merges", () => {
  const publish = job(run, "publish");
  assert.ok(publish.indexOf("agent-checks.mjs ref") < publish.indexOf("git -c"), "the ref check comes before the first push");
  assert.doesNotMatch(run, /gh pr merge|gh api[^\n]*merge|--auto|enable_pr_auto_merge/);
  assert.doesNotMatch(run, /workflows:\s*write|administration|environments:\s*write/);
});

test("the agent never receives credentials in its checkout, and runs with a bounded time", () => {
  for (const m of run.matchAll(/actions\/checkout@[0-9a-f]{40}[^\n]*\n(?:\s+with:\n(?:\s{10}.+\n)+)?/g)) assert.match(m[0], /persist-credentials: false/);
  for (const name of ["prepare", "work", "publish", "escalate"]) assert.match(job(run, name), /timeout-minutes: \d+/);
  assert.match(job(run, "work"), /timeout-minutes: 90/);
  assert.match(run, /retention-days: 7/);
});

test("the image workflow is the only one with packages: write, and does not run on pull requests", () => {
  assert.match(image, /packages: write/);
  assert.doesNotMatch(run, /packages: write/);
  assert.doesNotMatch(image, /pull_request/);
});
