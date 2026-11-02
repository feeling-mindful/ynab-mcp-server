import {
  OAuthConfigError,
  clientIdHash,
  isAllowedYnabUser,
  issueTokens,
  oauthConfig,
  oauthError,
  sha256Base64Url,
  safeEqual,
  verify,
  jsonResponse,
  unseal,
} from "../../lib/oauth";
import { refreshYnabGrant } from "../../lib/ynab-oauth";

export const dynamic = "force-dynamic";

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
    if (!code || code.client_id_hash !== cid || code.resource !== cfg.resource || !isAllowedYnabUser(code.uid, cfg)) {
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
    const accessToken = unseal("ynab-access", code.yat, cfg.signingSecret);
    const refreshToken = unseal("ynab-refresh", code.yrt, cfg.signingSecret);
    if (!accessToken || !refreshToken || code.yexp - 60 <= Math.floor(Date.now() / 1000)) {
      return oauthError("invalid_grant", "Invalid or expired code");
    }
    return jsonResponse(
      issueTokens(clientId, code.scope, cfg, { userId: code.uid, accessToken, refreshToken, expiresAt: code.yexp }),
    );
  }

  if (grantType === "refresh_token") {
    const refresh = verify("refresh", form.get("refresh_token"), cfg.signingSecret);
    if (!refresh || refresh.client_id_hash !== cid || refresh.aud !== cfg.resource || !isAllowedYnabUser(refresh.uid, cfg)) {
      return oauthError("invalid_grant", "Invalid or expired refresh token");
    }
    const ynabRefreshToken = unseal("ynab-refresh", refresh.yrt, cfg.signingSecret);
    if (!ynabRefreshToken) return oauthError("invalid_grant", "Invalid or expired refresh token");

    // Refresh the YNAB grant too. If YNAB says the grant is gone (revoked in
    // YNAB, or the refresh token was already used), answer invalid_grant so
    // Claude runs the sign-in again.
    const ynab = await refreshYnabGrant(cfg, ynabRefreshToken);
    if (!ynab.ok) {
      return ynab.error === "invalid_grant"
        ? oauthError("invalid_grant", "The YNAB sign-in is no longer valid")
        : oauthError("temporarily_unavailable", "YNAB didn't respond; try again", 503);
    }
    return jsonResponse(issueTokens(clientId, refresh.scope, cfg, { userId: refresh.uid, ...ynab.value }));
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token");
}
