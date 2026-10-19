// Run with: node --test scripts/*.test.ts
// Reads the proposed workflows in docs/agents/workflows/ and checks the security properties of the design
// (docs/MULTI-AGENT-PHASES.md, Phase 2). Text checks cover the YAML; commit-step tests run in temporary repositories.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  // The only write permission is id-token, which can mint OIDC tokens but writes nothing (docs/specs/claude-wif.md).
  assert.doesNotMatch(perms.replace("id-token: write", ""), /write/);
  assert.doesNotMatch(work, /AGENT_APP_/);
  assert.match(work, /git [^\n]*push --dry-run/);
});

test("the model key is read in exactly one step of one job, and the App key only in publish", () => {
  assert.equal([...run.matchAll(/secrets\[needs\.prepare\.outputs\.key_secret\]/g)].length, 1);
  const agentStep = /- name: Run the agent\n([\s\S]*?)(?=\n      - )/.exec(run)![1]!;
  assert.match(agentStep, /AGENT_MODEL_KEY: \$\{\{ needs\.prepare\.outputs\.auth == 'api-key' && secrets\[needs\.prepare\.outputs\.key_secret\] \|\| '' \}\}/);
  // Handed to the CLI under its own name, and removed from the environment that the CLI inherits.
  assert.match(agentStep, /unset AGENT_MODEL_KEY/);
  assert.match(agentStep, /CODEX_API_KEY="\$KEY" codex exec/);
  assert.match(agentStep, /export ANTHROPIC_API_KEY="\$KEY"\n\s+fi\n\s+claude -p/);
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
  assert.match(step, /':\(exclude,glob\)\*\*\/\.agent\/\*\*'/);
  assert.doesNotMatch(step, /CODEX_API_KEY|secrets\./);
});

for (const workflowPath of [".github/workflows/agent-run.yml", "docs/agents/workflows/agent-run.yml"]) {
  for (const ignored of [true, false]) {
    test(`SEC-04: ${workflowPath} commits changes without scratch files when ignore rules are ${ignored ? "present" : "absent"}`, async () => {
      const workflow = await readFile(new URL(`../${workflowPath}`, import.meta.url), "utf8");
      const commitStep = step(job(workflow, "work"), "Commit the agent's changes");
      const script = /        run: \|\n([\s\S]*)/.exec(commitStep)![1]!.replace(/^          /gm, "");
      const dir = await mkdtemp(join(tmpdir(), "agent-commit-"));
      const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
      const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8" });
      try {
        git("init", "-q");
        git("config", "user.name", "Test");
        git("config", "user.email", "test@example.invalid");
        await writeFile(join(dir, ".gitignore"), ignored ? ".agent/\nnode_modules/\n" : "");
        await writeFile(join(dir, "modified.ts"), "export const value = 1;\n");
        await writeFile(join(dir, "deleted.ts"), "export {};\n");
        git("add", ".gitignore", "modified.ts", "deleted.ts");
        git("commit", "-qm", "Initial fixture");
        for (const folder of [".agent", "node_modules", "nested/.agent", "nested/node_modules"]) {
          await mkdir(join(dir, folder, "nested"), { recursive: true });
          await writeFile(join(dir, folder, "nested", "scratch.txt"), "scratch\n");
        }
        await writeFile(join(dir, ".agent/pr-title.txt"), "Fixture changes\n");
        await writeFile(join(dir, "added.ts"), "export {};\n");
        await writeFile(join(dir, "modified.ts"), "export const value = 2;\n");
        await rm(join(dir, "deleted.ts"));
        execFileSync("bash", ["-eu", "-o", "pipefail", "-c", script], { cwd: dir, env, stdio: "pipe" });
        assert.equal(git("log", "-1", "--format=%s").trim(), "Fixture changes");
        assert.deepEqual(git("diff", "--no-renames", "HEAD^", "HEAD", "--name-status").trim().split("\n"), [
          "A\tadded.ts", "D\tdeleted.ts", "M\tmodified.ts",
        ]);
        assert.deepEqual(git("ls-tree", "-r", "--name-only", "HEAD").trim().split("\n"), [
          ".gitignore", "added.ts", "modified.ts",
        ]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
}

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
  assert.match(smoke, /runs-on: ubuntu-22\.04/);
  assert.match(smoke, /apparmor=artemis-ii-agent-bwrap/);
  assert.match(smoke, /sudo apparmor_parser -r agents\/agent-apparmor\.profile/);
  assert.match(smoke, /permissions:\n  contents: read/);
  assert.match(smoke, /head\.repo\.full_name == github\.repository/);
  assert.doesNotMatch(smoke, /secrets\.|packages: write|--privileged|seccomp=unconfined|apparmor=unconfined/);
  assert.match(smoke, /bwrap --unshare-user --unshare-pid/);
  assert.match(smoke, /codex sandbox -c sandbox_mode=workspace-write -c sandbox_workspace_write\.network_access=true -- \/bin\/sh -c/);
  assert.match(smoke, /mktemp \/work\/\.sandbox-smoke\.XXXXXX/);
  assert.match(smoke, /printf sandbox-ok > "\$probe"/);
  assert.match(smoke, /test "\$\(cat "\$probe"\)" = sandbox-ok/);
  assert.match(smoke, /if \( : > \/work\/\.git\/sandbox-smoke-write \) 2>\/dev\/null; then/);
  assert.match(smoke, /\.git unexpectedly writable/);
});

test("the nested sandbox uses a trusted, bounded seccomp profile", async () => {
  const installed = await readFile(new URL("../.github/workflows/agent-run.yml", import.meta.url), "utf8");
  const apparmor = await readFile(new URL("../agents/agent-apparmor.profile", import.meta.url), "utf8");
  assert.match(apparmor, /profile "artemis-ii-agent-bwrap"/);
  assert.match(apparmor, /  mount,/);
  assert.match(apparmor, /  pivot_root,/);
  assert.doesNotMatch(apparmor, /deny mount,/);
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
    assert.match(prepare, /cp agents\/agent-apparmor\.profile "\$RUNNER_TEMP\/trusted\/agent-apparmor\.profile"/);
    assert.match(work, /runs-on: ubuntu-22\.04/);
    assert.match(work, /sudo apparmor_parser -r "\$RUNNER_TEMP\/trusted\/agent-apparmor\.profile"/);
    assert.match(work, /sudo apparmor_parser -R "\$RUNNER_TEMP\/trusted\/agent-apparmor\.profile"/);
    assert.match(agent, /--security-opt "seccomp=\$RUNNER_TEMP\/trusted\/agent-seccomp\.json"/);
    assert.match(agent, /--security-opt apparmor=artemis-ii-agent-bwrap/);
    assert.doesNotMatch(install, /agent-seccomp\.json/);
    assert.doesNotMatch(agent, /-v "\$RUNNER_TEMP\/trusted/);
    assert.ok(work.indexOf("cp agents/agent-seccomp.json") < work.indexOf("npm ci"));
    assert.ok(work.indexOf("cp agents/agent-apparmor.profile") < work.indexOf("npm ci"));
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

test("WIF-03: id-token: write is granted only to the work job, and the OIDC request variables never reach a container", () => {
  assert.equal([...run.replace(/^\s*#.*$/gm, "").matchAll(/id-token:/g)].length, 1);
  assert.match(job(run, "work"), /permissions:\n(?:      .+\n)*      id-token: write\n/);
  for (const name of ["prepare", "publish", "figma-revoke", "escalate"]) assert.doesNotMatch(job(run, name), /id-token/, name);
  // Passed by name (-e NAME) or not at all: neither request variable is ever named in a docker run or the container script.
  const code = run.replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(code, /-e ACTIONS_ID_TOKEN|ACTIONS_ID_TOKEN_REQUEST_(?:URL|TOKEN)/);
  assert.doesNotMatch(run, /--env-file|-e [A-Z_]+=\$\{?ACTIONS_/);
  // Only the refresher process, started from the trusted copy, fetches tokens, and it runs only for federation agents.
  const start = step(job(run, "work"), "Start the Anthropic OIDC token refresher");
  assert.match(start, /if: needs\.prepare\.outputs\.auth == 'federation'/);
  assert.match(start, /node "\$RUNNER_TEMP\/trusted\/scripts\/anthropic-oidc\.ts" start "\$OIDC_DIR"/);
  assert.doesNotMatch(start, /docker/);
});

test("WIF-04: the agent's container gets the token folder read-only and the ids by name, never a model key, for federation", () => {
  const work = job(run, "work");
  const agent = step(work, "Run the agent");
  assert.match(agent, /-v "\$RUNNER_TEMP\/anthropic-oidc:\/run\/anthropic-oidc:ro"/);
  assert.match(agent, /-e ANTHROPIC_IDENTITY_TOKEN_FILE=\/run\/anthropic-oidc\/token/);
  for (const v of ["ANTHROPIC_FEDERATION_RULE_ID", "ANTHROPIC_ORGANIZATION_ID", "ANTHROPIC_SERVICE_ACCOUNT_ID", "ANTHROPIC_WORKSPACE_ID"]) {
    assert.match(agent, new RegExp(`-e ${v}[ )\\n]`), v);
    assert.match(agent, new RegExp(`${v}: \\$\\{\\{ needs\\.prepare\\.outputs\\.auth == 'federation' && secrets\\.${v} \\|\\| '' \\}\\}`), v);
    // Secrets, so GitHub masks them; a repository variable would be printed in the step's logged environment.
    assert.doesNotMatch(run, new RegExp(`vars\\.${v}`), v);
  }
  // The folder is mounted read-only, never read-write, and the token never goes through a secret or an output.
  assert.doesNotMatch(run, /anthropic-oidc:[^"\n]*:rw|anthropic-oidc:\/run\/anthropic-oidc"/);
  assert.doesNotMatch(run, /secrets\.ANTHROPIC_API_KEY|ANTHROPIC_API_KEY: /);
  assert.match(agent, /A federation agent must not have a model key/);
  assert.match(agent, /unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN/);
  assert.doesNotMatch(agent, /--bare/);
  // The install container never gets any of it.
  assert.doesNotMatch(step(work, "Install the project dependencies"), /ANTHROPIC|anthropic-oidc/);
});

test("WIF-03: the refresher starts after the install and before the agent, and stops right after it, whatever happened", () => {
  const work = job(run, "work");
  const at = (n: string) => work.indexOf(`- name: ${n}`);
  assert.ok(at("Install the project dependencies") < at("Start the Anthropic OIDC token refresher"));
  assert.ok(at("Start the Anthropic OIDC token refresher") < at("Run the agent"));
  assert.ok(at("Run the agent") < at("Stop the Anthropic OIDC token refresher"));
  assert.ok(at("Stop the Anthropic OIDC token refresher") < at("Commit the agent's changes"));
  const stop = step(work, "Stop the Anthropic OIDC token refresher");
  assert.match(stop, /if: always\(\) && needs\.prepare\.outputs\.auth == 'federation'/);
  assert.match(stop, /kill "\$OIDC_REFRESHER_PID"/);
  assert.match(stop, /rm -rf -- "\$RUNNER_TEMP\/anthropic-oidc"/);
});

test("WIF-02: prepare passes the auth mode on, and the work job validates the masked federation ids before the agent starts", () => {
  const prepare = job(run, "prepare");
  assert.match(prepare, /auth: \$\{\{ steps\.order\.outputs\.auth \}\}/);
  assert.match(prepare, /echo "auth=\$AUTH"/);
  assert.doesNotMatch(prepare, /ANTHROPIC_/);
  const start = step(job(run, "work"), "Start the Anthropic OIDC token refresher");
  for (const v of ["ANTHROPIC_FEDERATION_RULE_ID", "ANTHROPIC_ORGANIZATION_ID", "ANTHROPIC_SERVICE_ACCOUNT_ID", "ANTHROPIC_WORKSPACE_ID"]) assert.match(start, new RegExp(`${v}: \\$\\{\\{ secrets\\.${v} \\}\\}`), v);
  assert.match(start, /node "\$RUNNER_TEMP\/trusted\/scripts\/anthropic-oidc\.ts" validate\n/);
  assert.ok(start.indexOf("validate") < start.indexOf("start \"$OIDC_DIR\""));
});

test("WIF-05: the Claude WIF smoke runs only for the trusted login on main, with no model key, no repository write and a read-only token folder", async () => {
  const wif = await read("claude-wif-smoke.yml");
  const code = wif.replace(/^\s*#.*$/gm, "");
  assert.match(wif, /if: github\.ref == 'refs\/heads\/main' && github\.actor == vars\.AGENT_TRUSTED_LOGIN && github\.triggering_actor == vars\.AGENT_TRUSTED_LOGIN/);
  assert.match(wif, /^permissions: \{\}/m);
  assert.match(wif, /permissions:\n      contents: read\n      packages: read\n      id-token: write\n/);
  assert.doesNotMatch(code, /secrets\.(?!ANTHROPIC_(?:FEDERATION_RULE|ORGANIZATION|SERVICE_ACCOUNT|WORKSPACE)_ID \})|vars\.ANTHROPIC|ACTIONS_ID_TOKEN|ANTHROPIC_API_KEY=|pull-requests|contents: write/);
  // A long run that ends early does not prove the refresh.
  assert.match(wif, /if \[ "\$LONG" = true \] && \[ "\$ELAPSED" -lt 900 \]; then/);
  assert.match(wif, /-v "\$RUNNER_TEMP\/anthropic-oidc:\/run\/anthropic-oidc:ro"/);
  assert.match(wif, /unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN/);
  assert.match(wif, /node scripts\/anthropic-oidc\.ts start "\$OIDC_DIR"/);
  assert.match(wif, /- name: Stop the Anthropic OIDC token refresher\n        if: always\(\)/);
  assert.match(wif, /ref: main/);
  for (const m of wif.matchAll(/^\s*- uses: (\S+)/gm)) assert.match(m[1]!, /^actions\/[a-z-]+@[0-9a-f]{40}$/, m[1]);
});
