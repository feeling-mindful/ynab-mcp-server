import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as GetMoneyMovementsTool from '../tools/GetMoneyMovementsTool';

const mockYnabFetch = vi.fn();

vi.mock('../tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

describe('GetMoneyMovementsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    it('should return money movements with formatted amounts', async () => {
      mockYnabFetch.mockResolvedValue({
        data: {
          money_movements: [
            {
              id: 'mm-1',
              month: '2024-01',
              moved_at: '2024-01-15T12:00:00Z',
              note: 'Covered overspending',
              money_movement_group_id: 'mmg-1',
              from_category_id: 'cat-1',
              to_category_id: 'cat-2',
              amount: 50000,
              amount_currency: 50000,
              amount_formatted: '$50.00',
            },
          ],
        },
      });

      const result = await GetMoneyMovementsTool.execute({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.money_movements).toHaveLength(1);
      expect(parsed.count).toBe(1);
      expect(parsed.money_movements[0].amount).toBe('50.00');
      expect(parsed.money_movements[0].amount_formatted).toBe('$50.00');
      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/money_movements');
    });

    it('should handle empty money movements', async () => {
      mockYnabFetch.mockResolvedValue({
        data: { money_movements: [] },
      });

      const result = await GetMoneyMovementsTool.execute({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.money_movements).toHaveLength(0);
      expect(parsed.count).toBe(0);
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Unauthorized'));

      const result = await GetMoneyMovementsTool.execute({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
