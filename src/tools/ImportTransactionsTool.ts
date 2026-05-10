import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_import_transactions";
export const description = "Imports available transactions on all linked accounts for the budget. This triggers an import from connected financial institutions (equivalent to clicking 'Import' in the YNAB app).";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
};

interface ImportTransactionsInput {
  budgetId?: string;
}

export async function execute(input: ImportTransactionsInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    console.error(`Importing transactions for budget ${budgetId}`);
    const response = await api.transactions.importTransactions(budgetId);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          transaction_ids: response.data.transaction_ids,
          imported_count: response.data.transaction_ids.length,
          message: response.data.transaction_ids.length > 0
            ? `Successfully imported ${response.data.transaction_ids.length} transaction(s)`
            : "No new transactions to import",
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error importing transactions:", error);
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
