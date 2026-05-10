import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as CreateScheduledTransactionTool from '../tools/CreateScheduledTransactionTool';

vi.mock('ynab');

describe('CreateScheduledTransactionTool', () => {
  let mockApi: {
    scheduledTransactions: {
      createScheduledTransaction: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      scheduledTransactions: {
        createScheduledTransaction: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockCreated = {
      data: {
        scheduled_transaction: {
          id: 'sched-1',
          date_first: '2024-12-01',
          date_next: '2024-12-01',
          frequency: 'monthly',
          amount: -500000,
          payee_name: 'Rent',
          category_name: 'Housing',
          memo: 'Monthly rent',
          account_name: 'Checking',
        },
      },
    };

    it('should create a scheduled transaction', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue(mockCreated);

      const input = {
        accountId: 'acc-1',
        date: '2024-12-01',
        frequency: 'monthly',
        amount: -500,
        payeeName: 'Rent',
        categoryId: 'cat-housing',
        memo: 'Monthly rent',
      };
      const result = await CreateScheduledTransactionTool.execute(input, mockApi as any);

      expect(mockApi.scheduledTransactions.createScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        expect.objectContaining({
          scheduled_transaction: expect.objectContaining({
            account_id: 'acc-1',
            amount: -500000,
          }),
        })
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should error when no payee provided', async () => {
      const input = {
        accountId: 'acc-1',
        date: '2024-12-01',
        frequency: 'monthly',
        amount: -500,
      };
      const result = await CreateScheduledTransactionTool.execute(input, mockApi as any);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should use provided budgetId', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue(mockCreated);

      const input = { budgetId: 'custom-budget', accountId: 'acc-1', date: '2024-12-01', frequency: 'monthly', amount: -500, payeeId: 'payee-1' };
      await CreateScheduledTransactionTool.execute(input, mockApi as any);

      expect(mockApi.scheduledTransactions.createScheduledTransaction).toHaveBeenCalledWith(
        'custom-budget',
        expect.any(Object)
      );
    });

    it('should return error on API failure', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockRejectedValue(new Error('Creation failed'));

      const input = { accountId: 'acc-1', date: '2024-12-01', frequency: 'monthly', amount: -500, payeeId: 'payee-1' };
      const result = await CreateScheduledTransactionTool.execute(input, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
