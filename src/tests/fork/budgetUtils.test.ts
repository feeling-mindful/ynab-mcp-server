import { describe, it, expect, beforeEach } from 'vitest';
import { getBudgetId, LAST_USED_BUDGET } from '../../fork/tools/budgetUtils';

describe('getBudgetId', () => {
  beforeEach(() => {
    delete process.env.YNAB_BUDGET_ID;
  });

  it('uses the budget ID passed in', () => {
    process.env.YNAB_BUDGET_ID = 'env-budget';
    expect(getBudgetId('input-budget')).toBe('input-budget');
  });

  it('falls back to YNAB_BUDGET_ID', () => {
    process.env.YNAB_BUDGET_ID = 'env-budget';
    expect(getBudgetId()).toBe('env-budget');
  });

  it("falls back to YNAB's last-used budget when nothing is set", () => {
    expect(getBudgetId()).toBe('last-used');
    expect(LAST_USED_BUDGET).toBe('last-used');
  });

  it('treats an empty string as not set', () => {
    process.env.YNAB_BUDGET_ID = '';
    expect(getBudgetId('')).toBe('last-used');
  });
});
