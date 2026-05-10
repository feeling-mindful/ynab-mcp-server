import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_update_scheduled_transaction";
export const description = "Updates an existing scheduled transaction. Only provide fields you want to change.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  scheduledTransactionId: z.string().describe("The ID of the scheduled transaction to update"),
  accountId: z.string().optional().describe("New account ID"),
  date: z.string().optional().describe("New first occurrence date in ISO format (e.g. 2024-03-24)"),
  frequency: z.enum(["never", "daily", "weekly", "everyOtherWeek", "twiceAMonth", "monthly", "everyOtherMonth", "every3Months", "every4Months", "twiceAYear", "yearly", "everyOtherYear"]).optional().describe("New frequency"),
  amount: z.number().optional().describe("New amount in dollars"),
  payeeId: z.string().optional().describe("New payee ID"),
  payeeName: z.string().optional().describe("New payee name"),
  categoryId: z.string().optional().describe("New category ID"),
  memo: z.string().optional().describe("New memo"),
  flagColor: z.enum(["red", "orange", "yellow", "green", "blue", "purple"]).optional().describe("New flag color"),
};

interface UpdateScheduledTransactionInput {
  budgetId?: string;
  scheduledTransactionId: string;
  accountId?: string;
  date?: string;
  frequency?: string;
  amount?: number;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  memo?: string;
  flagColor?: string;
}

export async function execute(input: UpdateScheduledTransactionInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const update: any = {};

    if (input.accountId !== undefined) update.account_id = input.accountId;
    if (input.date !== undefined) update.date = input.date;
    if (input.frequency !== undefined) update.frequency = input.frequency;
    if (input.amount !== undefined) update.amount = Math.round(input.amount * 1000);
    if (input.payeeId !== undefined) update.payee_id = input.payeeId;
    if (input.payeeName !== undefined) update.payee_name = input.payeeName;
    if (input.categoryId !== undefined) update.category_id = input.categoryId;
    if (input.memo !== undefined) update.memo = input.memo;
    if (input.flagColor !== undefined) update.flag_color = input.flagColor;

    if (Object.keys(update).length === 0) {
      throw new Error("No fields provided to update");
    }

    const data: ynab.PutScheduledTransactionWrapper = {
      scheduled_transaction: update,
    };

    console.error(`Updating scheduled transaction ${input.scheduledTransactionId} in budget ${budgetId}`);
    const response = await api.scheduledTransactions.updateScheduledTransaction(
      budgetId,
      input.scheduledTransactionId,
      data
    );

    const txn = response.data.scheduled_transaction;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          scheduled_transaction: {
            id: txn.id,
            date_first: txn.date_first,
            date_next: txn.date_next,
            frequency: txn.frequency,
            amount: (txn.amount / 1000).toFixed(2),
            payee_name: txn.payee_name,
            category_name: txn.category_name,
            memo: txn.memo,
            account_name: txn.account_name,
          },
          message: "Scheduled transaction updated successfully",
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error updating scheduled transaction:", error);
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
