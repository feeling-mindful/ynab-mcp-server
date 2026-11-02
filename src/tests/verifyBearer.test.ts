import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { issueTokens, oauthConfig } from '../../lib/oauth';
import { verifyBearer } from '../../lib/verify-bearer';

const ENV_KEYS = [
  'MCP_API_KEY',
  'MCP_PUBLIC_URL',
  'OAUTH_SIGNING_SECRET',
  'OAUTH_LOGIN_PASSWORD',
] as const;

const req = new Request('https://example.test/mcp');

function setOAuthEnv() {
  process.env.MCP_PUBLIC_URL = 'https://example.test';
  process.env.OAUTH_SIGNING_SECRET = 's'.repeat(40);
  process.env.OAUTH_LOGIN_PASSWORD = 'p'.repeat(40);
}

function accessToken() {
  return issueTokens('test-client', 'ynab', oauthConfig()).access_token;
}

describe('verifyBearer', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('fails closed when neither MCP_API_KEY nor OAuth is configured', async () => {
    await expect(verifyBearer(req, 'anything')).rejects.toThrow();
  });

  it('treats an empty MCP_API_KEY as unset', async () => {
    process.env.MCP_API_KEY = '';
    await expect(verifyBearer(req, '')).rejects.toThrow();
  });

  describe('OAuth only, no MCP_API_KEY', () => {
    beforeEach(setOAuthEnv);

    it('accepts a valid OAuth access token', async () => {
      const token = accessToken();
      const info = await verifyBearer(req, token);
      expect(info?.token).toBe(token);
      expect(info?.clientId).toMatch(/^oauth:/);
      expect(info?.scopes).toEqual(['ynab']);
    });

    it('rejects a missing, random or tampered bearer', async () => {
      expect(await verifyBearer(req, undefined)).toBeUndefined();
      expect(await verifyBearer(req, 'not-a-token')).toBeUndefined();
      expect(await verifyBearer(req, accessToken() + 'x')).toBeUndefined();
    });

    it('rejects a refresh token used as an access token', async () => {
      const { refresh_token } = issueTokens('test-client', 'ynab', oauthConfig());
      expect(await verifyBearer(req, refresh_token)).toBeUndefined();
    });
  });

  describe('static key', () => {
    it('accepts MCP_API_KEY when OAuth is not configured', async () => {
      process.env.MCP_API_KEY = 'k'.repeat(40);
      const info = await verifyBearer(req, 'k'.repeat(40));
      expect(info?.clientId).toBe('ynab-mcp-server');
      expect(await verifyBearer(req, 'wrong')).toBeUndefined();
    });

    it('accepts both when both are configured', async () => {
      setOAuthEnv();
      process.env.MCP_API_KEY = 'k'.repeat(40);
      expect(await verifyBearer(req, 'k'.repeat(40))).toBeDefined();
      expect(await verifyBearer(req, accessToken())).toBeDefined();
    });
  });
});
