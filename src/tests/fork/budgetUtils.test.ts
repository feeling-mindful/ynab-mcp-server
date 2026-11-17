import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBudgetId, LAST_USED_BUDGET, resolvePlan } from '../../fork/tools/budgetUtils';

describe('getBudgetId', () => {
  beforeEach(() => {
    vi.stubEnv('YNAB_BUDGET_ID', undefined);
    vi.stubEnv('YNAB_PLAN_ID', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the budget ID passed in', () => {
    vi.stubEnv('YNAB_BUDGET_ID', 'env-budget');
    expect(getBudgetId('input-budget')).toBe('input-budget');
  });

  it('falls back to YNAB_BUDGET_ID', () => {
    vi.stubEnv('YNAB_BUDGET_ID', 'env-budget');
    expect(getBudgetId()).toBe('env-budget');
  });

  it('falls back to YNAB_PLAN_ID, which wins over YNAB_BUDGET_ID as it does for upstream tools', () => {
    vi.stubEnv('YNAB_PLAN_ID', 'env-plan');
    expect(getBudgetId()).toBe('env-plan');
    vi.stubEnv('YNAB_BUDGET_ID', 'env-budget');
    expect(getBudgetId()).toBe('env-plan');
  });

  it("falls back to YNAB's last-used budget when nothing is set", () => {
    expect(getBudgetId()).toBe('last-used');
    expect(LAST_USED_BUDGET).toBe('last-used');
  });

  it('treats an empty string as not set', () => {
    vi.stubEnv('YNAB_BUDGET_ID', '');
    expect(getBudgetId('')).toBe('last-used');
  });

  it('lets planId win over budgetId, and ignores blank values', () => {
    expect(resolvePlan({ planId: 'p', budgetId: 'b' })).toBe('p');
    expect(resolvePlan({ planId: '  ', budgetId: ' b ' })).toBe('b');
    expect(resolvePlan({ planId: ' ' })).toBe('last-used');
  });
});
