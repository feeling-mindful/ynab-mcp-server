import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_get_category_by_id";
export const description = "Returns a single category by ID. Amounts are specific to the current budget month (UTC).";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  categoryId: z.string().describe("The ID of the category to retrieve"),
};

interface GetCategoryByIdInput {
  budgetId?: string;
  categoryId: string;
}

export async function execute(input: GetCategoryByIdInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    console.error(`Getting category ${input.categoryId} for budget ${budgetId}`);
    const response = await api.categories.getCategoryById(budgetId, input.categoryId);

    const category = response.data.category;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          id: category.id,
          name: category.name,
          category_group_id: category.category_group_id,
          category_group_name: category.category_group_name,
          hidden: category.hidden,
          note: category.note,
          budgeted: (category.budgeted / 1000).toFixed(2),
          activity: (category.activity / 1000).toFixed(2),
          balance: (category.balance / 1000).toFixed(2),
          goal_type: category.goal_type,
          goal_target: category.goal_target ? (category.goal_target / 1000).toFixed(2) : null,
          goal_target_month: category.goal_target_month,
          goal_percentage_complete: category.goal_percentage_complete,
          goal_months_to_budget: category.goal_months_to_budget,
          goal_under_funded: category.goal_under_funded ? (category.goal_under_funded / 1000).toFixed(2) : null,
          goal_overall_funded: category.goal_overall_funded ? (category.goal_overall_funded / 1000).toFixed(2) : null,
          goal_overall_left: category.goal_overall_left ? (category.goal_overall_left / 1000).toFixed(2) : null,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting category by ID:", error);
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
