#!/usr/bin/env node
// Run by Hugo on his own machine, once, after signing in to Figma's MCP server with an approved client (Codex) in a
// separate folder. Finds that grant's client id, client secret and refresh token in the client's credentials file
// and prints one field, so it can be piped into `gh secret set` without being shown on screen.
// The file layout of each client is not documented, so the search is by field name: it looks for the object that holds
// a refresh token for mcp.figma.com. No dependencies (Node 22). Steps: docs/agents/adding-an-agent.md.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FIELDS = {
  client_id: ["client_id", "clientId"],
  client_secret: ["client_secret", "clientSecret"],
  refresh_token: ["refresh_token", "refreshToken"],
};

function pick(obj, names) {
  for (const n of names) if (typeof obj?.[n] === "string" && obj[n] !== "") return obj[n];
  return undefined;
}

// Walks the parsed JSON (strings that are JSON themselves included) and returns every object with a refresh token,
// with the client id found on the object itself or on one of its parents.
export function findGrants(value, parents = []) {
  let node = value;
  if (typeof node === "string") {
    try { node = JSON.parse(node); } catch { return []; }
  }
  if (!node || typeof node !== "object") return [];
  const found = [];
  const refresh = pick(node, FIELDS.refresh_token);
  if (refresh) {
    const chain = [node, ...parents];
    const first = (names) => chain.map((o) => pick(o, names)).find(Boolean);
    found.push({ client_id: first(FIELDS.client_id), client_secret: first(FIELDS.client_secret), refresh_token: refresh, text: JSON.stringify(node) });
  }
  for (const child of Object.values(node)) found.push(...findGrants(child, [node, ...parents]));
  return found;
}

export function figmaGrant(json) {
  const grants = findGrants(json);
  const figma = grants.filter((g) => /figma\.com/.test(g.text));
  const list = figma.length > 0 ? figma : grants;
  if (list.length === 0) throw new Error("No refresh token found in this file. Sign in first (see docs/agents/adding-an-agent.md).");
  if (list.length > 1) throw new Error("More than one grant found. Use a folder that only has the Figma sign-in.");
  if (!list[0].client_id) throw new Error("A refresh token was found but no client id. The steps in docs/agents/adding-an-agent.md need to be checked against this client version.");
  const { text, ...grant } = list[0];
  return grant;
}

async function main([file, field]) {
  if (!file || !(field in FIELDS)) {
    console.error("Usage: figma-mcp-credentials.mjs <credentials file> client_id|client_secret|refresh_token");
    return 2;
  }
  const grant = figmaGrant(JSON.parse(await readFile(file, "utf8")));
  const value = grant[field];
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
    console.error(e.message);
    process.exit(1);
  }
}
