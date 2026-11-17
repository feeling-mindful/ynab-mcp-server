import * as ynab from "ynab";

/**
 * Lets tools accept a YNAB name ("Ally Checking", "Groceries") anywhere they
 * accept an ID. An ID-shaped value is returned as is, with no API call; a name
 * is looked up in the budget's live list and must resolve to exactly one item.
 */

export interface Named {
  id: string;
  name: string;
}

export type EntityKind = "account" | "category" | "editable_category" | "category_group" | "payee";

const KIND_LABEL: Record<EntityKind, { one: string; many: string }> = {
  account: { one: "account", many: "accounts" },
  category: { one: "category", many: "categories" },
  editable_category: { one: "category", many: "categories" },
  category_group: { one: "category group", many: "category groups" },
  payee: { one: "payee", many: "payees" },
};

// Groups YNAB manages itself, matched by their fixed names because the installed
// SDK does not expose the API's `internal` flag. YNAB refuses any internal group
// as a target, so a miss here fails safely at the API.
const INTERNAL_GROUPS = new Set(["Internal Master Category", "Hidden Categories"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isYnabId(ref: string): boolean {
  return UUID.test(ref.trim());
}

/**
 * Picks the one item that `ref` names, or throws an Error whose message tells
 * the agent what to do next (e.g. list the close candidates so it can ask).
 *
 * `items` are the live, non-deleted entities of one kind. `ref` is never an ID
 * here (callers handle IDs first) and is already trimmed.
 *
 * Policy: an exact name wins; otherwise the name must equal exactly one item
 * after normalizing case, spacing and emoji ("groceries" finds "🛒 Groceries").
 * Partial matches are never picked automatically: writes are enabled and an
 * agent may act unattended, so a near miss must ask, not guess.
 */
export function matchByName<T extends Named>(items: readonly T[], ref: string, kind: EntityKind): T {
  const label = KIND_LABEL[kind];
  const exact = items.filter((item) => item.name === ref);
  if (exact.length === 1) return exact[0];

  const target = normalizeName(ref);
  // A name with no letters or digits ("💰", "-") normalizes to "", which would
  // loosely equal every other such name; those must match exactly or not at all.
  const loose = target ? items.filter((item) => normalizeName(item.name) === target) : [];
  if (loose.length === 1) return loose[0];

  if (loose.length > 1 || exact.length > 1) {
    const tied = loose.length > 1 ? loose : exact;
    throw new Error(`More than one ${label.one} is named "${ref}": ${describe(tied)}. Pass the ID instead.`);
  }
  const similar = target ? items.filter((item) => normalizeName(item.name).includes(target)) : [];
  const hint = similar.length > 0
    ? `Did you mean: ${describe(similar)}?`
    : `List the ${label.many} to find the right name or ID.`;
  throw new Error(`No ${label.one} named "${ref}". ${hint}`);
}

const MAX_SUGGESTIONS = 5;

/** Lowercase, letters and digits only, single spaces: "🛒  Groceries!" → "groceries". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop accents split off by NFKD, so "Café" → "cafe", not "caf e"
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function describe(items: readonly Named[]): string {
  return items
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => `"${item.name}" (${item.id})`)
    .join(", ");
}

async function listAccounts(api: ynab.API, budgetId: string): Promise<Named[]> {
  const response = await api.accounts.getAccounts(budgetId);
  return response.data.accounts.filter((a) => !a.deleted && !a.closed);
}

/**
 * One request's view of the budget's category tree. Pass the same snapshot to
 * every lookup in a tool call so two names (a category and a group) cost one
 * download, not two. Never share one across requests: it would go stale.
 */
export type CategorySnapshot = Map<string, Promise<ynab.CategoryGroupWithCategories[]>>;

export function createCategorySnapshot(): CategorySnapshot {
  return new Map();
}

async function fetchCategoryGroups(
  api: ynab.API,
  budgetId: string,
  snapshot?: CategorySnapshot,
): Promise<ynab.CategoryGroupWithCategories[]> {
  const load = async () => (await api.categories.getCategories(budgetId)).data.category_groups;
  if (!snapshot) return load();
  const cached = snapshot.get(budgetId);
  if (cached) return cached;
  const pending = load();
  snapshot.set(budgetId, pending);
  return pending;
}

async function listCategories(api: ynab.API, budgetId: string, snapshot?: CategorySnapshot): Promise<Named[]> {
  const groups = await fetchCategoryGroups(api, budgetId, snapshot);
  return groups
    .filter((g) => !g.deleted)
    .flatMap((g) => g.categories)
    .filter((c) => !c.deleted);
}

/**
 * Categories a user may rename, retarget or move: nothing hidden and nothing
 * YNAB manages itself (e.g. "Uncategorized", "Inflow: Ready to Assign"). The
 * plain "category" kind keeps those, because transactions legitimately use them.
 */
async function listEditableCategories(api: ynab.API, budgetId: string, snapshot?: CategorySnapshot): Promise<Named[]> {
  const groups = await fetchCategoryGroups(api, budgetId, snapshot);
  return groups
    .filter((g) => !g.deleted && !g.hidden && !INTERNAL_GROUPS.has(g.name))
    .flatMap((g) => g.categories)
    .filter((c) => !c.deleted && !c.hidden);
}

async function listCategoryGroups(api: ynab.API, budgetId: string, snapshot?: CategorySnapshot): Promise<Named[]> {
  const groups = await fetchCategoryGroups(api, budgetId, snapshot);
  return groups.filter((g) => !g.deleted && !g.hidden && !INTERNAL_GROUPS.has(g.name));
}

/** Like resolveId, for a required reference: a missing or blank value throws instead of reaching YNAB. */
export async function requireId(
  api: ynab.API,
  budgetId: string,
  kind: EntityKind,
  ref: string | undefined,
  field: string,
  snapshot?: CategorySnapshot,
): Promise<string> {
  const id = await resolveId(api, budgetId, kind, ref, snapshot);
  if (!id) throw new Error(`${field} is required: pass the ${KIND_LABEL[kind].one}'s ID or name`);
  return id;
}

async function listPayees(api: ynab.API, budgetId: string): Promise<Named[]> {
  const response = await api.payees.getPayees(budgetId);
  return response.data.payees.filter((p) => !p.deleted);
}

const LISTERS: Record<EntityKind, (api: ynab.API, budgetId: string, snapshot?: CategorySnapshot) => Promise<Named[]>> = {
  account: listAccounts,
  category: listCategories,
  editable_category: listEditableCategories,
  category_group: listCategoryGroups,
  payee: listPayees,
};

/** Finds the one live item that `name` names, under the strict policy of matchByName. `snapshot` lets several lookups share one category download. */
export async function resolveNamed(
  api: ynab.API,
  budgetId: string,
  kind: EntityKind,
  name: string,
  snapshot?: CategorySnapshot,
): Promise<Named> {
  const items = await LISTERS[kind](api, budgetId, snapshot);
  return matchByName(items, name.trim(), kind);
}

/** Resolves an ID-or-name to an ID. `undefined` in, `undefined` out. `snapshot` lets several lookups share one category download. */
export async function resolveId(
  api: ynab.API,
  budgetId: string,
  kind: EntityKind,
  ref: string | undefined,
  snapshot?: CategorySnapshot,
): Promise<string | undefined> {
  if (ref === undefined) return undefined;
  const trimmed = ref.trim();
  if (!trimmed || isYnabId(trimmed)) return trimmed || undefined;
  return (await resolveNamed(api, budgetId, kind, trimmed, snapshot)).id;
}
