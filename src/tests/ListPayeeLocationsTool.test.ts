import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as ListPayeeLocationsTool from '../tools/ListPayeeLocationsTool';

vi.mock('ynab');

describe('ListPayeeLocationsTool', () => {
  let mockApi: {
    payeeLocations: {
      getPayeeLocations: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      payeeLocations: {
        getPayeeLocations: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockLocationsData = {
      data: {
        payee_locations: [
          { id: 'loc-1', payee_id: 'payee-1', latitude: '40.7128', longitude: '-74.0060', deleted: false },
          { id: 'loc-2', payee_id: 'payee-2', latitude: '34.0522', longitude: '-118.2437', deleted: false },
          { id: 'loc-3', payee_id: 'payee-3', latitude: null, longitude: null, deleted: true },
        ],
      },
    };

    it('should list payee locations', async () => {
      mockApi.payeeLocations.getPayeeLocations.mockResolvedValue(mockLocationsData);

      const result = await ListPayeeLocationsTool.execute({}, mockApi as any);

      expect(mockApi.payeeLocations.getPayeeLocations).toHaveBeenCalledWith('test-budget-id');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.payee_locations).toHaveLength(2); // deleted filtered out
      expect(parsed.count).toBe(2);
    });

    it('should use provided budgetId', async () => {
      mockApi.payeeLocations.getPayeeLocations.mockResolvedValue(mockLocationsData);

      await ListPayeeLocationsTool.execute({ budgetId: 'custom-budget' }, mockApi as any);

      expect(mockApi.payeeLocations.getPayeeLocations).toHaveBeenCalledWith('custom-budget');
    });

    it('should return error on API failure', async () => {
      mockApi.payeeLocations.getPayeeLocations.mockRejectedValue(new Error('API error'));

      const result = await ListPayeeLocationsTool.execute({}, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('API error');
    });
  });
});
