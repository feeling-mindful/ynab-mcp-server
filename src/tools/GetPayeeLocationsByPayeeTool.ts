import { z } from "zod";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";

export const name = "ynab_get_payee_locations_by_payee";
export const description = "Returns all payee locations for a specific payee. Useful for seeing where transactions with a payee occur.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  payeeId: z.string().describe("The ID of the payee"),
};

interface GetPayeeLocationsByPayeeInput {
  budgetId?: string;
  payeeId: string;
}

export async function execute(input: GetPayeeLocationsByPayeeInput) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const response: any = await ynabFetch(`/plans/${budgetId}/payees/${input.payeeId}/payee_locations`);

    const locations = response.data.payee_locations
      .filter((loc: any) => !loc.deleted)
      .map((loc: any) => ({
        id: loc.id,
        payee_id: loc.payee_id,
        latitude: loc.latitude,
        longitude: loc.longitude,
      }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          payee_locations: locations,
          count: locations.length,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting payee locations by payee:", error);
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
