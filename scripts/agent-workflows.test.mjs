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

test("the work job runs its steps with bash, not the container's default sh", () => {
  assert.match(job(run, "work"), /defaults:\n      run:\n        shell: bash/);
});

test("the artifact comes from a fresh folder outside the agent's paths and is extracted where publish looks for it", () => {
  const work = job(run, "work");
  assert.match(work, /OUT=\$\(mktemp -d\)/);
  assert.match(work, /path: \|\n(\s+\$\{\{ env\.OUT \}\}\/[a-z.-]+\n)+/);
  assert.doesNotMatch(work.split("- name: Bundle and scan the result")[1], />\s*\.agent\//, "no redirection into the agent's scratch folder");
  assert.match(work, /\[ ! -L \.agent \]/);
  assert.match(job(run, "publish"), /path: \$\{\{ runner\.temp \}\}\/bundle\/\.agent/);
});

test("path lists are NUL separated without rename detection, and no scan relies on a text patch", () => {
  const diffs = [...run.matchAll(/git diff [^\n]*--name-only[^\n]*/g)].map((m) => m[0]);
  assert.equal(diffs.length, 2);
  for (const d of diffs) assert.match(d, /--no-renames/), assert.match(d, / -z /);
  assert.doesNotMatch(run, /git log -p/);
});

test("every new object is scanned in work and again in publish, before the App token exists", () => {
  assert.match(job(run, "work"), /scan-range origin\/main "\$BRANCH"/);
  const publish = job(run, "publish");
  assert.ok(publish.indexOf("scan-range origin/main") !== -1);
  assert.ok(publish.indexOf("scan-range origin/main") < publish.indexOf("create-github-app-token"));
});

test("the draft warning never goes through a step output", () => {
  assert.doesNotMatch(run, /outputs\.warning|warning=/);
  assert.match(run, /publish-plan/);
});

test("a trusted step makes the commit, with hooks off and without the scratch folder, after the agent ran", () => {
  const work = job(run, "work");
  assert.ok(work.indexOf("- name: Run the agent") < work.indexOf("- name: Commit the agent's changes"));
  const step = /- name: Commit the agent's changes\n([\s\S]*?)(?=\n      - name:)/.exec(work)[1];
  assert.match(step, /core\.hooksPath=\/dev\/null/);
  assert.match(step, /':!\.agent'/);
  assert.doesNotMatch(step, /CODEX_API_KEY|secrets\./);
});

test("the work order line is matched on a numeric boundary, and prepare checks merged stage PRs", () => {
  assert.match(run, /grep -Eq "Closes #\$\{ISSUE\}\(\[\^0-9\]\|\$\)"/);
  assert.match(job(run, "prepare"), /--state merged/);
  assert.match(job(run, "prepare"), /merged\.json/);
});

test("path diffs use three dots, and the concurrency group mirrors the eligibility of prepare", () => {
  for (const m of run.matchAll(/git diff [^\n]*--name-only[^\n]*/g)) assert.match(m[0], /origin\/main\.\.\.\$/);
  const group = /^  group: (.*)$/m.exec(run)[1];
  for (const part of ["agent-task", "issue.pull_request == null", "startsWith(github.event.label.name, 'agent:')", "github.actor == vars.AGENT_TRUSTED_LOGIN", "github.triggering_actor == vars.AGENT_TRUSTED_LOGIN"]) assert.ok(group.includes(part), part);
});

test("a re-run by anyone but the trusted login is refused, in prepare and again in the later jobs", () => {
  assert.match(job(run, "prepare"), /TRIGGERING_ACTOR: \$\{\{ github\.triggering_actor \}\}/);
  assert.match(job(run, "prepare"), /trusted "\$TRIGGERING_ACTOR" "\$TRUSTED"/);
  for (const name of ["work", "publish", "escalate"]) assert.match(job(run, name), /^    if: .*github\.triggering_actor == vars\.AGENT_TRUSTED_LOGIN/m, name);
});

test("the agent step never asks the CLI to write to a path of the agent's choosing, and never bypasses the sandbox", () => {
  const step = /- name: Run the agent\n([\s\S]*?)(?=\n      - )/.exec(run)[1];
  assert.doesNotMatch(step, /--output-last-message|-o \./);
  assert.doesNotMatch(run, /dangerously-bypass/);
  assert.match(step, /--sandbox workspace-write/);
});

test("single-line run: values contain no colon followed by a space, which is invalid in a plain YAML scalar", () => {
  for (const [name, text] of [["agent-run.yml", run], ["agent-runner-image.yml", image]]) {
    for (const m of text.matchAll(/^\s*(?:- )?run: ([^|>\n].*)$/gm)) {
      const value = m[1];
      const quoted = /^["'].*["']$/.test(value);
      // The whole value is checked: YAML is parsed before Actions expressions are evaluated, so a colon and a space
      // inside an expression is just as invalid.
      assert.ok(quoted || !/: /.test(value), `${name}: ${value}`);
    }
  }
});
