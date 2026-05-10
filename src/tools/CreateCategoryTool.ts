import { z } from "zod";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";

export const name = "ynab_create_category";
export const description = "Creates a new category in the budget. Optionally set a goal target and goal target date.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  name: z.string().describe("The name of the category"),
  categoryGroupId: z.string().describe("The ID of the category group to add this category to"),
  note: z.string().optional().describe("Optional note for the category"),
  goalTarget: z.number().optional().describe("Goal target amount in dollars (optional)"),
  goalTargetDate: z.string().optional().describe("Goal target date in ISO format, e.g. 2024-12-01 (optional). If provided with goalTarget, creates a 'due on' date goal."),
};

interface CreateCategoryInput {
  budgetId?: string;
  name: string;
  categoryGroupId: string;
  note?: string;
  goalTarget?: number;
  goalTargetDate?: string;
}

export async function execute(input: CreateCategoryInput) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const category: any = {
      name: input.name,
      category_group_id: input.categoryGroupId,
    };

    if (input.note !== undefined) category.note = input.note;
    if (input.goalTarget !== undefined) category.goal_target = Math.round(input.goalTarget * 1000);
    if (input.goalTargetDate !== undefined) category.goal_target_date = input.goalTargetDate;

    const response: any = await ynabFetch(`/plans/${budgetId}/categories`, {
      method: "POST",
      body: { category },
    });

    const created = response.data.category;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          category: {
            id: created.id,
            name: created.name,
            category_group_id: created.category_group_id,
            category_group_name: created.category_group_name,
            goal_target: created.goal_target ? (created.goal_target / 1000).toFixed(2) : null,
            goal_target_date: created.goal_target_date,
          },
          message: `Category "${created.name}" created successfully`,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error creating category:", error);
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
