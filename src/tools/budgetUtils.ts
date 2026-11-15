/**
 * YNAB's alias for the budget the user opened most recently. The API accepts it
 * anywhere a budget ID goes, so tools work with zero configuration.
 */
export const LAST_USED_BUDGET = "last-used";

/**
 * Shared utility for resolving a budget ID: the one passed in, then
 * YNAB_BUDGET_ID, then the user's last-used budget.
 */
export function getBudgetId(inputBudgetId?: string): string {
  return inputBudgetId || process.env.YNAB_BUDGET_ID || LAST_USED_BUDGET;
}
