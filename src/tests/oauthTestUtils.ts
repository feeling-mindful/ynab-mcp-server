// Shared setup for the OAuth tests (not a test file itself).
import { nowSeconds, type YnabGrant } from '../../lib/oauth';

export const OAUTH_ENV_KEYS = [
  'MCP_API_KEY',
  'YNAB_API_TOKEN',
  'MCP_PUBLIC_URL',
  'OAUTH_SIGNING_SECRET',
  'YNAB_OAUTH_CLIENT_ID',
  'YNAB_OAUTH_CLIENT_SECRET',
  'ALLOWED_YNAB_USER_ID',
] as const;

export const ALLOWED_USER = '6d1d2c3e-1111-4a4a-9b9b-abcdefabcdef';
export const OTHER_USER = '0f0f0f0f-2222-4b4b-8c8c-123412341234';

export function saveAndClearEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const k of OAUTH_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  return saved;
}

export function restoreEnv(saved: Record<string, string | undefined>) {
  for (const k of OAUTH_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

export function setOAuthEnv() {
  process.env.MCP_PUBLIC_URL = 'https://example.test';
  process.env.OAUTH_SIGNING_SECRET = 's'.repeat(40);
  process.env.YNAB_OAUTH_CLIENT_ID = 'ynab-client-id';
  process.env.YNAB_OAUTH_CLIENT_SECRET = 'ynab-client-secret';
  process.env.ALLOWED_YNAB_USER_ID = ALLOWED_USER;
}

export function grant(overrides: Partial<YnabGrant> = {}): YnabGrant {
  return {
    userId: ALLOWED_USER,
    accessToken: 'ynab-access-1',
    refreshToken: 'ynab-refresh-1',
    expiresAt: nowSeconds() + 7200,
    ...overrides,
  };
}
