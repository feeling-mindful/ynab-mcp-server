import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as GetMonthCategoryByIdTool from '../tools/GetMonthCategoryByIdTool';

vi.mock('ynab');

describe('GetMonthCategoryByIdTool', () => {
  let mockApi: {
    categories: {
      getMonthCategoryById: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      categories: {
        getMonthCategoryById: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockCategoryData = {
      data: {
        category: {
          id: 'cat-1',
          name: 'Groceries',
          category_group_id: 'group-1',
          category_group_name: 'Food',
          hidden: false,
          note: null,
          budgeted: 500000,
          activity: -350000,
          balance: 150000,
          goal_type: 'NEED',
          goal_target: 500000,
          goal_target_month: '2024-01-01',
          goal_percentage_complete: 70,
        },
      },
    };

    it('should return category for specific month', async () => {
      mockApi.categories.getMonthCategoryById.mockResolvedValue(mockCategoryData);

      const input = { month: '2024-01-01', categoryId: 'cat-1' };
      const result = await GetMonthCategoryByIdTool.execute(input, mockApi as any);

      expect(mockApi.categories.getMonthCategoryById).toHaveBeenCalledWith('test-budget-id', '2024-01-01', 'cat-1');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('cat-1');
      expect(parsed.budgeted).toBe('500.00');
    });

    it('should use provided budgetId', async () => {
      mockApi.categories.getMonthCategoryById.mockResolvedValue(mockCategoryData);

      const input = { budgetId: 'custom-budget', month: '2024-02-01', categoryId: 'cat-1' };
      await GetMonthCategoryByIdTool.execute(input, mockApi as any);

      expect(mockApi.categories.getMonthCategoryById).toHaveBeenCalledWith('custom-budget', '2024-02-01', 'cat-1');
    });

    it('should return error on API failure', async () => {
      mockApi.categories.getMonthCategoryById.mockRejectedValue(new Error('API error'));

      const result = await GetMonthCategoryByIdTool.execute(
        { month: '2024-01-01', categoryId: 'bad-id' },
        mockApi as any
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('API error');
    });
  });
});
