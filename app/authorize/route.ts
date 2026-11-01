import {
  AUTH_CODE_TTL,
  OAuthConfigError,
  SCOPE,
  clientIdHash,
  nowSeconds,
  oauthConfig,
  randomId,
  redirectUriMatches,
  safeEqual,
  sign,
  verify,
} from "../../lib/oauth";

// Authorization endpoint. GET shows a password form; POST checks the password
// and redirects back to Claude with a short-lived, PKCE-bound code.

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
};

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function plainError(message: string, status = 400) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Sign-in error</title><body style="font-family:system-ui;padding:2rem"><h1>Can't sign in</h1><p>${escapeHtml(message)}</p></body>`,
    { status, headers: PAGE_HEADERS },
  );
}

type Validated =
  | { ok: true; clientId: string; redirectUri: string; codeChallenge: string; state?: string }
  | { ok: false; response: Response };

/**
 * Validates the request. Errors about the client or redirect URI are shown on
 * the page (never redirected), per OAuth 2.1, so a bad request can't bounce the
 * browser to an unverified URL.
 */
function validate(p: Params, cfg: ReturnType<typeof oauthConfig>): Validated {
  const client = verify("client", p.client_id, cfg.signingSecret);
  if (!client || !p.client_id) return { ok: false, response: plainError("Unknown client.") };
  const redirectUri = p.redirect_uri;
  if (!redirectUri || !client.redirect_uris.some((r) => redirectUriMatches(r, redirectUri))) {
    return { ok: false, response: plainError("This redirect address isn't registered for this client.") };
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

function formPage(p: Params, redirectUri: string, error?: string, status = 200) {
  const hidden = PARAMS.filter((k) => p[k] !== undefined)
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(p[k] as string)}">`)
    .join("");
  const host = new URL(redirectUri).host;
  return new Response(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to YNAB MCP</title></head>
<body style="font-family:system-ui;max-width:420px;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.4rem">Connect your YNAB budget</h1>
<p><strong>${escapeHtml(host)}</strong> is asking for access to your budget through this server.</p>
${error ? `<p role="alert" style="color:#b00020">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/authorize">
${hidden}
<label for="password">Server password</label><br>
<input id="password" name="password" type="password" autocomplete="current-password" required autofocus
  style="width:100%;padding:.5rem;margin:.25rem 0 1rem;font-size:1rem">
<button type="submit" style="padding:.5rem 1rem;font-size:1rem">Allow access</button>
</form>
</body></html>`,
    { status, headers: PAGE_HEADERS },
  );
}

function readParams(source: URLSearchParams | FormData): Params {
  const p: Params = {};
  for (const k of PARAMS) {
    const v = source.get(k);
    if (typeof v === "string") p[k] = v.slice(0, 4096);
  }
  return p;
}

function config() {
  try {
    return oauthConfig();
  } catch (error) {
    if (error instanceof OAuthConfigError) return undefined;
    throw error;
  }
}

export function GET(req: Request) {
  const cfg = config();
  if (!cfg) return plainError("OAuth sign-in isn't set up on this server.", 503);
  const p = readParams(new URL(req.url).searchParams);
  const v = validate(p, cfg);
  if (!v.ok) return v.response;
  return formPage(p, v.redirectUri);
}

export async function POST(req: Request) {
  const cfg = config();
  if (!cfg) return plainError("OAuth sign-in isn't set up on this server.", 503);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return plainError("Bad form submission.");
  }
  const p = readParams(form);
  const v = validate(p, cfg);
  if (!v.ok) return v.response;

  const password = form.get("password");
  if (typeof password !== "string" || !safeEqual(password, cfg.loginPassword)) {
    // Slow down guessing. Not a full rate limit, so the password must be long and random.
    await new Promise((r) => setTimeout(r, 1500));
    console.warn("OAuth sign-in: wrong password");
    return formPage(p, v.redirectUri, "That password didn't work.", 401);
  }

  const code = sign(
    "code",
    {
      client_id_hash: clientIdHash(v.clientId),
      redirect_uri: v.redirectUri,
      code_challenge: v.codeChallenge,
      scope: SCOPE,
      resource: cfg.resource,
      exp: nowSeconds() + AUTH_CODE_TTL,
      jti: randomId(),
    },
    cfg.signingSecret,
  );

  const url = new URL(v.redirectUri);
  url.searchParams.set("code", code);
  if (v.state) url.searchParams.set("state", v.state);
  url.searchParams.set("iss", cfg.issuer);
  // 303 so the browser follows with GET.
  return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "no-store" } });
}
