import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { forkTools, registerForkServer, writesEnabled } from '../../fork/registry';
import { tools as upstreamTools } from '../../registry';
import { ynabTokenContext } from '../../fork/tools/apiUtils';
import * as GetUserTool from '../../fork/tools/GetUserTool';
import * as ListAccountsTool from '../../tools/ListAccountsTool';

type Callback = (input: unknown, extra: unknown) => Promise<any>;

function fakeServer() {
  const registered = new Map<string, { config: any; cb: Callback }>();
  return {
    registered,
    registerTool(name: string, config: any, cb: Callback) {
      if (registered.has(name)) throw new Error(`duplicate tool ${name}`);
      registered.set(name, { config, cb });
    },
  };
}

const ok = () => ({ content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }] });
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const tokenOf = (extra: unknown) => (extra as { token?: string } | undefined)?.token;
const WRITES_ON = { YNAB_ALLOW_WRITES: 'true' };

describe('fork registry', () => {
  beforeEach(() => {
    vi.stubEnv('YNAB_PLAN_ID', undefined);
    vi.stubEnv('YNAB_BUDGET_ID', 'plan-1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('writesEnabled', () => {
    it.each([
      [{}, false],
      [{ YNAB_ALLOW_WRITES: 'false' }, false],
      [{ YNAB_ALLOW_WRITES: 'TRUE' }, false],
      [{ YNAB_ALLOW_WRITES: '1' }, false],
      [{ YNAB_ALLOW_WRITES: 'true' }, true],
      [{ YNAB_ALLOW_WRITES: 'true', YNAB_READ_ONLY: 'true' }, false],
    ])('%j -> %s', (env, expected) => {
      expect(writesEnabled(env)).toBe(expected);
    });
  });

  describe('which tools are exposed', () => {
    it('gives every fork tool a name no upstream tool uses', () => {
      const names = [...upstreamTools, ...forkTools].map((tool) => tool.module.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('marks every fork tool that changes YNAB as a write', () => {
      const changing = /^ynab_(create|update|delete|approve|bulk_approve|import|move|auto_assign|apply)_?/;
      const unmarked = forkTools.filter((tool) => changing.test(tool.module.name) && !tool.writes);
      expect(unmarked.map((tool) => tool.module.name)).toEqual([]);
    });

    it('hides every write tool unless writes are allowed', () => {
      const server = fakeServer();
      registerForkServer(server, tokenOf, {});
      const writeNames = [...upstreamTools, ...forkTools].filter((tool) => tool.writes).map((tool) => tool.module.name);
      expect(writeNames.length).toBeGreaterThan(10);
      for (const name of writeNames) expect(server.registered.has(name)).toBe(false);
      expect(server.registered.has('ynab_list_accounts')).toBe(true);
      expect(server.registered.has('ynab_get_user')).toBe(true);
      for (const { config } of server.registered.values()) expect(config.annotations.destructiveHint).toBe(false);
    });

    it('registers upstream and fork write tools when writes are allowed', () => {
      const server = fakeServer();
      const count = registerForkServer(server, tokenOf, WRITES_ON);
      expect(count).toBe(server.registered.size);
      expect(server.registered.has('ynab_create_transaction')).toBe(true);
      expect(server.registered.has('ynab_update_category')).toBe(true);
      expect(server.registered.get('ynab_delete_scheduled_transaction')!.config.annotations.destructiveHint).toBe(true);
    });
  });

  describe('a tool call', () => {
    it('is refused when the request carries no YNAB token', async () => {
      const execute = vi.spyOn(GetUserTool, 'execute');
      const server = fakeServer();
      registerForkServer(server, tokenOf, {});

      const result = await server.registered.get('ynab_get_user')!.cb({}, {});

      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).error).toContain('No YNAB token');
      expect(execute).not.toHaveBeenCalled();
    });

    it('runs as the request\'s user, each call with its own token', async () => {
      const seen: Array<string | undefined> = [];
      vi.spyOn(GetUserTool, 'execute').mockImplementation(async () => {
        await Promise.resolve();
        seen.push(ynabTokenContext.getStore());
        return ok();
      });
      const server = fakeServer();
      registerForkServer(server, tokenOf, {});
      const call = server.registered.get('ynab_get_user')!.cb;

      await Promise.all([call({}, { token: 'token-a' }), call({}, { token: 'token-b' })]);

      expect(seen.sort()).toEqual(['token-a', 'token-b']);
      expect(ynabTokenContext.getStore()).toBeUndefined();
    });

    it('defaults an upstream tool to the last-used plan when none is configured', async () => {
      vi.stubEnv('YNAB_BUDGET_ID', undefined);
      const execute = vi.spyOn(ListAccountsTool, 'execute').mockResolvedValue(ok() as any);
      const server = fakeServer();
      registerForkServer(server, tokenOf, {});

      await server.registered.get('ynab_list_accounts')!.cb({}, { token: 'token-a' });

      expect(execute.mock.calls[0][0]).toMatchObject({ planId: 'last-used' });
    });

    it('reports a name that is not exact as a tool error, without running the tool', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
        data: { accounts: [{ id: 'a-1', name: 'Ally Checking', deleted: false, closed: false }], server_knowledge: 1 },
      }));
      const server = fakeServer();
      registerForkServer(server, tokenOf, WRITES_ON);

      const result = await server.registered.get('ynab_create_transaction')!.cb(
        { accountName: 'Checking', payeeName: 'X', amount: -5, date: '2026-11-17' },
        { token: 'token-a' },
      );

      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).error).toContain('No account named "Checking"');
      // One lookup of the account list, as the signed-in user, and no write.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(String(url)).toContain('/plans/plan-1/accounts');
      expect((init.method ?? 'GET').toUpperCase()).toBe('GET');
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-a');
    });

    it('runs a fork tool on the plan the call names, planId winning over budgetId as it does upstream', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ data: { payee_locations: [] } }));
      const server = fakeServer();
      registerForkServer(server, tokenOf, {});
      const tool = server.registered.get('ynab_list_payee_locations')!;

      expect(tool.config.inputSchema.shape).toHaveProperty('planId');
      await tool.cb({ planId: 'plan-b', budgetId: 'plan-c' }, { token: 'token-a' });

      expect(String(fetchMock.mock.calls[0][0])).toContain('/plan-b/');
    });

    it('builds the tool list once and reuses it for every request', () => {
      const first = fakeServer();
      const second = fakeServer();
      registerForkServer(first, tokenOf, {});
      registerForkServer(second, tokenOf, {});

      expect(second.registered.get('ynab_list_accounts')!.config).toBe(first.registered.get('ynab_list_accounts')!.config);
    });

    it('sends a fork tool to the configured plan when only YNAB_PLAN_ID is set', async () => {
      vi.stubEnv('YNAB_BUDGET_ID', undefined);
      vi.stubEnv('YNAB_PLAN_ID', 'plan-a');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({
        data: { payee_locations: [] },
      }));
      const server = fakeServer();
      registerForkServer(server, tokenOf, {});

      await server.registered.get('ynab_list_payee_locations')!.cb({}, { token: 'token-a' });

      expect(String(fetchMock.mock.calls[0][0])).toContain('/plan-a/');
    });

    it('gives each signed-in user their own YNAB client, so upstream caches keyed on it are never shared', async () => {
      const clients: unknown[] = [];
      vi.spyOn(ListAccountsTool, 'execute').mockImplementation(async (_input: any, api: any) => {
        clients.push(api);
        return ok() as any;
      });
      const server = fakeServer();
      registerForkServer(server, tokenOf, {});
      const call = server.registered.get('ynab_list_accounts')!.cb;

      await call({}, { token: 'token-a' });
      await call({}, { token: 'token-b' });
      await call({}, { token: 'token-a' });

      expect(clients[0]).not.toBe(clients[1]);
      expect(clients[2]).toBe(clients[0]);
    });
  });
});
