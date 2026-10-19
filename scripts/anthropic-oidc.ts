// Keeps a fresh GitHub Actions OIDC token in a file for Claude Code's workload identity federation
// (docs/specs/claude-wif.md). Runs on the runner, from the trusted copy of main's scripts, never in the agent's
// container: only the file reaches the container, mounted read-only. No dependencies (Node 22).
//   node scripts/anthropic-oidc.ts validate        checks the four federation ids in the environment
//   node scripts/anthropic-oidc.ts start <dir>     writes <dir>/token now and every 120 seconds, until killed
//   ... | node scripts/anthropic-oidc.ts redact    copies stdin to stdout with every JWT replaced, line by line
import { mkdir, rename, writeFile, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const AUDIENCE = "https://api.anthropic.com";
export const REFRESH_MS = 120_000;
export const FEDERATION_VARIABLES = ["ANTHROPIC_FEDERATION_RULE_ID", "ANTHROPIC_ORGANIZATION_ID", "ANTHROPIC_SERVICE_ACCOUNT_ID", "ANTHROPIC_WORKSPACE_ID"];

// The ids come from secrets of the environment "agents" (masked in logs); they are still data: short opaque ids only, never a path or a shell fragment.
export function isFederationId(value: unknown): boolean {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

// Names of the variables that are missing or malformed, never their values (account identifiers stay out of logs).
export function badFederationVariables(env: Record<string, string | undefined>): string[] {
  return FEDERATION_VARIABLES.filter((name) => !isFederationId(env[name]));
}

// GitHub's token endpoint: GET <url>&audience=<aud> with the request token as a bearer. The response is {"value": "<jwt>"}.
export async function fetchOidcToken(requestUrl: string, requestToken: string, doFetch: typeof fetch = fetch): Promise<string> {
  const url = new URL(requestUrl);
  if (url.protocol !== "https:") throw new Error("The OIDC request URL must be https.");
  url.searchParams.set("audience", AUDIENCE);
  const res = await doFetch(url, { headers: { Authorization: `Bearer ${requestToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`The OIDC token request failed with status ${res.status}.`);
  const body = (await res.json()) as { value?: unknown };
  if (typeof body.value !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(body.value)) throw new Error("The OIDC response holds no token.");
  return body.value;
}

// Written next to the target and renamed over it, so a reader sees the old or the new token, never half of one.
let writes = 0;
export async function writeTokenAtomic(dir: string, token: string): Promise<void> {
  const tmp = join(dir, `.token.${process.pid}.${++writes}.tmp`);
  try {
    await writeFile(tmp, token, { mode: 0o600 });
    await rename(tmp, join(dir, "token"));
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

// The expiry (seconds since the epoch) of a JWT, for the log. The token itself is never printed.
export function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

// The agent can read the token file, so it could print a token. GitHub's masker only knows values registered before
// they appear, and the refresher runs in another step, so the agent's output is filtered instead: anything shaped like
// a JWT (base64url header and payload of a JSON object, then a signature) is replaced before it reaches the log.
export const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
export function redactJwts(text: string): string {
  return text.replace(JWT_PATTERN, "[redacted token]");
}

export interface RefreshOptions {
  dir: string;
  requestUrl: string;
  requestToken: string;
  intervalMs?: number;
  doFetch?: typeof fetch;
  log?: (line: string) => void;
}

// Writes the first token (throws if that fails), then keeps refreshing; a failed refresh is logged and retried
// at the next tick, since the previous token stays valid for a few minutes. Returns a stop function.
export async function startRefresher(opts: RefreshOptions): Promise<() => void> {
  const log = opts.log ?? ((line) => console.log(line));
  await mkdir(opts.dir, { recursive: true, mode: 0o700 });
  const once = async () => {
    const token = await fetchOidcToken(opts.requestUrl, opts.requestToken, opts.doFetch);
    await writeTokenAtomic(opts.dir, token);
    const exp = jwtExpiry(token);
    log(`${new Date().toISOString()} wrote a fresh OIDC token${exp ? `, expires ${new Date(exp * 1000).toISOString()}` : ""}.`);
  };
  await once();
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    once().catch((e: Error) => log(`${new Date().toISOString()} refresh failed: ${e.message}`)).finally(() => { busy = false; });
  }, opts.intervalMs ?? REFRESH_MS);
  return () => clearInterval(timer);
}

async function main(argv: string[]): Promise<number> {
  const [cmd, dir] = argv;
  if (cmd === "validate") {
    const bad = badFederationVariables(process.env);
    if (bad.length) { console.error(`Missing or malformed secrets of the environment "agents": ${bad.join(", ")}.`); return 1; }
    console.log("The federation variables are set.");
    return 0;
  }
  if (cmd === "start" && dir) {
    const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!requestUrl || !requestToken) { console.error("No OIDC request token: the job needs permissions: id-token: write."); return 1; }
    const stop = await startRefresher({ dir, requestUrl, requestToken });
    // On SIGTERM the folder goes with the process.
    const end = async () => { stop(); await rm(dir, { recursive: true, force: true }); process.exit(0); };
    process.on("SIGTERM", end);
    process.on("SIGINT", end);
    return new Promise<number>(() => {});
  }
  if (cmd === "redact") {
    for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) process.stdout.write(`${redactJwts(line)}\n`);
    return 0;
  }
  console.error("Usage: anthropic-oidc.ts validate | start <dir> | redact");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
