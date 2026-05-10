import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as GetPayeeByIdTool from '../tools/GetPayeeByIdTool';

vi.mock('ynab');

describe('GetPayeeByIdTool', () => {
  let mockApi: {
    payees: {
      getPayeeById: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      payees: {
        getPayeeById: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockPayeeData = {
      data: {
        payee: {
          id: 'payee-1',
          name: 'Grocery Store',
          transfer_account_id: null,
          deleted: false,
        },
      },
    };

    it('should return payee by ID', async () => {
      mockApi.payees.getPayeeById.mockResolvedValue(mockPayeeData);

      const result = await GetPayeeByIdTool.execute({ payeeId: 'payee-1' }, mockApi as any);

      expect(mockApi.payees.getPayeeById).toHaveBeenCalledWith('test-budget-id', 'payee-1');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('payee-1');
      expect(parsed.name).toBe('Grocery Store');
    });

    it('should use provided budgetId', async () => {
      mockApi.payees.getPayeeById.mockResolvedValue(mockPayeeData);

      await GetPayeeByIdTool.execute({ budgetId: 'custom-budget', payeeId: 'payee-1' }, mockApi as any);

      expect(mockApi.payees.getPayeeById).toHaveBeenCalledWith('custom-budget', 'payee-1');
    });

    it('should return error on API failure', async () => {
      mockApi.payees.getPayeeById.mockRejectedValue(new Error('API error'));

      const result = await GetPayeeByIdTool.execute({ payeeId: 'bad-id' }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('API error');
    });
  });
});
