import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { getBudgetId } from "./budgetUtils.js";
import { toDollars } from "./moneyUtils.js";

export const name = "ynab_budget_summary";
export const description =
  "Get a compact summary of a budget month, in dollars. Starts with a headline (Ready to Assign, income, " +
  "overspent total, underfunded total, unapproved transaction count, age of money), then lists overspent " +
  "categories worst first, underfunded categories by amount still needed, and open account balances. " +
  "Use this first to answer 'how am I doing?' or 'does anything need attention?'.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget (optional, defaults to YNAB_BUDGET_ID, then your last-used budget)"),
  month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The budget month in ISO format (e.g. 2016-12-01). The string 'current' can also be used to specify the current calendar month (UTC)"),
};

interface BudgetSummaryInput {
  budgetId?: string;
  month?: string;
}

// YNAB's own bookkeeping group (holds "Inflow: Ready to Assign"); never shown to users.
const INTERNAL_GROUP = "Internal Master Category";

function visibleCategories(categories: ynab.Category[]): ynab.Category[] {
  return categories.filter(
    (c) => !c.deleted && !c.hidden && c.category_group_name !== INTERNAL_GROUP,
  );
}

function summarize(month: ynab.MonthDetail, accounts: ynab.Account[], unapprovedCount: number) {
  const categories = visibleCategories(month.categories);

  const overspent = categories
    .filter((c) => c.balance < 0)
    .sort((a, b) => a.balance - b.balance)
    .map((c) => ({
      name: c.name,
      group: c.category_group_name,
      balance: toDollars(c.balance),
      budgeted: toDollars(c.budgeted),
      activity: toDollars(c.activity),
    }));

  const underfunded = categories
    .filter((c) => (c.goal_under_funded ?? 0) > 0)
    .sort((a, b) => (b.goal_under_funded ?? 0) - (a.goal_under_funded ?? 0))
    .map((c) => ({
      name: c.name,
      group: c.category_group_name,
      needed: toDollars(c.goal_under_funded ?? 0),
    }));

  const sumMilliunits = (values: number[]) => values.reduce((total, v) => total + v, 0);

  return {
    month: month.month,
    headline: {
      ready_to_assign: toDollars(month.to_be_budgeted),
      income: toDollars(month.income),
      budgeted: toDollars(month.budgeted),
      activity: toDollars(month.activity),
      age_of_money_days: month.age_of_money ?? null,
      overspent_count: overspent.length,
      overspent_total: toDollars(sumMilliunits(categories.filter((c) => c.balance < 0).map((c) => c.balance))),
      underfunded_total: toDollars(sumMilliunits(categories.map((c) => c.goal_under_funded ?? 0))),
      unapproved_count: unapprovedCount,
    },
    overspent,
    underfunded,
    accounts: accounts
      .filter((a) => !a.deleted && !a.closed)
      .map((a) => ({ name: a.name, type: a.type, balance: toDollars(a.balance) })),
  };
}

export async function execute(input: BudgetSummaryInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);
    const month = input.month || "current";

    const [accountsResponse, monthResponse, unapprovedResponse] = await Promise.all([
      api.accounts.getAccounts(budgetId),
      api.months.getBudgetMonth(budgetId, month),
      api.transactions.getTransactions(budgetId, undefined, ynab.GetTransactionsTypeEnum.Unapproved),
    ]);

    const unapprovedCount = unapprovedResponse.data.transactions.filter((t) => !t.deleted).length;
    const summary = summarize(monthResponse.data.month, accountsResponse.data.accounts, unapprovedCount);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    };
  } catch (error: unknown) {
    console.error("Error getting budget summary:", error);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        success: false,
        error: getErrorMessage(error),
      }, null, 2) }],
    };
  }
}
