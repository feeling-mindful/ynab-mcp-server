import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as GetAccountByIdTool from '../tools/GetAccountByIdTool';

vi.mock('ynab');

describe('GetAccountByIdTool', () => {
  let mockApi: {
    accounts: {
      getAccountById: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      accounts: {
        getAccountById: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockAccountData = {
      data: {
        account: {
          id: 'account-1',
          name: 'Checking',
          type: 'checking',
          on_budget: true,
          closed: false,
          deleted: false,
          note: 'Test note',
          balance: 5000000,
          cleared_balance: 4500000,
          uncleared_balance: 500000,
          transfer_payee_id: 'payee-transfer-1',
          direct_import_linked: true,
          direct_import_in_error: false,
          last_reconciled_at: '2024-01-15',
          debt_original_balance: 10000000,
          debt_interest_rates: { '2024-01-01': 5.5 },
          debt_minimum_payments: { '2024-01-01': 25000 },
          debt_escrow_amounts: { '2024-01-01': 5000 },
        },
      },
    };

    it('should return account by ID', async () => {
      mockApi.accounts.getAccountById.mockResolvedValue(mockAccountData);

      const input = { accountId: 'account-1' };
      const result = await GetAccountByIdTool.execute(input, mockApi as any);

      expect(mockApi.accounts.getAccountById).toHaveBeenCalledWith('test-budget-id', 'account-1');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('account-1');
      expect(parsed.name).toBe('Checking');
      expect(parsed.balance).toBe('5000.00');
    });

    it('should use provided budgetId', async () => {
      mockApi.accounts.getAccountById.mockResolvedValue(mockAccountData);

      const input = { budgetId: 'custom-budget', accountId: 'account-1' };
      await GetAccountByIdTool.execute(input, mockApi as any);

      expect(mockApi.accounts.getAccountById).toHaveBeenCalledWith('custom-budget', 'account-1');
    });

    it('should return error on API failure', async () => {
      mockApi.accounts.getAccountById.mockRejectedValue(new Error('API error'));

      const result = await GetAccountByIdTool.execute({ accountId: 'bad-id' }, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('API error');
    });
  });
});
