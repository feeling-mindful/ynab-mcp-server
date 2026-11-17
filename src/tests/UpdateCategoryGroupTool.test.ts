import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as UpdateCategoryGroupTool from '../tools/UpdateCategoryGroupTool';

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

describe('UpdateCategoryGroupTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.categories.getCategories.mockResolvedValue(groups);
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    it('should update a category group name', async () => {
      mockYnabFetch.mockResolvedValue({
        data: { category_group: { id: GROUP_ID, name: 'Bills & Utilities' } },
      });

      const result = await UpdateCategoryGroupTool.execute({
        categoryGroupId: GROUP_ID,
        name: 'Bills & Utilities',
      }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.category_group.id).toBe(GROUP_ID);
      expect(parsed.category_group.name).toBe('Bills & Utilities');
      expect(mockYnabFetch).toHaveBeenCalledWith(`/plans/test-budget-id/category_groups/${GROUP_ID}`, {
        method: 'PATCH',
        body: { category_group: { name: 'Bills & Utilities' } },
      });
    });

    it('accepts the group by name', async () => {
      mockYnabFetch.mockResolvedValue({
        data: { category_group: { id: GROUP_ID, name: 'Bills' } },
      });

      await UpdateCategoryGroupTool.execute({ categoryGroupId: 'bills & utilities', name: 'Bills' }, mockApi as any);

      expect(mockYnabFetch).toHaveBeenCalledWith(`/plans/test-budget-id/category_groups/${GROUP_ID}`, {
        method: 'PATCH',
        body: { category_group: { name: 'Bills' } },
      });
    });

    it('refuses an unknown group name without calling YNAB to rename', async () => {
      const result = await UpdateCategoryGroupTool.execute({ categoryGroupId: 'Nope', name: 'X' }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('No category group named "Nope"');
      expect(mockYnabFetch).not.toHaveBeenCalled();
    });

    it('refuses a blank group without calling YNAB', async () => {
      const result = await UpdateCategoryGroupTool.execute({ categoryGroupId: ' ', name: 'X' }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('categoryGroupId is required');
      expect(mockYnabFetch).not.toHaveBeenCalled();
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Not found'));

      const result = await UpdateCategoryGroupTool.execute({
        categoryGroupId: 'dddddddd-0000-4000-8000-00000000dead',
        name: 'Test',
      }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Not found');
    });
  });
});
