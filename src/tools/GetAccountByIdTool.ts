import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_get_account_by_id";
export const description = "Returns a single account by ID. Useful for getting detailed information about a specific account.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  accountId: z.string().describe("The ID of the account to retrieve"),
};

interface GetAccountByIdInput {
  budgetId?: string;
  accountId: string;
}

export async function execute(input: GetAccountByIdInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    console.error(`Getting account ${input.accountId} for budget ${budgetId}`);
    const response = await api.accounts.getAccountById(budgetId, input.accountId);

    const account = response.data.account;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          id: account.id,
          name: account.name,
          type: account.type,
          on_budget: account.on_budget,
          closed: account.closed,
          note: account.note,
          balance: (account.balance / 1000).toFixed(2),
          cleared_balance: (account.cleared_balance / 1000).toFixed(2),
          uncleared_balance: (account.uncleared_balance / 1000).toFixed(2),
          transfer_payee_id: account.transfer_payee_id,
          direct_import_linked: account.direct_import_linked,
          direct_import_in_error: account.direct_import_in_error,
          last_reconciled_at: account.last_reconciled_at,
          debt_original_balance: account.debt_original_balance ? (account.debt_original_balance / 1000).toFixed(2) : null,
          debt_interest_rates: account.debt_interest_rates,
          debt_minimum_payments: account.debt_minimum_payments,
          debt_escrow_amounts: account.debt_escrow_amounts,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting account by ID:", error);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: false,
          error: getErrorMessage(error),
        }, null, 2),
      }],
    };
  }
}
