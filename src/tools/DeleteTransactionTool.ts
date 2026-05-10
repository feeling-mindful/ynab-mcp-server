import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_delete_transaction";
export const description = "Deletes a transaction from the budget. This action cannot be undone.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  transactionId: z.string().describe("The ID of the transaction to delete"),
};

interface DeleteTransactionInput {
  budgetId?: string;
  transactionId: string;
}

export async function execute(input: DeleteTransactionInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const response = await api.transactions.deleteTransaction(
      budgetId,
      input.transactionId
    );

    if (!response.data.transaction) {
      throw new Error("Failed to delete transaction - no transaction data returned");
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          transactionId: response.data.transaction.id,
          message: "Transaction deleted successfully",
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error deleting transaction:", error);
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
