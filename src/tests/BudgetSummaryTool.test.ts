import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as BudgetSummaryTool from '../tools/BudgetSummaryTool';

vi.mock('ynab');

const account = (overrides: Record<string, unknown>) => ({
  id: 'acc',
  name: 'Account',
  type: 'checking',
  deleted: false,
  closed: false,
  balance: 0,
  ...overrides,
});

const category = (overrides: Record<string, unknown>) => ({
  id: 'cat',
  name: 'Category',
  category_group_name: 'Everyday',
  deleted: false,
  hidden: false,
  balance: 0,
  budgeted: 0,
  activity: 0,
  goal_under_funded: null,
  ...overrides,
});

const mockAccounts = [
  account({ id: 'a1', name: 'Checking', balance: 150000 }),
  account({ id: 'a2', name: 'Savings', type: 'savings', balance: 500000 }),
  account({ id: 'a3', name: 'Closed', closed: true, balance: 1000 }),
  account({ id: 'a4', name: 'Deleted', deleted: true, balance: 1000 }),
];

const mockMonth = {
  month: '2023-01-01',
  income: 500000,
  budgeted: 450000,
  activity: -400000,
  to_be_budgeted: 50000,
  age_of_money: 45,
  categories: [
    category({ id: 'c1', name: 'Groceries', balance: -2500, budgeted: 20000, activity: -22500 }),
    category({ id: 'c2', name: 'Dining', balance: -40000, budgeted: 10000, activity: -50000 }),
    category({ id: 'c3', name: 'Gas', balance: 5000, budgeted: 15000, activity: -10000 }),
    category({ id: 'c4', name: 'Vacation', category_group_name: 'Goals', balance: 10000, goal_under_funded: 90000 }),
    category({ id: 'c5', name: 'Car', category_group_name: 'Goals', goal_under_funded: 25500 }),
    category({ id: 'c6', name: 'Hidden', hidden: true, balance: -9000, goal_under_funded: 9000 }),
    category({ id: 'c7', name: 'Deleted', deleted: true, balance: -9000, goal_under_funded: 9000 }),
    category({ id: 'c8', name: 'Inflow: Ready to Assign', category_group_name: 'Internal Master Category', balance: -1000 }),
  ],
};

describe('BudgetSummaryTool', () => {
  let mockApi: {
    accounts: { getAccounts: Mock };
    months: { getBudgetMonth: Mock };
    transactions: { getTransactions: Mock };
  };

  const run = async (input: Record<string, unknown> = {}) => {
    const result = await BudgetSummaryTool.execute(input, mockApi as any);
    return JSON.parse(result.content[0].text);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      accounts: { getAccounts: vi.fn().mockResolvedValue({ data: { accounts: mockAccounts } }) },
      months: { getBudgetMonth: vi.fn().mockResolvedValue({ data: { month: mockMonth } }) },
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: { transactions: [{ id: 't1', deleted: false }, { id: 't2', deleted: false }, { id: 't3', deleted: true }] },
        }),
      },
    };
    (ynab.API as any).mockImplementation(() => mockApi);
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  it('calls YNAB for the default budget and current month', async () => {
    await run();
    expect(mockApi.accounts.getAccounts).toHaveBeenCalledWith('test-budget-id');
    expect(mockApi.months.getBudgetMonth).toHaveBeenCalledWith('test-budget-id', 'current');
    expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith('test-budget-id', undefined, 'unapproved');
  });

  it('passes a custom budget and month through', async () => {
    await run({ budgetId: 'custom', month: '2023-01-01' });
    expect(mockApi.accounts.getAccounts).toHaveBeenCalledWith('custom');
    expect(mockApi.months.getBudgetMonth).toHaveBeenCalledWith('custom', '2023-01-01');
  });

  it('leads with a headline in dollars', async () => {
    const summary = await run();
    expect(summary.month).toBe('2023-01-01');
    expect(summary.headline).toEqual({
      ready_to_assign: 50,
      income: 500,
      budgeted: 450,
      activity: -400,
      age_of_money_days: 45,
      overspent_count: 2,
      overspent_total: -42.5,
      underfunded_total: 115.5,
      unapproved_count: 2,
    });
  });

  it('lists overspent categories worst first, excluding hidden, deleted and internal ones', async () => {
    const summary = await run();
    expect(summary.overspent).toEqual([
      { name: 'Dining', group: 'Everyday', balance: -40, budgeted: 10, activity: -50 },
      { name: 'Groceries', group: 'Everyday', balance: -2.5, budgeted: 20, activity: -22.5 },
    ]);
  });

  it('lists underfunded categories by amount still needed', async () => {
    const summary = await run();
    expect(summary.underfunded).toEqual([
      { name: 'Vacation', group: 'Goals', needed: 90 },
      { name: 'Car', group: 'Goals', needed: 25.5 },
    ]);
  });

  it('lists open accounts compactly in dollars', async () => {
    const summary = await run();
    expect(summary.accounts).toEqual([
      { name: 'Checking', type: 'checking', balance: 150 },
      { name: 'Savings', type: 'savings', balance: 500 },
    ]);
  });

  it('no longer returns raw milliunits or the full month object', async () => {
    const text = JSON.stringify(await run());
    expect(text).not.toContain('Divide all numbers by 1000');
    expect(text).not.toContain('monthBudget');
    expect(text).not.toContain('150000');
  });

  it('handles a month with nothing to report', async () => {
    mockApi.accounts.getAccounts.mockResolvedValue({ data: { accounts: [] } });
    mockApi.months.getBudgetMonth.mockResolvedValue({ data: { month: { ...mockMonth, age_of_money: null, categories: [] } } });
    mockApi.transactions.getTransactions.mockResolvedValue({ data: { transactions: [] } });

    const summary = await run();
    expect(summary.headline.overspent_count).toBe(0);
    expect(summary.headline.overspent_total).toBe(0);
    expect(summary.headline.age_of_money_days).toBeNull();
    expect(summary.overspent).toEqual([]);
    expect(summary.underfunded).toEqual([]);
    expect(summary.accounts).toEqual([]);
  });

  it.each([
    ['accounts', 'getAccounts'],
    ['months', 'getBudgetMonth'],
    ['transactions', 'getTransactions'],
  ] as const)('returns an error when the %s call fails', async (group, method) => {
    (mockApi[group] as Record<string, Mock>)[method].mockRejectedValue(new Error(`${method} failed`));
    const response = await run();
    expect(response.success).toBe(false);
    expect(response.error).toContain(`${method} failed`);
  });

  it('validates the month format', () => {
    const schema = BudgetSummaryTool.inputSchema.month;
    for (const ok of ['current', '2023-01-01']) expect(schema.safeParse(ok).success).toBe(true);
    for (const bad of ['invalid', '2023-1-1', '2023/01/01']) expect(schema.safeParse(bad).success).toBe(false);
  });
});
