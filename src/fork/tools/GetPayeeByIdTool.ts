import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "../../tools/errorUtils.js";
import { planIdFields, resolvePlan } from "./budgetUtils.js";

export const name = "ynab_get_payee_by_id";
export const description = "Returns a single payee by ID. Useful for getting detailed information about a specific payee.";
export const inputSchema = {
  ...planIdFields,
  payeeId: z.string().describe("The ID of the payee to retrieve"),
};

interface GetPayeeByIdInput {
  planId?: string;
  budgetId?: string;
  payeeId: string;
}

export async function execute(input: GetPayeeByIdInput, api: ynab.API) {
  try {
    const budgetId = resolvePlan(input);

    console.error(`Getting payee ${input.payeeId} for budget ${budgetId}`);
    const response = await api.payees.getPayeeById(budgetId, input.payeeId);

    const payee = response.data.payee;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          id: payee.id,
          name: payee.name,
          transfer_account_id: payee.transfer_account_id,
          deleted: payee.deleted,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting payee by ID:", error);
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
