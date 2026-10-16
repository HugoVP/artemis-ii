// Run with: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { buildIssue, parseStages, pickNext, run } from "./next-stage-issue.mjs";

const plan = await readFile(new URL("../docs/PLAN.md", import.meta.url), "utf8");
const sample = `# Stage plan

| # | Stage | Needs | Spec | Status | PR | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| 00 | 🔍 Plan | — | — | in review | #1 | — |
| 01 | 🎨 Design | \`figma-write\` | [stage-01-design](specs/stage-01-design.md) | in review | #4 | \`HUG-5\` |
| 02 | Project base | \`node\`, \`browser\` | [stage-02-base](specs/stage-02-base.md) | pending | | \`HUG-6\` |
| 03 | Pipeline | \`node\` | written in 02 | pending | | \`HUG-7\` |

## Log

| 99 | Not a stage row | a | b | pending | | x |
`;

test("parseStages reads the opening table of the real PLAN.md", () => {
  const stages = parseStages(plan);
  assert.ok(stages.length >= 12);
  assert.equal(stages[0].number, "00");
});

test("parseStages reads name, needs, spec, status, PR and Linear issue, and ignores later sections", () => {
  const s = parseStages(sample);
  assert.equal(s.length, 4);
  assert.deepEqual(s[2], { number: "02", name: "Project base", needs: ["node", "browser"], specPath: "specs/stage-02-base.md", status: "pending", pr: "", linear: "HUG-6" });
  assert.equal(s[1].name, "Design");
  assert.equal(s[3].specPath, null);
});

test("pickNext takes the pending stage after the merged PR, or the first pending one", () => {
  const s = parseStages(sample);
  assert.equal(pickNext(s, 4).number, "02");
  assert.equal(pickNext(s, 999).number, "02");
  assert.equal(pickNext(s.map((x) => ({ ...x, status: "approved" })), 4), null);
});

test("buildIssue has the prompt, an absolute spec link and no PR title", () => {
  const stage = parseStages(sample)[2];
  const issue = buildIssue(stage, { repo: "o/r", prNumber: 4 });
  assert.equal(issue.title, "Run Stage 02: Project base");
  assert.ok(issue.body.includes("Read AGENTS.md and follow docs/agents/next-stage.md."));
  assert.ok(issue.body.includes("https://github.com/o/r/blob/main/docs/specs/stage-02-base.md"));
  assert.ok(issue.body.includes("`HUG-6`"));
  assert.ok(issue.body.includes("`git`, `node`, `browser`"));
  assert.deepEqual(issue.labels, ["agent-task"]);
  const noSpec = buildIssue(parseStages(sample)[3], { repo: "o/r", prNumber: 4 });
  assert.ok(noSpec.body.includes("not written yet"));
});

function mockGitHub(existing = []) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      calls.push(`${req.method} ${req.url.split("?")[0]}`);
      res.setHeader("content-type", "application/json");
      if (req.method === "GET") return res.end(JSON.stringify(existing));
      if (req.url.endsWith("/labels")) { res.statusCode = 422; return res.end("{}"); }
      res.statusCode = 201;
      res.end(JSON.stringify({ number: 7 }));
    });
  }).listen(0);
  return { server, calls, base: `http://127.0.0.1:${server.address().port}` };
}

test("run creates the issue and tolerates an existing label", async () => {
  const m = mockGitHub();
  const r = await run({ token: "t", repo: "o/r", prNumber: 4, markdown: sample, base: m.base });
  m.server.close();
  assert.deepEqual(r, { action: "created", number: 7 });
  assert.ok(m.calls.includes("POST /repos/o/r/issues"));
});

test("run does not create a duplicate", async () => {
  const m = mockGitHub([{ number: 3, title: "Run Stage 02: Project base" }]);
  const r = await run({ token: "t", repo: "o/r", prNumber: 4, markdown: sample, base: m.base });
  m.server.close();
  assert.deepEqual(r, { action: "exists", number: 3 });
  assert.ok(!m.calls.includes("POST /repos/o/r/issues"));
});

test("run ignores a pull request that has the same title", async () => {
  const m = mockGitHub([{ number: 3, title: "Run Stage 02: Project base", pull_request: {} }]);
  const r = await run({ token: "t", repo: "o/r", prNumber: 4, markdown: sample, base: m.base });
  m.server.close();
  assert.equal(r.action, "created");
});

test("run does nothing when no stage is pending", async () => {
  const done = sample.replaceAll("pending", "approved");
  const r = await run({ token: "t", repo: "o/r", prNumber: 4, markdown: done, base: "http://127.0.0.1:1" });
  assert.equal(r.action, "none");
});
