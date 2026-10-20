// Run with: node --test scripts/*.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { checkTokenEndpoint, refresh } from "./figma-mcp-token.ts";

const portOf = (server: http.Server) => (server.address() as AddressInfo).port;

test("refresh rejects a missing client secret before contacting Figma", async () => {
  let calls = 0;
  await assert.rejects(refresh({ clientId: "cid", refreshToken: "private-refresh-marker", fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ token_endpoint: "https://api.figma.com/v1/oauth/token" }));
  } }), /FIGMA_MCP_CLIENT_SECRET/);
  assert.equal(calls, 0);
});

interface MockOptions {
  status?: number;
  token?: { access_token: string; expires_in?: number; refresh_token?: string };
  endpoint?: string;
}

function mockFigma({ status = 200, token = { access_token: "fig_access_1", expires_in: 7776000 }, endpoint }: MockOptions = {}) {
  const calls: { method: string | undefined; path: string | undefined; body: URLSearchParams }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ method: req.method, path: req.url, body: new URLSearchParams(body) });
      res.setHeader("content-type", "application/json");
      const origin = `http://127.0.0.1:${portOf(server)}`;
      if (req.url === "/.well-known/oauth-authorization-server") return res.end(JSON.stringify({ token_endpoint: endpoint ?? `${origin}/v1/oauth/token` }));
      if (req.url === "/v1/oauth/token") { res.statusCode = status; return res.end(JSON.stringify(status === 200 ? token : { error: "invalid_grant" })); }
      res.statusCode = 404; res.end("{}");
    });
  }).listen(0);
  const origin = `http://127.0.0.1:${portOf(server)}`;
  return { server, calls, origin, discoveryUrl: `${origin}/.well-known/oauth-authorization-server` };
}

test("checkTokenEndpoint accepts Figma's own origin only", () => {
  assert.equal(checkTokenEndpoint("https://api.figma.com/v1/oauth/token"), "https://api.figma.com/v1/oauth/token");
  assert.throws(() => checkTokenEndpoint("https://evil.example.com/token"), /origin/);
  assert.throws(() => checkTokenEndpoint("http://api.figma.com/v1/oauth/token"), /origin/);
});

test("refresh exchanges the refresh token for an access token with a form POST", async () => {
  const m = mockFigma();
  const r = await refresh({ clientId: "cid", clientSecret: "cs", refreshToken: "rt", discoveryUrl: m.discoveryUrl, allowedOrigin: m.origin });
  m.server.close();
  assert.deepEqual(r, { accessToken: "fig_access_1", expiresIn: 7776000, rotated: false });
  const post = m.calls.find((c) => c.method === "POST")!;
  assert.equal(post.body.get("grant_type"), "refresh_token");
  assert.equal(post.body.get("client_id"), "cid");
  assert.equal(post.body.get("refresh_token"), "rt");
  assert.equal(post.body.get("client_secret"), "cs");
});

test("refresh reports a rotated refresh token", async () => {
  const m = mockFigma({ token: { access_token: "a2", refresh_token: "rt-new" } });
  const r = await refresh({ clientId: "cid", clientSecret: "cs", refreshToken: "rt", discoveryUrl: m.discoveryUrl, allowedOrigin: m.origin });
  m.server.close();
  assert.equal(r.rotated, true);
  assert.equal(m.calls.find((c) => c.method === "POST")!.body.get("client_secret"), "cs");
});

test("refresh fails with the status and OAuth error, never echoing the secrets", async () => {
  const m = mockFigma({ status: 400 });
  await assert.rejects(refresh({ clientId: "cid", clientSecret: "cs", refreshToken: "very-secret-refresh", discoveryUrl: m.discoveryUrl, allowedOrigin: m.origin }), (e) => {
    assert.match((e as Error).message, /400 \(invalid_grant\)/);
    assert.ok(!(e as Error).message.includes("very-secret-refresh"));
    return true;
  });
  m.server.close();
  await assert.rejects(refresh({ clientId: "", refreshToken: "" }), /FIGMA_MCP_CLIENT_ID/);
});

test("refresh refuses a discovery document that points the secrets at another host", async () => {
  const m = mockFigma({ endpoint: "https://evil.example.com/token" });
  await assert.rejects(refresh({ clientId: "cid", clientSecret: "cs", refreshToken: "rt", discoveryUrl: m.discoveryUrl, allowedOrigin: m.origin }), /origin/);
  m.server.close();
  assert.ok(!m.calls.some((c) => c.method === "POST"));
});

test("refresh does not follow a redirect that would resend the secrets to another origin", async () => {
  const other = { hits: 0 };
  const evil = http.createServer((req, res) => { other.hits++; res.end("{}"); }).listen(0);
  const evilUrl = `http://127.0.0.1:${portOf(evil)}/steal`;
  const server = http.createServer((req, res) => {
    const origin = `http://127.0.0.1:${portOf(server)}`;
    if (req.url === "/.well-known/oauth-authorization-server") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ token_endpoint: `${origin}/v1/oauth/token` })); }
    res.statusCode = 307; res.setHeader("location", evilUrl); res.end();
  }).listen(0);
  const origin = `http://127.0.0.1:${portOf(server)}`;
  await assert.rejects(refresh({ clientId: "cid", clientSecret: "cs", refreshToken: "rt", discoveryUrl: `${origin}/.well-known/oauth-authorization-server`, allowedOrigin: origin }));
  server.close(); evil.close();
  assert.equal(other.hits, 0);
});
