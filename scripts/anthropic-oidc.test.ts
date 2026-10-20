// Run with: node --test scripts/*.test.ts
// WIF-02 and WIF-03 (docs/specs/claude-wif.md): id validation and the OIDC token refresher, against a local fake.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AUDIENCE, badFederationVariables, fetchOidcToken, isFederationId, jwtExpiry, neutralizeWorkflowCommands, redactJwts, sanitizeLogLine, startRefresher } from "./anthropic-oidc.ts";

const jwt = (exp: number) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;
const fake = (fn: (url: URL, init: RequestInit) => Promise<Response>) => fn as unknown as typeof fetch;
const reply = (value: string) => fake(async () => new Response(JSON.stringify({ value }), { status: 200 }));

test("WIF-02: the federation ids are short opaque ids, and bad ones are reported by name only", () => {
  assert.equal(isFederationId("fdrl_01AbC-d_9"), true);
  for (const bad of ["", "a b", "a/b", "$(id)", "x".repeat(129), undefined, 5]) assert.equal(isFederationId(bad), false);
  const ok = { ANTHROPIC_FEDERATION_RULE_ID: "r1", ANTHROPIC_ORGANIZATION_ID: "o1", ANTHROPIC_SERVICE_ACCOUNT_ID: "s1", ANTHROPIC_WORKSPACE_ID: "w1" };
  assert.deepEqual(badFederationVariables(ok), []);
  assert.deepEqual(badFederationVariables({ ...ok, ANTHROPIC_WORKSPACE_ID: "bad id", ANTHROPIC_ORGANIZATION_ID: undefined }), ["ANTHROPIC_ORGANIZATION_ID", "ANTHROPIC_WORKSPACE_ID"]);
});

test("WIF-03: the token request names the Anthropic audience, sends the request token as a bearer, and rejects odd answers", async () => {
  let seen: { url: string; auth: string } | undefined;
  await fetchOidcToken("https://example.invalid/token?x=1", "req-secret", fake(async (url, init) => {
    seen = { url: String(url), auth: String((init.headers as Record<string, string>).Authorization) };
    return new Response(JSON.stringify({ value: jwt(1) }), { status: 200 });
  }));
  assert.equal(new URL(seen!.url).searchParams.get("audience"), AUDIENCE);
  assert.equal(new URL(seen!.url).searchParams.get("x"), "1");
  assert.equal(seen!.auth, "Bearer req-secret");
  await assert.rejects(fetchOidcToken("http://example.invalid/t", "r", reply(jwt(1))), /https/);
  await assert.rejects(fetchOidcToken("https://example.invalid/t", "r", fake(async () => new Response("no", { status: 403 }))), /status 403/);
  await assert.rejects(fetchOidcToken("https://example.invalid/t", "r", reply("not a token")), /no token/);
});

test("WIF-03: the refresher writes the token atomically, refreshes, survives a failed refresh, and never logs the token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oidc-"));
  const tokens = [jwt(100), "FAIL", jwt(200)];
  const logs: string[] = [];
  const doFetch = fake(async () => {
    const t = tokens.shift();
    if (t === "FAIL") throw new Error("network down");
    return new Response(JSON.stringify({ value: t ?? jwt(200) }), { status: 200 });
  });
  // Stopped in finally too, so a failed assertion cannot leave the interval writing into a removed folder.
  let stop = () => {};
  try {
    stop = await startRefresher({ dir, requestUrl: "https://example.invalid/t", requestToken: "req-secret", intervalMs: 20, doFetch, log: (l) => logs.push(l), issuedFile: join(dir, "..", `${dir.split(/[\\/]/).pop()}.issued`) });
    assert.equal(await readFile(join(dir, "token"), "utf8"), jwt(100));
    if (process.platform !== "win32") assert.equal((await stat(join(dir, "token"))).mode & 0o777, 0o600);
    for (let i = 0; i < 100 && (await readFile(join(dir, "token"), "utf8")) !== jwt(200); i++) await new Promise((r) => setTimeout(r, 20));
    stop();
    assert.equal(await readFile(join(dir, "token"), "utf8"), jwt(200));
    assert.ok(logs.some((l) => l.includes("refresh failed")));
    for (const l of logs) assert.ok(!l.includes("sig") && !l.includes("req-secret"), l);
    assert.deepEqual(await readdir(dir), ["token"], "no temporary file is left behind");
    // Every token written is listed, outside the mounted folder, for the log masker.
    const issued = (await readFile(join(dir, "..", `${dir.split(/[\\/]/).pop()}.issued`), "utf8")).trim().split("\n");
    assert.deepEqual([issued[0], issued.at(-1)], [jwt(100), jwt(200)]);
  } finally {
    stop();
    await rm(dir, { recursive: true, force: true });
    await rm(join(dir, "..", `${dir.split(/[\\/]/).pop()}.issued`), { force: true });
  }
});

test("the first token must be written, or the refresher fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oidc-"));
  try {
    await assert.rejects(startRefresher({ dir, requestUrl: "https://example.invalid/t", requestToken: "r", doFetch: fake(async () => new Response("", { status: 500 })), log: () => {} }), /status 500/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WIF-04: a token printed by the agent is redacted before it reaches the log, by the function and by the redact command", () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = `${b64({ alg: "RS256", kid: "k" })}.${b64({ sub: "repo:x", aud: "y", exp: 1 })}.${"s".repeat(40)}`;
  assert.equal(redactJwts(`here: ${token} done`), "here: [redacted token] done");
  assert.equal(redactJwts("plain text with eyJ but no token"), "plain text with eyJ but no token");
  const script = fileURLToPath(new URL("./anthropic-oidc.ts", import.meta.url));
  const out = execFileSync(process.execPath, [script, "redact"], { input: `a ${token}\nno token here\nlast ${token}`, encoding: "utf8" });
  assert.equal(out, "a [redacted token]\nno token here\nlast [redacted token]\n");
  // A large output is copied in full: the command exits only after stdout drains.
  const lines = Array.from({ length: 50_000 }, (_, i) => `line ${i} ${"x".repeat(60)}`);
  const big = execFileSync(process.execPath, [script, "redact"], { input: lines.join("\n"), encoding: "utf8", maxBuffer: 1 << 28 });
  assert.equal(big, `${lines.join("\n")}\n`);
});

test("WIF-04: untrusted output cannot run workflow commands, so it cannot switch off the masks of the cleanup step", () => {
  for (const line of ["::stop-commands::marker", "  ::add-mask::x", "::set-output name=a::b", "##[set-output name=a;]b", "\t::warning::x"]) {
    assert.match(neutralizeWorkflowCommands(line), /^\[agent output\] /, line);
  }
  for (const line of ["plain", "a ::stop-commands::x in the middle", "# heading", ": :not a command"]) assert.equal(neutralizeWorkflowCommands(line), line);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = `${b64({ alg: "RS256" })}.${b64({ sub: "x" })}.${"s".repeat(30)}`;
  assert.equal(sanitizeLogLine(`::add-mask::${token}`), "[agent output] ::add-mask::[redacted token]");
  const script = fileURLToPath(new URL("./anthropic-oidc.ts", import.meta.url));
  const out = execFileSync(process.execPath, [script, "redact"], { input: "::stop-commands::m\nok\n", encoding: "utf8" });
  assert.equal(out, "[agent output] ::stop-commands::m\nok\n");
});

test("jwtExpiry reads exp and tolerates junk", () => {
  assert.equal(jwtExpiry(jwt(1234)), 1234);
  assert.equal(jwtExpiry("junk"), null);
});
