import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as UpdatePayeeTool from '../tools/UpdatePayeeTool';

vi.mock('ynab');

describe('UpdatePayeeTool', () => {
  let mockApi: {
    payees: {
      updatePayee: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      payees: {
        updatePayee: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockUpdatedPayee = {
      data: {
        payee: {
          id: 'payee-1',
          name: 'Updated Store Name',
          transfer_account_id: null,
        },
      },
    };

    it('should update payee name', async () => {
      mockApi.payees.updatePayee.mockResolvedValue(mockUpdatedPayee);

      const input = { payeeId: 'payee-1', name: 'Updated Store Name' };
      const result = await UpdatePayeeTool.execute(input, mockApi as any);

      expect(mockApi.payees.updatePayee).toHaveBeenCalledWith('test-budget-id', 'payee-1', {
        payee: { name: 'Updated Store Name' },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.payee.name).toBe('Updated Store Name');
    });

    it('should use provided budgetId', async () => {
      mockApi.payees.updatePayee.mockResolvedValue(mockUpdatedPayee);

      const input = { budgetId: 'custom-budget', payeeId: 'payee-1', name: 'New Name' };
      await UpdatePayeeTool.execute(input, mockApi as any);

      expect(mockApi.payees.updatePayee).toHaveBeenCalledWith('custom-budget', 'payee-1', expect.any(Object));
    });

    it('should return error on API failure', async () => {
      mockApi.payees.updatePayee.mockRejectedValue(new Error('Update failed'));

      const result = await UpdatePayeeTool.execute({ payeeId: 'payee-1', name: 'New Name' }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
