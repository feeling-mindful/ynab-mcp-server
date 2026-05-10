import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_get_scheduled_transaction_by_id";
export const description = "Returns a single scheduled (recurring) transaction by ID.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  scheduledTransactionId: z.string().describe("The ID of the scheduled transaction to retrieve"),
};

interface GetScheduledTransactionByIdInput {
  budgetId?: string;
  scheduledTransactionId: string;
}

export async function execute(input: GetScheduledTransactionByIdInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    console.error(`Getting scheduled transaction ${input.scheduledTransactionId} for budget ${budgetId}`);
    const response = await api.scheduledTransactions.getScheduledTransactionById(
      budgetId,
      input.scheduledTransactionId
    );

    const txn = response.data.scheduled_transaction;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          id: txn.id,
          date_first: txn.date_first,
          date_next: txn.date_next,
          frequency: txn.frequency,
          amount: (txn.amount / 1000).toFixed(2),
          memo: txn.memo,
          flag_color: txn.flag_color,
          flag_name: txn.flag_name,
          account_id: txn.account_id,
          account_name: txn.account_name,
          payee_id: txn.payee_id,
          payee_name: txn.payee_name,
          category_id: txn.category_id,
          category_name: txn.category_name,
          transfer_account_id: txn.transfer_account_id,
          deleted: txn.deleted,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting scheduled transaction by ID:", error);
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
