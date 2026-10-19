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
  assert.deepEqual(r.alternatives.map(c => c.id), ["gamma", "delta"]);
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
