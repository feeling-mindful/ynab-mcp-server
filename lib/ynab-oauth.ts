import { nowSeconds, type OAuthConfig } from "./oauth";

// Calls to YNAB's OAuth endpoints and API, kept in one place so tests can stub
// fetch. YNAB tokens are only ever passed through here; nothing is logged.

export const YNAB_AUTHORIZE_URL = "https://app.ynab.com/oauth/authorize";
export const YNAB_TOKEN_URL = "https://app.ynab.com/oauth/token";
export const YNAB_USER_URL = "https://api.ynab.com/v1/user";

export interface YnabTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** invalid_grant: the YNAB grant is gone (revoked, expired, reused). unavailable: try again later. */
export type YnabResult<T> = { ok: true; value: T } | { ok: false; error: "invalid_grant" | "unavailable" };

export function ynabAuthorizeUrl(cfg: OAuthConfig, state: string, codeChallenge: string): string {
  const url = new URL(YNAB_AUTHORIZE_URL);
  url.searchParams.set("client_id", cfg.ynabClientId);
  url.searchParams.set("redirect_uri", cfg.ynabRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // No scope: full access, since writes are switched on server-side by YNAB_ALLOW_WRITES.
  return url.toString();
}

/**
 * Only a grant that YNAB itself calls invalid means the user must sign in again.
 * A client error (wrong client id or secret, bad redirect URI) is our own
 * misconfiguration: report it as unavailable so the user isn't sent round a
 * sign-in loop that can never succeed, and log the error code (never a secret).
 */
async function classifyTokenError(res: Response): Promise<"invalid_grant" | "unavailable"> {
  let code: unknown;
  try {
    code = ((await res.json()) as { error?: unknown }).error;
  } catch {
    code = undefined;
  }
  if (code === "invalid_grant") return "invalid_grant";
  if (code === undefined && res.status === 400) return "invalid_grant";
  console.warn(
    `YNAB token endpoint refused the request (status ${res.status}, error ${typeof code === "string" ? code : "unknown"}); check YNAB_OAUTH_CLIENT_ID, YNAB_OAUTH_CLIENT_SECRET and the redirect URI`,
  );
  return "unavailable";
}

async function tokenRequest(
  params: Record<string, string>,
  previousRefreshToken?: string,
): Promise<YnabResult<YnabTokens>> {
  let res: Response;
  try {
    res = await fetch(YNAB_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(params).toString(),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (res.status >= 500 || res.status === 429) return { ok: false, error: "unavailable" };
  if (!res.ok) return { ok: false, error: await classifyTokenError(res) };
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const accessToken = body.access_token;
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : previousRefreshToken;
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 7200;
  if (typeof accessToken !== "string" || !accessToken || !refreshToken) {
    return { ok: false, error: "invalid_grant" };
  }
  return { ok: true, value: { accessToken, refreshToken, expiresAt: nowSeconds() + expiresIn } };
}

export function exchangeYnabCode(cfg: OAuthConfig, code: string, codeVerifier: string) {
  return tokenRequest({
    client_id: cfg.ynabClientId,
    client_secret: cfg.ynabClientSecret,
    redirect_uri: cfg.ynabRedirectUri,
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
  });
}

export function refreshYnabGrant(cfg: OAuthConfig, refreshToken: string) {
  return tokenRequest(
    {
      client_id: cfg.ynabClientId,
      client_secret: cfg.ynabClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    refreshToken,
  );
}

export async function fetchYnabUserId(accessToken: string): Promise<YnabResult<string>> {
  let res: Response;
  try {
    res = await fetch(YNAB_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (res.status === 401) return { ok: false, error: "invalid_grant" };
  if (!res.ok) return { ok: false, error: "unavailable" };
  try {
    const body = (await res.json()) as { data?: { user?: { id?: unknown } } };
    const id = body.data?.user?.id;
    return typeof id === "string" && id ? { ok: true, value: id } : { ok: false, error: "unavailable" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
