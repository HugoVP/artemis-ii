// Run with: node --test scripts/*.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { buildIssue, parseStages, pickNext, run, readMergeSubjects, HISTORY_PAGE } from "./next-stage-issue.ts";
import { spawnSync } from "node:child_process";
import type { AddressInfo } from "node:net";

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
  assert.deepEqual(s[2], { number: "02", name: "Project base", needs: ["node", "browser"], specPath: "specs/stage-02-base.md", status: "pending", pr: "", linear: "HUG-6", marker: "" });
  assert.equal(s[1].name, "Design");
  assert.equal(s[1].marker, "🎨");
  assert.equal(s[3].specPath, null);
});

test("pickNext takes the pending stage after the merged PR, or the first pending one", () => {
  const s = parseStages(sample);
  assert.equal(pickNext(s, 4)?.number, "02");
  assert.equal(pickNext(s, 999)?.number, "02");
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

function mockGitHub(existing: { number: number; title: string; pull_request?: object }[] = []) {
  const calls: string[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      calls.push(`${req.method} ${req.url!.split("?")[0]}`);
      res.setHeader("content-type", "application/json");
      if (req.method === "GET") return res.end(JSON.stringify(existing));
      if (req.url!.endsWith("/labels")) { res.statusCode = 422; return res.end("{}"); }
      res.statusCode = 201;
      res.end(JSON.stringify({ number: 7 }));
    });
  }).listen(0);
  return { server, calls, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
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

const registry = [
  "- id: alpha\n  key_secret: AGENT_KEY_ALPHA\n  runner: codex-exec\n  capabilities: [git, node, browser]\n  status: active\n  roles: [lead, review]\n  family: one\n  cost: api",
  "- id: beta\n  key_secret: AGENT_KEY_BETA\n  runner: codex-exec\n  capabilities: [git, node, browser]\n  status: active\n  roles: [lead, review]\n  family: two\n  cost: api",
].join("\n");

function mockWithMerges(subjects: string[], commitsStatus = 200) {
  const calls: { method: string; path: string; body: string }[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const path = req.url!.split("?")[0];
      calls.push({ method: req.method!, path, body: data });
      res.setHeader("content-type", "application/json");
      if (req.method === "GET" && path.endsWith("/commits")) { res.statusCode = commitsStatus; return res.end(JSON.stringify(subjects.map((m) => ({ commit: { message: `${m}\n\nbody` } })))); }
      if (req.method === "GET") return res.end("[]");
      if (path.endsWith("/labels")) { res.statusCode = 422; return res.end("{}"); }
      res.statusCode = 201;
      res.end(JSON.stringify({ number: 7 }));
    });
  }).listen(0);
  return { server, calls, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test("run appends the recommendation, applying rotation from the merged stage branches", async () => {
  const m = mockWithMerges(["Merge pull request #8 from o/agent/stage-01-alpha"]);
  const r = await run({ token: "t", repo: "o/r", prNumber: 4, markdown: sample, registry, base: m.base });
  m.server.close();
  assert.deepEqual(r, { action: "created", number: 7 });
  const issue = JSON.parse(m.calls.find((c) => c.method === "POST" && c.path === "/repos/o/r/issues")!.body);
  assert.match(issue.body, /## Recommended agents/);
  assert.match(issue.body, /\*\*Leader: `beta`/);
  assert.match(issue.body, /`alpha` \(excluded by rotation\)/);
  assert.deepEqual(issue.labels, ["agent-task"]);
});

test("run escalates with needs-hugo when nobody can lead, and survives an unreadable history", async () => {
  const m = mockWithMerges([], 500);
  const lonely = registry.split("\n- id: beta")[0];
  await run({ token: "t", repo: "o/r", prNumber: 4, markdown: sample, registry: lonely.replace("status: active", "status: pending"), base: m.base });
  m.server.close();
  const issue = JSON.parse(m.calls.find((c) => c.method === "POST" && c.path === "/repos/o/r/issues")!.body);
  assert.deepEqual(issue.labels, ["agent-task", "needs-hugo"]);
  assert.match(issue.body, /No leader recommended/);
  assert.match(issue.body, /merge history could not be read/);
});

test("run does nothing when no stage is pending", async () => {
  const done = sample.replaceAll("pending", "approved");
  const r = await run({ token: "t", repo: "o/r", prNumber: 4, markdown: done, base: "http://127.0.0.1:1" });
  assert.equal(r.action, "none");
});

test("ORC-05: the work-order CLI runs as a process with the recommendation (no import cycle with its top-level await)", () => {
  const out = spawnSync(process.execPath, ["scripts/next-stage-issue.ts"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 60_000,
    env: { PATH: process.env.PATH, PR_NUMBER: "1", GITHUB_REPOSITORY: "o/r", DRY_RUN: "1" },
  });
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stderr, /unsettled top-level await/i);
  const issue = JSON.parse(out.stdout) as { title: string; body: string };
  assert.match(issue.title, /^Run Stage \d\d:/);
  assert.match(issue.body, /## Recommended agents/);
});

function mockHistory(handler: (page: number, res: http.ServerResponse) => void) {
  const server = http.createServer((req, res) => {
    const page = Number(new URL(req.url!, "http://x").searchParams.get("page") ?? "1");
    handler(page, res);
  }).listen(0);
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
const commit = (message: string) => ({ commit: { message } });

test("ORC-04: a rejected request or a body that is not JSON means unavailable history, not a crash", async () => {
  const dropped = mockHistory((_page, res) => res.destroy());
  const garbled = mockHistory((_page, res) => { res.setHeader("content-type", "text/html"); res.end("<html>Bad gateway</html>"); });
  try {
    assert.equal(await readMergeSubjects(dropped.base, "t", "o/r"), null);
    assert.equal(await readMergeSubjects(garbled.base, "t", "o/r"), null);
    assert.equal(await readMergeSubjects("http://127.0.0.1:1", "t", "o/r"), null);
  } finally { dropped.server.close(); garbled.server.close(); }
});

test("ORC-04: the work order is still created, with the no-rotation notice, when the history request fails", async () => {
  const posted: string[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const path = req.url!.split("?")[0];
      if (path.endsWith("/commits")) return res.destroy();
      res.setHeader("content-type", "application/json");
      if (req.method === "GET") return res.end("[]");
      if (path.endsWith("/labels")) { res.statusCode = 422; return res.end("{}"); }
      posted.push(data);
      res.statusCode = 201;
      res.end(JSON.stringify({ number: 7 }));
    });
  }).listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const r = await run({ token: "t", repo: "o/r", prNumber: 4, markdown: sample, registry, base });
    assert.deepEqual(r, { action: "created", number: 7 });
    assert.match(JSON.parse(posted[0]).body, /merge history could not be read/);
  } finally { server.close(); }
});

test("ORC-04: the history is read page by page, so older stage merges beyond the first 100 commits still count", async () => {
  const pages: number[] = [];
  const m = mockHistory((page, res) => {
    pages.push(page);
    res.setHeader("content-type", "application/json");
    const batch = page === 1 ? Array.from({ length: HISTORY_PAGE }, (_, i) => commit(`Fix ${i}`))
      : page === 2 ? [commit("Merge pull request #8 from o/agent/stage-01-alpha"), commit("Initial commit")] : [];
    res.end(JSON.stringify(batch));
  });
  try {
    const subjects = await readMergeSubjects(m.base, "t", "o/r");
    assert.deepEqual(pages, [1, 2]);
    assert.ok(subjects!.includes("Merge pull request #8 from o/agent/stage-01-alpha"));
    assert.equal(subjects!.length, HISTORY_PAGE + 2);
  } finally { m.server.close(); }
});
