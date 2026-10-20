import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseStages } from "./next-stage-issue.ts";
import { parseRegistry } from "./agent-checks.ts";
import { recommend, leadersFromMerges, stageKind, stageNeeds, formatRecommendation, validateOrchestration } from "./orchestrate.ts";

const plan = [
  "| # | Stage | Needs | Spec | Status | PR | Issue |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  "| 01 | 🎨 Design | `figma-write` | x | approved | #4 | |",
  "| 02 | Base | `node`, `browser` | x | approved | #8 | |",
  "| 03 | Pipeline | `node` | x | approved | #14 | |",
  "| 04 | Preferences | `node`, `browser` | x | approved | #31 | |",
  "| 05 | 🔍 Curation | `web` | x | pending | | |",
  "| 06 | Ingestion | `node`, `web` | x | pending | | |",
].join("\n");
const stages = parseStages(plan);

const agent = (id: string, fields: string) => `- id: ${id}\n  key_secret: AGENT_KEY_${id.toUpperCase()}\n  runner: codex-exec\n${fields}`;
const team = parseRegistry([
  agent("alpha", "  capabilities: [git, node, browser, web, figma-read, figma-write]\n  status: active\n  roles: [lead, review]\n  family: one\n  cost: api\n"),
  agent("beta", "  capabilities: [git, node, browser, web]\n  status: active\n  roles: [lead, review]\n  family: two\n  cost: subscription\n"),
  agent("gamma", "  capabilities: [git, node, browser, web]\n  status: active\n  roles: [lead, review]\n  family: two\n  cost: api\n"),
  agent("delta", "  capabilities: [git, node, browser, web]\n  status: active\n  roles: [lead-small]\n  family: three\n  cost: subscription\n  avoid: [content-review]\n"),
  agent("omega", "  capabilities: [git, node, browser, web]\n  status: pending\n  roles: [lead, review]\n  family: four\n  cost: subscription\n"),
].join("\n"));

test("stage kinds and needs come from docs/PLAN.md markers and the Stage 02 baseline", () => {
  assert.equal(stageKind(stages[0]), "design");
  assert.equal(stageKind(stages[4]), "content-review");
  assert.equal(stageKind(stages[5]), "build");
  assert.deepEqual(stageNeeds(stages[0]), ["git", "figma-write"]);
  assert.deepEqual(stageNeeds(stages[4]), ["git", "node", "browser", "web"]);
});

test("leaders come only from merge subjects of registry agents' stage branches", () => {
  const leaders = leadersFromMerges([
    "Merge pull request #31 from HugoVP/agent/stage-04-alpha",
    "Merge pull request #14 from HugoVP/agent/stage-03-pipeline",
    "Merge pull request #9 from HugoVP/agent/fix-something",
    "Merge pull request #8 from HugoVP/agent/stage-02-beta extra",
    "Stage 02: Base",
  ], ["alpha", "beta"]);
  assert.deepEqual([...leaders], [["04", "alpha"]]);
});

test("P3-1: the same data always gives the same recommendation", () => {
  const leaders = new Map([["04", "alpha"]]);
  const first = recommend({ stages, stageNumber: "06", agents: team, leaders });
  const second = recommend({ stages, stageNumber: "06", agents: [...team], leaders: new Map(leaders) });
  assert.deepEqual(first, second);
  assert.equal(formatRecommendation(first), formatRecommendation(second));
});

test("rotation excludes the previous leader, and cost then registry order break the rest", () => {
  const r = recommend({ stages, stageNumber: "06", agents: team, leaders: new Map([["04", "alpha"]]) });
  assert.equal(r.previousLeader, "alpha");
  assert.equal(r.leader?.id, "beta");
  assert.deepEqual(r.alternatives.map(c => c.id), ["delta", "gamma"]);
  assert.ok(r.excluded.some(e => e.id === "alpha" && /previous stage/.test(e.reason)));
  assert.ok(r.excluded.some(e => e.id === "omega" && /not active/.test(e.reason)));
});

test("P3-2: reviewers never share the leader's model family, nor each other's", () => {
  for (const previous of ["alpha", "beta", "gamma"]) {
    const r = recommend({ stages, stageNumber: "06", agents: team, leaders: new Map([["04", previous]]) });
    const family = (id: string) => team.find(a => a.id === id)!.family;
    assert.ok(r.leader);
    for (const reviewer of r.reviewers) assert.notEqual(family(reviewer.id), family(r.leader!.id));
    assert.equal(new Set(r.reviewers.map(c => family(c.id))).size, r.reviewers.length);
    assert.ok(r.reviewers.every(c => team.find(a => a.id === c.id)!.roles.includes("review")));
  }
});

test("lead-small agents are never the recommended leader, and avoided kinds and missing capabilities exclude", () => {
  const onlySmall = parseRegistry(agent("delta", "  capabilities: [git, node, browser, web]\n  status: active\n  roles: [lead-small]\n  family: three\n  cost: subscription\n"));
  const r = recommend({ stages, stageNumber: "06", agents: onlySmall, leaders: new Map() });
  assert.equal(r.leader, null);
  assert.deepEqual(r.alternatives.map(c => c.id), ["delta"]);
  assert.match(r.escalate!, /small stages/);
  const curation = recommend({ stages, stageNumber: "05", agents: team, leaders: new Map() });
  assert.ok(curation.excluded.some(e => e.id === "delta" && /avoids content-review/.test(e.reason)));
  const design = recommend({ stages, stageNumber: "01", agents: team, leaders: new Map() });
  assert.equal(design.leader?.id, "alpha");
  assert.ok(design.excluded.some(e => e.id === "beta" && /lacks figma-write/.test(e.reason)));
});

test("no eligible leader escalates to Hugo with the reason for every agent", () => {
  const withoutFigma = team.filter(a => a.id !== "alpha");
  const r = recommend({ stages, stageNumber: "01", agents: withoutFigma, leaders: new Map() });
  assert.equal(r.leader, null);
  assert.match(r.escalate!, /No registered agent/);
  assert.match(formatRecommendation(r), /No leader recommended/);
  assert.equal(r.excluded.length, withoutFigma.length);
});

test("unknown orchestrator values are rejected instead of silently changing eligibility", () => {
  for (const bad of ["  status: activ\n", "  roles: [leader]\n", "  cost: free\n", "  avoid: [docs]\n", "  family: Bad Family\n"]) {
    assert.throws(() => validateOrchestration(parseRegistry(agent("x", `  capabilities: [git]\n${bad}`))), /unknown|invalid/);
  }
});

test("the real registry and plan give a recommendation for every pending stage", async () => {
  const agents = parseRegistry(await readFile(new URL("../agents/registry.yaml", import.meta.url), "utf8"));
  const real = parseStages(await readFile(new URL("../docs/PLAN.md", import.meta.url), "utf8"));
  validateOrchestration(agents);
  for (const stage of real.filter(s => s.status === "pending")) {
    const r = recommend({ stages: real, stageNumber: stage.number, agents, leaders: new Map([["04", "codex"]]) });
    assert.ok(r.leader || r.escalate, `stage ${stage.number}`);
    if (r.leader) assert.ok(agents.find(a => a.id === r.leader!.id)!.status === "active");
  }
});

test("ORC-01: a present registry value that is a list or empty is rejected, and only an absent status defaults", () => {
  const entry = (extra: string) => parseRegistry(agent("x", `  capabilities: [git]\n${extra}`));
  for (const bad of ["  status: [activ]\n", "  status:\n", "  cost: [free]\n", "  cost:\n", "  family: [x]\n", "  family:\n", "  family: Bad Family\n"]) {
    assert.throws(() => validateOrchestration(entry(bad)), /invalid|unknown/, bad);
  }
  validateOrchestration(entry("")); // absent status is pending, absent cost and family are allowed
  validateOrchestration(entry("  status: active\n  cost: api\n  family: acme\n"));
});

test("ORC-04: the local history comes from this repository's main, not from the checked-out branch", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { readLocalHistory } = await import("./orchestrate.ts");
  const dir = mkdtempSync(join(tmpdir(), "orc-history-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "Merge pull request #1 from o/agent/stage-01-alpha");
    git("switch", "-q", "-c", "feature");
    git("commit", "-q", "--allow-empty", "-m", "Merge pull request #2 from o/agent/stage-02-beta");
    git("switch", "-q", "-c", "stale", "HEAD~1");
    const subjects = readLocalHistory(dir)!;
    assert.ok(subjects.includes("Merge pull request #1 from o/agent/stage-01-alpha"));
    assert.ok(!subjects.includes("Merge pull request #2 from o/agent/stage-02-beta"));
    assert.equal(readLocalHistory(join(dir, "missing")), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const empty = mkdtempSync(join(tmpdir(), "orc-nogit-"));
  try { assert.equal(readLocalHistory(empty), null); } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("ORC-07: an eligible agent that has never led comes before one that has, whatever the score", () => {
  // beta led Stage 02 and scores higher (subscription); gamma never led, so gamma is recommended.
  const r = recommend({ stages, stageNumber: "06", agents: team, leaders: new Map([["02", "beta"], ["04", "alpha"]]) });
  assert.equal(r.leader?.id, "gamma");
  assert.ok(r.leader!.score < r.alternatives.find(c => c.id === "beta")!.score);
  assert.match(formatRecommendation(r), /`gamma` \([^)]*has not led a stage yet\)/);
  // Once everyone eligible has led, the score decides again.
  const later = recommend({ stages, stageNumber: "06", agents: team, leaders: new Map([["02", "beta"], ["03", "gamma"], ["04", "alpha"]]) });
  assert.equal(later.leader?.id, "beta");
});

test("ORC-07: a lead-small agent comes first among the alternatives, even behind a full leader that has already led", () => {
  // beta led Stage 02, gamma never led (recommended); delta is lead-small and never led, so it is listed before beta.
  const r = recommend({ stages, stageNumber: "06", agents: team, leaders: new Map([["02", "beta"], ["04", "alpha"]]) });
  assert.equal(r.leader?.id, "gamma");
  assert.deepEqual(r.alternatives.map(c => c.id), ["delta", "beta"]);
  assert.notEqual(r.leader?.id, "delta");
});
