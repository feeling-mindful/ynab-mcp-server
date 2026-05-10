import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as GetCategoryByIdTool from '../tools/GetCategoryByIdTool';

vi.mock('ynab');

describe('GetCategoryByIdTool', () => {
  let mockApi: {
    categories: {
      getCategoryById: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      categories: {
        getCategoryById: vi.fn(),
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
          note: 'Weekly grocery budget',
          budgeted: 500000,
          activity: -350000,
          balance: 150000,
          goal_type: 'NEED',
          goal_target: 500000,
          goal_target_month: '2024-01-01',
          goal_percentage_complete: 70,
          goal_months_to_budget: 3,
          goal_under_funded: 0,
          goal_overall_funded: 500000,
          goal_overall_left: 0,
        },
      },
    };

    it('should return category by ID', async () => {
      mockApi.categories.getCategoryById.mockResolvedValue(mockCategoryData);

      const result = await GetCategoryByIdTool.execute({ categoryId: 'cat-1' }, mockApi as any);

      expect(mockApi.categories.getCategoryById).toHaveBeenCalledWith('test-budget-id', 'cat-1');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('cat-1');
      expect(parsed.name).toBe('Groceries');
      expect(parsed.budgeted).toBe('500.00');
      expect(parsed.activity).toBe('-350.00');
    });

    it('should use provided budgetId', async () => {
      mockApi.categories.getCategoryById.mockResolvedValue(mockCategoryData);

      await GetCategoryByIdTool.execute({ budgetId: 'custom-budget', categoryId: 'cat-1' }, mockApi as any);

      expect(mockApi.categories.getCategoryById).toHaveBeenCalledWith('custom-budget', 'cat-1');
    });

    it('should return error on API failure', async () => {
      mockApi.categories.getCategoryById.mockRejectedValue(new Error('API error'));

      const result = await GetCategoryByIdTool.execute({ categoryId: 'bad-id' }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('API error');
    });
  });
});
