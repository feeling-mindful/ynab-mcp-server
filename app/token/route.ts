import {
  OAuthConfigError,
  clientIdHash,
  issueTokens,
  oauthConfig,
  oauthError,
  sha256Base64Url,
  safeEqual,
  verify,
  jsonResponse,
} from "../../lib/oauth";

// Token endpoint: authorization_code (with PKCE) and refresh_token grants.
export async function POST(req: Request) {
  let cfg;
  try {
    cfg = oauthConfig();
  } catch (error) {
    if (error instanceof OAuthConfigError) return oauthError("temporarily_unavailable", "OAuth is not configured", 503);
    throw error;
  }

  let form: URLSearchParams;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await req.json()) as Record<string, unknown>;
      form = new URLSearchParams(
        Object.entries(json).filter(([, v]) => typeof v === "string") as [string, string][],
      );
    } else {
      form = new URLSearchParams(await req.text());
    }
  } catch {
    return oauthError("invalid_request", "Could not read the request body");
  }

  const grantType = form.get("grant_type");
  const clientId = form.get("client_id");
  if (!clientId || !verify("client", clientId, cfg.signingSecret)) {
    return oauthError("invalid_client", "Unknown client", 401);
  }
  const cid = clientIdHash(clientId);

  if (grantType === "authorization_code") {
    const code = verify("code", form.get("code"), cfg.signingSecret);
    const redirectUri = form.get("redirect_uri");
    const verifier = form.get("code_verifier");
    if (!code || code.client_id_hash !== cid || code.resource !== cfg.resource) {
      return oauthError("invalid_grant", "Invalid or expired code");
    }
    // RFC 6749 4.1.3: must be identical to the redirect_uri sent to /authorize,
    // which is what the code is bound to (no loopback port leniency here).
    if (!redirectUri || redirectUri !== code.redirect_uri) {
      return oauthError("invalid_grant", "redirect_uri does not match");
    }
    if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !safeEqual(sha256Base64Url(verifier), code.code_challenge)) {
      return oauthError("invalid_grant", "PKCE verification failed");
    }
    return jsonResponse(issueTokens(clientId, code.scope, cfg));
  }

  if (grantType === "refresh_token") {
    const refresh = verify("refresh", form.get("refresh_token"), cfg.signingSecret);
    if (!refresh || refresh.client_id_hash !== cid || refresh.aud !== cfg.resource) {
      return oauthError("invalid_grant", "Invalid or expired refresh token");
    }
    return jsonResponse(issueTokens(clientId, refresh.scope, cfg));
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token");
}
