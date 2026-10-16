// Run with: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { buildBlocks, pageIdFrom, richText, sync } from "./notion-sync.mjs";

const plan = await readFile(new URL("../docs/PLAN.md", import.meta.url), "utf8");

test("pageIdFrom accepts a bare ID and a Notion URL", () => {
  const id = "33f6c8f2d37c4f19825b7b9600000000";
  assert.equal(pageIdFrom(id), id);
  assert.equal(pageIdFrom(`https://app.notion.com/p/${id}`), id);
  assert.equal(pageIdFrom(`https://www.notion.so/Decision-log-${id}?pvs=4`), id);
  assert.throws(() => pageIdFrom("nope"));
});

test("richText keeps absolute links, drops relative ones, chunks long text", () => {
  const t = richText("[a](https://example.com) and [b](docs/x.md) and `c`");
  assert.equal(t[0].text.link.url, "https://example.com");
  assert.equal(t[2].text.link, undefined);
  assert.equal(t[4].annotations.code, true);
  assert.ok(richText("x".repeat(4500)).every((i) => i.text.content.length <= 2000));
});

test("buildBlocks reads stages, decisions and log from PLAN.md", () => {
  const blocks = buildBlocks(plan, "abcdef123");
  const types = blocks.map((b) => b.type);
  assert.deepEqual(types.filter((t) => t === "heading_2").length, 3);
  assert.ok(types.filter((t) => t === "bulleted_list_item").length > 5);
  assert.ok(JSON.stringify(blocks).includes("Stage 02"));
});

test("buildBlocks refuses session links, tokens and emails", () => {
  const tokens = ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"].map((p) => p + "a".repeat(30));
  for (const bad of ["https://claude.ai/code/session_abc", "ntn_" + "a".repeat(30), "me@example.com", ...tokens]) {
    assert.throws(() => buildBlocks(`## Decisions\n\n- ${bad} <!-- notion -->\n`), /Refusing to publish/);
  }
});

test("buildBlocks refuses a token split across rich-text items", () => {
  const split = "a".repeat(1997) + " ghp_" + "b".repeat(30);
  assert.throws(() => buildBlocks(`## Decisions\n\n- ${split} <!-- notion -->\n`), /Refusing to publish/);
});

test("only entries with the notion marker are published", () => {
  const md = "## Decisions\n\n- Public one <!-- notion -->\n- Credentials and bucket layout\n\n## Log\n\n- Hidden entry\n";
  const text = JSON.stringify(buildBlocks(md));
  assert.ok(text.includes("Public one"));
  assert.ok(!text.includes("Credentials"));
  assert.ok(!text.includes("Hidden entry"));
  assert.ok(!text.includes("notion -->"));
});

test("sync appends the new blocks, then deletes the old ones", async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(`${req.method} ${req.url.split("?")[0]}`);
    res.setHeader("content-type", "application/json");
    if (req.method === "GET") res.end(JSON.stringify({ results: [{ id: "old1" }, { id: "old2" }], has_more: false }));
    else res.end("{}");
  }).listen(0);
  const { port } = server.address();
  const result = await sync({ token: "t", pageId: "p".repeat(32), blocks: buildBlocks(plan), base: `http://127.0.0.1:${port}` });
  server.close();
  assert.equal(result.removed, 2);
  assert.ok(calls.indexOf("PATCH /v1/blocks/" + "p".repeat(32) + "/children") < calls.indexOf("DELETE /v1/blocks/old1"));
});
