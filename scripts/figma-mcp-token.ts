#!/usr/bin/env node
// Short-lived access to Figma's MCP server (mcp.figma.com) for agents in the pipeline.
// The MCP server does not accept personal access tokens: it takes OAuth access tokens issued to an approved client
// (Codex, Claude Code, …). Hugo signs in once with such a client on his machine; the pipeline keeps that grant's
// client id, client secret and refresh token as secrets of the environment `agents`. `refresh` exchanges the refresh token for an
// access token: the Figma gateway (figma-mcp-gateway.ts) calls it at the start of a run and keeps the token in
// memory, and the CLI's `revoke` calls it once more at the end, which replaces the token the gateway held. The token
// is never written to a file. No dependencies (Node 22). Setup: docs/agents/adding-an-agent.md, "Figma in the pipeline".
import { fileURLToPath } from "node:url";

export const DISCOVERY_URL = "https://api.figma.com/.well-known/oauth-authorization-server";

// The token endpoint must be Figma's own, over HTTPS, so a changed discovery document cannot send the secrets elsewhere.
export function checkTokenEndpoint(url: string, allowedOrigin = "https://api.figma.com"): string {
  const u = new URL(url);
  if (u.origin !== allowedOrigin) throw new Error(`Unexpected token endpoint origin ${u.origin}.`);
  return u.toString();
}

export interface RefreshOptions {
  clientId: string | undefined;
  clientSecret?: string | undefined;
  refreshToken: string | undefined;
  discoveryUrl?: string;
  allowedOrigin?: string;
  fetchImpl?: typeof fetch;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: number | null;
  rotated: boolean;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  refresh_token?: string;
  error?: string;
}

export async function refresh({ clientId, clientSecret, refreshToken, discoveryUrl = DISCOVERY_URL, allowedOrigin, fetchImpl = fetch }: RefreshOptions): Promise<RefreshResult> {
  if (!clientId || !refreshToken) throw new Error("FIGMA_MCP_CLIENT_ID and FIGMA_MCP_REFRESH_TOKEN must be set.");
  // Figma advertises client_secret_basic/client_secret_post, not public-client authentication.
  // A successful browser login is insufficient if the client discarded its registration secret.
  if (!clientSecret?.trim()) throw new Error("FIGMA_MCP_CLIENT_SECRET is missing. The pipeline needs the original client secret from the same OAuth registration as the client id and refresh token. Check the grant before storing it; see docs/agents/adding-an-agent.md.");
  // No redirects: a redirect could take the request, and the secrets of the POST below, to another origin.
  const meta = await fetchImpl(discoveryUrl, { redirect: "error" });
  if (!meta.ok) throw new Error(`Figma OAuth discovery failed with ${meta.status}.`);
  const tokenEndpoint = checkTokenEndpoint(((await meta.json()) as { token_endpoint: string }).token_endpoint, allowedOrigin);

  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });
  const res = await fetchImpl(tokenEndpoint, { method: "POST", redirect: "error", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  let json: TokenResponse = {};
  try { json = (await res.json()) as TokenResponse; } catch { /* no body */ }
  // Status and the OAuth error code only: never the request body.
  if (!res.ok || !json.access_token) throw new Error(`Figma token refresh failed with ${res.status}${json.error ? ` (${json.error})` : ""}.`);
  return {
    accessToken: json.access_token,
    expiresIn: Number(json.expires_in) || null,
    // Figma documents refresh tokens as reusable. If one comes back different, the stored secret must be updated.
    rotated: Boolean(json.refresh_token) && json.refresh_token !== refreshToken,
  };
}

function fromEnv(): RefreshOptions {
  return {
    clientId: process.env.FIGMA_MCP_CLIENT_ID,
    clientSecret: process.env.FIGMA_MCP_CLIENT_SECRET || undefined,
    refreshToken: process.env.FIGMA_MCP_REFRESH_TOKEN,
  };
}

// CLI used by agent-run.yml.
//   figma-mcp-token.ts revoke   refreshes once more and drops the result, so the token the gateway held stops working
async function main([cmd]: string[]): Promise<number> {
  if (cmd === "revoke") {
    const r = await refresh(fromEnv());
    console.log(`::add-mask::${r.accessToken}`);
    console.log("Figma MCP token replaced; the token used in this run no longer works.");
    if (r.rotated) console.log("::warning::Figma returned a new refresh token. Update FIGMA_MCP_REFRESH_TOKEN, or the next run will fail.");
    return 0;
  }
  console.error("Usage: figma-mcp-token.ts revoke");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
