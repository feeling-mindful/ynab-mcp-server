import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as UpdateScheduledTransactionTool from '../tools/UpdateScheduledTransactionTool';

vi.mock('ynab');

describe('UpdateScheduledTransactionTool', () => {
  let mockApi: {
    scheduledTransactions: {
      updateScheduledTransaction: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      scheduledTransactions: {
        updateScheduledTransaction: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockUpdated = {
      data: {
        scheduled_transaction: {
          id: 'sched-1',
          date_first: '2024-12-01',
          date_next: '2025-01-01',
          frequency: 'monthly',
          amount: -600000,
          payee_name: 'Updated Rent',
          category_name: 'Housing',
          memo: 'Updated memo',
          account_name: 'Savings',
        },
      },
    };

    it('should update scheduled transaction', async () => {
      mockApi.scheduledTransactions.updateScheduledTransaction.mockResolvedValue(mockUpdated);

      const input = {
        scheduledTransactionId: 'sched-1',
        amount: -600,
        payeeName: 'Updated Rent',
        memo: 'Updated memo',
        accountId: 'acc-savings',
      };
      const result = await UpdateScheduledTransactionTool.execute(input, mockApi as any);

      expect(mockApi.scheduledTransactions.updateScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        'sched-1',
        { scheduled_transaction: expect.objectContaining({ amount: -600000 }) }
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should error when no fields provided', async () => {
      const result = await UpdateScheduledTransactionTool.execute(
        { scheduledTransactionId: 'sched-1' },
        mockApi as any
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should return error on API failure', async () => {
      mockApi.scheduledTransactions.updateScheduledTransaction.mockRejectedValue(new Error('Update failed'));

      const input = { scheduledTransactionId: 'sched-1', memo: 'Test' };
      const result = await UpdateScheduledTransactionTool.execute(input, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
