import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_update_category";
export const description = "Updates a category's properties (name, note, goal). For updating the budgeted amount, use ynab_update_category_budget instead.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  categoryId: z.string().describe("The ID of the category to update"),
  name: z.string().optional().describe("New name for the category"),
  note: z.string().optional().describe("New note for the category"),
  goalType: z.enum(["TB", "TBD", "MF", "NEED"]).optional().describe("Goal type: TB=Target Balance, TBD=Target By Date, MF=Monthly Funding, NEED=Plan Your Spending"),
  goalTarget: z.number().optional().describe("Goal target amount in dollars"),
  goalTargetMonth: z.string().optional().describe("Goal target month in ISO format (e.g. 2024-12-01), required for TBD goal type"),
};

interface UpdateCategoryInput {
  budgetId?: string;
  categoryId: string;
  name?: string;
  note?: string;
  goalType?: string;
  goalTarget?: number;
  goalTargetMonth?: string;
}

export async function execute(input: UpdateCategoryInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const categoryUpdate: any = {};

    if (input.name !== undefined) {
      categoryUpdate.name = input.name;
    }
    if (input.note !== undefined) {
      categoryUpdate.note = input.note;
    }
    if (input.goalType !== undefined) {
      categoryUpdate.goal_type = input.goalType;
    }
    if (input.goalTarget !== undefined) {
      categoryUpdate.goal_target = Math.round(input.goalTarget * 1000);
    }
    if (input.goalTargetMonth !== undefined) {
      categoryUpdate.goal_target_month = input.goalTargetMonth;
    }

    if (Object.keys(categoryUpdate).length === 0) {
      throw new Error("No fields provided to update");
    }

    const data: ynab.PatchCategoryWrapper = {
      category: categoryUpdate,
    };

    console.error(`Updating category ${input.categoryId} in budget ${budgetId}`);
    const response = await api.categories.updateCategory(budgetId, input.categoryId, data);

    const category = response.data.category;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          category: {
            id: category.id,
            name: category.name,
            note: category.note,
            goal_type: category.goal_type,
            goal_target: category.goal_target ? (category.goal_target / 1000).toFixed(2) : null,
            goal_target_month: category.goal_target_month,
          },
          message: `Category "${category.name}" updated successfully`,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error updating category:", error);
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
