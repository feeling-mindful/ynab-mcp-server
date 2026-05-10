import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as CreatePayeeTool from '../tools/CreatePayeeTool';

const mockYnabFetch = vi.fn();

vi.mock('../tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

describe('CreatePayeeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    it('should create a payee and return success', async () => {
      mockYnabFetch.mockResolvedValue({
        data: { payee: { id: 'payee-1', name: 'Starbucks' } },
      });

      const result = await CreatePayeeTool.execute({ name: 'Starbucks' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.payee.id).toBe('payee-1');
      expect(parsed.payee.name).toBe('Starbucks');
      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/payees', {
        method: 'POST',
        body: { payee: { name: 'Starbucks' } },
      });
    });

    it('should use provided budgetId', async () => {
      mockYnabFetch.mockResolvedValue({
        data: { payee: { id: 'payee-2', name: 'Target' } },
      });

      await CreatePayeeTool.execute({ budgetId: 'custom-budget', name: 'Target' });

      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/custom-budget/payees', expect.any(Object));
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Already exists'));

      const result = await CreatePayeeTool.execute({ name: 'Starbucks' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Already exists');
    });
  });
});
