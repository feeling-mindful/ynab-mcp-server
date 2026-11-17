import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "../../tools/errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";

export const name = "ynab_create_account";
export const description = "Creates a new account in the budget. Supports checking, savings, credit card, and other account types.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID environment variable)"),
  name: z.string().describe("The name of the account"),
  type: z.enum(["checking", "savings", "cash", "creditCard", "otherAsset", "otherLiability"]).describe("The type of account. YNAB only lets the API create these types; loans must be added in the app."),
  balance: z.number().describe("The current balance of the account in dollars (e.g. 1500.00)"),
};

interface CreateAccountInput {
  budgetId?: string;
  name: string;
  type: ynab.SaveAccountType;
  balance: number;
}

export async function execute(input: CreateAccountInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    const account: ynab.PostAccountWrapper = {
      account: {
        name: input.name,
        type: input.type,
        balance: Math.round(input.balance * 1000),
      },
    };

    console.error(`Creating account "${input.name}" in budget ${budgetId}`);
    const response = await api.accounts.createAccount(budgetId, account);

    const createdAccount = response.data.account;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          account: {
            id: createdAccount.id,
            name: createdAccount.name,
            type: createdAccount.type,
            balance: (createdAccount.balance / 1000).toFixed(2),
            on_budget: createdAccount.on_budget,
          },
          message: `Account "${createdAccount.name}" created successfully`,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error creating account:", error);
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
