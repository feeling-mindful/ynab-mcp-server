import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as GetBudgetByIdTool from '../tools/GetBudgetByIdTool';

vi.mock('ynab');

describe('GetBudgetByIdTool', () => {
  let mockApi: {
    budgets: {
      getBudgetById: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      budgets: {
        getBudgetById: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockBudgetData = {
      data: {
        budget: {
          id: 'budget-1',
          name: 'My Budget',
          last_modified_on: '2024-01-15',
          first_month: '2023-01-01',
          last_month: '2024-12-01',
          currency_format: { iso_code: 'USD', example_format: '123,456.78' },
          accounts: [
            { id: 'acc-1', name: 'Checking', type: 'checking', on_budget: true, closed: false, balance: 5000000 },
          ],
          categories: [
            { id: 'cat-1', name: 'Groceries', hidden: false },
          ],
          payees: [
            { id: 'payee-1', name: 'Store' },
          ],
        },
      },
    };

    it('should return full budget detail', async () => {
      mockApi.budgets.getBudgetById.mockResolvedValue(mockBudgetData);

      const result = await GetBudgetByIdTool.execute({}, mockApi as any);

      expect(mockApi.budgets.getBudgetById).toHaveBeenCalledWith('test-budget-id');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('budget-1');
      expect(parsed.name).toBe('My Budget');
      expect(parsed.accounts).toHaveLength(1);
      expect(parsed.categories).toHaveLength(1);
    });

    it('should use provided budgetId', async () => {
      mockApi.budgets.getBudgetById.mockResolvedValue(mockBudgetData);

      await GetBudgetByIdTool.execute({ budgetId: 'custom-budget' }, mockApi as any);

      expect(mockApi.budgets.getBudgetById).toHaveBeenCalledWith('custom-budget');
    });

    it('should return error on API failure', async () => {
      mockApi.budgets.getBudgetById.mockRejectedValue(new Error('API error'));

      const result = await GetBudgetByIdTool.execute({}, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('API error');
    });
  });
});
