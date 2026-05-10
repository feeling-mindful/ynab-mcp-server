import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as GetBudgetSettingsTool from '../tools/GetBudgetSettingsTool';

vi.mock('ynab');

describe('GetBudgetSettingsTool', () => {
  let mockApi: {
    budgets: {
      getBudgetSettingsById: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      budgets: {
        getBudgetSettingsById: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockSettingsData = {
      data: {
        settings: {
          date_format: { format: 'MM/DD/YYYY' },
          currency_format: { iso_code: 'USD', example_format: '123,456.78' },
        },
      },
    };

    it('should return budget settings', async () => {
      mockApi.budgets.getBudgetSettingsById.mockResolvedValue(mockSettingsData);

      const result = await GetBudgetSettingsTool.execute({}, mockApi as any);

      expect(mockApi.budgets.getBudgetSettingsById).toHaveBeenCalledWith('test-budget-id');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.date_format).toBeDefined();
      expect(parsed.currency_format).toBeDefined();
    });

    it('should use provided budgetId', async () => {
      mockApi.budgets.getBudgetSettingsById.mockResolvedValue(mockSettingsData);

      await GetBudgetSettingsTool.execute({ budgetId: 'custom-budget' }, mockApi as any);

      expect(mockApi.budgets.getBudgetSettingsById).toHaveBeenCalledWith('custom-budget');
    });

    it('should return error on API failure', async () => {
      mockApi.budgets.getBudgetSettingsById.mockRejectedValue(new Error('API error'));

      const result = await GetBudgetSettingsTool.execute({}, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('API error');
    });
  });
});
