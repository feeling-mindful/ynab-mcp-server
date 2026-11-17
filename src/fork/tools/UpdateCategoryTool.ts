import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "../../tools/errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";
import { createCategorySnapshot, requireId, resolveId } from "./resolveUtils.js";

export const name = "ynab_update_category";
export const description = "Updates a category's properties (name, note, target) or moves it to another category group. For updating the budgeted amount, use ynab_update_category_budget instead.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID, then your last-used budget)"),
  categoryId: z.string().describe("The category to update: its ID or its name"),
  categoryGroupId: z.string().optional().describe("Move the category to this category group: the group's ID or its name"),
  name: z.string().optional().describe("New name for the category"),
  note: z.string().optional().describe("New note for the category"),
  goalTarget: z.number().nonnegative().optional().describe("Target amount in dollars. If the category has no target yet, YNAB creates a monthly one. 0 removes the existing target."),
  goalTargetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Target date in ISO format (e.g. 2024-12-01)"),
};

interface UpdateCategoryInput {
  budgetId?: string;
  categoryId: string;
  categoryGroupId?: string;
  name?: string;
  note?: string;
  goalTarget?: number;
  goalTargetDate?: string;
}

// The fields YNAB's PATCH /categories accepts that this tool sets. Sent with
// ynabFetch because the installed SDK's serializer drops goal_target_date.
interface CategoryPatch {
  category_group_id?: string;
  name?: string;
  note?: string;
  goal_target?: number;
  goal_target_date?: string;
}

interface CategoryResponse {
  // goal_target_date is in the API response but missing from the installed SDK's type.
  data: { category: ynab.Category & { goal_target_date?: string | null } };
}

function buildPatch(input: UpdateCategoryInput, categoryGroupId: string | undefined): CategoryPatch {
  return {
    ...(categoryGroupId !== undefined && { category_group_id: categoryGroupId }),
    ...(input.name !== undefined && { name: input.name }),
    ...(input.note !== undefined && { note: input.note }),
    ...(input.goalTarget !== undefined && { goal_target: Math.round(input.goalTarget * 1000) }),
    ...(input.goalTargetDate !== undefined && { goal_target_date: input.goalTargetDate }),
  };
}

export async function execute(input: UpdateCategoryInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);
    // Both lookups read the same category tree; share one download between them.
    const snapshot = createCategorySnapshot();
    const categoryId = await requireId(api, budgetId, "editable_category", input.categoryId, "categoryId", snapshot);
    if (input.categoryGroupId !== undefined && !input.categoryGroupId.trim()) {
      throw new Error("categoryGroupId is blank: pass the category group's ID or name, or leave it out");
    }
    const categoryGroupId = await resolveId(api, budgetId, "category_group", input.categoryGroupId, snapshot);

    const patch = buildPatch(input, categoryGroupId);
    if (Object.keys(patch).length === 0) {
      throw new Error("No fields provided to update");
    }

    console.error(`Updating category ${categoryId} in budget ${budgetId}`);
    const response = (await ynabFetch(`/plans/${budgetId}/categories/${categoryId}`, {
      method: "PATCH",
      body: { category: patch },
    })) as CategoryResponse;

    const category = response.data.category;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          category: {
            id: category.id,
            name: category.name,
            category_group_id: category.category_group_id,
            category_group_name: category.category_group_name,
            note: category.note,
            goal_type: category.goal_type,
            goal_target: category.goal_target ? (category.goal_target / 1000).toFixed(2) : null,
            goal_target_date: category.goal_target_date,
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
