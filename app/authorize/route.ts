import {
  OAuthConfigError,
  YNAB_LOGIN_TTL,
  nowSeconds,
  oauthConfig,
  randomId,
  redirectUriMatches,
  sha256Base64Url,
  sign,
  verify,
  type OAuthConfig,
} from "../../lib/oauth";
import { LOGIN_COOKIE, LOGIN_COOKIE_PATH, errorPage } from "../../lib/pages";
import { ynabAuthorizeUrl } from "../../lib/ynab-oauth";

// Authorization endpoint. Checks Claude's request, then sends the browser to
// sign in with YNAB. The answer comes back to /ynab/callback.

export const dynamic = "force-dynamic";

/** Longest parameter we accept. Values are never cut short, since a changed state would fail Claude's own check. */
const MAX_PARAM_LENGTH = 2048;
/** verify() refuses signed values longer than this, so the callback would refuse a longer state. */
const MAX_SIGNED_LENGTH = 8192;

const PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;
type Params = Partial<Record<(typeof PARAMS)[number], string>>;

type Validated =
  | { ok: true; clientId: string; redirectUri: string; codeChallenge: string; state?: string }
  | { ok: false; response: Response };

/**
 * Errors about the client or redirect URI are shown on the page (never
 * redirected), per OAuth 2.1, so a bad request can't bounce the browser to an
 * unverified URL.
 */
function validate(p: Params, cfg: OAuthConfig): Validated {
  const client = verify("client", p.client_id, cfg.signingSecret);
  if (!client || !p.client_id) return { ok: false, response: errorPage("Unknown client.") };
  const redirectUri = p.redirect_uri;
  if (!redirectUri || !client.redirect_uris.some((r) => redirectUriMatches(r, redirectUri))) {
    return { ok: false, response: errorPage("This redirect address isn't registered for this client.") };
  }

  const bounce = (error: string, description: string): Validated => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (p.state) url.searchParams.set("state", p.state);
    url.searchParams.set("iss", cfg.issuer);
    return { ok: false, response: Response.redirect(url.toString(), 302) };
  };

  if (p.response_type !== "code") return bounce("unsupported_response_type", "Only response_type=code is supported");
  if (p.code_challenge_method !== "S256" || !p.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge)) {
    return bounce("invalid_request", "PKCE with S256 is required");
  }
  if (p.resource && p.resource.replace(/\/+$/, "") !== cfg.resource) {
    return bounce("invalid_target", "Unknown resource");
  }
  return { ok: true, clientId: p.client_id, redirectUri, codeChallenge: p.code_challenge, state: p.state };
}

export function GET(req: Request) {
  let cfg: OAuthConfig;
  try {
    cfg = oauthConfig();
  } catch (error) {
    if (error instanceof OAuthConfigError) return errorPage("OAuth sign-in isn't set up on this server.", 503);
    throw error;
  }

  const search = new URL(req.url).searchParams;
  const p: Params = {};
  for (const k of PARAMS) {
    const v = search.get(k);
    if (v === null) continue;
    if (v.length > MAX_PARAM_LENGTH) return errorPage("This sign-in request is too long.");
    p[k] = v;
  }
  const v = validate(p, cfg);
  if (!v.ok) return v.response;

  // The state carries Claude's request through YNAB; the cookie carries the
  // PKCE verifier. Both hold the same nonce, so a state only works in the
  // browser that started the sign-in.
  const nonce = randomId();
  const exp = nowSeconds() + YNAB_LOGIN_TTL;
  const verifier = randomBytesVerifier();
  const state = sign(
    "ystate",
    { n: nonce, client_id: v.clientId, redirect_uri: v.redirectUri, code_challenge: v.codeChallenge, state: v.state, exp },
    cfg.signingSecret,
  );
  if (state.length > MAX_SIGNED_LENGTH) return errorPage("This sign-in request is too long.");
  const cookie = sign("ycookie", { n: nonce, v: verifier, exp }, cfg.signingSecret);

  return new Response(null, {
    status: 302,
    headers: {
      Location: ynabAuthorizeUrl(cfg, state, sha256Base64Url(verifier)),
      "Set-Cookie": `${LOGIN_COOKIE}=${cookie}; Path=${LOGIN_COOKIE_PATH}; Max-Age=${YNAB_LOGIN_TTL}; HttpOnly; Secure; SameSite=Lax`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** 43+ characters from the PKCE alphabet. */
function randomBytesVerifier(): string {
  return randomId() + randomId() + randomId();
}
