import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_list_payee_locations";
export const description = "Lists all payee locations in a budget. Payee locations are used to track where transactions with a payee occur.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
};

interface ListPayeeLocationsInput {
  budgetId?: string;
}

export async function execute(input: ListPayeeLocationsInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    console.error(`Listing payee locations for budget ${budgetId}`);
    const response = await api.payeeLocations.getPayeeLocations(budgetId);

    const locations = response.data.payee_locations
      .filter((loc) => !loc.deleted)
      .map((loc) => ({
        id: loc.id,
        payee_id: loc.payee_id,
        latitude: loc.latitude,
        longitude: loc.longitude,
        deleted: loc.deleted,
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
    console.error("Error listing payee locations:", error);
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
