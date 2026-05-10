import { z } from "zod";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";

export const name = "ynab_get_money_movements";
export const description = "Returns all money movements for a budget. Money movements show where funds were moved between categories.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
};

interface GetMoneyMovementsInput {
  budgetId?: string;
}

export async function execute(input: GetMoneyMovementsInput) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const response: any = await ynabFetch(`/plans/${budgetId}/money_movements`);

    const movements = response.data.money_movements.map((m: any) => ({
      id: m.id,
      month: m.month,
      moved_at: m.moved_at,
      note: m.note,
      money_movement_group_id: m.money_movement_group_id,
      from_category_id: m.from_category_id,
      to_category_id: m.to_category_id,
      amount: (m.amount / 1000).toFixed(2),
      amount_currency: m.amount_currency,
      amount_formatted: m.amount_formatted,
    }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          money_movements: movements,
          count: movements.length,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting money movements:", error);
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
