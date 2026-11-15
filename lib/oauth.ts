/**
 * Minimal single-user OAuth 2.1 authorization server for the YNAB MCP server.
 *
 * Stateless: client IDs, authorization codes, access tokens and refresh tokens
 * are all HMAC-signed blobs, so nothing needs a database. Rotating
 * OAUTH_SIGNING_SECRET revokes every OAuth client and token at once without
 * touching MCP_API_KEY, if one is set.
 *
 * Sign-in is delegated to YNAB: /authorize sends the browser through YNAB's
 * OAuth authorization code grant (with PKCE), and a code is issued only when
 * the YNAB user id matches ALLOWED_YNAB_USER_ID. The YNAB access and refresh
 * tokens travel AES-256-GCM encrypted inside the tokens this server issues, so
 * there is still no database, and the server acts with that sign-in's own
 * YNAB token instead of a stored personal access token.
 *
 * Env vars:
 *   MCP_PUBLIC_URL           Public base URL, e.g. https://example.vercel.app (no trailing slash)
 *   OAUTH_SIGNING_SECRET     Long random secret; signs everything and derives the encryption key
 *   YNAB_OAUTH_CLIENT_ID     Client ID of the YNAB OAuth application
 *   YNAB_OAUTH_CLIENT_SECRET Client secret of the YNAB OAuth application
 *   ALLOWED_YNAB_USER_ID     The one YNAB user id allowed to sign in
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days
export const AUTH_CODE_TTL = 120; // 2 minutes
export const YNAB_LOGIN_TTL = 600; // 10 minutes to finish signing in at YNAB
export const SCOPE = "ynab";
export const MIN_SECRET_LENGTH = 32;

// Redirect URIs a client may register. claude.ai (web, desktop, mobile) uses the
// fixed callback; Claude Code uses a loopback redirect on a random port.
const HOSTED_CALLBACKS = new Set(["https://claude.ai/api/mcp/auth_callback"]);
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?\/callback$/;

export class OAuthConfigError extends Error {}

export function oauthConfig() {
  const baseUrl = process.env.MCP_PUBLIC_URL?.replace(/\/+$/, "");
  const signingSecret = process.env.OAUTH_SIGNING_SECRET;
  const ynabClientId = process.env.YNAB_OAUTH_CLIENT_ID?.trim();
  const ynabClientSecret = process.env.YNAB_OAUTH_CLIENT_SECRET?.trim();
  const allowedYnabUserId = process.env.ALLOWED_YNAB_USER_ID?.trim().toLowerCase();
  if (!baseUrl || !signingSecret || !ynabClientId || !ynabClientSecret || !allowedYnabUserId) {
    throw new OAuthConfigError(
      "OAuth is not configured: set MCP_PUBLIC_URL, OAUTH_SIGNING_SECRET, YNAB_OAUTH_CLIENT_ID, YNAB_OAUTH_CLIENT_SECRET and ALLOWED_YNAB_USER_ID.",
    );
  }
  if (signingSecret.length < MIN_SECRET_LENGTH) {
    throw new OAuthConfigError(`OAUTH_SIGNING_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return {
    baseUrl,
    signingSecret,
    ynabClientId,
    ynabClientSecret,
    allowedYnabUserId,
    ynabRedirectUri: `${baseUrl}/ynab/callback`,
    issuer: baseUrl,
    resource: `${baseUrl}/mcp`,
  };
}

export type OAuthConfig = ReturnType<typeof oauthConfig>;

/** YNAB user ids are UUIDs; compare them case-insensitively and in constant time. */
export function isAllowedYnabUser(userId: unknown, cfg: OAuthConfig): boolean {
  return typeof userId === "string" && safeEqual(userId.toLowerCase(), cfg.allowedYnabUserId);
}

export function isOAuthConfigured(): boolean {
  try {
    oauthConfig();
    return true;
  } catch {
    return false;
  }
}

function parseUrl(uri: string): URL | undefined {
  try {
    return new URL(uri);
  } catch {
    return undefined; // e.g. a loopback port above 65535
  }
}

function isLoopback(uri: string): boolean {
  return LOOPBACK.test(uri) && parseUrl(uri) !== undefined;
}

export function isAllowedRedirectUri(uri: string): boolean {
  return HOSTED_CALLBACKS.has(uri) || isLoopback(uri);
}

/** Loopback redirects match regardless of port (RFC 8252 section 7.3). */
export function redirectUriMatches(registered: string, presented: string): boolean {
  if (registered === presented) return isAllowedRedirectUri(presented);
  if (!isLoopback(registered) || !isLoopback(presented)) return false;
  const a = parseUrl(registered) as URL;
  const b = parseUrl(presented) as URL;
  return a.hostname === b.hostname && a.pathname === b.pathname;
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export function randomId(): string {
  return randomBytes(16).toString("base64url");
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Signed blobs. Each kind gets its own derived key, so a token of one kind can
// never be replayed as another (e.g. a client_id used as an access token).
// ---------------------------------------------------------------------------

type Kind = "client" | "code" | "access" | "refresh" | "ystate" | "ycookie";

export interface ClientPayload {
  redirect_uris: string[];
  client_name?: string;
  iat: number;
}

export interface CodePayload {
  client_id_hash: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource: string;
  exp: number;
  jti: string;
  /** YNAB user id that signed in. */
  uid: string;
  /** Encrypted YNAB tokens from the sign-in. */
  yat: string;
  yrt: string;
  /** When the YNAB access token expires (unix seconds). */
  yexp: number;
}

export interface AccessPayload {
  aud: string;
  scope: string;
  client_id_hash: string;
  exp: number;
  jti: string;
  uid: string;
  /** Encrypted YNAB access token. This token never outlives it. */
  yat: string;
}

export interface RefreshPayload {
  aud: string;
  scope: string;
  client_id_hash: string;
  exp: number;
  jti: string;
  uid: string;
  /** Encrypted YNAB refresh token. */
  yrt: string;
}

/** The `state` sent through YNAB: Claude's original request, bound to a nonce. */
export interface YnabStatePayload {
  n: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state?: string;
  exp: number;
}

/** HttpOnly cookie holding the YNAB PKCE verifier and the same nonce. */
export interface YnabCookiePayload {
  n: string;
  v: string;
  exp: number;
}

interface PayloadByKind {
  client: ClientPayload;
  code: CodePayload;
  access: AccessPayload;
  refresh: RefreshPayload;
  ystate: YnabStatePayload;
  ycookie: YnabCookiePayload;
}

function keyFor(kind: Kind, secret: string): Buffer {
  return createHmac("sha256", secret).update(`ynab-mcp-oauth:${kind}`).digest();
}

export function sign<K extends Kind>(kind: K, payload: PayloadByKind[K], secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", keyFor(kind, secret)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<K extends Kind>(
  kind: K,
  token: string | undefined | null,
  secret: string,
): PayloadByKind[K] | undefined {
  if (!token || token.length > 8192) return undefined;
  const parts = token.split(".");
  if (parts.length !== 2) return undefined;
  const [body, mac] = parts;
  const expected = createHmac("sha256", keyFor(kind, secret)).update(body).digest("base64url");
  if (!safeEqual(mac, expected)) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null) return undefined;
    if ("exp" in payload && (typeof payload.exp !== "number" || payload.exp <= nowSeconds())) {
      return undefined;
    }
    return payload as PayloadByKind[K];
  } catch {
    return undefined;
  }
}

export function clientIdHash(clientId: string): string {
  return sha256Base64Url(clientId);
}

// ---------------------------------------------------------------------------
// Encryption for the YNAB tokens carried inside our tokens. AES-256-GCM with a
// key derived from OAUTH_SIGNING_SECRET; the purpose label is bound in as AAD,
// so a ciphertext made for one field can't be swapped into another.
// ---------------------------------------------------------------------------

type Sealed = "ynab-access" | "ynab-refresh";

function encryptionKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", "ynab-mcp-oauth:encryption", 32));
}

export function seal(purpose: Sealed, plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(purpose));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

export function unseal(purpose: Sealed, sealed: unknown, secret: string): string | undefined {
  if (typeof sealed !== "string" || sealed.length > 8192) return undefined;
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 29) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}

export interface YnabGrant {
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
}

/**
 * Issues an access token and a refresh token that carry the YNAB grant. The
 * access token expires a minute before the YNAB access token does, so the
 * client always refreshes (and we refresh YNAB) before the YNAB token dies.
 */
export function issueTokens(clientId: string, scope: string, cfg: OAuthConfig, grant: YnabGrant) {
  const now = nowSeconds();
  const cid = clientIdHash(clientId);
  const exp = Math.min(now + ACCESS_TOKEN_TTL, grant.expiresAt - 60);
  if (exp <= now) throw new Error("YNAB access token is already expired");
  const accessToken = sign(
    "access",
    {
      aud: cfg.resource,
      scope,
      client_id_hash: cid,
      exp,
      jti: randomId(),
      uid: grant.userId,
      yat: seal("ynab-access", grant.accessToken, cfg.signingSecret),
    },
    cfg.signingSecret,
  );
  const refreshToken = sign(
    "refresh",
    {
      aud: cfg.resource,
      scope,
      client_id_hash: cid,
      exp: now + REFRESH_TOKEN_TTL,
      jti: randomId(),
      uid: grant.userId,
      yrt: seal("ynab-refresh", grant.refreshToken, cfg.signingSecret),
    },
    cfg.signingSecret,
  );
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: exp - now,
    refresh_token: refreshToken,
    scope,
  };
}

/**
 * Verifies an OAuth access token presented to the MCP endpoint and returns the
 * YNAB access token it carries. Tokens for any YNAB user other than
 * ALLOWED_YNAB_USER_ID are refused, so changing that env var cuts off old tokens.
 */
export function verifyAccessToken(
  token: string,
): (AccessPayload & { ynabAccessToken: string }) | undefined {
  let cfg;
  try {
    cfg = oauthConfig();
  } catch {
    return undefined; // OAuth disabled.
  }
  const payload = verify("access", token, cfg.signingSecret);
  if (!payload || payload.aud !== cfg.resource || !isAllowedYnabUser(payload.uid, cfg)) return undefined;
  const ynabAccessToken = unseal("ynab-access", payload.yat, cfg.signingSecret);
  if (!ynabAccessToken) return undefined;
  return { ...payload, ynabAccessToken };
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...extraHeaders,
    },
  });
}

export function oauthError(error: string, description: string, status = 400) {
  return jsonResponse({ error, error_description: description }, status);
}

export const METADATA_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};
