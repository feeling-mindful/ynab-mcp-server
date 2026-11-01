/**
 * Minimal single-user OAuth 2.1 authorization server for the YNAB MCP server.
 *
 * Stateless: client IDs, authorization codes, access tokens and refresh tokens
 * are all HMAC-signed blobs, so nothing needs a database. Rotating
 * OAUTH_SIGNING_SECRET revokes every OAuth client and token at once without
 * touching MCP_API_KEY (which other clients such as Perplexity keep using).
 *
 * Env vars:
 *   MCP_PUBLIC_URL        Public base URL, e.g. https://example.vercel.app (no trailing slash)
 *   OAUTH_SIGNING_SECRET  Long random secret used to sign everything below
 *   OAUTH_LOGIN_PASSWORD  The password typed on the sign-in page
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days
export const AUTH_CODE_TTL = 120; // 2 minutes
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
  const loginPassword = process.env.OAUTH_LOGIN_PASSWORD;
  if (!baseUrl || !signingSecret || !loginPassword) {
    throw new OAuthConfigError(
      "OAuth is not configured: set MCP_PUBLIC_URL, OAUTH_SIGNING_SECRET and OAUTH_LOGIN_PASSWORD.",
    );
  }
  if (signingSecret.length < MIN_SECRET_LENGTH || loginPassword.length < MIN_SECRET_LENGTH) {
    throw new OAuthConfigError(
      `OAUTH_SIGNING_SECRET and OAUTH_LOGIN_PASSWORD must each be at least ${MIN_SECRET_LENGTH} characters.`,
    );
  }
  return {
    baseUrl,
    signingSecret,
    loginPassword,
    issuer: baseUrl,
    resource: `${baseUrl}/mcp`,
  };
}

export function isOAuthConfigured(): boolean {
  try {
    oauthConfig();
    return true;
  } catch {
    return false;
  }
}

export function isAllowedRedirectUri(uri: string): boolean {
  return HOSTED_CALLBACKS.has(uri) || LOOPBACK.test(uri);
}

/** Loopback redirects match regardless of port (RFC 8252 section 7.3). */
export function redirectUriMatches(registered: string, presented: string): boolean {
  if (registered === presented) return true;
  if (!LOOPBACK.test(registered) || !LOOPBACK.test(presented)) return false;
  const a = new URL(registered);
  const b = new URL(presented);
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

type Kind = "client" | "code" | "access" | "refresh";

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
}

export interface AccessPayload {
  aud: string;
  scope: string;
  client_id_hash: string;
  exp: number;
  jti: string;
}

export interface RefreshPayload {
  aud: string;
  scope: string;
  client_id_hash: string;
  exp: number;
  jti: string;
}

interface PayloadByKind {
  client: ClientPayload;
  code: CodePayload;
  access: AccessPayload;
  refresh: RefreshPayload;
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
    if ("exp" in payload && (typeof payload.exp !== "number" || payload.exp < nowSeconds())) {
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

/** Issues an access token and a fresh refresh token for a client. */
export function issueTokens(
  clientId: string,
  scope: string,
  cfg: ReturnType<typeof oauthConfig>,
) {
  const now = nowSeconds();
  const cid = clientIdHash(clientId);
  const accessToken = sign(
    "access",
    { aud: cfg.resource, scope, client_id_hash: cid, exp: now + ACCESS_TOKEN_TTL, jti: randomId() },
    cfg.signingSecret,
  );
  const refreshToken = sign(
    "refresh",
    { aud: cfg.resource, scope, client_id_hash: cid, exp: now + REFRESH_TOKEN_TTL, jti: randomId() },
    cfg.signingSecret,
  );
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
    scope,
  };
}

/** Verifies an OAuth access token presented to the MCP endpoint. */
export function verifyAccessToken(token: string): AccessPayload | undefined {
  let cfg;
  try {
    cfg = oauthConfig();
  } catch {
    return undefined; // OAuth disabled: only MCP_API_KEY works.
  }
  const payload = verify("access", token, cfg.signingSecret);
  if (!payload || payload.aud !== cfg.resource) return undefined;
  return payload;
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
