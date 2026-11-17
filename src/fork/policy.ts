import type * as ynab from "ynab";

import { scoreMatch } from "../tools/match.js";
import { configuredPlanId } from "../tools/planId.js";
import { LAST_USED_BUDGET } from "./tools/budgetUtils.js";
import {
  createCategorySnapshot,
  isYnabId,
  listNamed,
  matchByName,
  resolveId,
  type CategorySnapshot,
  type EntityKind,
} from "./tools/resolveUtils.js";

/**
 * Fork behaviour applied to a tool call before the tool runs, so the upstream
 * tool files stay untouched:
 *
 * - Names are matched strictly. Upstream picks the best fuzzy match; here an
 *   agent may write unattended, so a near miss must ask, not guess. Every name
 *   is resolved to its ID (or, for splits, to its exact name) first, and the
 *   upstream tool never sees a loose name.
 * - A name is accepted wherever one of the listed ID fields is.
 * - With no plan given or configured, the user's last-used plan is the default.
 */

type Input = Record<string, unknown>;

interface NameField {
  /** The input field that may hold a name. */
  field: string;
  kind: EntityKind;
  /** The ID field the resolved name moves into. Omitted when `field` is itself the ID field. */
  into?: string;
}

export const NAME_FIELDS: Record<string, readonly NameField[]> = {
  ynab_create_transaction: [
    { field: "accountId", kind: "account" },
    { field: "accountName", kind: "account", into: "accountId" },
    { field: "categoryId", kind: "category" },
    { field: "categoryName", kind: "category", into: "categoryId" },
    { field: "payeeId", kind: "payee" },
  ],
  ynab_update_transaction: [
    { field: "accountId", kind: "account" },
    { field: "categoryId", kind: "category" },
    { field: "payeeId", kind: "payee" },
  ],
  ynab_get_transactions: [
    { field: "accountId", kind: "account" },
    { field: "categoryId", kind: "category" },
    { field: "payeeId", kind: "payee" },
  ],
  ynab_move_money: [
    { field: "fromCategoryId", kind: "category" },
    { field: "toCategoryId", kind: "category" },
  ],
  ynab_update_category_budget: [{ field: "categoryId", kind: "category" }],
};

/** Tools whose `subtransactions` carry a `category_name` that upstream matches loosely. */
export const SPLIT_TOOLS: ReadonlySet<string> = new Set(["ynab_create_transaction", "ynab_update_transaction"]);

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function withDefaultPlan(input: Input, acceptsPlanId: boolean): Input {
  if (!acceptsPlanId || text(input.planId) || text(input.budgetId) || configuredPlanId()) return input;
  return { ...input, planId: LAST_USED_BUDGET };
}

async function resolveField(
  input: Input,
  { field, kind, into }: NameField,
  api: ynab.API,
  planId: string,
  snapshot: CategorySnapshot,
): Promise<Input> {
  const ref = text(input[field]);
  if (!ref) return input;
  if (!into) {
    return isYnabId(ref) ? input : { ...input, [field]: await resolveId(api, planId, kind, ref, snapshot) };
  }
  // The tool prefers the ID when both are given, so the name is not consulted.
  if (text(input[into])) return input;
  const { [field]: _name, ...rest } = input;
  return { ...rest, [into]: await resolveId(api, planId, kind, ref, snapshot) };
}

const EXACT = 1;

/**
 * Splits name their category and take no ID, so upstream matches the name
 * again after this policy has run. Each name is therefore replaced by the
 * exact name of the one category it strictly matches, and that name is checked
 * with upstream's own scoring: it must be an exact match for upstream too, and
 * for no other category. Otherwise upstream could settle on a different
 * category than the one resolved here, so the call is refused instead.
 *
 * Candidates are the visible categories only, the same set upstream matches
 * against. A hidden category can not be named in a split.
 */
async function resolveSplits(input: Input, api: ynab.API, planId: string, snapshot: CategorySnapshot): Promise<Input> {
  if (!Array.isArray(input.subtransactions)) return input;
  const names = input.subtransactions.map((split: unknown) => text((split as Input | null)?.category_name));
  if (!names.some(Boolean)) return input;

  const categories = await listNamed(api, planId, "visible_category", snapshot);
  const subtransactions = input.subtransactions.map((split: unknown, index: number) => {
    const name = names[index];
    if (!name) return split;
    const match = matchByName(categories, name, "visible_category");
    const exactForUpstream = categories.filter((category) => scoreMatch(match.name, category.name) === EXACT);
    if (exactForUpstream.length !== 1 || exactForUpstream[0].id !== match.id) {
      throw new Error(
        `The category "${match.name}" can not be named in a split: its name is not unique once symbols and non-English letters are ignored. Rename it in YNAB, or split the transaction there.`,
      );
    }
    return { ...(split as Input), category_name: match.name };
  });
  return { ...input, subtransactions };
}

/** Returns the input the upstream tool should run with. Throws, without writing, when a name is not exact. */
export async function applyForkPolicy(
  toolName: string,
  rawInput: Input | null | undefined,
  api: ynab.API,
  acceptsPlanId: boolean,
): Promise<Input> {
  const input = withDefaultPlan(rawInput ?? {}, acceptsPlanId);
  const fields = NAME_FIELDS[toolName] ?? [];
  const hasSplits = SPLIT_TOOLS.has(toolName);
  if (fields.length === 0 && !hasSplits) return input;

  const planId = text(input.planId) ?? text(input.budgetId) ?? configuredPlanId() ?? LAST_USED_BUDGET;
  const snapshot = createCategorySnapshot();
  let next = input;
  for (const field of fields) {
    next = await resolveField(next, field, api, planId, snapshot);
  }
  return hasSplits ? resolveSplits(next, api, planId, snapshot) : next;
}
