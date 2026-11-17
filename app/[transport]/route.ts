import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { verifyBearer } from "../../lib/verify-bearer";
import { registerForkServer, type HostServer } from "../../src/fork/registry.js";

/**
 * The token comes from whoever authenticated this request: the signed-in YNAB
 * user for OAuth, or YNAB_API_TOKEN for MCP_API_KEY (see lib/verify-bearer.ts).
 */
function ynabTokenOf(extra: unknown): string | undefined {
  const token = (extra as { authInfo?: { extra?: { ynabToken?: unknown } } } | undefined)?.authInfo?.extra?.ynabToken;
  return typeof token === "string" && token ? token : undefined;
}

const handler = createMcpHandler(
  (server) => {
    // McpServer's registerTool is generic over its schema; the registry only
    // needs the plain (name, config, callback) form of it.
    registerForkServer(server as unknown as HostServer, ynabTokenOf);
  },
  {},
  {
    basePath: "",
    maxDuration: 60,
    verboseLogs: false,
  },
);

const authHandler = withMcpAuth(handler, verifyBearer, {
  required: true,
  // Point the 401's resource_metadata at the configured public URL rather than
  // trusting forwarded host headers.
  resourceUrl: process.env.MCP_PUBLIC_URL?.replace(/\/+$/, "") || undefined,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
