import { configuredPlanId } from "../../tools/planId.js";

/**
 * YNAB's alias for the plan the user opened most recently. The API accepts it
 * anywhere a plan ID goes, so tools work with zero configuration.
 */
export const LAST_USED_BUDGET = "last-used";

/**
 * Shared utility for resolving a plan ID: the one passed in, then the
 * configured one (YNAB_PLAN_ID, or the older YNAB_BUDGET_ID, exactly as
 * upstream's tools read them), then the user's last-used plan.
 */
export function getBudgetId(inputBudgetId?: string): string {
  return inputBudgetId || configuredPlanId() || LAST_USED_BUDGET;
}
