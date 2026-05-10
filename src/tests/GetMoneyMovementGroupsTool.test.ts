import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as GetMoneyMovementGroupsTool from '../tools/GetMoneyMovementGroupsTool';

const mockYnabFetch = vi.fn();

vi.mock('../tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

describe('GetMoneyMovementGroupsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    it('should return money movement groups', async () => {
      mockYnabFetch.mockResolvedValue({
        data: {
          money_movement_groups: [
            {
              id: 'mmg-1',
              group_created_at: '2024-01-15T12:00:00Z',
              month: '2024-01',
              note: 'Rebalancing',
              performed_by_user_id: 'user-1',
            },
          ],
        },
      });

      const result = await GetMoneyMovementGroupsTool.execute({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.money_movement_groups).toHaveLength(1);
      expect(parsed.count).toBe(1);
      expect(parsed.money_movement_groups[0].id).toBe('mmg-1');
      expect(parsed.money_movement_groups[0].note).toBe('Rebalancing');
      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/money_movement_groups');
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Server error'));

      const result = await GetMoneyMovementGroupsTool.execute({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
