import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as CreateAccountTool from '../tools/CreateAccountTool';

vi.mock('ynab');

describe('CreateAccountTool', () => {
  let mockApi: {
    accounts: {
      createAccount: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      accounts: {
        createAccount: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  describe('execute', () => {
    const mockCreatedAccount = {
      data: {
        account: {
          id: 'new-acc-1',
          name: 'New Checking',
          type: 'checking',
          balance: 1500000,
          on_budget: true,
        },
      },
    };

    it('should create an account', async () => {
      mockApi.accounts.createAccount.mockResolvedValue(mockCreatedAccount);

      const input = { name: 'New Checking', type: 'checking', balance: 1500.00 };
      const result = await CreateAccountTool.execute(input, mockApi as any);

      expect(mockApi.accounts.createAccount).toHaveBeenCalledWith('test-budget-id', {
        account: {
          name: 'New Checking',
          type: 'checking',
          balance: 1500000,
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.account.id).toBe('new-acc-1');
    });

    it('should use provided budgetId', async () => {
      mockApi.accounts.createAccount.mockResolvedValue(mockCreatedAccount);

      const input = { budgetId: 'custom-budget', name: 'Savings', type: 'savings', balance: 5000.00 };
      await CreateAccountTool.execute(input, mockApi as any);

      expect(mockApi.accounts.createAccount).toHaveBeenCalledWith('custom-budget', {
        account: {
          name: 'Savings',
          type: 'savings',
          balance: 5000000,
        },
      });
    });

    it('should return error on API failure', async () => {
      mockApi.accounts.createAccount.mockRejectedValue(new Error('Creation failed'));

      const input = { name: 'Bad', type: 'checking', balance: 100 };
      const result = await CreateAccountTool.execute(input, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Creation failed');
    });
  });
});
