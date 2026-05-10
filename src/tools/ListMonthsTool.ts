import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_list_months";
export const description = "Lists all budget months. Each month contains summary information about budgeting status.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
};

interface ListMonthsInput {
  budgetId?: string;
}

export async function execute(input: ListMonthsInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    console.error(`Listing months for budget ${budgetId}`);
    const response = await api.months.getBudgetMonths(budgetId);

    // Format the months
    const months = response.data.months.map((month) => ({
      month: month.month,
      note: month.note,
      income: (month.income / 1000).toFixed(2),
      budgeted: (month.budgeted / 1000).toFixed(2),
      activity: (month.activity / 1000).toFixed(2),
      to_be_budgeted: (month.to_be_budgeted / 1000).toFixed(2),
      age_of_money: month.age_of_money,
    }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          months,
          month_count: months.length,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error listing months:", error);
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
