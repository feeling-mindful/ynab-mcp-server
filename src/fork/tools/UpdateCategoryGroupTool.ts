import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "../../tools/errorUtils.js";
import { planIdFields, resolvePlan } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";
import { requireId } from "./resolveUtils.js";

export const name = "ynab_update_category_group";
export const description = "Updates a category group's name. Use this to rename a category group.";
export const inputSchema = {
  ...planIdFields,
  categoryGroupId: z.string().describe("The category group to update: its ID or its name"),
  name: z.string().describe("The new name for the category group"),
};

interface UpdateCategoryGroupInput {
  planId?: string;
  budgetId?: string;
  categoryGroupId: string;
  name: string;
}

export async function execute(input: UpdateCategoryGroupInput, api: ynab.API) {
  try {
    const budgetId = resolvePlan(input);
    const categoryGroupId = await requireId(api, budgetId, "category_group", input.categoryGroupId, "categoryGroupId");

    const response: any = await ynabFetch(`/plans/${budgetId}/category_groups/${categoryGroupId}`, {
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
