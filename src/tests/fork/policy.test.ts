import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyForkPolicy } from '../../fork/policy';

const ACCOUNT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const GROCERIES_ID = 'cccccccc-0000-4000-8000-000000000001';
const DINING_ID = 'cccccccc-0000-4000-8000-000000000002';
const PAYEE_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

const mockApi = {
  accounts: { getAccounts: vi.fn() },
  categories: { getCategories: vi.fn() },
  payees: { getPayees: vi.fn() },
};

const run = (tool: string, input: Record<string, unknown> | null, acceptsPlanId = true) =>
  applyForkPolicy(tool, input, mockApi as any, acceptsPlanId);

describe('applyForkPolicy', () => {
  const saved = { plan: process.env.YNAB_PLAN_ID, budget: process.env.YNAB_BUDGET_ID };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.YNAB_PLAN_ID;
    process.env.YNAB_BUDGET_ID = 'plan-1';
    mockApi.accounts.getAccounts.mockResolvedValue({
      data: { accounts: [
        { id: ACCOUNT_ID, name: 'Ally Checking', deleted: false, closed: false },
        { id: 'a-2', name: 'Ally Savings', deleted: false, closed: false },
      ] },
    });
    mockApi.categories.getCategories.mockResolvedValue({
      data: { category_groups: [{ id: 'g-1', name: 'Everyday', deleted: false, hidden: false, categories: [
        { id: GROCERIES_ID, name: '🛒 Groceries', deleted: false, hidden: false },
        { id: DINING_ID, name: 'Dining Out', deleted: false, hidden: false },
      ] }] },
    });
    mockApi.payees.getPayees.mockResolvedValue({
      data: { payees: [{ id: PAYEE_ID, name: 'Corner Market', deleted: false }] },
    });
  });

  afterEach(() => {
    if (saved.plan === undefined) delete process.env.YNAB_PLAN_ID; else process.env.YNAB_PLAN_ID = saved.plan;
    if (saved.budget === undefined) delete process.env.YNAB_BUDGET_ID; else process.env.YNAB_BUDGET_ID = saved.budget;
  });

  describe('default plan', () => {
    it('falls back to the last-used plan when none is given or configured', async () => {
      delete process.env.YNAB_BUDGET_ID;
      expect(await run('ynab_list_accounts', {})).toEqual({ planId: 'last-used' });
    });

    it('treats a missing input as an empty one', async () => {
      delete process.env.YNAB_BUDGET_ID;
      expect(await run('ynab_list_accounts', null)).toEqual({ planId: 'last-used' });
    });

    it.each([
      ['a planId is given', { planId: 'p' }],
      ['a legacy budgetId is given', { budgetId: 'b' }],
    ])('leaves the input alone when %s', async (_label, input) => {
      delete process.env.YNAB_BUDGET_ID;
      expect(await run('ynab_list_accounts', input)).toEqual(input);
    });

    it('leaves the input alone when a plan is configured', async () => {
      expect(await run('ynab_list_accounts', {})).toEqual({});
    });

    it('adds nothing to a tool that takes no planId', async () => {
      delete process.env.YNAB_BUDGET_ID;
      expect(await run('ynab_get_user', {}, false)).toEqual({});
    });
  });

  describe('names', () => {
    it('passes IDs through without looking anything up', async () => {
      const input = { accountId: ACCOUNT_ID, categoryId: GROCERIES_ID, payeeId: PAYEE_ID, amount: -5 };
      expect(await run('ynab_create_transaction', input)).toEqual(input);
      expect(mockApi.accounts.getAccounts).not.toHaveBeenCalled();
      expect(mockApi.categories.getCategories).not.toHaveBeenCalled();
      expect(mockApi.payees.getPayees).not.toHaveBeenCalled();
    });

    it('turns exact names into IDs so the tool never matches loosely', async () => {
      const result = await run('ynab_create_transaction', {
        accountName: 'ally checking', categoryName: 'groceries', payeeName: 'Anyone', amount: -5,
      });
      expect(result).toEqual({ accountId: ACCOUNT_ID, categoryId: GROCERIES_ID, payeeName: 'Anyone', amount: -5 });
      expect(mockApi.accounts.getAccounts).toHaveBeenCalledWith('plan-1');
    });

    it('refuses a partial name that upstream would have picked', async () => {
      await expect(run('ynab_create_transaction', { accountName: 'Checking', payeeName: 'X', amount: -5 }))
        .rejects.toThrow('No account named "Checking". Did you mean: "Ally Checking"');
    });

    it('refuses a name that fits several items', async () => {
      await expect(run('ynab_create_transaction', { accountName: 'Ally', payeeName: 'X', amount: -5 }))
        .rejects.toThrow('No account named "Ally"');
    });

    it('accepts a name in an ID field', async () => {
      expect(await run('ynab_update_category_budget', { month: '2026-11-01', categoryId: 'Dining Out', budgeted: 50 }))
        .toEqual({ month: '2026-11-01', categoryId: DINING_ID, budgeted: 50 });
    });

    it('resolves both categories of a money move from one download', async () => {
      const result = await run('ynab_move_money', { fromCategoryId: 'groceries', toCategoryId: 'dining out', amount: 10 });
      expect(result).toEqual({ fromCategoryId: GROCERIES_ID, toCategoryId: DINING_ID, amount: 10 });
      expect(mockApi.categories.getCategories).toHaveBeenCalledTimes(1);
    });

    it('does not consult the name when the ID is also given', async () => {
      const input = { accountId: ACCOUNT_ID, accountName: 'nonsense', payeeName: 'X', amount: -5 };
      expect(await run('ynab_create_transaction', input)).toEqual(input);
      expect(mockApi.accounts.getAccounts).not.toHaveBeenCalled();
    });

    it('ignores null and blank optional fields', async () => {
      const input = { transactionId: 't-1', accountId: null, categoryId: ' ', payeeId: undefined };
      expect(await run('ynab_update_transaction', input)).toEqual(input);
      expect(mockApi.accounts.getAccounts).not.toHaveBeenCalled();
    });

    it('looks names up in the plan the call names', async () => {
      await run('ynab_get_transactions', { planId: 'other-plan', payeeId: 'corner market' });
      expect(mockApi.payees.getPayees).toHaveBeenCalledWith('other-plan');
    });

    it('looks names up in the last-used plan when none is configured', async () => {
      delete process.env.YNAB_BUDGET_ID;
      const result = await run('ynab_get_transactions', { accountId: 'Ally Savings' });
      expect(result).toEqual({ planId: 'last-used', accountId: 'a-2' });
      expect(mockApi.accounts.getAccounts).toHaveBeenCalledWith('last-used');
    });

    it('leaves other tools untouched', async () => {
      const input = { planId: 'p', accountId: 'whatever' };
      expect(await run('ynab_list_accounts', input)).toBe(input);
    });

    it('does not change the input it was given', async () => {
      const input = { accountName: 'Ally Checking', payeeName: 'X', amount: -5 };
      await run('ynab_create_transaction', input);
      expect(input).toEqual({ accountName: 'Ally Checking', payeeName: 'X', amount: -5 });
    });
  });

  describe('splits', () => {
    const split = (category_name: string | null, amount: number) => ({ amount, category_name, memo: null });

    it('replaces each split category with the exact name it strictly matches', async () => {
      const result = await run('ynab_update_transaction', {
        transactionId: 't-1',
        subtransactions: [split('groceries', -3), split('Dining Out', -2), split(null, -1)],
      });
      expect(result.subtransactions).toEqual([split('🛒 Groceries', -3), split('Dining Out', -2), split(null, -1)]);
      expect(mockApi.categories.getCategories).toHaveBeenCalledTimes(1);
    });

    it('refuses a partial split category without returning an input to run', async () => {
      await expect(run('ynab_create_transaction', {
        accountId: ACCOUNT_ID, payeeName: 'X', amount: -5,
        subtransactions: [split('Dining', -3), split('groceries', -2)],
      })).rejects.toThrow('No category named "Dining". Did you mean: "Dining Out"');
    });
  });
});
