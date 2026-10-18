// Run with: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { findGrants, figmaGrant } from "./figma-mcp-credentials.mjs";

test("figmaGrant finds the client id and refresh token whatever the nesting", () => {
  const flat = { "figma|abc": { server_url: "https://mcp.figma.com/mcp", client_id: "cid", token_response: { access_token: "a", refresh_token: "rt" } } };
  assert.deepEqual(figmaGrant(flat), { client_id: "cid", client_secret: undefined, refresh_token: "rt" });
  const camel = { mcpOAuth: { "figma|x": { serverUrl: "https://mcp.figma.com/mcp", clientId: "c2", clientSecret: "s2", refreshToken: "r2" } } };
  assert.deepEqual(figmaGrant(camel), { client_id: "c2", client_secret: "s2", refresh_token: "r2" });
});

test("figmaGrant reads grants stored as JSON strings inside the file", () => {
  const nested = { entries: [{ key: "figma", value: JSON.stringify({ url: "https://mcp.figma.com/mcp", client_id: "c3", refresh_token: "r3" }) }] };
  assert.equal(figmaGrant(nested).refresh_token, "r3");
});

test("figmaGrant prefers the Figma grant and refuses ambiguous or incomplete files", () => {
  const two = { a: { url: "https://mcp.example.com", client_id: "x", refresh_token: "rx" }, b: { url: "https://mcp.figma.com/mcp", client_id: "y", refresh_token: "ry" } };
  assert.equal(figmaGrant(two).client_id, "y");
  const twoFigma = { a: { url: "https://mcp.figma.com/mcp", client_id: "x", refresh_token: "rx" }, b: { url: "https://mcp.figma.com/mcp", client_id: "y", refresh_token: "ry" } };
  assert.throws(() => figmaGrant(twoFigma), /More than one/);
  assert.throws(() => figmaGrant({ nothing: true }), /No refresh token/);
  assert.throws(() => figmaGrant({ url: "https://mcp.figma.com/mcp", refresh_token: "r" }), /no client id/);
  assert.equal(findGrants("not json").length, 0);
});

test("figmaGrant fails closed when the file holds grants of other servers only", () => {
  const others = { "other|x": { server_url: "https://mcp.example.com/mcp", client_id: "oid", refresh_token: "rt-other" } };
  assert.throws(() => figmaGrant(others), /No grant for https:\/\/mcp\.figma\.com/);
  const lookalike = { a: { url: "https://mcp.figma.com.evil.example/mcp", client_id: "x", refresh_token: "rx" } };
  assert.throws(() => figmaGrant(lookalike), /No grant/);
  const unlabelled = { client_id: "x", refresh_token: "rx" };
  assert.throws(() => figmaGrant(unlabelled), /No grant/);
});

test("figmaGrant uses the server URL of an enclosing entry, so a nested Figma grant is told apart from other grants", () => {
  const mixed = {
    "figma|abc": { server_url: "https://mcp.figma.com/mcp", client_id: "cid", token_response: { access_token: "a", refresh_token: "rt-figma" } },
    "other|def": { server_url: "https://mcp.example.com/mcp", client_id: "oid", token_response: { access_token: "b", refresh_token: "rt-other" } },
  };
  assert.deepEqual(figmaGrant(mixed), { client_id: "cid", client_secret: undefined, refresh_token: "rt-figma" });
});
