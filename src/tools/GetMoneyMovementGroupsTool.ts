import { z } from "zod";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";

export const name = "ynab_get_money_movement_groups";
export const description = "Returns all money movement groups for a budget. Money movement groups batch related category transfers together.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
};

interface GetMoneyMovementGroupsInput {
  budgetId?: string;
}

export async function execute(input: GetMoneyMovementGroupsInput) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const response: any = await ynabFetch(`/plans/${budgetId}/money_movement_groups`);

    const groups = response.data.money_movement_groups.map((g: any) => ({
      id: g.id,
      group_created_at: g.group_created_at,
      month: g.month,
      note: g.note,
      performed_by_user_id: g.performed_by_user_id,
    }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          money_movement_groups: groups,
          count: groups.length,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting money movement groups:", error);
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
