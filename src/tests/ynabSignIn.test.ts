import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { oauthConfig, sign } from '../../lib/oauth';
import { verifyBearer } from '../../lib/verify-bearer';
import { GET as authorize } from '../../app/authorize/route';
import { GET as callback } from '../../app/ynab/callback/route';
import { POST as token } from '../../app/token/route';
import { ALLOWED_USER, OTHER_USER, restoreEnv, saveAndClearEnv, setOAuthEnv } from './oauthTestUtils';

const BASE = 'https://example.test';
const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const b64url = (b: Buffer) => b.toString('base64url');

function pkce() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

function registeredClient() {
  return sign('client', { redirect_uris: [CLAUDE_CALLBACK], iat: 0 }, oauthConfig().signingSecret);
}

interface YnabStub {
  userId: string;
  tokenStatus?: number;
  refreshStatus?: number;
  refreshError?: string;
  calls: { url: string; body?: URLSearchParams; auth?: string | null }[];
}

function stubYnab(stub: YnabStub) {
  let issued = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? new URLSearchParams(init.body) : undefined;
    const auth = new Headers(init?.headers).get('authorization');
    stub.calls.push({ url, body, auth });
    if (url === 'https://app.ynab.com/oauth/token') {
      const isRefresh = body?.get('grant_type') === 'refresh_token';
      const status = isRefresh ? stub.refreshStatus ?? 200 : stub.tokenStatus ?? 200;
      if (status !== 200) {
        const error = isRefresh ? stub.refreshError ?? 'invalid_grant' : 'invalid_grant';
        return new Response(JSON.stringify({ error }), { status });
      }
      issued += 1;
      return Response.json({
        access_token: `ynab-access-${issued}`,
        token_type: 'bearer',
        expires_in: 7200,
        refresh_token: `ynab-refresh-${issued}`,
      });
    }
    if (url === 'https://api.ynab.com/v1/user') {
      return Response.json({ data: { user: { id: stub.userId } } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
}

/** Runs /authorize and returns what the browser would carry to the callback. */
function startSignIn(clientId: string, claudePkce = pkce(), state = 'claude-state') {
  const url = new URL(`${BASE}/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', CLAUDE_CALLBACK);
  url.searchParams.set('code_challenge', claudePkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  const res = authorize(new Request(url));
  const location = new URL(res.headers.get('location') ?? '');
  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0];
  return { res, location, setCookie, cookie, ynabState: location.searchParams.get('state') ?? '', claudePkce };
}

function finish(ynabState: string, cookie: string, code = 'ynab-auth-code') {
  const url = new URL(`${BASE}/ynab/callback`);
  url.searchParams.set('code', code);
  url.searchParams.set('state', ynabState);
  return callback(new Request(url, { headers: cookie ? { cookie } : {} }));
}

function tokenRequest(params: Record<string, string>) {
  return token(new Request(`${BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  }));
}

describe('sign in with YNAB', () => {
  let saved: Record<string, string | undefined>;
  let stub: YnabStub;

  beforeEach(() => {
    saved = saveAndClearEnv();
    setOAuthEnv();
    stub = { userId: ALLOWED_USER, calls: [] };
    stubYnab(stub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv(saved);
  });

  it('sends the browser to YNAB with state, PKCE, no scope, and an HttpOnly login cookie', () => {
    const { res, location, setCookie } = startSignIn(registeredClient());
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe('https://app.ynab.com/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('ynab-client-id');
    expect(location.searchParams.get('redirect_uri')).toBe(`${BASE}/ynab/callback`);
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.has('scope')).toBe(false);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Path=\/ynab\/callback/);
  });

  it('allowed YNAB user: full flow issues tokens that carry that user\'s YNAB token', async () => {
    const clientId = registeredClient();
    const s = startSignIn(clientId);
    const res = await finish(s.ynabState, s.cookie);
    expect(res.status).toBe(303);
    const back = new URL(res.headers.get('location') ?? '');
    expect(back.origin + back.pathname).toBe(CLAUDE_CALLBACK);
    expect(back.searchParams.get('state')).toBe('claude-state');
    expect(back.searchParams.get('iss')).toBe(BASE);
    const code = back.searchParams.get('code') ?? '';
    expect(code).not.toBe('');

    // The YNAB leg used PKCE: the verifier sent matches the challenge sent.
    const exchange = stub.calls.find((c) => c.body?.get('grant_type') === 'authorization_code');
    const sentChallenge = s.location.searchParams.get('code_challenge');
    const verifier = exchange?.body?.get('code_verifier') ?? '';
    expect(b64url(createHash('sha256').update(verifier).digest())).toBe(sentChallenge);
    expect(exchange?.body?.get('redirect_uri')).toBe(`${BASE}/ynab/callback`);

    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: CLAUDE_CALLBACK,
      code_verifier: s.claudePkce.verifier,
    });
    expect(tokens.status).toBe(200);
    const body = await tokens.json();
    const info = await verifyBearer(new Request(`${BASE}/mcp`), body.access_token);
    expect(info?.extra?.ynabToken).toBe('ynab-access-1');
  });

  it('other YNAB user: refused, no code issued', async () => {
    stub.userId = OTHER_USER;
    const s = startSignIn(registeredClient());
    const res = await finish(s.ynabState, s.cookie);
    expect(res.status).toBe(403);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain(OTHER_USER);
  });

  it('tampered state: refused before anything is sent to YNAB', async () => {
    const s = startSignIn(registeredClient());
    const tampered = s.ynabState.slice(0, -2) + (s.ynabState.endsWith('A') ? 'BB' : 'AA');
    const res = await finish(tampered, s.cookie);
    expect(res.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });

  it('state from another browser (no or different login cookie): refused', async () => {
    const a = startSignIn(registeredClient());
    const b = startSignIn(registeredClient());
    expect((await finish(a.ynabState, '')).status).toBe(400);
    expect((await finish(a.ynabState, b.cookie)).status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });

  it('YNAB declining the code sends Claude access_denied', async () => {
    stub.tokenStatus = 400;
    const s = startSignIn(registeredClient());
    const res = await finish(s.ynabState, s.cookie);
    const back = new URL(res.headers.get('location') ?? '');
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.has('code')).toBe(false);
  });

  describe('refresh', () => {
    async function signedIn() {
      const clientId = registeredClient();
      const s = startSignIn(clientId);
      const back = new URL((await finish(s.ynabState, s.cookie)).headers.get('location') ?? '');
      const res = await tokenRequest({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: back.searchParams.get('code') ?? '',
        redirect_uri: CLAUDE_CALLBACK,
        code_verifier: s.claudePkce.verifier,
      });
      return { clientId, tokens: await res.json() };
    }

    it('refreshes the YNAB grant and carries the new YNAB token', async () => {
      const { clientId, tokens } = await signedIn();
      const res = await tokenRequest({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token });
      expect(res.status).toBe(200);
      const next = await res.json();
      const refreshCall = stub.calls.find((c) => c.body?.get('grant_type') === 'refresh_token');
      expect(refreshCall?.body?.get('refresh_token')).toBe('ynab-refresh-1');
      const info = await verifyBearer(new Request(`${BASE}/mcp`), next.access_token);
      expect(info?.extra?.ynabToken).toBe('ynab-access-2');
    });

    it('revoked YNAB grant: invalid_grant, so Claude signs in again', async () => {
      const { clientId, tokens } = await signedIn();
      stub.refreshStatus = 400;
      const res = await tokenRequest({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid_grant');
    });

    it('YNAB down: temporarily_unavailable, not invalid_grant', async () => {
      const { clientId, tokens } = await signedIn();
      stub.refreshStatus = 503;
      const res = await tokenRequest({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token });
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe('temporarily_unavailable');
    });

    it('wrong client secret: temporarily_unavailable, not a sign-in loop', async () => {
      const { clientId, tokens } = await signedIn();
      stub.refreshStatus = 401;
      stub.refreshError = 'invalid_client';
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const res = await tokenRequest({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token });
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe('temporarily_unavailable');
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain('invalid_client');
      expect(String(warn.mock.calls[0][0])).not.toContain('ynab-client-secret');
      warn.mockRestore();
    });

    it('tampered refresh token: refused without calling YNAB', async () => {
      const { clientId, tokens } = await signedIn();
      const before = stub.calls.length;
      const res = await tokenRequest({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token + 'x' });
      expect((await res.json()).error).toBe('invalid_grant');
      expect(stub.calls.length).toBe(before);
    });
  });
});
