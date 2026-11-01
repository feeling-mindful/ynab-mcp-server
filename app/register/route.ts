import {
  OAuthConfigError,
  isAllowedRedirectUri,
  jsonResponse,
  nowSeconds,
  oauthConfig,
  oauthError,
  sign,
} from "../../lib/oauth";

// RFC 7591 dynamic client registration. Stateless: the client_id is a signed
// record of the allowed redirect URIs. Only Claude's own callbacks are accepted,
// so nobody can register a client that sends codes to their own site.
export async function POST(req: Request) {
  let cfg;
  try {
    cfg = oauthConfig();
  } catch (error) {
    if (error instanceof OAuthConfigError) return oauthError("temporarily_unavailable", "OAuth is not configured", 503);
    throw error;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON");
  }

  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > 10 ||
    !redirectUris.every((u) => typeof u === "string" && isAllowedRedirectUri(u))
  ) {
    return oauthError("invalid_redirect_uri", "Only Claude's callback URLs can be registered");
  }

  const authMethod = body.token_endpoint_auth_method ?? "none";
  if (authMethod !== "none") {
    return oauthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method=none) are supported");
  }

  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : undefined;
  const issuedAt = nowSeconds();
  const clientId = sign(
    "client",
    { redirect_uris: redirectUris as string[], client_name: clientName, iat: issuedAt },
    cfg.signingSecret,
  );

  return jsonResponse(
    {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}
