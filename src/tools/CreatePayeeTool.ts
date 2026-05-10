import { z } from "zod";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";
import { ynabFetch } from "./apiUtils.js";

export const name = "ynab_create_payee";
export const description = "Creates a new payee in the budget. Use this to add a new payee that doesn't exist yet.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  name: z.string().describe("The name of the payee to create"),
};

interface CreatePayeeInput {
  budgetId?: string;
  name: string;
}

export async function execute(input: CreatePayeeInput) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const response: any = await ynabFetch(`/plans/${budgetId}/payees`, {
      method: "POST",
      body: { payee: { name: input.name } },
    });

    const payee = response.data.payee;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          payee: {
            id: payee.id,
            name: payee.name,
          },
          message: `Payee "${payee.name}" created successfully`,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error creating payee:", error);
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
