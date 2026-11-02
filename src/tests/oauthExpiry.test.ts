import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ACCESS_TOKEN_TTL,
  AUTH_CODE_TTL,
  REFRESH_TOKEN_TTL,
  issueTokens,
  nowSeconds,
  oauthConfig,
  sign,
  verify,
} from '../../lib/oauth';
import { verifyBearer } from '../../lib/verify-bearer';

const ENV_KEYS = ['MCP_API_KEY', 'MCP_PUBLIC_URL', 'OAUTH_SIGNING_SECRET', 'OAUTH_LOGIN_PASSWORD'] as const;
const START = new Date('2026-01-01T00:00:00Z');
const req = new Request('https://example.test/mcp');

describe('OAuth token expiry', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    delete process.env.MCP_API_KEY;
    process.env.MCP_PUBLIC_URL = 'https://example.test';
    process.env.OAUTH_SIGNING_SECRET = 's'.repeat(40);
    process.env.OAUTH_LOGIN_PASSWORD = 'p'.repeat(40);
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const advance = (seconds: number) => vi.setSystemTime(START.getTime() + seconds * 1000);

  it('access token: valid until its last second, rejected at and after expiry (also via verifyBearer)', async () => {
    const cfg = oauthConfig();
    const { access_token } = issueTokens('c', 'ynab', cfg);

    advance(ACCESS_TOKEN_TTL - 1);
    expect(verify('access', access_token, cfg.signingSecret)).toBeDefined();
    expect(await verifyBearer(req, access_token)).toBeDefined();

    advance(ACCESS_TOKEN_TTL);
    expect(verify('access', access_token, cfg.signingSecret)).toBeUndefined();
    expect(await verifyBearer(req, access_token)).toBeUndefined();

    advance(ACCESS_TOKEN_TTL + 1);
    expect(await verifyBearer(req, access_token)).toBeUndefined();
  });

  it('refresh token: valid until its last second, rejected at and after expiry', () => {
    const cfg = oauthConfig();
    const { refresh_token } = issueTokens('c', 'ynab', cfg);

    advance(REFRESH_TOKEN_TTL - 1);
    expect(verify('refresh', refresh_token, cfg.signingSecret)).toBeDefined();
    advance(REFRESH_TOKEN_TTL);
    expect(verify('refresh', refresh_token, cfg.signingSecret)).toBeUndefined();
    advance(REFRESH_TOKEN_TTL + 1);
    expect(verify('refresh', refresh_token, cfg.signingSecret)).toBeUndefined();
  });

  it('authorization code: valid until its last second, rejected at and after expiry', () => {
    const cfg = oauthConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = sign('code', { exp: nowSeconds() + AUTH_CODE_TTL } as any, cfg.signingSecret);

    advance(AUTH_CODE_TTL - 1);
    expect(verify('code', code, cfg.signingSecret)).toBeDefined();
    advance(AUTH_CODE_TTL);
    expect(verify('code', code, cfg.signingSecret)).toBeUndefined();
    advance(AUTH_CODE_TTL + 1);
    expect(verify('code', code, cfg.signingSecret)).toBeUndefined();
  });
});
