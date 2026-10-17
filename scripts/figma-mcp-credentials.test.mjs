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
