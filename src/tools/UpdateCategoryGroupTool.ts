import { z } from "zod";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";

export const name = "ynab_update_category_group";
export const description = "Updates a category group's name. Use this to rename a category group.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  categoryGroupId: z.string().describe("The ID of the category group to update"),
  name: z.string().describe("The new name for the category group"),
};

interface UpdateCategoryGroupInput {
  budgetId?: string;
  categoryGroupId: string;
  name: string;
}

export async function execute(input: UpdateCategoryGroupInput) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const response: any = await ynabFetch(`/plans/${budgetId}/category_groups/${input.categoryGroupId}`, {
      method: "PATCH",
      body: { category_group: { name: input.name } },
    });

    const group = response.data.category_group;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          category_group: {
            id: group.id,
            name: group.name,
          },
          message: `Category group renamed to "${group.name}"`,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error updating category group:", error);
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
