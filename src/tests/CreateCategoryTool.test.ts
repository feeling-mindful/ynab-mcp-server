import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as CreateCategoryTool from '../tools/CreateCategoryTool';

const mockYnabFetch = vi.fn();

vi.mock('../tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

describe('CreateCategoryTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    it('should create a category with basic fields', async () => {
      mockYnabFetch.mockResolvedValue({
        data: {
          category: {
            id: 'cat-1',
            name: 'Groceries',
            category_group_id: 'grp-1',
            category_group_name: 'Food',
            goal_target: null,
            goal_target_date: null,
          },
        },
      });

      const result = await CreateCategoryTool.execute({
        name: 'Groceries',
        categoryGroupId: 'grp-1',
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.category.id).toBe('cat-1');
      expect(parsed.category.name).toBe('Groceries');
      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/categories', {
        method: 'POST',
        body: { category: { name: 'Groceries', category_group_id: 'grp-1' } },
      });
    });

    it('should create a category with goal and note', async () => {
      mockYnabFetch.mockResolvedValue({
        data: {
          category: {
            id: 'cat-2',
            name: 'Rent',
            category_group_id: 'grp-1',
            category_group_name: 'Bills',
            goal_target: 1200000,
            goal_target_date: '2025-01-01',
          },
        },
      });

      const result = await CreateCategoryTool.execute({
        name: 'Rent',
        categoryGroupId: 'grp-1',
        note: 'Monthly rent',
        goalTarget: 1200,
        goalTargetDate: '2025-01-01',
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.category.goal_target).toBe('1200.00');
      expect(parsed.category.goal_target_date).toBe('2025-01-01');
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Invalid group'));

      const result = await CreateCategoryTool.execute({
        name: 'Bad',
        categoryGroupId: 'invalid',
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Invalid group');
    });
  });
});
