import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as CreateCategoryGroupTool from '../tools/CreateCategoryGroupTool';

const mockYnabFetch = vi.fn();

vi.mock('../tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

describe('CreateCategoryGroupTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    it('should create a category group', async () => {
      mockYnabFetch.mockResolvedValue({
        data: { category_group: { id: 'grp-1', name: 'Savings' } },
      });

      const result = await CreateCategoryGroupTool.execute({ name: 'Savings' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.category_group.id).toBe('grp-1');
      expect(parsed.category_group.name).toBe('Savings');
      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/category_groups', {
        method: 'POST',
        body: { category_group: { name: 'Savings' } },
      });
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Budget not found'));

      const result = await CreateCategoryGroupTool.execute({ name: 'Bad' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Budget not found');
    });
  });
});
