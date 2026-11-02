import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { isOAuthConfigured, safeEqual, verifyAccessToken } from "./oauth";

/**
 * Checks the bearer token sent to the MCP endpoint.
 *
 * Two ways in, each enabled only by its own env vars:
 * - MCP_API_KEY: a fixed key, for clients that can only send a static bearer.
 *   Optional. Leave it unset to accept OAuth tokens only.
 * - OAuth access tokens from "sign in with YNAB", used by claude.ai custom
 *   connectors. Each carries the signed-in user's own YNAB token.
 *
 * Fails closed: throws if neither is configured, so a misconfigured
 * deployment never serves the budget without auth.
 */
export async function verifyBearer(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  const apiKey = process.env.MCP_API_KEY || undefined;
  if (!apiKey && !isOAuthConfigured()) {
    throw new Error(
      "Set the OAuth env vars (MCP_PUBLIC_URL, OAUTH_SIGNING_SECRET, YNAB_OAUTH_CLIENT_ID, YNAB_OAUTH_CLIENT_SECRET, ALLOWED_YNAB_USER_ID) and/or MCP_API_KEY.",
    );
  }
  if (!bearerToken) return undefined;

  if (apiKey && safeEqual(bearerToken, apiKey)) {
    return {
      token: bearerToken,
      scopes: ["ynab:full"],
      clientId: "ynab-mcp-server",
      // The static key acts with the stored personal access token.
      extra: { ynabToken: process.env.YNAB_API_TOKEN },
    };
  }

  const oauth = verifyAccessToken(bearerToken);
  if (oauth) {
    return {
      token: bearerToken,
      scopes: oauth.scope.split(" "),
      clientId: `oauth:${oauth.client_id_hash.slice(0, 12)}`,
      expiresAt: oauth.exp,
      extra: { ynabToken: oauth.ynabAccessToken },
    };
  }

  return undefined;
}
