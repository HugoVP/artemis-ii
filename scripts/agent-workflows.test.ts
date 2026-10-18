// Run with: node --test scripts/*.test.ts
// Reads the proposed workflows in docs/agents/workflows/ and checks the security properties of the design
// (docs/MULTI-AGENT-PHASES.md, Phase 2). These are text checks: they catch regressions in the YAML, they do not run it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (n: string) => readFile(new URL(`../docs/agents/workflows/${n}`, import.meta.url), "utf8");
const run = await read("agent-run.yml");
const image = await read("agent-runner-image.yml");
const smoke = await read("agent-sandbox-smoke.yml");

// The text of one job, from its key to the next top-level job.
function job(text: string, name: string): string {
  const m = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, "m").exec(text);
  assert.ok(m, `job ${name} not found`);
  return m[1]!;
}

test("every action is pinned to a full commit SHA, and is a GitHub-created action", () => {
  for (const text of [run, image, smoke]) {
    for (const m of text.matchAll(/^\s*- uses: (\S+)/gm)) {
      assert.match(m[1], /^actions\/[a-z-]+@[0-9a-f]{40}$/, m[1]);
    }
  }
});

test("P2-2: the work job has read-only permissions and no App credential", () => {
  const work = job(run, "work");
  const perms = /permissions:\n((?:      .+\n)+)/.exec(work)![1];
  assert.doesNotMatch(perms, /write/);
  assert.doesNotMatch(work, /AGENT_APP_/);
  assert.match(work, /git [^\n]*push --dry-run/);
});

test("the model key is read in exactly one step of one job, and the App key only in publish", () => {
  assert.equal([...run.matchAll(/secrets\[needs\.prepare\.outputs\.key_secret\]/g)].length, 1);
  const agentStep = /- name: Run the agent\n([\s\S]*?)(?=\n      - )/.exec(run)![1]!;
  assert.match(agentStep, /AGENT_MODEL_KEY: \$\{\{ secrets\[needs\.prepare\.outputs\.key_secret\] \}\}/);
  // Handed to the CLI under its own name, and removed from the environment that the CLI inherits.
  assert.match(agentStep, /unset AGENT_MODEL_KEY/);
  assert.match(agentStep, /CODEX_API_KEY="\$KEY" codex exec/);
  assert.match(agentStep, /ANTHROPIC_API_KEY="\$KEY" claude -p/);
  for (const name of ["prepare", "work", "escalate"]) assert.doesNotMatch(job(run, name), /AGENT_APP_PRIVATE_KEY/);
  assert.equal([...run.matchAll(/secrets\.AGENT_APP_PRIVATE_KEY/g)].length, 1);
  assert.doesNotMatch(image, /secrets\./);
});

test("P2-1: prepare compares the actor with the AGENT_TRUSTED_LOGIN variable, never with the repository owner", () => {
  const prepare = job(run, "prepare");
  assert.match(prepare, /TRUSTED: \$\{\{ vars\.AGENT_TRUSTED_LOGIN \}\}/);
  assert.match(prepare, /agent-checks\.ts trusted/);
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
  assert.match(publish, /RUNNER_TEMP\/trusted\/scripts\/agent-checks\.ts/);
  // After the agent's branch is checked out, only the trusted copy of the scripts may run.
  const afterCheckout = publish.split('git checkout "$BRANCH"')[1];
  assert.ok(afterCheckout, "publish checks out the branch to add the PLAN.md link");
  assert.doesNotMatch(afterCheckout, /node scripts\/|\.\/scripts\//);
});

test("publish pushes only after the destination ref check, and never merges", () => {
  const publish = job(run, "publish");
  assert.ok(publish.indexOf("agent-checks.ts ref") < publish.indexOf("git -c"), "the ref check comes before the first push");
  assert.doesNotMatch(run, /gh pr merge|gh api[^\n]*merge|--auto|enable_pr_auto_merge/);
  assert.doesNotMatch(run, /workflows:\s*write|administration|environments:\s*write/);
});

test("the agent never receives credentials in its checkout, and runs with a bounded time", () => {
  for (const m of run.matchAll(/actions\/checkout@[0-9a-f]{40}[^\n]*\n(?:\s+with:\n(?:\s{10}.+\n)+)?/g)) assert.match(m[0], /persist-credentials: false/);
  for (const name of ["prepare", "work", "publish", "figma-revoke", "escalate"]) assert.match(job(run, name), /timeout-minutes: \d+/);
  assert.match(job(run, "work"), /timeout-minutes: 90/);
  assert.match(run, /retention-days: 7/);
});

test("the image workflow is the only one with packages: write, and does not run on pull requests", () => {
  assert.match(image, /packages: write/);
  assert.doesNotMatch(run, /packages: write/);
  assert.doesNotMatch(image, /pull_request/);
});

test("the work job runs its steps with bash", () => {
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
  const step = /- name: Commit the agent's changes\n([\s\S]*?)(?=\n      - name:)/.exec(work)![1]!;
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
  const group = /^  group: (.*)$/m.exec(run)![1]!;
  for (const part of ["agent-task", "issue.pull_request == null", "startsWith(github.event.label.name, 'agent:')", "github.actor == vars.AGENT_TRUSTED_LOGIN", "github.triggering_actor == vars.AGENT_TRUSTED_LOGIN"]) assert.ok(group.includes(part), part);
});

test("a re-run by anyone but the trusted login is refused, in prepare and again in the later jobs", () => {
  assert.match(job(run, "prepare"), /TRIGGERING_ACTOR: \$\{\{ github\.triggering_actor \}\}/);
  assert.match(job(run, "prepare"), /trusted "\$TRIGGERING_ACTOR" "\$TRUSTED"/);
  for (const name of ["work", "publish", "figma-revoke", "escalate"]) assert.match(job(run, name), /^    if: (?:>-\n\s+)?.*github\.triggering_actor == vars\.AGENT_TRUSTED_LOGIN/m, name);
});

test("the agent step never asks the CLI to write to a path of the agent's choosing, and never bypasses the sandbox", () => {
  const step = /- name: Run the agent\n([\s\S]*?)(?=\n      - )/.exec(run)![1]!;
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

// The text of one step of a job, up to the next step or comment.
function step(text: string, name: string): string {
  const m = new RegExp(`- name: ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n([\\s\\S]*?)(?=\\n      #|\\n      - )`).exec(text);
  assert.ok(m, `step ${name} not found`);
  return m[1]!;
}

test("the agent runs in a docker run container without the Docker socket, as the runner's user, with .git read-only", () => {
  const work = job(run, "work");
  // A container job gets the Docker socket mounted by the runner; the agent must never reach it.
  assert.doesNotMatch(work, /^    container:/m);
  assert.doesNotMatch(run, /docker\.sock|--privileged|--cap-add|seccomp=unconfined|--network host|--pid host/);
  for (const name of ["Install the project dependencies", "Run the agent"]) {
    const s = step(work, name);
    assert.match(s, /docker run --rm --init --user "\$\(id -u\):\$\(id -g\)" --cap-drop ALL --security-opt no-new-privileges/, name);
    assert.match(s, /--pids-limit \d+/, name);
    assert.match(s, /-v "\$GITHUB_WORKSPACE:\/work" -v "\$GITHUB_WORKSPACE\/\.git:\/work\/\.git:ro"/, name);
    assert.doesNotMatch(s, /-v "\$RUNNER_TEMP\/trusted|-v "\$RUNNER_TEMP:/, name);
  }
  // Project code runs only in the container: npm on the runner would run install scripts next to the trusted steps.
  assert.equal([...run.matchAll(/npm ci/g)].length, 1);
  assert.match(step(work, "Install the project dependencies"), /"\$IMAGE" npm ci/);
  assert.match(step(work, "Pull the runner image"), /@sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(step(work, "Pull the runner image"), /docker logout ghcr\.io/);
});

test("the sandbox smoke workflow has no secrets and tests bwrap and Codex on the PR image", () => {
  assert.match(smoke, /pull_request:/);
  assert.match(smoke, /permissions:\n  contents: read/);
  assert.match(smoke, /head\.repo\.full_name == github\.repository/);
  assert.doesNotMatch(smoke, /secrets\.|packages: write|--privileged|seccomp=unconfined/);
  assert.match(smoke, /bwrap --unshare-user --unshare-pid/);
  assert.match(smoke, /codex sandbox -- \/bin\/true/);
});

test("the nested sandbox uses a trusted, bounded seccomp profile", async () => {
  const installed = await readFile(new URL("../.github/workflows/agent-run.yml", import.meta.url), "utf8");
  const profile = JSON.parse(await readFile(new URL("../agents/agent-seccomp.json", import.meta.url), "utf8")) as {
    defaultAction: string;
    syscalls: Array<{ names: string[]; action: string; args?: Array<{ index: number; value: number; valueTwo?: number; op: string }> }>;
  };
  assert.equal(profile.defaultAction, "SCMP_ACT_ERRNO");
  assert.ok(profile.syscalls.some((rule) => rule.names.includes("clone") && rule.action === "SCMP_ACT_ALLOW" &&
    rule.args?.some((arg) => arg.value === 0x10000000 && arg.valueTwo === 0x10000000 && arg.op === "SCMP_CMP_MASKED_EQ")));
  for (const name of ["mount", "umount2", "pivot_root", "unshare"]) {
    assert.ok(profile.syscalls.some((rule) => rule.names.includes(name) && rule.action === "SCMP_ACT_ALLOW"), name);
  }
  for (const workflow of [run, installed]) {
    const work = job(workflow, "work");
    const prepare = step(work, "Prepare the workspace");
    const install = step(work, "Install the project dependencies");
    const agent = step(work, "Run the agent");
    assert.match(prepare, /cp agents\/agent-seccomp\.json "\$RUNNER_TEMP\/trusted\/agent-seccomp\.json"/);
    assert.match(agent, /--security-opt "seccomp=\$RUNNER_TEMP\/trusted\/agent-seccomp\.json"/);
    assert.doesNotMatch(install, /agent-seccomp\.json/);
    assert.doesNotMatch(agent, /-v "\$RUNNER_TEMP\/trusted/);
    assert.ok(work.indexOf("cp agents/agent-seccomp.json") < work.indexOf("npm ci"));
  }
});

test("the Figma refresh token is read only by the gateway and the replacement job, from trusted scripts, and the agent gets no Figma credential", () => {
  const work = job(run, "work");
  const gateway = step(work, "Start the Figma MCP gateway");
  assert.match(gateway, /if: needs\.prepare\.outputs\.figma != 'none'/);
  assert.match(gateway, /node "\$RUNNER_TEMP\/trusted\/scripts\/figma-mcp-gateway\.ts" "\$BIND"/);
  assert.match(gateway, /FIGMA_ACCESS: \$\{\{ needs\.prepare\.outputs\.figma \}\}/);
  const revoke = job(run, "figma-revoke");
  assert.match(revoke, /^    if: always\(\) && github\.triggering_actor == vars\.AGENT_TRUSTED_LOGIN && needs\.prepare\.result == 'success' && needs\.prepare\.outputs\.figma != 'none'/m);
  assert.match(revoke, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(revoke, /run: node scripts\/figma-mcp-token\.ts revoke/);
  assert.doesNotMatch(revoke.replace(/^\s*#.*$/gm, ""), /\bnpm\b/);
  assert.equal([...run.matchAll(/secrets\.FIGMA_MCP_REFRESH_TOKEN/g)].length, 2);
  for (const name of ["Install the project dependencies", "Run the agent"]) assert.doesNotMatch(step(work, name), /FIGMA_MCP_|FIGMA_TOKEN|headers:|Bearer |bearer_token/, name);
  assert.doesNotMatch(run, /figma-mcp-token\.ts" issue|bearer_token_env_var/);
  for (const name of ["prepare", "publish", "escalate"]) assert.doesNotMatch(job(run, name), /FIGMA_MCP_/);
  assert.match(job(run, "prepare"), /figma=\$FIGMA/);
  // The gateway is stopped right after the agent, whatever happened, and its log is shown.
  const stop = step(work, "Stop the Figma MCP gateway");
  assert.match(stop, /if: always\(\) && needs\.prepare\.outputs\.figma != 'none'/);
  assert.match(stop, /kill "\$FIGMA_GATEWAY_PID"/);
});

test("Figma write tools are offered only to stages that need figma-write, for both runners, through the gateway", () => {
  const agentStep = step(job(run, "work"), "Run the agent");
  assert.match(agentStep, /TOOLS=\(get_metadata get_screenshot get_variable_defs get_design_context\)/);
  assert.match(agentStep, /if \[ "\$FIGMA" = write \]; then TOOLS\+=\(use_figma\); fi/);
  assert.doesNotMatch(agentStep, /whoami|create_new_file/);
  assert.match(agentStep, /GATEWAY="http:\/\/figma-gateway:8787\/mcp"/);
  assert.doesNotMatch(agentStep, /mcp\.figma\.com/);
  assert.match(agentStep, /--add-host figma-gateway:host-gateway/);
  assert.match(agentStep, /mcp_servers\.figma\.enabled_tools=/);
  assert.match(agentStep, /--permission-mode dontAsk/);
  assert.match(agentStep, /--strict-mcp-config/);
  assert.match(agentStep, /failIfUnavailable: true/);
  assert.match(agentStep, /allowUnsandboxedCommands: false/);
  assert.match(agentStep, /allowedDomains: \["registry\.npmjs\.org"/);
  assert.doesNotMatch(agentStep, /dangerously|bypassPermissions/);
});

test("Claude Code may edit and write only inside the workspace, never in .git", () => {
  const agentStep = step(job(run, "work"), "Run the agent");
  const allowed = /ALLOWED=\(([^)]*\))*[^)]*\)/.exec(agentStep)![0];
  assert.match(allowed, /"Edit\(\/\/work\/\*\*\)" "Write\(\/\/work\/\*\*\)"/);
  assert.doesNotMatch(allowed, /(?:^|[ (])(?:Edit|Write)(?:[ )]|$)/);
  assert.match(agentStep, /deny: \["Edit\(\/\/work\/\.git\/\*\*\)", "Write\(\/\/work\/\.git\/\*\*\)"\]/);
});

test("the trusted git steps after the agent read no global or system configuration and run no hooks or fsmonitor", () => {
  const work = job(run, "work");
  for (const name of ["Commit the agent's changes", "Check that no write token reached the workspace", "Bundle and scan the result"]) {
    const s = /- name: ([^\n]+)\n([\s\S]*?)(?=\n      - |(?![\s\S]))/g;
    const text = [...work.matchAll(s)].find((m) => m[1] === name)![2]!;
    assert.match(text, /GIT_CONFIG_GLOBAL: \/dev\/null/, name);
    assert.match(text, /GIT_CONFIG_NOSYSTEM: "1"/, name);
    assert.match(text, /core\.hooksPath[\s\S]*\/dev\/null/, name);
    assert.match(text, /core\.fsmonitor/, name);
  }
});

test("project dependencies are installed before the gateway starts and before the agent, never in the preparation step", () => {
  const work = job(run, "work");
  assert.doesNotMatch(step(work, "Prepare the workspace"), /npm ci/);
  const at = (s: string) => work.indexOf(`- name: ${s}`);
  assert.ok(at("Prepare the workspace") < at("Install the project dependencies"));
  // The gateway starts after the install, so install scripts never find it running, and stops right after the agent.
  assert.ok(at("Install the project dependencies") < at("Start the Figma MCP gateway"));
  assert.ok(at("Start the Figma MCP gateway") < at("Run the agent"));
  assert.ok(at("Run the agent") < at("Stop the Figma MCP gateway"));
  assert.ok(at("Stop the Figma MCP gateway") < at("Commit the agent's changes"));
});

test("a failed or cancelled token replacement is escalated, and its intended skip is not", () => {
  const esc = job(run, "escalate");
  assert.match(esc, /needs: \[prepare, work, publish, figma-revoke\]/);
  assert.match(esc, /needs\.figma-revoke\.result == 'failure' \|\| needs\.figma-revoke\.result == 'cancelled'/);
  assert.doesNotMatch(esc, /figma-revoke\.result != 'success'/);
  assert.match(esc, /was not replaced/);
});
