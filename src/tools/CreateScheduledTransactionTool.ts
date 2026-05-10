import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_create_scheduled_transaction";
export const description = "Creates a new scheduled (recurring) transaction. Scheduled transactions have a future date and can repeat on a given frequency.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  accountId: z.string().describe("The ID of the account"),
  date: z.string().describe("The date of the first occurrence in ISO format (e.g. 2024-03-24). Must be a future date."),
  frequency: z.enum(["never", "daily", "weekly", "everyOtherWeek", "twiceAMonth", "monthly", "everyOtherMonth", "every3Months", "every4Months", "twiceAYear", "yearly", "everyOtherYear"]).describe("How often the transaction repeats"),
  amount: z.number().describe("The amount in dollars (e.g. -10.99 for outflow, 10.99 for inflow)"),
  payeeId: z.string().optional().describe("The ID of the payee (optional if payeeName is provided)"),
  payeeName: z.string().optional().describe("The name of the payee (optional if payeeId is provided)"),
  categoryId: z.string().optional().describe("The category ID for the transaction (optional)"),
  memo: z.string().optional().describe("A memo/note for the transaction (optional)"),
  flagColor: z.enum(["red", "orange", "yellow", "green", "blue", "purple"]).optional().describe("The transaction flag color (optional)"),
};

interface CreateScheduledTransactionInput {
  budgetId?: string;
  accountId: string;
  date: string;
  frequency: string;
  amount: number;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  memo?: string;
  flagColor?: string;
}

export async function execute(input: CreateScheduledTransactionInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    if (!input.payeeId && !input.payeeName) {
      throw new Error("Either payeeId or payeeName must be provided");
    }

    const scheduledTransaction: ynab.PostScheduledTransactionWrapper = {
      scheduled_transaction: {
        account_id: input.accountId,
        date: input.date,
        frequency: input.frequency as ynab.ScheduledTransactionFrequency,
        amount: Math.round(input.amount * 1000),
        payee_id: input.payeeId,
        payee_name: input.payeeName,
        category_id: input.categoryId,
        memo: input.memo,
        flag_color: input.flagColor as ynab.TransactionFlagColor,
      },
    };

    console.error(`Creating scheduled transaction in budget ${budgetId}`);
    const response = await api.scheduledTransactions.createScheduledTransaction(budgetId, scheduledTransaction);

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
          message: "Scheduled transaction created successfully",
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error creating scheduled transaction:", error);
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
