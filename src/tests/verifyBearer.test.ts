import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { issueTokens, oauthConfig } from '../../lib/oauth';
import { verifyBearer } from '../../lib/verify-bearer';
import { OTHER_USER, grant, restoreEnv, saveAndClearEnv, setOAuthEnv } from './oauthTestUtils';

const req = new Request('https://example.test/mcp');
const accessToken = (g = grant()) => issueTokens('test-client', 'ynab', oauthConfig(), g).access_token;

describe('verifyBearer', () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = saveAndClearEnv();
  });
  afterEach(() => restoreEnv(saved));

  it('fails closed when neither MCP_API_KEY nor OAuth is configured', async () => {
    await expect(verifyBearer(req, 'anything')).rejects.toThrow();
  });

  it('treats an empty MCP_API_KEY as unset', async () => {
    process.env.MCP_API_KEY = '';
    await expect(verifyBearer(req, '')).rejects.toThrow();
  });

  describe('OAuth only, no MCP_API_KEY', () => {
    beforeEach(setOAuthEnv);

    it('accepts a valid access token and hands over the YNAB token it carries', async () => {
      const token = accessToken();
      const info = await verifyBearer(req, token);
      expect(info?.token).toBe(token);
      expect(info?.clientId).toMatch(/^oauth:/);
      expect(info?.extra?.ynabToken).toBe('ynab-access-1');
    });

    it('never exposes the YNAB token in the access token itself', () => {
      const token = accessToken();
      const body = Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
      expect(body).not.toContain('ynab-access-1');
      expect(body).not.toContain('ynab-refresh-1');
    });

    it('rejects a missing, random or tampered bearer', async () => {
      expect(await verifyBearer(req, undefined)).toBeUndefined();
      expect(await verifyBearer(req, 'not-a-token')).toBeUndefined();
      expect(await verifyBearer(req, accessToken() + 'x')).toBeUndefined();
    });

    it('rejects a refresh token used as an access token', async () => {
      const { refresh_token } = issueTokens('test-client', 'ynab', oauthConfig(), grant());
      expect(await verifyBearer(req, refresh_token)).toBeUndefined();
    });

    it('rejects tokens for a YNAB user that is no longer allowed', async () => {
      const token = accessToken();
      process.env.ALLOWED_YNAB_USER_ID = OTHER_USER;
      expect(await verifyBearer(req, token)).toBeUndefined();
    });

    it('rejects tokens signed with a different secret', async () => {
      const token = accessToken();
      process.env.OAUTH_SIGNING_SECRET = 't'.repeat(40);
      expect(await verifyBearer(req, token)).toBeUndefined();
    });
  });

  describe('static key', () => {
    it('accepts MCP_API_KEY when OAuth is not configured and uses YNAB_API_TOKEN', async () => {
      process.env.MCP_API_KEY = 'k'.repeat(40);
      process.env.YNAB_API_TOKEN = 'pat';
      const info = await verifyBearer(req, 'k'.repeat(40));
      expect(info?.clientId).toBe('ynab-mcp-server');
      expect(info?.extra?.ynabToken).toBe('pat');
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
