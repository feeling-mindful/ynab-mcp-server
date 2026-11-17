import * as ynab from "ynab";

import { getErrorMessage, toolError } from "../../tools/errorUtils.js";

/**
 * Replaces upstream's tool of the same name on the per-request server.
 * Upstream's refuses to run unless YNAB_API_TOKEN is set in the environment,
 * which is right for a single-user process; here the token comes from whoever
 * signed in, and the environment variable is deliberately absent.
 */
export const name = "ynab_list_plans";
export const description = "Lists all available plans from YNAB API";
export const inputSchema = {};

export async function execute(_input: Record<string, unknown>, api: ynab.API) {
  try {
    const response = await api.plans.getPlans();
    const plans = response.data.plans.map((plan) => ({ id: plan.id, name: plan.name }));
    return {
      content: [{ type: "text" as const, text: JSON.stringify(plans, null, 2) }],
    };
  } catch (error: unknown) {
    console.error("Error listing plans:", getErrorMessage(error));
    return toolError(getErrorMessage(error));
  }
}
