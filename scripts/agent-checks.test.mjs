// Run with: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isTrusted, parseWorkOrderTitle, validateDestRef, parseProtectedPaths, matchesProtected, protectedTouched,
  touchesWorkflows, findSecrets, validatePrText, checkPlanFollowUp, decidePublication, PR_BODY_HEADINGS,
} from "./agent-checks.mjs";

const agentsMd = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8");
const patterns = parseProtectedPaths(agentsMd);

test("P2-1: Hugo is accepted and any other actor is rejected, whoever owns the repository", () => {
  assert.equal(isTrusted("HugoVP", "HugoVP"), true);
  assert.equal(isTrusted("hugovp", "HugoVP"), true);
  assert.equal(isTrusted("someone-else", "HugoVP"), false);
  assert.equal(isTrusted("HugoVP", ""), false, "an unset variable trusts nobody");
  assert.equal(isTrusted("", ""), false);
  assert.equal(isTrusted(undefined, "HugoVP"), false);
  assert.equal(isTrusted("some-org", "HugoVP"), false, "a transfer to an organization does not make the owner trusted");
});

test("the work order title is accepted only in its exact shape", () => {
  assert.equal(parseWorkOrderTitle("Run Stage 03: Delivery pipeline"), "03");
  assert.equal(parseWorkOrderTitle("Run Stage 3: x"), null);
  assert.equal(parseWorkOrderTitle("run stage 03: x"), null);
  assert.equal(parseWorkOrderTitle("Please Run Stage 03: x"), null);
  assert.equal(parseWorkOrderTitle("Run Stage 03"), null);
  assert.equal(parseWorkOrderTitle("Run Stage 03: $(curl evil)"), "03");
  assert.equal(parseWorkOrderTitle(undefined), null);
});

test("P2-5: publish refuses a destination outside agent/stage-NN-* and another stage's branch", () => {
  assert.equal(validateDestRef("agent/stage-03-codex", "03"), true);
  assert.equal(validateDestRef("agent/stage-03-codex-2", "03"), true);
  assert.equal(validateDestRef("agent/stage-04-codex", "03"), false, "another stage");
  assert.equal(validateDestRef("main", "03"), false);
  assert.equal(validateDestRef("agent/process-x", "03"), false);
  assert.equal(validateDestRef("agent/stage-03-", "03"), false);
  assert.equal(validateDestRef("agent/stage-03-x/../main", "03"), false);
  assert.equal(validateDestRef("refs/heads/agent/stage-03-x", "03"), false);
  assert.equal(validateDestRef("agent/stage-03-x", "3"), false);
  assert.equal(validateDestRef("agent/stage-03-UPPER", "03"), false);
});

test("protected paths are read from AGENTS.md and cover the documented list and scanner configs", () => {
  for (const f of [".github/workflows/ci.yml", "AGENTS.md", "CLAUDE.md", "REVIEW.md", "docs/DELIVERY.md", "docs/agents/README.md", "public/_headers", ".gitleaks.toml"]) {
    assert.equal(matchesProtected(f, patterns), true, f);
  }
  for (const f of ["src/pages/index.astro", "docs/PLAN.md", "docs/agents-notes.md", "public/robots.txt", "README.md"]) {
    assert.equal(matchesProtected(f, patterns), false, f);
  }
  assert.throws(() => parseProtectedPaths("# nothing here"), /Protected paths/);
});

test("P2-3: a run that touches a protected path opens a draft (AGENTS.md, _headers, a scanner config)", () => {
  for (const f of ["AGENTS.md", "public/_headers", ".gitleaks.toml"]) {
    const d = decidePublication({ files: ["src/a.ts", f], patterns, texts: ["clean"] });
    assert.equal(d.action, "draft", f);
    assert.deepEqual(d.protectedFiles, [f]);
  }
  assert.equal(decidePublication({ files: ["src/a.ts", "docs/PLAN.md"], patterns, texts: ["clean"] }).action, "publish");
});

test("P2-3: a direct edit of workflow files is rejected, not drafted", () => {
  assert.equal(touchesWorkflows(["src/a.ts", ".github/workflows/x.yml"]), true);
  assert.equal(touchesWorkflows(["docs/agents/workflows/agent-run.yml"]), false);
  const d = decidePublication({ files: [".github/workflows/x.yml"], patterns, texts: [""] });
  assert.equal(d.action, "reject");
  assert.deepEqual(protectedTouched([".github/workflows/x.yml", "src/a.ts"], patterns), [".github/workflows/x.yml"]);
});

test("the secret scan finds model keys, tokens, private keys and session links, and never repeats the value", () => {
  const key = "sk-" + "proj-" + "a".repeat(40);
  assert.deepEqual(findSecrets(`token ${key}`), ["OpenAI-style API key"]);
  assert.deepEqual(findSecrets("sk-ant-" + "b".repeat(30)), ["Anthropic API key"]);
  assert.deepEqual(findSecrets("ghp_" + "c".repeat(36)), ["GitHub token"]);
  assert.deepEqual(findSecrets("-----BEGIN " + "RSA PRIVATE KEY-----"), ["private key"]);
  assert.deepEqual(findSecrets("see https://claude.ai/code/" + "session_" + "A1b2C3d4E5f6G7h8"), ["session link"]);
  assert.deepEqual(findSecrets("plain text, a sk-ip, and AGENT_KEY_CODEX as a name"), []);
  const d = decidePublication({ files: ["src/a.ts"], patterns, texts: [key] });
  assert.equal(d.action, "reject");
  assert.ok(!d.reason.includes(key));
});

test("the PR text must start with Stage NN: and follow the template", () => {
  const body = PR_BODY_HEADINGS.join("\n\ntext\n\n");
  assert.deepEqual(validatePrText("Stage 03: Pipeline", body, "03"), []);
  assert.equal(validatePrText("Process: x", body, "03").length, 1);
  assert.equal(validatePrText("Stage 04: x", body, "03").length, 1);
  assert.ok(validatePrText("Stage 03: x", "", "03").length > 1);
  assert.ok(validatePrText("Stage 03: x", "## What was done", "03").some((p) => p.includes("Security-relevant")));
});

const planDiff = (lines) => `diff --git a/docs/PLAN.md b/docs/PLAN.md\n--- a/docs/PLAN.md\n+++ b/docs/PLAN.md\n@@ -1 +1 @@\n${lines.join("\n")}\n`;

test("the follow-up commit may only add the PR link to one or two lines of PLAN.md", () => {
  const ok = planDiff(["-| 03 | Pipeline | in review |  |", "+| 03 | Pipeline | in review | #21 |", "-- 2026-10-17 — Stage 03 — x", "+- 2026-10-17 — Stage 03 — PR #21 — x"]);
  assert.deepEqual(checkPlanFollowUp(ok, 21), { ok: true });
  assert.equal(checkPlanFollowUp(ok, 2).ok, false, "#2 must not match #21");
  assert.equal(checkPlanFollowUp(planDiff(["-a", "+b"]), 21).ok, false, "no link");
  assert.equal(checkPlanFollowUp(planDiff(["-a", "-b", "-c", "+#21", "+#21", "+#21"]), 21).ok, false, "too many lines");
  assert.equal(checkPlanFollowUp(planDiff(["+#21"]), 21).ok, false, "added without removed");
  const two = ok + "diff --git a/AGENTS.md b/AGENTS.md\n--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1 +1 @@\n-x\n+#21\n";
  assert.equal(checkPlanFollowUp(two, 21).ok, false, "another file");
});

import { parseRegistry, missingCapabilities, hasOpenStagePr, selectStage } from "./agent-checks.mjs";
import { parseStages } from "./next-stage-issue.mjs";

test("the registry parser reads scalars and inline lists, and rejects incomplete entries", async () => {
  const real = parseRegistry(await readFile(new URL("../agents/registry.yaml", import.meta.url), "utf8"));
  assert.equal(real[0].id, "codex");
  assert.equal(real[0].key_secret, "AGENT_KEY_CODEX");
  assert.deepEqual(real[0].capabilities, ["git", "node", "browser"]);
  assert.throws(() => parseRegistry("- id: x\n  runner: y\n"), /key_secret/);
  assert.throws(() => parseRegistry("  id: x\n"), /Unreadable|start with/);
});

test("a stage whose Needs the agent lacks is refused", () => {
  assert.deepEqual(missingCapabilities(["node", "figma-write"], ["git", "node"]), ["figma-write"]);
  assert.deepEqual(missingCapabilities([], ["git"]), []);
});

test("P2-6: the open-stage-PR guard counts same-repository PRs titled Stage, and ignores forks and other titles", () => {
  assert.equal(hasOpenStagePr([{ title: "Stage 03: x", isCrossRepository: false }]), true);
  assert.equal(hasOpenStagePr([{ title: "Stage 03: x", isCrossRepository: true }]), false);
  assert.equal(hasOpenStagePr([{ title: "Process: x", isCrossRepository: false }]), false);
  assert.equal(hasOpenStagePr([]), false);
});

test("stage selection runs the first unapproved stage, skips merged in-review stages, and stops at unresolved ones", () => {
  const rows = (...r) => parseStages(["| # | Stage | Needs | Spec | Status | PR | Issue |", "| --- | --- | --- | --- | --- | --- | --- |", ...r.map(([n, st, pr]) => `| ${n} | S${n} | \`node\` | w | ${st} | ${pr} | — |`)].join("\n"));
  const none = new Set();
  assert.equal(selectStage(rows(["01", "approved", "#4"], ["02", "pending", ""]), none).stage.number, "02");
  assert.equal(selectStage(rows(["01", "in review", "#4"], ["02", "pending", ""]), new Set([4])).stage.number, "02", "merged stage is approved by the run");
  assert.match(selectStage(rows(["01", "in review", "#4"], ["02", "pending", ""]), none).stop, /Stage 01 is in review/, "open or closed-unmerged PR stops the run");
  assert.match(selectStage(rows(["01", "in review", ""], ["02", "pending", ""]), none).stop, /no PR/);
  assert.match(selectStage(rows(["01", "approved", "#4"]), none).stop, /Every stage is approved/);
  assert.match(selectStage(rows(["01", "weird", ""]), none).stop, /unknown status/);
});

test("the real PLAN.md parses into stages that selectStage can walk", async () => {
  const plan = await readFile(new URL("../docs/PLAN.md", import.meta.url), "utf8");
  const r = selectStage(parseStages(plan), new Set());
  assert.ok(r.stage ? /^[0-9]{2}$/.test(r.stage.number) : typeof r.stop === "string");
});

import { linkPlan } from "./agent-checks.mjs";

test("a registry entry cannot point the work job at a secret that is not a model key", () => {
  const bad = (k) => `- id: x\n  key_secret: ${k}\n  runner: r\n  capabilities: [git]\n`;
  assert.throws(() => parseRegistry(bad("AGENT_APP_PRIVATE_KEY")), /AGENT_KEY_/);
  assert.throws(() => parseRegistry(bad("GITHUB_TOKEN")), /AGENT_KEY_/);
  assert.equal(parseRegistry(bad("AGENT_KEY_OTHER"))[0].key_secret, "AGENT_KEY_OTHER");
});

test("linkPlan adds the PR link to the stage row and its log line, and nothing else", () => {
  const plan = ["| # | Stage | Needs | Spec | Status | PR | Issue |", "| --- | --- | --- | --- | --- | --- | --- |",
    "| 03 | Pipeline | `node` | [s](s.md) | in review |  | `HUG-7` |", "| 04 | Prefs | `node` | w | pending |  | — |", "", "## Log", "",
    "- 2026-10-17 — Stage 03 — Built the pipeline.", "- 2026-10-12 — Stage 00 — PR #1 — Plan."].join("\n");
  const out = linkPlan(plan, "03", 21);
  const a = plan.split("\n"), b = out.split("\n");
  const changed = a.map((l, i) => (l === b[i] ? null : i)).filter((i) => i !== null);
  assert.equal(changed.length, 2);
  assert.match(b[2], /\| in review \| #21 \| `HUG-7` \|/);
  assert.match(b[7], /Stage 03 — PR #21 — Built/);
  assert.equal(linkPlan(out, "03", 21), out, "idempotent");
  const diff = `diff --git a/docs/PLAN.md b/docs/PLAN.md\n` + changed.map((i) => `-${a[i]}\n+${b[i]}`).join("\n") + "\n";
  assert.deepEqual(checkPlanFollowUp(diff, 21), { ok: true });
});

import { parsePathList, scanRange, finalizePublication, cleanDraftReason } from "./agent-checks.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("linkPlan ignores historical mentions of the stage and links only its own newest log entry", () => {
  const plan = ["| 03 | Pipeline | `node` | [s](s.md) | in review |  | `HUG-7` |", "", "## Log", "",
    "- 2026-10-12 — Stage 00 update — Added new Stage 03 (delivery pipeline).",
    "- 2026-10-13 — Stage 03 — PR #9 — An older, already linked entry.",
    "- 2026-10-14 — Stage 03 — An older unlinked entry.",
    "- 2026-10-17 — Stage 03 — The newest entry."].join("\n");
  const out = linkPlan(plan, "03", 21).split("\n");
  const src = plan.split("\n");
  assert.deepEqual(out.map((l, i) => l !== src[i]), [true, false, false, false, false, false, false, true]);
  assert.match(out[7], /Stage 03 — PR #21 — The newest entry/);
});

test("path lists are NUL separated, so unusual names and both sides of a rename are checked literally", () => {
  const list = parsePathList("AGENTS.md\0docs/agents/é.md\0name with \"quotes\".md\0");
  assert.deepEqual(list, ["AGENTS.md", "docs/agents/é.md", 'name with "quotes".md']);
  assert.deepEqual(protectedTouched(list, patterns), ["AGENTS.md", "docs/agents/é.md"]);
  assert.deepEqual(parsePathList(""), []);
});

test("scanRange finds a key in a binary blob and in a commit message, and passes a clean branch", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-"));
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "base\n");
  git("add", "."); git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "agent/x");
  writeFileSync(join(dir, "ok.txt"), "clean\n");
  git("add", "."); git("commit", "-q", "-m", "clean change");
  assert.deepEqual(scanRange("main", "agent/x", dir), []);
  const key = "sk-" + "proj-" + "z".repeat(40);
  const binary = Buffer.concat([Buffer.from([0, 1, 2, 255, 254, 0]), Buffer.from(key), Buffer.from([0, 9])]);
  writeFileSync(join(dir, "blob.bin"), binary);
  git("add", "."); git("commit", "-q", "-m", "binary");
  assert.deepEqual(scanRange("main", "agent/x", dir), ["OpenAI-style API key"]);
  git("checkout", "-q", "-b", "agent/y", "main");
  writeFileSync(join(dir, "b.txt"), "b\n");
  git("add", "."); git("commit", "-q", "-m", "message with " + key);
  assert.deepEqual(scanRange("main", "agent/y", dir), ["OpenAI-style API key"]);
});

test("a draft comes from protected paths, from the agent's own request, or both; the reason is one short line", () => {
  assert.deepEqual(finalizePublication({ action: "publish" }, ""), { draft: false, warning: "" });
  assert.equal(finalizePublication({ action: "publish" }, "Missing capability:\n  figma-write\n").warning, "The agent asked for a draft: Missing capability: figma-write");
  const both = finalizePublication({ action: "draft", reason: "Protected paths changed: AGENTS.md." }, "blocked");
  assert.equal(both.draft, true);
  assert.match(both.warning, /AGENTS\.md\. The agent asked for a draft: blocked$/);
  assert.equal(cleanDraftReason("x".repeat(900)).length, 500);
  assert.equal(finalizePublication({ action: "publish" }, "   \n ").draft, false);
});

test("a session link needs an identifier: the placeholders in AGENTS.md and REVIEW.md are not flagged", async () => {
  assert.deepEqual(findSecrets("for example `claude.ai/code/session_…`"), []);
  assert.deepEqual(findSecrets("claude.ai/code/session_ and chatgpt.com/codex/tasks/"), []);
  assert.deepEqual(findSecrets("https://chatgpt.com/codex/tasks/task_e_0123456789abcdef"), ["session link"]);
  for (const f of ["../AGENTS.md", "../REVIEW.md"]) assert.deepEqual(findSecrets(await readFile(new URL(f, import.meta.url), "utf8")), [], f);
});

test("scanRange also finds a key in a file name, and decide scans the path list", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-"));
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "base\n");
  git("add", "."); git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "agent/x");
  const key = "sk-" + "proj-" + "q".repeat(40);
  writeFileSync(join(dir, `${key}.txt`), "clean contents\n");
  git("add", "."); git("commit", "-q", "-m", "named file");
  assert.deepEqual(scanRange("main", "agent/x", dir), ["OpenAI-style API key"]);
  assert.equal(decidePublication({ files: [`${key}.txt`], patterns, texts: [`${key}.txt`] }).action, "reject");
});
