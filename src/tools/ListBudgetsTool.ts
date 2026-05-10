import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";

export const name = "ynab_list_budgets";
export const description = "Lists all available budgets from YNAB API. Optionally includes account information for each budget.";
export const inputSchema = {
  includeAccounts: z.boolean().optional().describe("Include accounts in the response (default: false)"),
};

interface ListBudgetsInput {
  includeAccounts?: boolean;
}

export async function execute(input: ListBudgetsInput, api: ynab.API) {
  try {
    if (!process.env.YNAB_API_TOKEN) {
      return {
        content: [{ type: "text" as const, text: "YNAB API Token is not set" }]
      };
    }

    const includeAccounts = input.includeAccounts ?? false;

    console.error(`Listing budgets (includeAccounts=${includeAccounts})`);
    const budgetsResponse = await api.budgets.getBudgets(includeAccounts);
    console.error(`Found ${budgetsResponse.data.budgets.length} budgets`);

    const budgets = budgetsResponse.data.budgets.map((budget) => ({
      id: budget.id,
      name: budget.name,
      ...(includeAccounts && 'accounts' in budget ? {
        accounts: (budget as any).accounts?.map((a: any) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          on_budget: a.on_budget,
          closed: a.closed,
          balance: (a.balance / 1000).toFixed(2),
        })) ?? [],
      } : {}),
    }));

    return {
      content: [{ type: "text" as const, text: JSON.stringify(budgets, null, 2) }]
    };
  } catch (error: unknown) {
    console.error("Error listing budgets:", error);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        success: false,
        error: getErrorMessage(error),
      }, null, 2) }]
    };
  }
}