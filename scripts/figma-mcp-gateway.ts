#!/usr/bin/env node
// Figma MCP gateway for the agent pipeline (docs/agents/adding-an-agent.md, "Figma in the pipeline").
// Runs on the runner itself, outside the agent's container, and is the only thing that holds the run's Figma access
// token. The agent's MCP client talks to it without credentials; it forwards to mcp.figma.com only what the stage may do:
//   - the tools of the stage (read tools for figma-read, plus use_figma for figma-write); every other tool is blocked,
//     including whoami, create_new_file and any tool Figma adds later
//   - on the design file of FIGMA_FILE_URL only: `fileKey` must be that file, and no argument may name another file
//   - a bounded number of tool calls per run, so a looping agent cannot spend the account's daily quota
// It logs every decision with the method, tool and node id, never the arguments, the code or the token.
// No dependencies (Node 22).
import http from "node:http";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { refresh } from "./figma-mcp-token.ts";

// A JSON-RPC message as the gateway reads it. Parsed JSON is untrusted: every field is checked before use.
export type RpcId = string | number | null | undefined;
export interface RpcMessage {
  jsonrpc?: unknown;
  id?: RpcId;
  method?: unknown;
  params?: { [key: string]: unknown; name?: unknown; uri?: unknown; arguments?: { [key: string]: unknown } };
  result?: { [key: string]: unknown; isError?: boolean; content?: { type: string; text: string }[] };
  error?: { code: number; message: string };
}

export interface Policy {
  fileKey: string;
  tools: string[];
  maxCalls: number;
}

export interface State {
  calls: number;
}

export interface LogEntry {
  t?: string;
  method: string;
  decision: string;
  tool?: string;
  node?: string | undefined;
  reason?: string;
  call?: number;
  status?: number;
  ms?: number;
}

// { forward } is sent upstream; { reply } is answered locally (null: a notification that is dropped).
export type Decision =
  | { forward: RpcMessage; reply?: undefined; log: LogEntry }
  | { reply: RpcMessage | null; forward?: undefined; log: LogEntry };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const UPSTREAM = "https://mcp.figma.com/mcp";
export const PORT = 8787;
export const HOSTNAME = "figma-gateway";
export const READ_TOOLS = ["get_metadata", "get_screenshot", "get_variable_defs", "get_design_context"];
export const WRITE_TOOLS = ["use_figma"];
export const MAX_CALLS = 150;
const MAX_BODY = 2 * 1024 * 1024;
const MAX_RESPONSE = 64 * 1024 * 1024;
const MAX_INFLIGHT = 8;
const UPSTREAM_TIMEOUT_MS = 5 * 60 * 1000;

// The design file's key, from FIGMA_FILE_URL. Branch links are refused: a branch is another file key.
export function fileKeyFromUrl(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "https:" || !/^(?:www\.)?figma\.com$/.test(u.hostname)) throw new Error("FIGMA_FILE_URL must be a https://www.figma.com/ link.");
  const m = /^\/(?:design|file)\/([A-Za-z0-9]{10,64})(?:\/[^/]*)?\/?$/.exec(u.pathname);
  if (!m) throw new Error("FIGMA_FILE_URL must be the link of a design file (/design/<key>/<name>), not a branch or another page.");
  return m[1];
}

export function toolsFor(access: string | undefined): string[] {
  if (access === "read") return [...READ_TOOLS];
  if (access === "write") return [...READ_TOOLS, ...WRITE_TOOLS];
  throw new Error("The Figma access of the stage must be read or write.");
}

// Argument names that could point a call at another file, team or plan. Only the top-level fileKey is allowed.
const OTHER_TARGET = /^(?:file_?keys?|file_?urls?|urls?|plan_?keys?|team_?ids?|project_?ids?|branch_?keys?|org_?ids?)$/i;
// The key, then the rest of the path: a branch (/branch/<key>) may come right after the key or after the file name.
const FIGMA_LINK = /figma\.com\/(?:design|file|board|make|slides|proto|deck)\/([A-Za-z0-9]+)([^\s"'?#]*)/gi;

export function checkArguments(args: unknown, fileKey: string): string | null {
  if (!isObject(args)) return "the call has no arguments";
  if (args.fileKey !== fileKey) return "fileKey must be the project's design file (FIGMA_FILE_URL)";
  const walk = (value: unknown, top: boolean): string | null => {
    if (typeof value === "string") {
      for (const m of value.matchAll(FIGMA_LINK)) if (m[1] !== fileKey || /\/branch\//i.test(m[2])) return "an argument links to another Figma file";
      return null;
    }
    if (!value || typeof value !== "object") return null;
    for (const [k, v] of Object.entries(value)) {
      if (!(top && k === "fileKey") && OTHER_TARGET.test(k)) return `the argument ${k} is not allowed`;
      const r = walk(v, false);
      if (r) return r;
    }
    return null;
  };
  return walk(args, true);
}

// Node ids look like 1:2 or 1-2, or I1:2;3:4 for instances. Anything else is logged as "other": the log is printed in
// the job, so no text chosen by the agent goes into it.
function safeNode(v: unknown): string | undefined {
  return typeof v === "string" && /^[I0-9:;-]{1,80}$/.test(v) ? v : v === undefined ? undefined : "other";
}

const rpcError = (id: RpcId, code: number, message: string): RpcMessage => ({ jsonrpc: "2.0", id, error: { code, message } });
const blockedTool = (id: RpcId, reason: string): RpcMessage => ({
  jsonrpc: "2.0", id,
  result: { isError: true, content: [{ type: "text", text: `Blocked by the pipeline's Figma gateway: ${reason}.` }] },
});

// Decides what to do with one JSON-RPC message from the agent. Returns { forward } with the message to send upstream,
// or { reply } with a local answer (null for a notification that is dropped), and a log entry.
export function decide(input: unknown, policy: Policy, state: State): Decision {
  if (!isObject(input) || input.jsonrpc !== "2.0") {
    return { reply: rpcError(null, -32600, "Invalid request."), log: { method: "invalid", decision: "block" } };
  }
  const msg = input as RpcMessage;
  const id = msg.id;
  // Responses to requests of the server: the gateway announces no client capabilities, so there are none to answer.
  if (typeof msg.method !== "string") return { reply: null, log: { method: "response", decision: "drop" } };
  const method = msg.method;
  const isNotification = id === undefined;
  const known = (m: string) => (["initialize", "ping", "tools/list", "tools/call", "resources/list", "resources/read", "resources/templates/list", "prompts/list", "notifications/initialized", "notifications/cancelled"].includes(m) ? m : "other");

  switch (method) {
    case "initialize":
      // No sampling, roots or elicitation: the server cannot ask the agent's client for anything.
      return { forward: { ...msg, params: { ...(msg.params ?? {}), capabilities: {} } }, log: { method, decision: "forward" } };
    case "ping":
    case "tools/list":
    case "resources/list":
    case "notifications/initialized":
    case "notifications/cancelled":
      return { forward: msg, log: { method, decision: "forward" } };
    case "resources/templates/list":
      return { reply: { jsonrpc: "2.0", id, result: { resourceTemplates: [] } }, log: { method, decision: "local" } };
    case "prompts/list":
      return { reply: { jsonrpc: "2.0", id, result: { prompts: [] } }, log: { method, decision: "local" } };
    case "resources/read": {
      // Figma's skills (skill://figma/...) only: read-only instructions, not files.
      const uri = msg.params?.uri;
      if (typeof uri === "string" && uri.startsWith("skill://")) return { forward: msg, log: { method, decision: "forward" } };
      return { reply: rpcError(id, -32602, "Blocked by the pipeline's Figma gateway: only skill:// resources can be read."), log: { method, decision: "block", reason: "resource" } };
    }
    case "tools/call": {
      const name = msg.params?.name;
      const allowed = typeof name === "string" && policy.tools.includes(name);
      const tool = allowed ? name : "other";
      const node = safeNode(msg.params?.arguments?.nodeId);
      if (!allowed) {
        return { reply: blockedTool(id, `the tool is not available in this stage (allowed: ${policy.tools.join(", ")})`), log: { method, tool, node, decision: "block", reason: "tool" } };
      }
      const bad = checkArguments(msg.params?.arguments, policy.fileKey);
      if (bad) return { reply: blockedTool(id, bad), log: { method, tool, node, decision: "block", reason: "file" } };
      if (state.calls >= policy.maxCalls) {
        return { reply: blockedTool(id, `this run reached its limit of ${policy.maxCalls} Figma tool calls`), log: { method, tool, node, decision: "block", reason: "quota" } };
      }
      state.calls += 1;
      return { forward: msg, log: { method, tool, node, decision: "forward", call: state.calls } };
    }
    default:
      if (isNotification) return { reply: null, log: { method: known(method), decision: "drop" } };
      return { reply: rpcError(id, -32601, "Blocked by the pipeline's Figma gateway: method not available."), log: { method: known(method), decision: "block", reason: "method" } };
  }
}

// Filters one message from the server before the agent sees it. Returns null to drop it.
export function filterServerMessage(msg: unknown, policy: Policy): unknown {
  if (!isObject(msg)) return msg;
  // Requests from the server (sampling, roots, elicitation) are not passed on: no client capabilities were announced.
  if (typeof msg.method === "string" && msg.id !== undefined) return null;
  const r = msg.result;
  if (!isObject(r)) return msg;
  const out: Record<string, unknown> = { ...r };
  if (Array.isArray(r.tools)) out.tools = r.tools.filter((t: unknown) => isObject(t) && typeof t.name === "string" && policy.tools.includes(t.name));
  if (Array.isArray(r.resources)) out.resources = r.resources.filter((x: unknown) => isObject(x) && typeof x.uri === "string" && x.uri.startsWith("skill://"));
  if (isObject(r.capabilities) && typeof r.protocolVersion === "string") {
    // initialize: only tools and resources are offered.
    out.capabilities = Object.fromEntries(Object.entries(r.capabilities).filter(([k]) => k === "tools" || k === "resources"));
  }
  return { ...msg, result: out };
}

function filterJsonText(text: string, policy: Policy): string | null {
  let msg: unknown;
  try { msg = JSON.parse(text); } catch { return text; }
  if (Array.isArray(msg)) return JSON.stringify(msg.map((m) => filterServerMessage(m, policy)).filter((m) => m !== null));
  const f = filterServerMessage(msg, policy);
  return f === null ? null : JSON.stringify(f);
}

// Rewrites a server-sent event stream one event at a time.
async function pipeEvents(body: ReadableStream<Uint8Array>, res: ServerResponse, policy: Policy): Promise<void> {
  const decoder = new TextDecoder();
  let buf = "";
  const flush = (block: string) => {
    const lines = block.split(/\r?\n/);
    const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
    const other = lines.filter((l) => !l.startsWith("data:") && l !== "");
    if (!data) { if (other.length) res.write(`${other.join("\n")}\n\n`); return; }
    const filtered = filterJsonText(data, policy);
    if (filtered === null) return;
    res.write(`${[...other, ...filtered.split("\n").map((l) => `data: ${l}`)].join("\n")}\n\n`);
  };
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    if (buf.length > MAX_RESPONSE) throw new Error("event too large");
    let m: RegExpExecArray | null;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      flush(buf.slice(0, m.index));
      buf = buf.slice(m.index + m[0].length);
    }
  }
  buf += decoder.decode();
  if (buf.trim()) flush(buf);
}

// Reads a web stream as text, up to a limit.
async function readText(body: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of body) {
    text += decoder.decode(chunk, { stream: true });
    if (text.length > limit) throw new Error("response too large");
  }
  return text + decoder.decode();
}

async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const SESSION_HEADERS = ["mcp-session-id", "mcp-protocol-version"] as const;
const HEADER_RULES: Record<(typeof SESSION_HEADERS)[number], RegExp> = {
  "mcp-session-id": /^[\x21-\x7e]{1,256}$/,
  "mcp-protocol-version": /^\d{4}-\d{2}-\d{2}$/,
};

export interface GatewayOptions {
  token: string;
  policy: Policy;
  hostnames: string[];
  upstream?: string;
  fetchImpl?: typeof fetch;
  log?: (entry: LogEntry) => void;
}

export type Gateway = http.Server & { state: State & { inflight: number } };

// upstream and fetchImpl are for tests; the CLI always uses UPSTREAM.
export function createGateway({ token, policy, hostnames, upstream = UPSTREAM, fetchImpl = fetch, log = (e) => console.log(JSON.stringify(e)) }: GatewayOptions): Gateway {
  const state = { calls: 0, inflight: 0 };
  const send = (res: ServerResponse, status: number, body?: unknown, headers: OutgoingHttpHeaders = {}) => {
    res.writeHead(status, { "cache-control": "no-store", ...headers });
    res.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      // Only requests addressed to the gateway's own name, and never from a browser page.
      const port = (server.address() as AddressInfo).port;
      const host = String(req.headers.host ?? "");
      if (!hostnames.some((h) => host === `${h}:${port}`) || req.headers.origin !== undefined) return send(res, 403, "Forbidden");
      const path = new URL(req.url ?? "/", "http://gateway").pathname;
      if (path === "/healthz" && req.method === "GET") return send(res, 200, "ok", { "content-type": "text/plain" });
      if (path !== "/mcp") return send(res, 404, "Not found");
      // No server-initiated stream: the spec allows a 405, and the client then works with responses only.
      if (req.method === "GET") return send(res, 405, "Method not allowed", { allow: "POST, DELETE" });
      if (req.method !== "POST" && req.method !== "DELETE") return send(res, 405, "Method not allowed", { allow: "POST, DELETE" });

      const headers: Record<string, string> = { authorization: `Bearer ${token}`, "user-agent": "artemis-ii-figma-gateway" };
      for (const h of SESSION_HEADERS) {
        const rule = HEADER_RULES[h];
        const v = req.headers[h];
        if (v === undefined) continue;
        if (typeof v !== "string" || !rule.test(v)) return send(res, 400, "Bad header");
        headers[h] = v;
      }

      let entry: LogEntry = { method: "session/delete", decision: "forward" };
      let body: string | undefined;
      if (req.method === "POST") {
        if (!/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))) return send(res, 415, "JSON only");
        let msg: unknown;
        try { msg = JSON.parse(await readBody(req, MAX_BODY)); } catch (e) {
          return send(res, (e as { status?: number }).status ?? 400, rpcError(null, -32700, "Parse error."), { "content-type": "application/json" });
        }
        // Batches were removed from MCP; refusing them keeps one decision per request.
        if (Array.isArray(msg)) {
          log({ t: new Date().toISOString(), method: "batch", decision: "block" });
          return send(res, 400, rpcError(null, -32600, "Batches are not accepted."), { "content-type": "application/json" });
        }
        const d = decide(msg, policy, state);
        entry = d.log;
        if (!d.forward) {
          log({ t: new Date().toISOString(), ...entry });
          return d.reply === null ? send(res, 202) : send(res, 200, d.reply, { "content-type": "application/json" });
        }
        body = JSON.stringify(d.forward);
        headers["content-type"] = "application/json";
        headers.accept = "application/json, text/event-stream";
      }

      if (state.inflight >= MAX_INFLIGHT) {
        // A call refused here never reached Figma, so it gives back the quota that decide() charged.
        if (entry.call !== undefined) state.calls -= 1;
        log({ t: new Date().toISOString(), ...entry, decision: "block", reason: "busy" });
        return send(res, 429, "Too many requests");
      }
      // The slot is held until the response has been relayed in full, so open streams count too.
      state.inflight += 1;
      let up: Response | undefined;
      try {
        up = await fetchImpl(upstream, { method: req.method, headers, body, redirect: "error", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
        log({ t: new Date().toISOString(), ...entry, status: up.status, ms: Date.now() - started });
        // An expired or revoked token must not look like an auth challenge: the client would try OAuth against the gateway.
        if (up.status === 401 || up.status === 403) return send(res, 502, "Figma refused the gateway's token");
        const out: Record<string, string> = { "cache-control": "no-store" };
        for (const h of SESSION_HEADERS) {
          const v = up.headers.get(h);
          if (v !== null && HEADER_RULES[h].test(v)) out[h] = v;
        }
        const type = up.headers.get("content-type") ?? "";
        if (!up.body || up.status === 202 || up.status === 204) { res.writeHead(up.status, out); return res.end(); }
        if (/^text\/event-stream\b/i.test(type)) {
          res.writeHead(up.status, { ...out, "content-type": "text/event-stream" });
          await pipeEvents(up.body, res, policy);
          return res.end();
        }
        if (/^application\/json\b/i.test(type)) {
          const filtered = filterJsonText(await readText(up.body, MAX_RESPONSE), policy);
          if (filtered === null) { res.writeHead(202, out); return res.end(); }
          res.writeHead(up.status, { ...out, "content-type": "application/json" });
          return res.end(filtered);
        }
        return send(res, 502, "Unexpected response from Figma");
      } finally {
        state.inflight -= 1;
        // A body that was not read to the end is cancelled, so no upstream stream outlives its slot.
        if (up?.body && !up.body.locked) await up.body.cancel().catch(() => {});
        else if (up?.body?.locked && !res.writableEnded) res.destroy();
      }
    } catch (e) {
      log({ t: new Date().toISOString(), method: "error", decision: "error", reason: (e as Error | undefined)?.name === "TimeoutError" ? "timeout" : "gateway" });
      if (!res.headersSent) send(res, 502, "Gateway error");
      else res.destroy();
    }
  });
  return Object.assign(server, { state });
}

// CLI used by agent-run.yml, on the runner:
//   figma-mcp-gateway.ts <bind address>
// Reads FIGMA_MCP_CLIENT_ID, FIGMA_MCP_CLIENT_SECRET, FIGMA_MCP_REFRESH_TOKEN, FIGMA_FILE_URL and FIGMA_ACCESS
// (read or write), removes them from its environment, gets the run's access token and listens on <bind>:8787.
async function main([bind]: string[]): Promise<void> {
  if (!bind || !/^[0-9.]+$/.test(bind)) throw new Error("Usage: figma-mcp-gateway.ts <bind IPv4 address>");
  const env = { ...process.env };
  for (const k of ["FIGMA_MCP_CLIENT_ID", "FIGMA_MCP_CLIENT_SECRET", "FIGMA_MCP_REFRESH_TOKEN"]) delete process.env[k];
  const policy: Policy = { fileKey: fileKeyFromUrl(env.FIGMA_FILE_URL ?? ""), tools: toolsFor(env.FIGMA_ACCESS), maxCalls: MAX_CALLS };
  const { accessToken } = await refresh({
    clientId: env.FIGMA_MCP_CLIENT_ID,
    clientSecret: env.FIGMA_MCP_CLIENT_SECRET || undefined,
    refreshToken: env.FIGMA_MCP_REFRESH_TOKEN,
  });
  const server = createGateway({ token: accessToken, policy, hostnames: [HOSTNAME] });
  server.listen(PORT, bind, () => console.log(JSON.stringify({ t: new Date().toISOString(), listening: `${bind}:${PORT}`, tools: policy.tools, maxCalls: policy.maxCalls })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
