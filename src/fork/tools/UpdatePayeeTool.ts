import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "../../tools/errorUtils.js";
import { planIdFields, resolvePlan } from "./budgetUtils.js";

export const name = "ynab_update_payee";
export const description = "Updates an existing payee. Allows renaming a payee.";
export const inputSchema = {
  ...planIdFields,
  payeeId: z.string().describe("The ID of the payee to update"),
  name: z.string().describe("The new name for the payee"),
};

interface UpdatePayeeInput {
  planId?: string;
  budgetId?: string;
  payeeId: string;
  name: string;
}

export async function execute(input: UpdatePayeeInput, api: ynab.API) {
  try {
    const budgetId = resolvePlan(input);

    const data: ynab.PatchPayeeWrapper = {
      payee: {
        name: input.name,
      },
    };

    console.error(`Updating payee ${input.payeeId} in budget ${budgetId}`);
    const response = await api.payees.updatePayee(budgetId, input.payeeId, data);

    const payee = response.data.payee;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          payee: {
            id: payee.id,
            name: payee.name,
            transfer_account_id: payee.transfer_account_id,
          },
          message: `Payee updated to "${payee.name}"`,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error updating payee:", error);
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
