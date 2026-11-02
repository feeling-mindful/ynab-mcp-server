// Small HTML pages for sign-in errors. Locked down: no scripts, no framing.

export const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export function errorPage(message: string, status = 400, extraHeaders: Record<string, string> = {}) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in error</title><body style="font-family:system-ui;max-width:480px;margin:3rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.4rem">Can't sign in</h1><p>${escapeHtml(message)}</p></body>`,
    { status, headers: { ...PAGE_HEADERS, ...extraHeaders } },
  );
}

/** The login cookie: holds the YNAB PKCE verifier, only sent back to the callback. */
export const LOGIN_COOKIE = "__Secure-ynab_mcp_login";
export const LOGIN_COOKIE_PATH = "/ynab/callback";
