import {
  AUTH_CODE_TTL,
  OAuthConfigError,
  SCOPE,
  clientIdHash,
  isAllowedYnabUser,
  nowSeconds,
  oauthConfig,
  randomId,
  safeEqual,
  seal,
  sign,
  verify,
  type OAuthConfig,
  type YnabStatePayload,
} from "../../../lib/oauth";
import { LOGIN_COOKIE, LOGIN_COOKIE_PATH, errorPage } from "../../../lib/pages";
import { exchangeYnabCode, fetchYnabUserId } from "../../../lib/ynab-oauth";

// YNAB redirects here after sign-in. Checks the state against the login
// cookie, swaps YNAB's code for tokens, checks the YNAB user is the allowed
// one, then sends Claude a short-lived code that carries the YNAB grant.

export const dynamic = "force-dynamic";

const CLEAR_COOKIE = `${LOGIN_COOKIE}=; Path=${LOGIN_COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

function backToClient(cfg: OAuthConfig, st: YnabStatePayload, params: Record<string, string>) {
  const url = new URL(st.redirect_uri);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (st.state) url.searchParams.set("state", st.state);
  url.searchParams.set("iss", cfg.issuer);
  // 303 so the browser follows with GET.
  return new Response(null, {
    status: 303,
    headers: { Location: url.toString(), "Cache-Control": "no-store", "Set-Cookie": CLEAR_COOKIE },
  });
}

export async function GET(req: Request) {
  let cfg: OAuthConfig;
  try {
    cfg = oauthConfig();
  } catch (error) {
    if (error instanceof OAuthConfigError) return errorPage("OAuth sign-in isn't set up on this server.", 503);
    throw error;
  }

  const search = new URL(req.url).searchParams;
  const st = verify("ystate", search.get("state"), cfg.signingSecret);
  const ck = verify("ycookie", readCookie(req, LOGIN_COOKIE), cfg.signingSecret);
  if (!st || !ck || !safeEqual(st.n, ck.n)) {
    return errorPage(
      "This sign-in link is invalid or has expired, or it was started in another browser. Start again from Claude.",
      400,
      { "Set-Cookie": CLEAR_COOKIE },
    );
  }

  // The person declined at YNAB, or YNAB refused the request.
  if (search.get("error")) {
    return backToClient(cfg, st, { error: "access_denied", error_description: "YNAB sign-in was not completed" });
  }

  const ynabCode = search.get("code");
  if (!ynabCode || ynabCode.length > 2048) {
    return backToClient(cfg, st, { error: "access_denied", error_description: "No code from YNAB" });
  }

  const tokens = await exchangeYnabCode(cfg, ynabCode, ck.v);
  if (!tokens.ok) {
    return tokens.error === "unavailable"
      ? backToClient(cfg, st, { error: "temporarily_unavailable", error_description: "YNAB didn't respond; try again" })
      : backToClient(cfg, st, { error: "access_denied", error_description: "YNAB rejected the sign-in" });
  }

  const user = await fetchYnabUserId(tokens.value.accessToken);
  if (!user.ok) {
    return backToClient(cfg, st, { error: "temporarily_unavailable", error_description: "Couldn't read the YNAB account" });
  }
  if (!isAllowedYnabUser(user.value, cfg)) {
    // Shown only to whoever just signed in, so they can see which account it was.
    console.warn("OAuth sign-in refused: YNAB user is not ALLOWED_YNAB_USER_ID");
    return errorPage(
      `This server only accepts one YNAB account, and you signed in as YNAB user ${user.value}. If that's your account, set ALLOWED_YNAB_USER_ID to it.`,
      403,
      { "Set-Cookie": CLEAR_COOKIE },
    );
  }

  const code = sign(
    "code",
    {
      client_id_hash: clientIdHash(st.client_id),
      redirect_uri: st.redirect_uri,
      code_challenge: st.code_challenge,
      scope: SCOPE,
      resource: cfg.resource,
      exp: nowSeconds() + AUTH_CODE_TTL,
      jti: randomId(),
      uid: user.value,
      yat: seal("ynab-access", tokens.value.accessToken, cfg.signingSecret),
      yrt: seal("ynab-refresh", tokens.value.refreshToken, cfg.signingSecret),
      yexp: tokens.value.expiresAt,
    },
    cfg.signingSecret,
  );
  return backToClient(cfg, st, { code });
}
