import { z } from "zod";
import { getErrorMessage } from "../../tools/errorUtils.js";
import { planIdFields, resolvePlan } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";

export const name = "ynab_get_payee_location_by_id";
export const description = "Returns a single payee location by ID. Payee locations store GPS coordinates for payees.";
export const inputSchema = {
  ...planIdFields,
  payeeLocationId: z.string().describe("The ID of the payee location"),
};

interface GetPayeeLocationByIdInput {
  planId?: string;
  budgetId?: string;
  payeeLocationId: string;
}

export async function execute(input: GetPayeeLocationByIdInput) {
  try {
    const budgetId = resolvePlan(input);

    const response: any = await ynabFetch(`/plans/${budgetId}/payee_locations/${input.payeeLocationId}`);

    const location = response.data.payee_location;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          id: location.id,
          payee_id: location.payee_id,
          latitude: location.latitude,
          longitude: location.longitude,
          deleted: location.deleted,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting payee location by ID:", error);
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
