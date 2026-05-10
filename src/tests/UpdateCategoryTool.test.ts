import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as UpdateCategoryTool from '../tools/UpdateCategoryTool';

vi.mock('ynab');

describe('UpdateCategoryTool', () => {
  let mockApi: {
    categories: {
      updateCategory: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      categories: {
        updateCategory: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockUpdatedCategory = {
      data: {
        category: {
          id: 'cat-1',
          name: 'Updated Category',
          note: 'New note',
          goal_type: 'TB',
          goal_target: 1000000,
          goal_target_month: '2024-12-01',
        },
      },
    };

    it('should update category properties', async () => {
      mockApi.categories.updateCategory.mockResolvedValue(mockUpdatedCategory);

      const input = {
        categoryId: 'cat-1',
        name: 'Updated Category',
        note: 'New note',
        goalType: 'TB',
        goalTarget: 1000,
        goalTargetMonth: '2024-12-01',
      };
      const result = await UpdateCategoryTool.execute(input, mockApi as any);

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-1', {
        category: {
          name: 'Updated Category',
          note: 'New note',
          goal_type: 'TB',
          goal_target: 1000000,
          goal_target_month: '2024-12-01',
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should error when no fields provided', async () => {
      const result = await UpdateCategoryTool.execute({ categoryId: 'cat-1' }, mockApi as any);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should update only provided fields', async () => {
      mockApi.categories.updateCategory.mockResolvedValue(mockUpdatedCategory);

      const input = { categoryId: 'cat-1', name: 'Renamed' };
      await UpdateCategoryTool.execute(input, mockApi as any);

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-1', {
        category: { name: 'Renamed' },
      });
    });

    it('should return error on API failure', async () => {
      mockApi.categories.updateCategory.mockRejectedValue(new Error('Update failed'));

      const result = await UpdateCategoryTool.execute({ categoryId: 'cat-1', name: 'Test' }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
