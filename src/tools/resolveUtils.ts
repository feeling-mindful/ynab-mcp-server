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

export type EntityKind = "account" | "category" | "payee";

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
  const exact = items.filter((item) => item.name === ref);
  if (exact.length === 1) return exact[0];

  const target = normalizeName(ref);
  const loose = items.filter((item) => normalizeName(item.name) === target);
  if (loose.length === 1) return loose[0];

  if (loose.length > 1 || exact.length > 1) {
    const tied = loose.length > 1 ? loose : exact;
    throw new Error(`More than one ${kind} is named "${ref}": ${describe(tied)}. Pass the ID instead.`);
  }
  const similar = target ? items.filter((item) => normalizeName(item.name).includes(target)) : [];
  const hint = similar.length > 0
    ? `Did you mean: ${describe(similar)}?`
    : `List the ${kind === "category" ? "categories" : `${kind}s`} to find the right name or ID.`;
  throw new Error(`No ${kind} named "${ref}". ${hint}`);
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

async function listCategories(api: ynab.API, budgetId: string): Promise<Named[]> {
  const response = await api.categories.getCategories(budgetId);
  return response.data.category_groups
    .filter((g) => !g.deleted)
    .flatMap((g) => g.categories)
    .filter((c) => !c.deleted);
}

async function listPayees(api: ynab.API, budgetId: string): Promise<Named[]> {
  const response = await api.payees.getPayees(budgetId);
  return response.data.payees.filter((p) => !p.deleted);
}

const LISTERS: Record<EntityKind, (api: ynab.API, budgetId: string) => Promise<Named[]>> = {
  account: listAccounts,
  category: listCategories,
  payee: listPayees,
};

/** Resolves an ID-or-name to an ID. `undefined` in, `undefined` out. */
export async function resolveId(
  api: ynab.API,
  budgetId: string,
  kind: EntityKind,
  ref: string | undefined,
): Promise<string | undefined> {
  if (ref === undefined) return undefined;
  const trimmed = ref.trim();
  if (!trimmed || isYnabId(trimmed)) return trimmed || undefined;
  const items = await LISTERS[kind](api, budgetId);
  return matchByName(items, trimmed, kind).id;
}
