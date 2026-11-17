import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as CreateCategoryTool from '../tools/CreateCategoryTool';

const mockYnabFetch = vi.fn();

vi.mock('../tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

const GROUP_ID = 'dddddddd-0000-4000-8000-000000000001';
const mockApi = {
  categories: {
    getCategories: vi.fn(),
  },
};
const groups = {
  data: {
    category_groups: [
      { id: GROUP_ID, name: 'Bills & Utilities', deleted: false, categories: [] },
      { id: 'dddddddd-0000-4000-8000-000000000002', name: 'Fun', deleted: false, categories: [] },
    ],
  },
};

describe('CreateCategoryTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.categories.getCategories.mockResolvedValue(groups);
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
            category_group_id: GROUP_ID,
            category_group_name: 'Food',
            goal_target: null,
            goal_target_date: null,
          },
        },
      });

      const result = await CreateCategoryTool.execute({
        name: 'Groceries',
        categoryGroupId: GROUP_ID,
      }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.category.id).toBe('cat-1');
      expect(parsed.category.name).toBe('Groceries');
      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/categories', {
        method: 'POST',
        body: { category: { name: 'Groceries', category_group_id: GROUP_ID } },
      });
    });

    it('should create a category with goal and note', async () => {
      mockYnabFetch.mockResolvedValue({
        data: {
          category: {
            id: 'cat-2',
            name: 'Rent',
            category_group_id: GROUP_ID,
            category_group_name: 'Bills',
            goal_target: 1200000,
            goal_target_date: '2025-01-01',
          },
        },
      });

      const result = await CreateCategoryTool.execute({
        name: 'Rent',
        categoryGroupId: GROUP_ID,
        note: 'Monthly rent',
        goalTarget: 1200,
        goalTargetDate: '2025-01-01',
      }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.category.goal_target).toBe('1200.00');
      expect(parsed.category.goal_target_date).toBe('2025-01-01');
    });

    it('accepts the group by name', async () => {
      mockYnabFetch.mockResolvedValue({
        data: { category: { id: 'cat-3', name: 'Games', category_group_id: 'dddddddd-0000-4000-8000-000000000002', category_group_name: 'Fun' } },
      });

      await CreateCategoryTool.execute({ name: 'Games', categoryGroupId: 'fun' }, mockApi as any);

      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/categories', {
        method: 'POST',
        body: { category: { name: 'Games', category_group_id: 'dddddddd-0000-4000-8000-000000000002' } },
      });
    });

    it('refuses an unknown group name without creating anything', async () => {
      const result = await CreateCategoryTool.execute({ name: 'Games', categoryGroupId: 'Nope' }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('No category group named "Nope"');
      expect(mockYnabFetch).not.toHaveBeenCalled();
    });

    it('refuses a blank group without calling YNAB', async () => {
      const result = await CreateCategoryTool.execute({ name: 'Games', categoryGroupId: ' ' }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('categoryGroupId is required');
      expect(mockYnabFetch).not.toHaveBeenCalled();
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Invalid group'));

      const result = await CreateCategoryTool.execute({
        name: 'Bad',
        categoryGroupId: 'dddddddd-0000-4000-8000-00000000dead',
      }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Invalid group');
    });
  });
});
