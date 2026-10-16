// Run with: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { parseStages } from "./next-stage-issue.mjs";
import { planActions, rank, run, wantedRows } from "./linear-sync.mjs";

const plan = await readFile(new URL("../docs/PLAN.md", import.meta.url), "utf8");
const table = (rows) => `# Plan\n\n| # | Stage | Needs | Spec | Status | PR | Issue |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`;
const md = table([
  "| 01 | Design | `figma-write` | [s](specs/s.md) | in review | #4 | `HUG-5` |",
  "| 02 | Base | `node` | [s](specs/s.md) | pending | | `HUG-6` |",
  "| 03 | Pipeline | `node` | — | approved | #9 | `HUG-7` |",
  "| 04 | Prefs | `node` | — | pending | | |",
]);

const S = { backlog: { id: "s1", name: "Backlog", type: "backlog" }, todo: { id: "s2", name: "Todo", type: "unstarted" }, progress: { id: "s3", name: "In Progress", type: "started" }, review: { id: "s4", name: "In Review", type: "started" }, done: { id: "s5", name: "Done", type: "completed" }, canceled: { id: "s6", name: "Canceled", type: "canceled" } };
const team = { id: "t1", key: "HUG" };
const issue = (n, state) => ({ id: `uuid-${n}`, identifier: `HUG-${n}`, state, team });
const states = { t1: Object.values(S) };

test("the real PLAN.md only uses known statuses", () => {
  assert.ok(wantedRows(parseStages(plan)).length >= 1);
});

test("rank orders the Linear states", () => {
  assert.deepEqual([S.backlog, S.todo, S.progress, S.review, S.done, S.canceled].map(rank), [0, 0, 1, 2, 3, null]);
});

test("issues behind the plan move forward", () => {
  const rows = wantedRows(parseStages(md));
  const { actions } = planActions(rows, { "HUG-5": issue(5, S.progress), "HUG-6": issue(6, S.backlog), "HUG-7": issue(7, S.review) }, states);
  assert.deepEqual(actions.map((a) => [a.identifier, a.from, a.to]), [["HUG-5", "In Progress", "In Review"], ["HUG-7", "In Review", "Done"]]);
});

test("issues ahead of the plan are never moved back", () => {
  const rows = wantedRows(parseStages(md));
  const { actions, notes } = planActions(rows, { "HUG-5": issue(5, S.done), "HUG-6": issue(6, S.progress), "HUG-7": issue(7, S.done) }, states);
  assert.equal(actions.length, 0);
  assert.ok(notes.some((n) => n.includes("HUG-5") && n.includes("ahead of the plan")));
});

test("canceled issues are left alone", () => {
  const { actions, notes } = planActions(wantedRows(parseStages(md)), { "HUG-5": issue(5, S.canceled), "HUG-6": issue(6, S.todo), "HUG-7": issue(7, S.done) }, states);
  assert.equal(actions.length, 0);
  assert.ok(notes[0].includes("canceled"));
});

test("a missing status name fails with the available names", () => {
  const few = { t1: [S.backlog, S.done] };
  assert.throws(() => planActions(wantedRows(parseStages(md)), { "HUG-5": issue(5, S.backlog), "HUG-6": issue(6, S.backlog), "HUG-7": issue(7, S.done) }, few), /"In Review" does not exist.*Backlog, Done/);
});

test("an issue missing in Linear and an unknown plan status both fail clearly", () => {
  assert.throws(() => planActions(wantedRows(parseStages(md)), {}, states), /HUG-5 .* was not found/);
  assert.throws(() => wantedRows(parseStages(table(["| 01 | Design | `x` | — | in progress | | `HUG-5` |"]))), /Unknown status "in progress"/);
});

function mockLinear(issues) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const { query, variables } = JSON.parse(data);
      calls.push({ auth: req.headers.authorization, query, variables });
      res.setHeader("content-type", "application/json");
      if (query.includes("issueUpdate")) return res.end(JSON.stringify({ data: { issueUpdate: { success: true } } }));
      if (query.includes("states")) return res.end(JSON.stringify({ data: { team: { states: { nodes: Object.values(S) } } } }));
      const out = {};
      Object.entries(variables).forEach(([k, id], i) => { out[`i${i}`] = issues[id] ?? null; });
      res.end(JSON.stringify({ data: out }));
    });
  }).listen(0);
  return { server, calls, url: `http://127.0.0.1:${server.address().port}/graphql` };
}

test("run applies the moves, sends the key without Bearer and leaves the rest alone", async () => {
  const m = mockLinear({ "HUG-5": issue(5, S.progress), "HUG-6": issue(6, S.todo), "HUG-7": issue(7, S.done) });
  const r = await run({ key: "lin_api_test", markdown: md, url: m.url });
  m.server.close();
  assert.deepEqual(r.actions.map((a) => a.identifier), ["HUG-5"]);
  assert.ok(m.calls.every((c) => c.auth === "lin_api_test"));
  const updates = m.calls.filter((c) => c.query.includes("issueUpdate"));
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].variables, { id: "uuid-5", stateId: "s4" });
});

test("a dry run reads but does not write", async () => {
  const m = mockLinear({ "HUG-5": issue(5, S.progress), "HUG-6": issue(6, S.todo), "HUG-7": issue(7, S.done) });
  const r = await run({ key: "k", markdown: md, url: m.url, dryRun: true });
  m.server.close();
  assert.equal(r.actions.length, 1);
  assert.ok(!m.calls.some((c) => c.query.includes("issueUpdate")));
});

test("GraphQL errors are reported", async () => {
  const server = http.createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ errors: [{ message: "Authentication required" }] })); }).listen(0);
  await assert.rejects(run({ key: "bad", markdown: md, url: `http://127.0.0.1:${server.address().port}/graphql` }), /Authentication required/);
  server.close();
});

// An issue whose status changes after the first read, as Linear's GitHub integration can do mid-run.
function changesAfterFirstRead(first, later) {
  let reads = 0;
  return { get value() { return issue(5, reads++ === 0 ? first : later); } };
}

for (const [label, later] of [["completed", S.done], ["canceled", S.canceled]]) {
  test(`an issue ${label} while the sync runs is not moved back`, async () => {
    const racing = changesAfterFirstRead(S.progress, later);
    const m = mockLinear({ get "HUG-5"() { return racing.value; }, "HUG-6": issue(6, S.todo), "HUG-7": issue(7, S.done) });
    const r = await run({ key: "k", markdown: md, url: m.url });
    m.server.close();
    assert.equal(r.actions.length, 0);
    assert.ok(r.notes.some((n) => n.includes("HUG-5") && n.includes("changed while the sync ran")));
    assert.ok(!m.calls.some((c) => c.query.includes("issueUpdate")));
  });
}

test("a missing-scope error says which permissions the key needs", async () => {
  const server = http.createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ errors: [{ message: "Invalid scope: `read` required" }] })); }).listen(0);
  await assert.rejects(run({ key: "k", markdown: md, url: `http://127.0.0.1:${server.address().port}/graphql` }), /Read and Write permissions/);
  server.close();
});
