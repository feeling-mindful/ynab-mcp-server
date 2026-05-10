import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as UpdateCategoryGroupTool from '../tools/UpdateCategoryGroupTool';

const mockYnabFetch = vi.fn();

vi.mock('../tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

describe('UpdateCategoryGroupTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    it('should update a category group name', async () => {
      mockYnabFetch.mockResolvedValue({
        data: { category_group: { id: 'grp-1', name: 'Bills & Utilities' } },
      });

      const result = await UpdateCategoryGroupTool.execute({
        categoryGroupId: 'grp-1',
        name: 'Bills & Utilities',
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.category_group.id).toBe('grp-1');
      expect(parsed.category_group.name).toBe('Bills & Utilities');
      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/category_groups/grp-1', {
        method: 'PATCH',
        body: { category_group: { name: 'Bills & Utilities' } },
      });
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Not found'));

      const result = await UpdateCategoryGroupTool.execute({
        categoryGroupId: 'invalid',
        name: 'Test',
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Not found');
    });
  });
});
