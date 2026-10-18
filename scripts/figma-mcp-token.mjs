#!/usr/bin/env node
// Short-lived access to Figma's MCP server (mcp.figma.com) for agents in the pipeline.
// The MCP server does not accept personal access tokens: it takes OAuth access tokens issued to an approved client
// (Codex, Claude Code, …). Hugo signs in once with such a client on his machine; the pipeline keeps that grant's
// client id and refresh token as secrets of the environment `agents`, and this script exchanges the refresh token
// for a fresh access token at the start of a run (`issue`) and once more at the end (`revoke`), which replaces the
// token the agent saw. No dependencies (Node 22). Setup: docs/agents/adding-an-agent.md, "Figma in the pipeline".
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const DISCOVERY_URL = "https://api.figma.com/.well-known/oauth-authorization-server";

// The token endpoint must be Figma's own, over HTTPS, so a changed discovery document cannot send the secrets elsewhere.
export function checkTokenEndpoint(url, allowedOrigin = "https://api.figma.com") {
  const u = new URL(url);
  if (u.origin !== allowedOrigin) throw new Error(`Unexpected token endpoint origin ${u.origin}.`);
  return u.toString();
}

export async function refresh({ clientId, clientSecret, refreshToken, discoveryUrl = DISCOVERY_URL, allowedOrigin, fetchImpl = fetch }) {
  if (!clientId || !refreshToken) throw new Error("FIGMA_MCP_CLIENT_ID and FIGMA_MCP_REFRESH_TOKEN must be set.");
  // No redirects: a redirect could take the request, and the secrets of the POST below, to another origin.
  const meta = await fetchImpl(discoveryUrl, { redirect: "error" });
  if (!meta.ok) throw new Error(`Figma OAuth discovery failed with ${meta.status}.`);
  const tokenEndpoint = checkTokenEndpoint((await meta.json()).token_endpoint, allowedOrigin);

  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: refreshToken });
  if (clientSecret) body.set("client_secret", clientSecret);
  const res = await fetchImpl(tokenEndpoint, { method: "POST", redirect: "error", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  let json = {};
  try { json = await res.json(); } catch { /* no body */ }
  // Status and the OAuth error code only: never the request body.
  if (!res.ok || !json.access_token) throw new Error(`Figma token refresh failed with ${res.status}${json.error ? ` (${json.error})` : ""}.`);
  return {
    accessToken: json.access_token,
    expiresIn: Number(json.expires_in) || null,
    // Figma documents refresh tokens as reusable. If one comes back different, the stored secret must be updated.
    rotated: Boolean(json.refresh_token) && json.refresh_token !== refreshToken,
  };
}

function fromEnv() {
  return {
    clientId: process.env.FIGMA_MCP_CLIENT_ID,
    clientSecret: process.env.FIGMA_MCP_CLIENT_SECRET || undefined,
    refreshToken: process.env.FIGMA_MCP_REFRESH_TOKEN,
  };
}

// CLI used by agent-run.yml.
//   figma-mcp-token.mjs issue <out-file>   writes a fresh access token to <out-file> (mode 0600) and masks it in the log
//   figma-mcp-token.mjs revoke             refreshes once more and drops the result, so the agent's token stops working
async function main([cmd, outFile]) {
  if (cmd === "issue") {
    if (!outFile) throw new Error("Usage: figma-mcp-token.mjs issue <out-file>");
    const r = await refresh(fromEnv());
    console.log(`::add-mask::${r.accessToken}`);
    await writeFile(outFile, r.accessToken, { mode: 0o600 });
    console.log(`Figma MCP token issued${r.expiresIn ? `, valid for ${Math.round(r.expiresIn / 3600)} h` : ""}.`);
    if (r.rotated) console.log("::warning::Figma returned a new refresh token. Update FIGMA_MCP_REFRESH_TOKEN, or the next run will fail.");
    return 0;
  }
  if (cmd === "revoke") {
    const r = await refresh(fromEnv());
    console.log(`::add-mask::${r.accessToken}`);
    console.log("Figma MCP token replaced; the token used in this run no longer works.");
    return 0;
  }
  console.error("Usage: figma-mcp-token.mjs issue <out-file> | revoke");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
