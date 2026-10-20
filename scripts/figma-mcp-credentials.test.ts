// Run with: node --test scripts/*.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findGrants, figmaGrant } from "./figma-mcp-credentials.ts";

test("figmaGrant refuses an incomplete Codex grant before any field can be exported", () => {
  const incomplete = { url: "https://mcp.figma.com/mcp", client_id: "private-client-marker", refresh_token: "private-refresh-marker" };
  assert.throws(() => figmaGrant(incomplete), (error) => {
    const message = (error as Error).message;
    assert.match(message, /client secret/i);
    assert.ok(!message.includes(incomplete.client_id));
    assert.ok(!message.includes(incomplete.refresh_token));
    return true;
  });
});

test("credentials CLI checks complete grants without printing them and exports nothing from incomplete or malformed files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "figma-grant-check-"));
  const path = join(dir, "credentials.json");
  const script = fileURLToPath(new URL("./figma-mcp-credentials.ts", import.meta.url));
  const grant = { url: "https://mcp.figma.com/mcp", client_id: "private-client-marker", client_secret: "private-secret-marker", refresh_token: "private-refresh-marker" };
  try {
    await writeFile(path, JSON.stringify(grant));
    const checked = spawnSync(process.execPath, [script, path, "check"], { encoding: "utf8" });
    assert.equal(checked.status, 0);
    assert.match(checked.stdout, /Live refresh and MCP access are not yet verified/);
    assert.ok(!`${checked.stdout}${checked.stderr}`.includes("private-"));
    await writeFile(path, JSON.stringify({ ...grant, client_secret: "   " }));
    for (const mode of ["check", "client_id", "client_secret", "refresh_token"]) {
      const incomplete = spawnSync(process.execPath, [script, path, mode], { encoding: "utf8" });
      assert.equal(incomplete.status, 1);
      assert.equal(incomplete.stdout, "");
      assert.match(incomplete.stderr, /No client secret/);
      assert.ok(!incomplete.stderr.includes("private-"));
    }
    await writeFile(path, "private-malformed-credential");
    const malformed = spawnSync(process.execPath, [script, path, "check"], { encoding: "utf8" });
    assert.equal(malformed.status, 1);
    assert.equal(malformed.stdout, "");
    assert.match(malformed.stderr, /not valid JSON/);
    assert.ok(!malformed.stderr.includes("private-"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("figmaGrant finds the client id and refresh token whatever the nesting", () => {
  const flat = { "figma|abc": { server_url: "https://mcp.figma.com/mcp", client_id: "cid", client_secret: "secret", token_response: { access_token: "a", refresh_token: "rt" } } };
  assert.deepEqual(figmaGrant(flat), { client_id: "cid", client_secret: "secret", refresh_token: "rt" });
  const camel = { mcpOAuth: { "figma|x": { serverUrl: "https://mcp.figma.com/mcp", clientId: "c2", clientSecret: "s2", refreshToken: "r2" } } };
  assert.deepEqual(figmaGrant(camel), { client_id: "c2", client_secret: "s2", refresh_token: "r2" });
});

test("figmaGrant reads grants stored as JSON strings inside the file", () => {
  const nested = { entries: [{ key: "figma", value: JSON.stringify({ url: "https://mcp.figma.com/mcp", client_id: "c3", client_secret: "secret", refresh_token: "r3" }) }] };
  assert.equal(figmaGrant(nested).refresh_token, "r3");
});

test("figmaGrant prefers the Figma grant and refuses ambiguous or incomplete files", () => {
  const two = { a: { url: "https://mcp.example.com", client_id: "x", refresh_token: "rx" }, b: { url: "https://mcp.figma.com/mcp", client_id: "y", refresh_token: "ry" } };
  assert.equal(figmaGrant({ ...two, b: { ...two.b, client_secret: "secret" } }).client_id, "y");
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
    "figma|abc": { server_url: "https://mcp.figma.com/mcp", client_id: "cid", client_secret: "secret", token_response: { access_token: "a", refresh_token: "rt-figma" } },
    "other|def": { server_url: "https://mcp.example.com/mcp", client_id: "oid", token_response: { access_token: "b", refresh_token: "rt-other" } },
  };
  assert.deepEqual(figmaGrant(mixed), { client_id: "cid", client_secret: "secret", refresh_token: "rt-figma" });
});
