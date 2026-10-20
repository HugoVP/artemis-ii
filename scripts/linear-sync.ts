#!/usr/bin/env node
// Moves the Linear issue of each stage forward to the status that docs/PLAN.md says.
// Only statuses change: no issues, comments or descriptions are created or edited.
// Forward only: PLAN.md lags a merge (a stage becomes `approved` in the next stage's PR), so Linear
// may legitimately be ahead of the plan, and the sync never moves an issue back.
// No dependencies (Node 22). `DRY_RUN=1` reads Linear and prints what it would change.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseStages, type Stage } from "./plan.ts";

const API_URL = "https://api.linear.app/graphql";
// Plan status -> the Linear status name to reach. `pending` never needs a move (Todo or Backlog both count).
export type PlanStatus = "pending" | "in review" | "approved";
export const TARGETS: Record<PlanStatus, string | null> = { pending: null, "in review": "In Review", approved: "Done" };
const RANK: Record<PlanStatus, number> = { pending: 0, "in review": 2, approved: 3 };

export interface LinearState {
  id: string;
  name: string;
  type: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  state: LinearState;
  team: { id: string; key: string };
}

export interface WantedRow {
  stage: string;
  identifier: string;
  status: PlanStatus;
}

export interface Action {
  identifier: string;
  id: string;
  from: string;
  to: string;
  stateId: string;
}

const isPlanStatus = (status: string): status is PlanStatus => status in TARGETS;

// 0 = Backlog/Todo/Triage, 1 = In Progress (any other started state), 2 = In Review, 3 = Done, null = Canceled.
export function rank(state: { name: string; type: string }): number | null {
  if (state.type === "canceled") return null;
  if (state.type === "completed") return 3;
  if (state.type === "started") return /review/i.test(state.name) ? 2 : 1;
  return 0;
}

export function wantedRows(stages: Stage[]): WantedRow[] {
  return stages.filter((s): s is Stage & { linear: string } => Boolean(s.linear)).map((s) => {
    if (!isPlanStatus(s.status)) throw new Error(`Unknown status "${s.status}" for Stage ${s.number} in docs/PLAN.md (expected pending, in review or approved).`);
    return { stage: s.number, identifier: s.linear, status: s.status };
  });
}

// Pure: decides what to do for each issue. `states` maps a team id to its workflow states.
export function planActions(rows: WantedRow[], issues: Record<string, LinearIssue>, states: Record<string, LinearState[]>): { actions: Action[]; notes: string[] } {
  const actions: Action[] = [];
  const notes: string[] = [];
  for (const row of rows) {
    const issue = issues[row.identifier];
    if (!issue) throw new Error(`${row.identifier} (Stage ${row.stage}) was not found in Linear.`);
    const current = rank(issue.state);
    if (current === null) { notes.push(`${row.identifier}: ${issue.state.name}, left alone (canceled)`); continue; }
    const wanted = RANK[row.status];
    if (current >= wanted) {
      notes.push(`${row.identifier}: ${issue.state.name}${current > wanted ? ` (ahead of the plan: ${row.status})` : ""}, no change`);
      continue;
    }
    const name = TARGETS[row.status];
    const teamStates = states[issue.team.id] ?? [];
    const target = teamStates.find((s) => s.name === name);
    if (!target) {
      throw new Error(`Status "${name}" does not exist in Linear team ${issue.team.key}. Available: ${teamStates.map((s) => s.name).join(", ")}.`);
    }
    actions.push({ identifier: row.identifier, id: issue.id, from: issue.state.name, to: target.name, stateId: target.id });
  }
  return { actions, notes };
}

// GraphQL response data: the shape depends on the query, so callers state the shape of the fields they asked for.
type GqlData = Record<string, unknown>;

async function gql(url: string, key: string, query: string, variables: Record<string, string>): Promise<GqlData> {
  const res = await fetch(url, {
    method: "POST",
    // A personal API key goes in the header as is, without "Bearer".
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json: { data?: GqlData; errors?: { message: string }[] };
  try { json = JSON.parse(text); } catch { throw new Error(`Linear returned HTTP ${res.status} with a body that is not JSON.`); }
  if (!res.ok || json.errors) {
    const msg = (json.errors ?? []).map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    const hint = /scope/i.test(msg) ? " The API key needs the Read and Write permissions (create a new key with both checked, limited to the team of the stage issues)." : "";
    throw new Error(`Linear request failed: ${msg.slice(0, 300)}${hint}`);
  }
  return json.data ?? {};
}

async function fetchIssues(url: string, key: string, rows: WantedRow[]): Promise<Record<string, LinearIssue>> {
  const vars = Object.fromEntries(rows.map((r, i) => [`id${i}`, r.identifier]));
  const decl = rows.map((_, i) => `$id${i}: String!`).join(", ");
  const body = rows.map((_, i) => `i${i}: issue(id: $id${i}) { id identifier state { id name type } team { id key } }`).join("\n");
  const data = await gql(url, key, `query Issues(${decl}) {\n${body}\n}`, vars);
  const issues: Record<string, LinearIssue> = {};
  rows.forEach((r, i) => { if (data[`i${i}`]) issues[r.identifier] = data[`i${i}`] as LinearIssue; });
  return issues;
}

export async function run({ key, markdown, url = API_URL, dryRun = false }: { key: string; markdown: string; url?: string; dryRun?: boolean }): Promise<{ actions: Action[]; notes: string[] }> {
  const rows = wantedRows(parseStages(markdown));
  if (!rows.length) return { actions: [], notes: ["No stage has a Linear issue in docs/PLAN.md."] };

  const issues = await fetchIssues(url, key, rows);
  const states: Record<string, LinearState[]> = {};
  for (const team of new Set(Object.values(issues).map((i) => i.team.id))) {
    const t = await gql(url, key, "query States($id: String!) { team(id: $id) { states(first: 100) { nodes { id name type } } } }", { id: team });
    states[team] = (t.team as { states: { nodes: LinearState[] } }).states.nodes;
  }

  const { actions, notes } = planActions(rows, issues, states);
  if (dryRun) return { actions, notes };

  // Linear's own GitHub integration can complete or cancel an issue while this runs, and an update cannot
  // be made conditional. So each issue is read again right before its write and evaluated again: the window
  // for overwriting a newer status shrinks from the whole run to the gap between that read and the write.
  const applied: Action[] = [];
  for (const a of actions) {
    const row = rows.find((r) => r.identifier === a.identifier)!;
    const fresh = await fetchIssues(url, key, [row]);
    const again = planActions([row], fresh, states);
    if (!again.actions.length) { notes.push(...again.notes.map((n) => `${n} (changed while the sync ran, skipped)`)); continue; }
    const r = await gql(url, key, "mutation Move($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }", { id: a.id, stateId: again.actions[0].stateId });
    if (!(r.issueUpdate as { success?: boolean } | undefined)?.success) throw new Error(`Linear did not confirm the update of ${a.identifier}.`);
    applied.push(a);
  }
  return { actions: applied, notes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const markdown = await readFile(new URL("../docs/PLAN.md", import.meta.url), "utf8");
  const dryRun = Boolean(process.env.DRY_RUN);
  const key = process.env.LINEAR_API_KEY;
  if (!key && dryRun) {
    // Offline check of the plan: what the sync would aim for.
    for (const r of wantedRows(parseStages(markdown))) console.log(`${r.identifier}: plan says ${r.status} (Linear: ${TARGETS[r.status] ?? "Todo or Backlog"})`);
  } else {
    if (!key) throw new Error("LINEAR_API_KEY is not set.");
    const { actions, notes } = await run({ key, markdown, dryRun });
    for (const n of notes) console.log(n);
    for (const a of actions) console.log(`${a.identifier}: ${a.from} -> ${a.to}${dryRun ? " (dry run, not applied)" : ""}`);
    if (!actions.length) console.log("Linear already matches the plan.");
  }
}
