import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as GetPayeeLocationsByPayeeTool from '../tools/GetPayeeLocationsByPayeeTool';

const mockYnabFetch = vi.fn();

vi.mock('../tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

describe('GetPayeeLocationsByPayeeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    it('should return locations for a payee (filtering deleted)', async () => {
      mockYnabFetch.mockResolvedValue({
        data: {
          payee_locations: [
            { id: 'loc-1', payee_id: 'payee-1', latitude: '40.7', longitude: '-74.0', deleted: false },
            { id: 'loc-2', payee_id: 'payee-1', latitude: '34.0', longitude: '-118.2', deleted: false },
            { id: 'loc-3', payee_id: 'payee-1', latitude: null, longitude: null, deleted: true },
          ],
        },
      });

      const result = await GetPayeeLocationsByPayeeTool.execute({ payeeId: 'payee-1' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.payee_locations).toHaveLength(2);
      expect(parsed.count).toBe(2);
      expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/payees/payee-1/payee_locations');
    });

    it('should return empty array if no non-deleted locations', async () => {
      mockYnabFetch.mockResolvedValue({
        data: {
          payee_locations: [
            { id: 'loc-1', payee_id: 'payee-1', latitude: '0', longitude: '0', deleted: true },
          ],
        },
      });

      const result = await GetPayeeLocationsByPayeeTool.execute({ payeeId: 'payee-1' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.payee_locations).toHaveLength(0);
      expect(parsed.count).toBe(0);
    });

    it('should return error on API failure', async () => {
      mockYnabFetch.mockRejectedValue(new Error('Not found'));

      const result = await GetPayeeLocationsByPayeeTool.execute({ payeeId: 'invalid' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
