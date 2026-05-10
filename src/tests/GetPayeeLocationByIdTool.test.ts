import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as GetPayeeLocationByIdTool from '../tools/GetPayeeLocationByIdTool';

const mockYnabFetch = vi.fn();

vi.mock('../tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

describe('GetPayeeLocationByIdTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    it('should return a single payee location', async () => {
      mockYnabFetch.mockResolvedValue({
        data: {
          payee_location: {
            id: 'loc-1',
            payee_id: 'payee-1',
            latitude: '40.7128',
            longitude: '-74.0060',
            deleted: false,
          },
        },
      });

      const result = await GetPayeeLocationByIdTool.execute({ payeeLocationId: 'loc-1' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.id).toBe('loc-1');
      expect(parsed.latitude).toBe('40.7128');
      expect(parsed.longitude).toBe('-74.0060');
      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/payee_locations/loc-1');
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Not found'));

      const result = await GetPayeeLocationByIdTool.execute({ payeeLocationId: 'invalid' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Not found');
    });
  });
});
