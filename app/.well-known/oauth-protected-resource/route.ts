import { METADATA_CORS_HEADERS, OAuthConfigError, jsonResponse, oauthConfig } from "../../../lib/oauth";

export const dynamic = "force-dynamic";

// RFC 9728 protected resource metadata. The MCP endpoint's 401 points here.
export function GET() {
  try {
    const cfg = oauthConfig();
    return jsonResponse(
      {
        resource: cfg.resource,
        authorization_servers: [cfg.issuer],
        scopes_supported: ["ynab"],
        bearer_methods_supported: ["header"],
        resource_name: "YNAB MCP Server",
      },
      200,
      METADATA_CORS_HEADERS,
    );
  } catch (error) {
    if (error instanceof OAuthConfigError) return jsonResponse({ error: "oauth_not_configured" }, 404);
    throw error;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: METADATA_CORS_HEADERS });
}
