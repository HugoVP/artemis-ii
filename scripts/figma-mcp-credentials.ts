#!/usr/bin/env node
// Run by Hugo on his own machine, once, after signing in to Figma's MCP server with an approved client (Codex) in a
// separate folder. Finds that grant's client id, client secret and refresh token in the client's credentials file
// and prints one field, so it can be piped into `gh secret set` without being shown on screen.
// The file layout of each client is not documented, so the search is by field name: it looks for the object that holds
// a refresh token for mcp.figma.com. No dependencies (Node 22). Steps: docs/agents/adding-an-agent.md.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type Field = "client_id" | "client_secret" | "refresh_token";
type Node = Record<string, unknown>;

export interface Grant {
  client_id: string | undefined;
  client_secret: string | undefined;
  refresh_token: string;
}

const FIELDS: Record<Field, string[]> = {
  client_id: ["client_id", "clientId"],
  client_secret: ["client_secret", "clientSecret"],
  refresh_token: ["refresh_token", "refreshToken"],
};

function pick(obj: Node | undefined, names: string[]): string | undefined {
  for (const n of names) {
    const v = obj?.[n];
    if (typeof v === "string" && v !== "") return v;
  }
  return undefined;
}

// Walks the parsed JSON (strings that are JSON themselves included) and returns every object with a refresh token,
// with the client id found on the object itself or on one of its parents.
// The server URL of a grant may sit on the grant's object or on an enclosing one (for example a `token_response`
// inside an entry that holds `server_url`), so the nearest URL in the chain decides which server the grant is for.
function nearestUrl(chain: Node[]): string {
  for (const o of chain) for (const k of ["server_url", "serverUrl", "url", "resource"]) {
    const v = o?.[k];
    if (typeof v === "string") return v;
  }
  return "";
}

export function findGrants(value: unknown, parents: Node[] = []): (Grant & { text: string })[] {
  let node: unknown = value;
  if (typeof node === "string") {
    try { node = JSON.parse(node); } catch { return []; }
  }
  if (!node || typeof node !== "object") return [];
  const obj = node as Node;
  const found: (Grant & { text: string })[] = [];
  const refresh = pick(obj, FIELDS.refresh_token);
  if (refresh) {
    const chain = [obj, ...parents];
    const first = (names: string[]) => chain.map((o) => pick(o, names)).find(Boolean);
    found.push({ client_id: first(FIELDS.client_id), client_secret: first(FIELDS.client_secret), refresh_token: refresh, text: nearestUrl(chain) || JSON.stringify(obj) });
  }
  for (const child of Object.values(obj)) found.push(...findGrants(child, [obj, ...parents]));
  return found;
}

export function figmaGrant(json: unknown): Grant {
  const grants = findGrants(json);
  // Only a grant for Figma's server counts: a grant of another server must never be printed as if it were Figma's.
  const list = grants.filter((g) => /^https:\/\/mcp\.figma\.com(?:\/|$)/.test(g.text));
  if (list.length === 0) throw new Error(grants.length === 0
    ? "No refresh token found in this file. Sign in first (see docs/agents/adding-an-agent.md)."
    : "No grant for https://mcp.figma.com in this file. Sign in to Figma's MCP server first (see docs/agents/adding-an-agent.md).");
  if (list.length > 1) throw new Error("More than one grant found. Use a folder that only has the Figma sign-in.");
  if (!list[0].client_id) throw new Error("A refresh token was found but no client id. The steps in docs/agents/adding-an-agent.md need to be checked against this client version.");
  const { text, ...grant } = list[0];
  return grant;
}

async function main([file, field]: string[]): Promise<number> {
  if (!file || !(field in FIELDS)) {
    console.error("Usage: figma-mcp-credentials.ts <credentials file> client_id|client_secret|refresh_token");
    return 2;
  }
  const grant = figmaGrant(JSON.parse(await readFile(file, "utf8")));
  const value = grant[field as Field];
  if (!value) {
    console.error(`No ${field} in this grant.${field === "client_secret" ? " That is normal for a public client: skip FIGMA_MCP_CLIENT_SECRET." : ""}`);
    return 1;
  }
  process.stdout.write(value);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
