import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_get_budget_settings";
export const description = "Returns the settings for a specific budget, including currency format, date format, and other configuration.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
};

interface GetBudgetSettingsInput {
  budgetId?: string;
}

export async function execute(input: GetBudgetSettingsInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    console.error(`Getting settings for budget ${budgetId}`);
    const response = await api.budgets.getBudgetSettingsById(budgetId);

    const settings = response.data.settings;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          date_format: settings.date_format,
          currency_format: settings.currency_format,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting budget settings:", error);
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
