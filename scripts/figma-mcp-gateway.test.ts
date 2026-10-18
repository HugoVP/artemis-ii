// Run with: node --test scripts/*.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { checkArguments, createGateway, decide, fileKeyFromUrl, filterServerMessage, toolsFor } from "./figma-mcp-gateway.ts";
import type { LogEntry, Policy } from "./figma-mcp-gateway.ts";

const KEY = "7b6W4tsb9Ia0J0KhyvBWCX";
const OTHER = "AAAAAAAAAAAAAAAAAAAAAA";
const readPolicy = (): Policy => ({ fileKey: KEY, tools: toolsFor("read"), maxCalls: 3 });
const writePolicy = (): Policy => ({ fileKey: KEY, tools: toolsFor("write"), maxCalls: 3 });
const call = (name: string, args: unknown, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

test("fileKeyFromUrl takes the key of a design file link and refuses anything else", () => {
  assert.equal(fileKeyFromUrl(`https://www.figma.com/design/${KEY}/Artemis-II---Site`), KEY);
  assert.equal(fileKeyFromUrl(`https://www.figma.com/design/${KEY}/Artemis-II---Site?node-id=1-2`), KEY);
  assert.throws(() => fileKeyFromUrl(`https://www.figma.com/design/${KEY}/branch/${OTHER}/x`), /branch/);
  assert.throws(() => fileKeyFromUrl(`http://www.figma.com/design/${KEY}/x`), /https/);
  assert.throws(() => fileKeyFromUrl(`https://figma.com.evil.example/design/${KEY}/x`), /https/);
  assert.throws(() => fileKeyFromUrl(""));
});

test("toolsFor gives read tools to figma-read stages and adds use_figma for figma-write only", () => {
  assert.deepEqual(toolsFor("read"), ["get_metadata", "get_screenshot", "get_variable_defs", "get_design_context"]);
  assert.ok(toolsFor("write").includes("use_figma"));
  assert.ok(!toolsFor("read").includes("use_figma"));
  for (const t of [...toolsFor("write")]) assert.ok(!["whoami", "create_new_file"].includes(t));
  assert.throws(() => toolsFor("none"));
});

test("a tool call must target the design file, and no argument may name another file", () => {
  assert.equal(checkArguments({ fileKey: KEY, nodeId: "1:2" }, KEY), null);
  assert.match(checkArguments({ fileKey: OTHER }, KEY) ?? "", /fileKey/);
  assert.match(checkArguments({ nodeId: "1:2" }, KEY) ?? "", /fileKey/);
  assert.match(checkArguments(undefined, KEY) ?? "", /no arguments/);
  assert.match(checkArguments({ fileKey: KEY, planKey: "team::1" }, KEY) ?? "", /planKey/);
  assert.match(checkArguments({ fileKey: KEY, options: { file_key: KEY } }, KEY) ?? "", /file_key/);
  assert.match(checkArguments({ fileKey: KEY, url: `https://www.figma.com/design/${KEY}/x` }, KEY) ?? "", /url/);
  assert.match(checkArguments({ fileKey: KEY, code: `// see https://www.figma.com/design/${OTHER}/Other` }, KEY) ?? "", /another Figma file/);
  assert.match(checkArguments({ fileKey: KEY, code: `https://www.figma.com/design/${KEY}/x/branch/${OTHER}/y` }, KEY) ?? "", /another Figma file/);
  assert.match(checkArguments({ fileKey: KEY, code: `https://www.figma.com/design/${KEY}/branch/${OTHER}/y` }, KEY) ?? "", /another Figma file/);
  assert.match(checkArguments({ fileKey: KEY, code: `https://www.figma.com/design/${KEY}/branch/${OTHER}` }, KEY) ?? "", /another Figma file/);
  assert.equal(checkArguments({ fileKey: KEY, code: `// frame https://www.figma.com/design/${KEY}/Artemis?node-id=1-2` }, KEY), null);
});

test("decide blocks tools outside the stage, other files and calls over the quota, and counts only forwarded calls", () => {
  const state = { calls: 0 };
  assert.equal(decide(call("whoami", {}), readPolicy(), state).reply!.result!.isError, true);
  assert.equal(decide(call("create_new_file", { planKey: "x" }), writePolicy(), state).reply!.result!.isError, true);
  assert.equal(decide(call("use_figma", { fileKey: KEY, code: "" }), readPolicy(), state).log.reason, "tool");
  assert.equal(decide(call("get_metadata", { fileKey: OTHER }), readPolicy(), state).log.reason, "file");
  assert.equal(state.calls, 0);
  for (let i = 0; i < 3; i++) assert.ok(decide(call("get_metadata", { fileKey: KEY }), readPolicy(), state).forward);
  const over = decide(call("get_metadata", { fileKey: KEY }), readPolicy(), state);
  assert.equal(over.log.reason, "quota");
  assert.ok(decide(call("use_figma", { fileKey: KEY, code: "1" }), { ...writePolicy(), maxCalls: 10 }, { calls: 0 }).forward);
});

test("decide allows only the protocol methods the agent needs, and strips client capabilities", () => {
  const p = readPolicy();
  const init = decide({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: { sampling: {}, roots: {} }, clientInfo: { name: "c" } } }, p, { calls: 0 });
  assert.deepEqual(init.forward!.params!.capabilities, {});
  assert.equal((init.forward!.params!.clientInfo as { name: string }).name, "c");
  for (const method of ["ping", "tools/list", "resources/list"]) assert.ok(decide({ jsonrpc: "2.0", id: 1, method }, p, { calls: 0 }).forward, method);
  assert.ok(decide({ jsonrpc: "2.0", method: "notifications/initialized" }, p, { calls: 0 }).forward);
  assert.ok(decide({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "skill://figma/figma-use/SKILL.md" } }, p, { calls: 0 }).forward);
  assert.equal(decide({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "file:///etc/passwd" } }, p, { calls: 0 }).reply!.error!.code, -32602);
  assert.equal(decide({ jsonrpc: "2.0", id: 1, method: "prompts/get" }, p, { calls: 0 }).reply!.error!.code, -32601);
  assert.equal(decide({ jsonrpc: "2.0", id: 1, method: "logging/setLevel" }, p, { calls: 0 }).reply!.error!.code, -32601);
  assert.deepEqual(decide({ jsonrpc: "2.0", id: 1, method: "prompts/list" }, p, { calls: 0 }).reply!.result, { prompts: [] });
  assert.equal(decide({ jsonrpc: "2.0", id: 1, result: {} }, p, { calls: 0 }).reply, null);
  assert.equal(decide({ id: 1, method: "ping" }, p, { calls: 0 }).reply!.error!.code, -32600);
});

test("the log of a decision never carries the agent's text", () => {
  const d = decide(call("use_figma", { fileKey: KEY, nodeId: "::add-mask::x", code: "secret code" }), writePolicy(), { calls: 0 });
  const text = JSON.stringify(d.log);
  assert.ok(!text.includes("secret code") && !text.includes("add-mask"));
  assert.equal(d.log.node, "other");
  assert.equal(decide(call("evil::tool", {}), readPolicy(), { calls: 0 }).log.tool, "other");
  assert.equal(decide({ jsonrpc: "2.0", id: 1, method: "::error::x" }, readPolicy(), { calls: 0 }).log.method, "other");
});

test("filterServerMessage hides tools and resources outside the stage, server requests and extra capabilities", () => {
  const p = readPolicy();
  type Filtered = { result: { tools: { name: string }[]; resources: { uri: string }[]; capabilities: object } };
  const list = filterServerMessage({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "get_metadata" }, { name: "use_figma" }, { name: "whoami" }, { name: "create_new_file" }] } }, p) as Filtered;
  assert.deepEqual(list.result.tools.map((t) => t.name), ["get_metadata"]);
  const res = filterServerMessage({ jsonrpc: "2.0", id: 1, result: { resources: [{ uri: "skill://figma/x" }, { uri: "figma://file/abc" }] } }, p) as Filtered;
  assert.deepEqual(res.result.resources.map((r) => r.uri), ["skill://figma/x"]);
  assert.equal(filterServerMessage({ jsonrpc: "2.0", id: 9, method: "sampling/createMessage", params: {} }, p), null);
  const init = filterServerMessage({ jsonrpc: "2.0", id: 0, result: { protocolVersion: "2025-06-18", capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} } } }, p) as Filtered;
  assert.deepEqual(Object.keys(init.result.capabilities).sort(), ["resources", "tools"]);
});

// An upstream that records requests and answers tools/list with SSE and everything else with JSON.
interface UpstreamCall {
  method: string | undefined;
  headers: IncomingHttpHeaders;
  body: unknown;
}

function mockUpstream({ status = 200 }: { status?: number } = {}) {
  const calls: UpstreamCall[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ method: req.method, headers: req.headers, body: body ? JSON.parse(body) : null });
      if (status !== 200) { res.statusCode = status; return res.end(); }
      const msg = body ? JSON.parse(body) : {};
      res.setHeader("mcp-session-id", "session-1");
      if (msg.method === "tools/list") {
        res.setHeader("content-type", "text/event-stream");
        const payload = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "get_metadata" }, { name: "whoami" }, { name: "use_figma" }] } });
        return res.end(`event: message\ndata: ${payload}\n\n`);
      }
      if (msg.id === undefined) { res.statusCode = 202; return res.end(); }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "ok" }] } }));
    });
  }).listen(0, "127.0.0.1");
  return { server, calls, url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp` };
}

interface GatewayFixture {
  base: string;
  post: (msg: unknown, headers?: Record<string, string>) => Promise<Response>;
  up: ReturnType<typeof mockUpstream>;
  logs: LogEntry[];
}

async function withGateway(fn: (f: GatewayFixture) => Promise<void>, { status, policy = readPolicy() }: { status?: number; policy?: Policy } = {}) {
  const up = mockUpstream({ status });
  await new Promise((r) => up.server.once("listening", r));
  const logs: LogEntry[] = [];
  const gw = createGateway({ token: "figma-access-token", policy, hostnames: ["127.0.0.1"], upstream: up.url(), log: (e) => logs.push(e) });
  await new Promise<void>((r) => gw.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(gw.address() as AddressInfo).port}`;
  const post = (msg: unknown, headers: Record<string, string> = {}) => fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(msg) });
  try {
    await fn({ base, post, up, logs });
  } finally {
    gw.close();
    up.server.close();
  }
}

test("the gateway forwards allowed calls with its own token and passes the session header both ways", async () => {
  await withGateway(async ({ post, up }) => {
    const r = await post(call("get_metadata", { fileKey: KEY, nodeId: "1:2" }), { authorization: "Bearer agent-chosen", "mcp-session-id": "abc" });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("mcp-session-id"), "session-1");
    assert.equal((await r.json()).result.content[0].text, "ok");
    assert.equal(up.calls.length, 1);
    assert.equal(up.calls[0].headers.authorization, "Bearer figma-access-token");
    assert.equal(up.calls[0].headers["mcp-session-id"], "abc");
  });
});

test("the gateway answers blocked calls itself, without reaching Figma", async () => {
  await withGateway(async ({ post, up, logs }) => {
    const r = await post(call("get_metadata", { fileKey: OTHER }));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).result.isError, true);
    const w = await post(call("whoami", {}));
    assert.match((await w.json()).result.content[0].text, /not available in this stage/);
    assert.equal(up.calls.length, 0);
    assert.deepEqual(logs.map((l) => l.decision), ["block", "block"]);
  });
});

test("the gateway filters the tool list inside an event stream", async () => {
  await withGateway(async ({ post }) => {
    const r = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.match(r.headers.get("content-type") ?? "", /text\/event-stream/);
    const text = await r.text();
    const data = JSON.parse(/^data: (.*)$/m.exec(text)![1]);
    assert.deepEqual(data.result.tools.map((t: { name: string }) => t.name), ["get_metadata"]);
    assert.match(text, /^event: message$/m);
  });
});

test("the gateway refuses other hosts, browser origins, batches, GET streams and other paths", async () => {
  await withGateway(async ({ base, post, up }) => {
    const port = new URL(base).port;
    assert.equal((await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { origin: "https://evil.example" })).status, 403);
    const wrongHost = await new Promise((resolve) => {
      http.request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { host: `evil.example:${port}`, "content-type": "application/json" } }, (res) => resolve(res.statusCode)).end("{}");
    });
    assert.equal(wrongHost, 403);
    assert.equal((await post([{ jsonrpc: "2.0", id: 1, method: "ping" }])).status, 400);
    assert.equal((await fetch(`${base}/mcp`)).status, 405);
    assert.equal((await fetch(`${base}/.well-known/oauth-authorization-server`)).status, 404);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { "mcp-session-id": "bad value" })).status, 400);
    assert.equal(up.calls.length, 0);
  });
});

test("a token Figma refuses becomes a gateway error, never an auth challenge for the client", async () => {
  await withGateway(async ({ post }) => {
    const r = await post({ jsonrpc: "2.0", id: 1, method: "ping" });
    assert.equal(r.status, 502);
    assert.equal(r.headers.get("www-authenticate"), null);
  }, { status: 401 });
});

test("notifications are forwarded and answered with 202", async () => {
  await withGateway(async ({ post, up }) => {
    const r = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(r.status, 202);
    assert.equal(up.calls.length, 1);
    assert.equal((await post({ jsonrpc: "2.0", method: "notifications/roots/list_changed" })).status, 202);
    assert.equal(up.calls.length, 1);
  });
});

test("a response holds its concurrency slot until its body is relayed, so a ninth open stream is refused", async () => {
  const open: ServerResponse[] = [];
  const up = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(": open\n\n");
      open.push(res);
    });
  }).listen(0, "127.0.0.1");
  await new Promise((r) => up.once("listening", r));
  const gw = createGateway({ token: "t", policy: readPolicy(), hostnames: ["127.0.0.1"], upstream: `http://127.0.0.1:${(up.address() as AddressInfo).port}/mcp`, log: () => {} });
  await new Promise<void>((r) => gw.listen(0, "127.0.0.1", r));
  const post = () => fetch(`http://127.0.0.1:${(gw.address() as AddressInfo).port}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
  try {
    const streams = [];
    for (let i = 0; i < 8; i++) streams.push(await post());
    assert.ok(streams.every((r) => r.status === 200));
    assert.equal(gw.state.inflight, 8);
    assert.equal((await post()).status, 429);
    // A tool call refused as busy does not use up the run's quota.
    const busy = await fetch(`http://127.0.0.1:${(gw.address() as AddressInfo).port}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(call("get_metadata", { fileKey: KEY })) });
    assert.equal(busy.status, 429);
    assert.equal(gw.state.calls, 0);
    for (const res of open) res.end();
    await Promise.all(streams.map((r) => r.text()));
    assert.equal(gw.state.inflight, 0);
    const again = post();
    await new Promise((r) => setTimeout(r, 50));
    open.at(-1)!.end();
    assert.equal((await again).status, 200);
  } finally {
    for (const res of open) res.end();
    gw.close();
    up.close();
  }
});
