// Phase 3a orchestrator: recommends a leader and reviewers for a stage. It never starts a run; Hugo does, with the
// label `agent:<id>`. Deterministic: the same PLAN.md, registry and history always give the same answer.
// Contract: docs/specs/orchestration.md. Design: docs/MULTI-AGENT-PHASES.md, "Phase 3".
// Local use: node scripts/orchestrate.ts <stage>   (reads docs/PLAN.md, agents/registry.yaml and `git log` of main)
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseStages, type Stage } from "./plan.ts";
import { parseRegistry, missingCapabilities, type Agent } from "./agent-checks.ts";

export type StageKind = "build" | "content-review" | "design";
export const ROLES = ["lead", "lead-small", "review"];
export const STATUSES = ["active", "pending"];
export const COSTS = ["subscription", "api"];

// 🔍 marks a content review stage and 🎨 a design stage in docs/PLAN.md.
export function stageKind(stage: Pick<Stage, "name" | "marker">): StageKind {
  const text = `${stage.marker ?? ""} ${stage.name}`;
  if (text.includes("🎨")) return "design";
  if (text.includes("🔍")) return "content-review";
  return "build";
}

// Every stage needs git, and from Stage 02 on also node and browser (docs/PLAN.md, "Needs").
export function stageNeeds(stage: Pick<Stage, "number" | "needs">): string[] {
  const base = Number(stage.number) >= 2 ? ["git", "node", "browser"] : ["git"];
  return [...new Set([...base, ...stage.needs])];
}

// Leaders of merged stages, from merge commit subjects such as
// "Merge pull request #31 from HugoVP/agent/stage-04-codex". Branches not named after a registry agent are ignored.
export function leadersFromMerges(subjects: string[], agentIds: string[]): Map<string, string> {
  const leaders = new Map<string, string>();
  for (const subject of subjects) {
    const match = /^Merge pull request #\d+ from [^/\s]+\/agent\/stage-(\d\d)-([a-z0-9-]+)\s*$/.exec(subject.trim());
    if (match && agentIds.includes(match[2]) && !leaders.has(match[1])) leaders.set(match[1], match[2]);
  }
  return leaders;
}

function list(agent: Agent, field: string): string[] {
  const value = agent[field];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function scalar(agent: Agent, field: string): string | undefined {
  const value = agent[field];
  return typeof value === "string" && value ? value : undefined;
}

// The orchestrator's registry fields, checked so a typo cannot silently make an agent eligible.
export function validateOrchestration(agents: Agent[]): void {
  for (const agent of agents) {
    // A value that is present must be one non-empty word of the right set; only an absent status defaults (to pending).
    // Lists and empty values are rejected here instead of being read as "absent" by scalar(), which would hide a typo
    // such as `status: [activ]` or `cost: [free]`.
    const single = (field: string, allowed: string[] | RegExp) => {
      const value = agent[field];
      if (value === undefined) return;
      const ok = typeof value === "string" && value !== "" && (Array.isArray(allowed) ? allowed.includes(value) : allowed.test(value));
      if (!ok) throw new Error(`Agent ${agent.id} has an invalid ${field} "${Array.isArray(value) ? `[${value.join(", ")}]` : value}".`);
    };
    single("status", STATUSES);
    single("cost", COSTS);
    single("family", /^[a-z0-9-]{2,30}$/);
    for (const role of list(agent, "roles")) if (!ROLES.includes(role)) throw new Error(`Agent ${agent.id} has the unknown role "${role}".`);
    for (const kind of list(agent, "avoid")) if (!["build", "content-review", "design"].includes(kind)) throw new Error(`Agent ${agent.id} avoids the unknown stage kind "${kind}".`);
  }
}

export interface Candidate {
  id: string;
  score: number;
  parts: { history: number; cost: number; rotation: number; fit: number };
  lastLed: number; // index of the last stage it led, -1 if never
}

export interface Recommendation {
  stage: string;
  kind: StageKind;
  needs: string[];
  previousLeader: string | null;
  leader: Candidate | null;
  alternatives: Candidate[];
  reviewers: Candidate[];
  excluded: { id: string; reason: string }[];
  escalate: string | null;
}

// Score from 0 to 100 (docs/MULTI-AGENT-PHASES.md): past results 50, cost 20, rotation 20, fit 10.
// Phase 3a has no record of past results yet, so every agent gets the neutral 25 unless `history` gives a rate.
function score(agent: Agent, kind: StageKind, previous: string | null, leaders: Map<string, string>, order: string[], history: Record<string, number>): Candidate {
  const rate = history[agent.id];
  const parts = {
    history: rate === undefined ? 25 : Math.round(50 * Math.min(1, Math.max(0, rate))),
    cost: scalar(agent, "cost") === "subscription" ? 20 : 10,
    rotation: agent.id === previous ? 0 : 20,
    fit: list(agent, "prefers").includes(kind) ? 10 : 0,
  };
  let lastLed = -1;
  for (const [stage, id] of leaders) if (id === agent.id) lastLed = Math.max(lastLed, order.indexOf(stage));
  return { id: agent.id, score: parts.history + parts.cost + parts.rotation + parts.fit, parts, lastLed };
}

// Higher score first; ties go to the agent that led less recently, then to registry order.
// Participation (ORC-07): when choosing a leader, an eligible agent that has never led a stage comes before every agent
// that has, so each registered agent leads at least once before anyone leads twice. Reviewers are ranked by score only.
function rank(candidates: Candidate[], registryOrder: string[], participation = false): Candidate[] {
  const neverLed = (c: Candidate) => (participation && c.lastLed === -1 ? 1 : 0);
  return [...candidates].sort((a, b) => neverLed(b) - neverLed(a) || b.score - a.score || a.lastLed - b.lastLed || registryOrder.indexOf(a.id) - registryOrder.indexOf(b.id));
}

export function recommend({ stages, stageNumber, agents, leaders, history = {} }: {
  stages: Stage[];
  stageNumber: string;
  agents: Agent[];
  leaders: Map<string, string>;
  history?: Record<string, number>;
}): Recommendation {
  validateOrchestration(agents);
  const stage = stages.find(s => s.number === stageNumber);
  if (!stage) throw new Error(`Stage ${stageNumber} is not in docs/PLAN.md.`);
  const kind = stageKind(stage);
  const needs = stageNeeds(stage);
  const order = stages.map(s => s.number);
  const earlier = order.slice(0, order.indexOf(stageNumber)).reverse();
  const previousStage = earlier.find(n => leaders.has(n));
  const previousLeader = previousStage ? leaders.get(previousStage)! : null;
  const registryOrder = agents.map(a => a.id);
  const excluded: { id: string; reason: string }[] = [];
  const leads: { agent: Agent; small: boolean }[] = [];
  for (const agent of agents) {
    const roles = list(agent, "roles");
    const missing = missingCapabilities(needs, agent.capabilities);
    const reason =
      (scalar(agent, "status") ?? "pending") !== "active" ? "not active in the registry (no key, model or smoke yet)"
      : !roles.includes("lead") && !roles.includes("lead-small") ? "no lead role"
      : missing.length ? `lacks ${missing.join(", ")}`
      : list(agent, "avoid").includes(kind) ? `avoids ${kind} stages`
      : !scalar(agent, "family") ? "no model family (model not chosen)"
      : agent.id === previousLeader ? `led the previous stage, ${previousStage}`
      : null;
    if (reason) excluded.push({ id: agent.id, reason });
    else leads.push({ agent, small: !roles.includes("lead") });
  }
  const scored = (items: Agent[]) => rank(items.map(a => score(a, kind, previousLeader, leaders, order, history)), registryOrder);
  const leading = (items: Agent[]) => rank(items.map(a => score(a, kind, previousLeader, leaders, order, history)), registryOrder, true);
  const full = leading(leads.filter(l => !l.small).map(l => l.agent));
  const small = leading(leads.filter(l => l.small).map(l => l.agent));
  const leader = full[0] ?? null;
  // ORC-07: agents limited to small stages come first among the alternatives, so one that has never led is not hidden behind
  // a full leader that has; they are still never the recommended leader.
  const alternatives = [...small, ...full.slice(1)];

  let reviewers: Candidate[] = [];
  if (leader) {
    const leaderFamily = scalar(agents.find(a => a.id === leader.id)!, "family");
    const pool = agents.filter(a => a.id !== leader.id && (scalar(a, "status") ?? "pending") === "active"
      && list(a, "roles").includes("review") && scalar(a, "family") && scalar(a, "family") !== leaderFamily);
    const families = new Set<string>();
    for (const candidate of scored(pool)) {
      const family = scalar(agents.find(a => a.id === candidate.id)!, "family")!;
      if (families.has(family)) continue;
      families.add(family);
      reviewers.push(candidate);
      if (reviewers.length === 2) break;
    }
  }
  const escalate = leader ? null
    : small.length ? "Only agents limited to small stages are eligible; Hugo decides whether this stage is small enough."
    : "No registered agent is eligible to lead this stage.";
  return { stage: stageNumber, kind, needs, previousLeader, leader, alternatives, reviewers, excluded, escalate };
}

export function formatRecommendation(r: Recommendation): string {
  const who = (c: Candidate) => `\`${c.id}\` (score ${c.score}: history ${c.parts.history}, cost ${c.parts.cost}, rotation ${c.parts.rotation}, fit ${c.parts.fit}${c.lastLed === -1 ? "; has not led a stage yet" : ""})`;
  const lines = [
    "## Recommended agents",
    "",
    `Computed by \`scripts/orchestrate.ts\` from \`docs/PLAN.md\`, \`agents/registry.yaml\` and the merged stage branches. It starts nothing: Hugo starts the stage by adding the label \`agent:<id>\` to this issue.`,
    "",
    `- Stage kind: ${r.kind}. Capabilities needed: ${r.needs.map(n => `\`${n}\``).join(", ")}.`,
    `- Previous leader: ${r.previousLeader ? `\`${r.previousLeader}\` (excluded by rotation)` : "none recorded"}.`,
    r.leader ? `- **Leader: ${who(r.leader)}.** Start with the label \`agent:${r.leader.id}\`.` : `- **No leader recommended.** ${r.escalate}`,
    r.reviewers.length
      ? `- Reviewers, from other model families: ${r.reviewers.map(who).join("; ")}.${r.reviewers.length < 2 ? " Only one is available." : ""}`
      : "- Reviewers: none available from another model family. Hugo reviews.",
    r.alternatives.length ? `- Also eligible: ${r.alternatives.map(who).join("; ")}.` : "- Also eligible: none.",
  ];
  if (r.excluded.length) lines.push(`- Not eligible: ${r.excluded.map(e => `\`${e.id}\` (${e.reason})`).join("; ")}.`);
  return lines.join("\n");
}

// Subjects of the first-parent commits of this repository's `main` (the merges of approved PRs), read from the repository
// that holds this script, not from the caller's working directory or checked-out branch, so a stale feature branch cannot
// recommend a leader again. `origin/main` is preferred over a local `main` that may lag. null when neither can be read.
export function readLocalHistory(repoDir: string, run: typeof execFileSync = execFileSync): string[] | null {
  for (const ref of ["refs/remotes/origin/main", "refs/heads/main"]) {
    try {
      return run("git", ["-C", repoDir, "log", "--first-parent", "--format=%s", "-n", "1000", ref], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n");
    } catch { /* try the next ref */ }
  }
  return null;
}

export const HISTORY_UNAVAILABLE = "\n- The merge history could not be read, so rotation was not applied.";

// Local CLI: the recommendation for a stage already in progress, without GitHub.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stageNumber = process.argv[2] ?? "";
  if (!/^\d\d$/.test(stageNumber)) throw new Error("Usage: node scripts/orchestrate.ts <two-digit stage>");
  const markdown = await readFile(new URL("../docs/PLAN.md", import.meta.url), "utf8");
  const agents = parseRegistry(await readFile(new URL("../agents/registry.yaml", import.meta.url), "utf8"));
  const subjects = readLocalHistory(fileURLToPath(new URL("..", import.meta.url)));
  const r = recommend({ stages: parseStages(markdown), stageNumber, agents, leaders: leadersFromMerges(subjects ?? [], agents.map(a => a.id)) });
  console.log(formatRecommendation(r) + (subjects ? "" : HISTORY_UNAVAILABLE));
}
