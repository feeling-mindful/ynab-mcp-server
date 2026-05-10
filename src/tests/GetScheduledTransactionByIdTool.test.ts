import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as GetScheduledTransactionByIdTool from '../tools/GetScheduledTransactionByIdTool';

vi.mock('ynab');

describe('GetScheduledTransactionByIdTool', () => {
  let mockApi: {
    scheduledTransactions: {
      getScheduledTransactionById: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      scheduledTransactions: {
        getScheduledTransactionById: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockScheduled = {
      data: {
        scheduled_transaction: {
          id: 'sched-1',
          date_first: '2024-12-01',
          date_next: '2025-01-01',
          frequency: 'monthly',
          amount: -500000,
          memo: 'Rent payment',
          flag_color: 'red',
          flag_name: 'Red',
          account_id: 'acc-1',
          account_name: 'Checking',
          payee_id: 'payee-1',
          payee_name: 'Landlord',
          category_id: 'cat-1',
          category_name: 'Housing',
          transfer_account_id: null,
          deleted: false,
        },
      },
    };

    it('should return scheduled transaction by ID', async () => {
      mockApi.scheduledTransactions.getScheduledTransactionById.mockResolvedValue(mockScheduled);

      const result = await GetScheduledTransactionByIdTool.execute(
        { scheduledTransactionId: 'sched-1' },
        mockApi as any
      );

      expect(mockApi.scheduledTransactions.getScheduledTransactionById).toHaveBeenCalledWith(
        'test-budget-id',
        'sched-1'
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('sched-1');
      expect(parsed.amount).toBe('-500.00');
      expect(parsed.payee_name).toBe('Landlord');
    });

    it('should use provided budgetId', async () => {
      mockApi.scheduledTransactions.getScheduledTransactionById.mockResolvedValue(mockScheduled);

      await GetScheduledTransactionByIdTool.execute(
        { budgetId: 'custom-budget', scheduledTransactionId: 'sched-1' },
        mockApi as any
      );

      expect(mockApi.scheduledTransactions.getScheduledTransactionById).toHaveBeenCalledWith(
        'custom-budget',
        'sched-1'
      );
    });

    it('should return error on API failure', async () => {
      mockApi.scheduledTransactions.getScheduledTransactionById.mockRejectedValue(new Error('Not found'));

      const result = await GetScheduledTransactionByIdTool.execute(
        { scheduledTransactionId: 'bad-id' },
        mockApi as any
      );
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
