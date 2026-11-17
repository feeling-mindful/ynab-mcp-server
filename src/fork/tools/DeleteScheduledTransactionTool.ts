import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "../../tools/errorUtils.js";
import { planIdFields, resolvePlan } from "./budgetUtils.js";

export const name = "ynab_delete_scheduled_transaction";
export const description = "Deletes a scheduled transaction from the budget. This action cannot be undone.";
export const inputSchema = {
  ...planIdFields,
  scheduledTransactionId: z.string().describe("The ID of the scheduled transaction to delete"),
};

interface DeleteScheduledTransactionInput {
  planId?: string;
  budgetId?: string;
  scheduledTransactionId: string;
}

export async function execute(input: DeleteScheduledTransactionInput, api: ynab.API) {
  try {
    const budgetId = resolvePlan(input);

    console.error(`Deleting scheduled transaction ${input.scheduledTransactionId} from budget ${budgetId}`);
    const response = await api.scheduledTransactions.deleteScheduledTransaction(
      budgetId,
      input.scheduledTransactionId
    );

    const txn = response.data.scheduled_transaction;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          deleted_transaction: {
            id: txn.id,
            amount: (txn.amount / 1000).toFixed(2),
            payee_name: txn.payee_name,
            memo: txn.memo,
          },
          message: "Scheduled transaction deleted successfully",
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error deleting scheduled transaction:", error);
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
