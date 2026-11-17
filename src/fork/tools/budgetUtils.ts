import { z } from "zod";

import { configuredPlanId, type PlanIdInput } from "../../tools/planId.js";

/**
 * YNAB's alias for the plan the user opened most recently. The API accepts it
 * anywhere a plan ID goes, so tools work with zero configuration.
 */
export const LAST_USED_BUDGET = "last-used";

/** The plan inputs every fork tool takes, named as upstream's tools name them. */
export const planIdFields = {
  planId: z.string().optional().describe("The plan ID (optional, defaults to YNAB_PLAN_ID, then the last-used plan; budgetId is a deprecated alias)"),
  budgetId: z.string().optional().describe("Deprecated alias of planId (still accepted)"),
};

function given(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** The plan a call names itself, if any: `planId`, then the older `budgetId`. */
export function givenPlanId(input: PlanIdInput): string | undefined {
  return given(input.planId) ?? given(input.budgetId);
}

/**
 * The one place the fork decides which plan a call acts on: the plan the call
 * names, then the configured one (YNAB_PLAN_ID, or the older YNAB_BUDGET_ID,
 * exactly as upstream's tools read them), then the user's last-used plan.
 */
export function resolvePlan(input: PlanIdInput = {}): string {
  return givenPlanId(input) ?? configuredPlanId() ?? LAST_USED_BUDGET;
}

/** `resolvePlan` for callers that hold a bare ID. */
export function getBudgetId(inputBudgetId?: string): string {
  return resolvePlan({ budgetId: inputBudgetId });
}
