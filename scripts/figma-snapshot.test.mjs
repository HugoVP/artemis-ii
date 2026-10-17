// Run with: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileKeyFrom, safeName, pickFrames, snapshot } from "./figma-snapshot.mjs";

const KEY = "7b6W4tsb9Ia0J0KhyvBWCX";
const fileJson = {
  name: "Artemis II - Site", version: "9", lastModified: "2026-10-17T00:00:00Z",
  document: { children: [
    { name: "Foundations", type: "CANVAS", children: [{ id: "1:2", name: "Colors / Light", type: "FRAME" }, { id: "1:3", name: "note", type: "TEXT" }] },
    { name: "Components", type: "CANVAS", children: [{ id: "8:10", name: "Top bar", type: "COMPONENT_SET" }] },
    { name: "Screens", type: "CANVAS", children: [{ id: "8:20", name: "Home ../../etc", type: "FRAME" }] },
    { name: "Exploration", type: "CANVAS", children: [{ id: "8:30", name: "Idea", type: "FRAME" }] },
  ] },
};

function mockFigma({ fail } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    calls.push({ path: url.pathname, token: req.headers["x-figma-token"] ?? null });
    res.setHeader("content-type", "application/json");
    if (fail) { res.statusCode = fail; res.setHeader("retry-after", "30"); return res.end(JSON.stringify({ err: "Forbidden" })); }
    if (url.pathname === `/v1/files/${KEY}`) return res.end(JSON.stringify(fileJson));
    if (url.pathname === `/v1/files/${KEY}/nodes`) {
      const nodes = {};
      for (const id of url.searchParams.get("ids").split(",")) nodes[id] = { document: { id, type: "FRAME", children: [] } };
      return res.end(JSON.stringify({ nodes }));
    }
    if (url.pathname === `/v1/images/${KEY}`) {
      const images = {};
      for (const id of url.searchParams.get("ids").split(",")) images[id] = `http://127.0.0.1:${server.address().port}/img/${encodeURIComponent(id)}.png`;
      return res.end(JSON.stringify({ images }));
    }
    if (url.pathname.startsWith("/img/")) { res.setHeader("content-type", "image/png"); return res.end(Buffer.from([137, 80, 78, 71])); }
    res.statusCode = 404; res.end("{}");
  }).listen(0);
  return { server, calls, base: `http://127.0.0.1:${server.address().port}` };
}

test("fileKeyFrom reads the key of a design URL and rejects anything else", () => {
  assert.equal(fileKeyFrom(`https://www.figma.com/design/${KEY}/Artemis-II---Site?node-id=0-1`), KEY);
  assert.equal(fileKeyFrom(`https://www.figma.com/file/${KEY}`), KEY);
  assert.throws(() => fileKeyFrom("https://example.com/design/abc"), /figma\.com/);
  assert.throws(() => fileKeyFrom(undefined), /FIGMA_FILE_URL/);
});

test("safeName keeps only lowercase letters, digits and dashes", () => {
  assert.equal(safeName("Home ../../etc"), "home-etc");
  assert.equal(safeName("8:20"), "8-20");
  assert.equal(safeName("///"), "frame");
});

test("pickFrames takes top-level frames of the three pages only", () => {
  const f = pickFrames(fileJson);
  assert.deepEqual(f.map((x) => x.id), ["1:2", "8:10", "8:20"]);
  assert.ok(!f.some((x) => x.page === "Exploration"));
});

test("snapshot writes an index, one PNG and one node tree per frame, and sends the token only to the API", async () => {
  const m = mockFigma();
  const dir = await mkdtemp(join(tmpdir(), "figma-"));
  const r = await snapshot({ token: "figd_test", fileKey: KEY, outDir: dir, base: m.base });
  m.server.close();
  assert.deepEqual(r, { frames: 3, withImages: 3 });
  const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
  assert.equal(index.frames.length, 3);
  assert.equal(index.file.name, "Artemis II - Site");
  assert.match(index.frames[2].png, /^frames\/screens-home-etc-8-20\.png$/);
  assert.deepEqual((await readdir(join(dir, "frames"))).length, 3);
  assert.deepEqual((await readdir(join(dir, "nodes"))).length, 3);
  for (const c of m.calls.filter((c) => c.path.startsWith("/v1/"))) assert.equal(c.token, "figd_test", c.path);
  for (const c of m.calls.filter((c) => c.path.startsWith("/img/"))) assert.equal(c.token, null, "image downloads carry no token");
});

test("snapshot asks for frames in chunks of 20", async () => {
  const many = { ...fileJson, document: { children: [{ name: "Screens", type: "CANVAS", children: Array.from({ length: 45 }, (_, i) => ({ id: `9:${i}`, name: `S${i}`, type: "FRAME" })) }] } };
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    calls.push(u.pathname);
    const ok = (body) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body, arrayBuffer: async () => new ArrayBuffer(4) });
    if (u.pathname === `/v1/files/${KEY}`) return ok(many);
    const ids = (u.searchParams.get("ids") ?? "").split(",");
    if (u.pathname.endsWith("/nodes")) return ok({ nodes: Object.fromEntries(ids.map((id) => [id, { document: { id } }])) });
    if (u.pathname.startsWith("/v1/images")) return ok({ images: Object.fromEntries(ids.map((id) => [id, `https://img.example.com/${id}.png`])) });
    return ok({});
  };
  const dir = await mkdtemp(join(tmpdir(), "figma-"));
  const r = await snapshot({ token: "t", fileKey: KEY, outDir: dir, base: "https://api.example.com", fetchImpl, maxFrames: 45 });
  assert.equal(r.frames, 45);
  assert.equal(calls.filter((p) => p.endsWith("/nodes")).length, 3);
  assert.equal(calls.filter((p) => p.startsWith("/v1/images")).length, 3);
});

test("snapshot fails with the status and never prints the token", async () => {
  const m = mockFigma({ fail: 403 });
  const dir = await mkdtemp(join(tmpdir(), "figma-"));
  await assert.rejects(snapshot({ token: "figd_secret_value", fileKey: KEY, outDir: dir, base: m.base }), (e) => {
    assert.match(e.message, /403/);
    assert.match(e.message, /retry after 30s/);
    assert.ok(!e.message.includes("figd_secret_value"));
    return true;
  });
  m.server.close();
  await assert.rejects(snapshot({ token: "", fileKey: KEY, outDir: dir }), /FIGMA_TOKEN/);
});

function stubFetch({ nodes, images }) {
  const ok = (body) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body, arrayBuffer: async () => new ArrayBuffer(4) });
  return async (url) => {
    const u = new URL(url);
    if (u.pathname === `/v1/files/${KEY}`) return ok(fileJson);
    const ids = (u.searchParams.get("ids") ?? "").split(",");
    if (u.pathname.endsWith("/nodes")) return ok({ nodes: nodes(ids) });
    if (u.pathname.startsWith("/v1/images")) return ok({ images: images(ids) });
    return ok({});
  };
}

test("snapshot fails when a frame has no node tree or no image, instead of recording a partial success", async () => {
  const allNodes = (ids) => Object.fromEntries(ids.map((id) => [id, { document: { id } }]));
  const allImages = (ids) => Object.fromEntries(ids.map((id) => [id, `https://img.example.com/${id}.png`]));
  const dir = await mkdtemp(join(tmpdir(), "figma-"));
  const run = (fetchImpl) => snapshot({ token: "t", fileKey: KEY, outDir: dir, base: "https://api.example.com", fetchImpl });
  await assert.rejects(run(stubFetch({ nodes: (ids) => ({ ...allNodes(ids), "8:10": null }), images: allImages })), /no node tree for the frame "Top bar"/);
  await assert.rejects(run(stubFetch({ nodes: allNodes, images: (ids) => ({ ...allImages(ids), "8:20": null }) })), /no image for the frame "Home/);
  await assert.rejects(run(stubFetch({ nodes: allNodes, images: () => ({}) })), /no image/);
  const r = await run(stubFetch({ nodes: allNodes, images: allImages }));
  assert.deepEqual(r, { frames: 3, withImages: 3 });
});
