import * as ynab from "ynab";

import { isReadOnly, registerAll, registerTools, tools as upstreamTools, type ToolEntry, type ToolRegistrar } from "../registry.js";
import { getErrorMessage, toolError } from "../tools/errorUtils.js";
import { applyForkPolicy } from "./policy.js";
import { ynabTokenContext } from "./tools/apiUtils.js";

import * as CreateAccountTool from "./tools/CreateAccountTool.js";
import * as CreateCategoryGroupTool from "./tools/CreateCategoryGroupTool.js";
import * as CreateCategoryTool from "./tools/CreateCategoryTool.js";
import * as CreatePayeeTool from "./tools/CreatePayeeTool.js";
import * as CreateScheduledTransactionTool from "./tools/CreateScheduledTransactionTool.js";
import * as DeleteScheduledTransactionTool from "./tools/DeleteScheduledTransactionTool.js";
import * as GetAccountByIdTool from "./tools/GetAccountByIdTool.js";
import * as GetBudgetByIdTool from "./tools/GetBudgetByIdTool.js";
import * as GetBudgetSettingsTool from "./tools/GetBudgetSettingsTool.js";
import * as GetCategoryByIdTool from "./tools/GetCategoryByIdTool.js";
import * as GetMoneyMovementGroupsTool from "./tools/GetMoneyMovementGroupsTool.js";
import * as GetMoneyMovementsTool from "./tools/GetMoneyMovementsTool.js";
import * as GetMonthCategoryByIdTool from "./tools/GetMonthCategoryByIdTool.js";
import * as GetPayeeByIdTool from "./tools/GetPayeeByIdTool.js";
import * as GetPayeeLocationByIdTool from "./tools/GetPayeeLocationByIdTool.js";
import * as GetPayeeLocationsByPayeeTool from "./tools/GetPayeeLocationsByPayeeTool.js";
import * as GetScheduledTransactionByIdTool from "./tools/GetScheduledTransactionByIdTool.js";
import * as GetUserTool from "./tools/GetUserTool.js";
import * as ListPayeeLocationsTool from "./tools/ListPayeeLocationsTool.js";
import * as ListPlansTool from "./tools/ListPlansTool.js";
import * as UpdateCategoryGroupTool from "./tools/UpdateCategoryGroupTool.js";
import * as UpdateCategoryTool from "./tools/UpdateCategoryTool.js";
import * as UpdatePayeeTool from "./tools/UpdatePayeeTool.js";
import * as UpdateScheduledTransactionTool from "./tools/UpdateScheduledTransactionTool.js";

/**
 * The tools this fork adds beside upstream's `tools` in ../registry.ts.
 * Upstream files are taken as they are; anything fork-specific lives under
 * src/fork so a sync with upstream does not touch it.
 *
 * A fork tool with the same name as an upstream tool replaces it here: the
 * fork's are registered second. Only the names in REPLACES_UPSTREAM may do so.
 */
export const forkTools: ToolEntry[] = [
  // Plans
  { title: "List Plans", module: ListPlansTool, writes: false },
  { title: "Get Budget", module: GetBudgetByIdTool, writes: false },
  { title: "Get Budget Settings", module: GetBudgetSettingsTool, writes: false },
  // Categories
  { title: "Get Category", module: GetCategoryByIdTool, writes: false },
  { title: "Get Month Category", module: GetMonthCategoryByIdTool, writes: false },
  { title: "Create Category", module: CreateCategoryTool, writes: true },
  { title: "Create Category Group", module: CreateCategoryGroupTool, writes: true },
  { title: "Update Category", module: UpdateCategoryTool, writes: true, idempotent: true },
  { title: "Update Category Group", module: UpdateCategoryGroupTool, writes: true, idempotent: true },
  // Accounts
  { title: "Get Account", module: GetAccountByIdTool, writes: false },
  { title: "Create Account", module: CreateAccountTool, writes: true },
  // Payees
  { title: "Get Payee", module: GetPayeeByIdTool, writes: false },
  { title: "Create Payee", module: CreatePayeeTool, writes: true },
  { title: "Update Payee", module: UpdatePayeeTool, writes: true, idempotent: true },
  { title: "List Payee Locations", module: ListPayeeLocationsTool, writes: false },
  { title: "Get Payee Location", module: GetPayeeLocationByIdTool, writes: false },
  { title: "Get Payee Locations By Payee", module: GetPayeeLocationsByPayeeTool, writes: false },
  // Scheduled transactions
  { title: "Get Scheduled Transaction", module: GetScheduledTransactionByIdTool, writes: false },
  { title: "Create Scheduled Transaction", module: CreateScheduledTransactionTool, writes: true },
  { title: "Update Scheduled Transaction", module: UpdateScheduledTransactionTool, writes: true, idempotent: true },
  { title: "Delete Scheduled Transaction", module: DeleteScheduledTransactionTool, writes: true, destructive: true },
  // User
  { title: "Get User", module: GetUserTool, writes: false },
  // Money movements
  { title: "Get Money Movements", module: GetMoneyMovementsTool, writes: false },
  { title: "Get Money Movement Groups", module: GetMoneyMovementGroupsTool, writes: false },
];

/** Upstream tools the fork serves its own version of, each for the reason given in its file. */
export const REPLACES_UPSTREAM: ReadonlySet<string> = new Set([ListPlansTool.name]);

/**
 * Tools that change YNAB are hidden unless YNAB_ALLOW_WRITES is exactly "true",
 * so a leaked credential can read the plan but cannot change it. Upstream's
 * YNAB_READ_ONLY=true still wins when both are set.
 */
export function writesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.YNAB_ALLOW_WRITES === "true" && !isReadOnly(env.YNAB_READ_ONLY);
}

/** The host MCP server: like upstream's ToolRegistrar, but its callback also gets the request's `extra`. */
export interface HostServer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(name: string, config: any, cb: (input: any, extra: any) => Promise<any>): unknown;
}

/** Reads the signed-in user's YNAB token from a tool call's `extra`. */
export type TokenReader = (extra: unknown) => string | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Run = (input: any) => Promise<any>;

interface Registered {
  config: Record<string, unknown>;
  run: Run;
}

/** Every tool the given mode exposes, bound to one YNAB client. */
function bindTools(api: ynab.API, readOnly: boolean): Map<string, Registered> {
  const bound = new Map<string, Registered>();
  const capture: ToolRegistrar = {
    registerTool(name, config, run) {
      bound.set(name, { config, run });
    },
  };
  registerAll(capture, api, { readOnly });
  registerTools(capture, api, forkTools, { readOnly });
  return bound;
}

/** Tools that take a plan, and so get the last-used plan when none is given or configured. */
const PLAN_TOOLS: ReadonlySet<string> = new Set(
  [...upstreamTools, ...forkTools].filter((tool) => "planId" in tool.module.inputSchema).map((tool) => tool.module.name),
);

/** The client used only to list tools on the host. Tools never run with it. */
const NO_CLIENT = new Proxy({} as ynab.API, {
  get() {
    throw new Error("No YNAB token for this request. Sign in again.");
  },
});

/**
 * The host builds a new server for every request, so what it registers is
 * built once per mode and reused: the name and config of each exposed tool.
 */
const catalogs = new Map<boolean, Map<string, Record<string, unknown>>>();

function catalogFor(readOnly: boolean): Map<string, Record<string, unknown>> {
  const cached = catalogs.get(readOnly);
  if (cached) return cached;
  const catalog = new Map([...bindTools(NO_CLIENT, readOnly)].map(([name, { config }]) => [name, config]));
  catalogs.set(readOnly, catalog);
  return catalog;
}

interface Session {
  api: ynab.API;
  run: Map<string, Run>;
}

const MAX_SESSIONS = 8;
const sessions = new Map<string, Session>();

/**
 * One YNAB client, and one set of tools bound to it, per signed-in token.
 * Upstream keeps short-lived caches keyed on the client object, so users must
 * never share a client: each token gets its own. The least recently used
 * session is dropped when there are too many.
 */
function sessionFor(token: string, readOnly: boolean): Session {
  const key = `${readOnly ? "ro" : "rw"}:${token}`;
  const cached = sessions.get(key);
  if (cached) {
    // A Map keeps insertion order; re-inserting marks this one as just used.
    sessions.delete(key);
    sessions.set(key, cached);
    return cached;
  }
  if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string);
  const api = new ynab.API(token);
  const run = new Map([...bindTools(api, readOnly)].map(([name, tool]) => [name, tool.run]));
  const session = { api, run };
  sessions.set(key, session);
  return session;
}

/**
 * Registers upstream's tools and the fork's on the host server. Every call
 * runs as the request's user and passes through the fork policy before the
 * tool itself. Returns how many tools were registered.
 */
export function registerForkServer(
  server: HostServer,
  tokenOf: TokenReader,
  env: Record<string, string | undefined> = process.env,
): number {
  const readOnly = !writesEnabled(env);
  const catalog = catalogFor(readOnly);

  for (const [name, config] of catalog) {
    server.registerTool(name, config, async (input: unknown, extra: unknown) => {
      const token = tokenOf(extra);
      if (!token) {
        return toolError("No YNAB token for this request. Sign in again, or set YNAB_API_TOKEN for MCP_API_KEY clients.");
      }
      const session = sessionFor(token, readOnly);
      // The catalog and the session come from the same tool list, so this only
      // misses if upstream's own env switches changed between the two.
      const run = session.run.get(name);
      if (!run) return toolError(`Tool ${name} is not available.`);
      return ynabTokenContext.run(token, async () => {
        try {
          return await run(await applyForkPolicy(name, input as Record<string, unknown>, session.api, PLAN_TOOLS.has(name)));
        } catch (error) {
          return toolError(getErrorMessage(error));
        }
      });
    });
  }
  return catalog.size;
}
