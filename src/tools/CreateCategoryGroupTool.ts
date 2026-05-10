import { z } from "zod";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";

export const name = "ynab_create_category_group";
export const description = "Creates a new category group in the budget.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  name: z.string().describe("The name of the category group"),
};

interface CreateCategoryGroupInput {
  budgetId?: string;
  name: string;
}

export async function execute(input: CreateCategoryGroupInput) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const response: any = await ynabFetch(`/plans/${budgetId}/category_groups`, {
      method: "POST",
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
          message: `Category group "${group.name}" created successfully`,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error creating category group:", error);
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
