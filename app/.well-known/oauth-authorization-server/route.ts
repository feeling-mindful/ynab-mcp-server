import { METADATA_CORS_HEADERS, OAuthConfigError, jsonResponse, oauthConfig } from "../../../lib/oauth";

export const dynamic = "force-dynamic";

// RFC 8414 authorization server metadata.
export function GET() {
  try {
    const cfg = oauthConfig();
    return jsonResponse(
      {
        issuer: cfg.issuer,
        authorization_endpoint: `${cfg.baseUrl}/authorize`,
        token_endpoint: `${cfg.baseUrl}/token`,
        registration_endpoint: `${cfg.baseUrl}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["ynab"],
        authorization_response_iss_parameter_supported: true,
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
