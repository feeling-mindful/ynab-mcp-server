import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_get_budget_by_id";
export const description = "Returns a single budget with all related entities (accounts, categories, payees, etc.). This is effectively a full budget export.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
};

interface GetBudgetByIdInput {
  budgetId?: string;
}

export async function execute(input: GetBudgetByIdInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    console.error(`Getting full budget detail for budget ${budgetId}`);
    const response = await api.budgets.getBudgetById(budgetId);

    const budget = response.data.budget;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          id: budget.id,
          name: budget.name,
          last_modified_on: budget.last_modified_on,
          first_month: budget.first_month,
          last_month: budget.last_month,
          currency_format: budget.currency_format,
          accounts: budget.accounts?.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            on_budget: a.on_budget,
            closed: a.closed,
            balance: (a.balance / 1000).toFixed(2),
          })),
          categories: budget.categories?.map((c) => ({
            id: c.id,
            name: c.name,
            hidden: c.hidden,
          })),
          payees: budget.payees?.map((p) => ({
            id: p.id,
            name: p.name,
          })),
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting budget by ID:", error);
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
