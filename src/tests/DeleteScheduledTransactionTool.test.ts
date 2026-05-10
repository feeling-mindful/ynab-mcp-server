import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as DeleteScheduledTransactionTool from '../tools/DeleteScheduledTransactionTool';

vi.mock('ynab');

describe('DeleteScheduledTransactionTool', () => {
  let mockApi: {
    scheduledTransactions: {
      deleteScheduledTransaction: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      scheduledTransactions: {
        deleteScheduledTransaction: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockDeleted = {
      data: {
        scheduled_transaction: {
          id: 'sched-1',
          amount: -500000,
          payee_name: 'Rent',
          memo: 'Monthly rent',
        },
      },
    };

    it('should delete scheduled transaction', async () => {
      mockApi.scheduledTransactions.deleteScheduledTransaction.mockResolvedValue(mockDeleted);

      const result = await DeleteScheduledTransactionTool.execute(
        { scheduledTransactionId: 'sched-1' },
        mockApi as any
      );

      expect(mockApi.scheduledTransactions.deleteScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        'sched-1'
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should use provided budgetId', async () => {
      mockApi.scheduledTransactions.deleteScheduledTransaction.mockResolvedValue(mockDeleted);

      await DeleteScheduledTransactionTool.execute(
        { budgetId: 'custom-budget', scheduledTransactionId: 'sched-1' },
        mockApi as any
      );

      expect(mockApi.scheduledTransactions.deleteScheduledTransaction).toHaveBeenCalledWith(
        'custom-budget',
        'sched-1'
      );
    });

    it('should return error on API failure', async () => {
      mockApi.scheduledTransactions.deleteScheduledTransaction.mockRejectedValue(new Error('Delete failed'));

      const result = await DeleteScheduledTransactionTool.execute(
        { scheduledTransactionId: 'sched-1' },
        mockApi as any
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
