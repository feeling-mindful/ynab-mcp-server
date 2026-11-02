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
import { grant, restoreEnv, saveAndClearEnv, setOAuthEnv } from './oauthTestUtils';

const START = new Date('2026-01-01T00:00:00Z');
const req = new Request('https://example.test/mcp');

describe('OAuth token expiry', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveAndClearEnv();
    setOAuthEnv();
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv(saved);
  });

  const advance = (seconds: number) => vi.setSystemTime(START.getTime() + seconds * 1000);

  it('access token: valid until its last second, rejected at and after expiry (also via verifyBearer)', async () => {
    const cfg = oauthConfig();
    const { access_token } = issueTokens('c', 'ynab', cfg, grant());

    advance(ACCESS_TOKEN_TTL - 1);
    expect(verify('access', access_token, cfg.signingSecret)).toBeDefined();
    expect(await verifyBearer(req, access_token)).toBeDefined();

    advance(ACCESS_TOKEN_TTL);
    expect(verify('access', access_token, cfg.signingSecret)).toBeUndefined();
    expect(await verifyBearer(req, access_token)).toBeUndefined();

    advance(ACCESS_TOKEN_TTL + 1);
    expect(await verifyBearer(req, access_token)).toBeUndefined();
  });

  it('access token never outlives the YNAB token it carries', async () => {
    const cfg = oauthConfig();
    const ynabExpiresIn = 600;
    const issued = issueTokens('c', 'ynab', cfg, grant({ expiresAt: nowSeconds() + ynabExpiresIn }));
    expect(issued.expires_in).toBe(ynabExpiresIn - 60);

    advance(ynabExpiresIn - 61);
    expect(await verifyBearer(req, issued.access_token)).toBeDefined();
    advance(ynabExpiresIn - 60);
    expect(await verifyBearer(req, issued.access_token)).toBeUndefined();
  });

  it('refuses to issue tokens for a YNAB token about to expire', () => {
    expect(() => issueTokens('c', 'ynab', oauthConfig(), grant({ expiresAt: nowSeconds() + 30 }))).toThrow();
  });

  it('refresh token: valid until its last second, rejected at and after expiry', () => {
    const cfg = oauthConfig();
    const { refresh_token } = issueTokens('c', 'ynab', cfg, grant());

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
