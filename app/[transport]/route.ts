import { createMcpHandler, withMcpAuth } from "mcp-handler";
import * as ynab from "ynab";

import { verifyBearer } from "../../lib/verify-bearer";

import * as ApproveTransactionTool from "../../src/tools/ApproveTransactionTool.js";
import * as BudgetSummaryTool from "../../src/tools/BudgetSummaryTool.js";
import * as BulkApproveTransactionsTool from "../../src/tools/BulkApproveTransactionsTool.js";
import * as CreateAccountTool from "../../src/tools/CreateAccountTool.js";
import * as CreateCategoryGroupTool from "../../src/tools/CreateCategoryGroupTool.js";
import * as CreateCategoryTool from "../../src/tools/CreateCategoryTool.js";
import * as CreatePayeeTool from "../../src/tools/CreatePayeeTool.js";
import * as CreateScheduledTransactionTool from "../../src/tools/CreateScheduledTransactionTool.js";
import * as CreateTransactionTool from "../../src/tools/CreateTransactionTool.js";
import * as DeleteScheduledTransactionTool from "../../src/tools/DeleteScheduledTransactionTool.js";
import * as DeleteTransactionTool from "../../src/tools/DeleteTransactionTool.js";
import * as GetAccountByIdTool from "../../src/tools/GetAccountByIdTool.js";
import * as GetBudgetByIdTool from "../../src/tools/GetBudgetByIdTool.js";
import * as GetBudgetSettingsTool from "../../src/tools/GetBudgetSettingsTool.js";
import * as GetCategoryByIdTool from "../../src/tools/GetCategoryByIdTool.js";
import * as GetMoneyMovementGroupsTool from "../../src/tools/GetMoneyMovementGroupsTool.js";
import * as GetMoneyMovementsTool from "../../src/tools/GetMoneyMovementsTool.js";
import * as GetMonthCategoryByIdTool from "../../src/tools/GetMonthCategoryByIdTool.js";
import * as GetPayeeByIdTool from "../../src/tools/GetPayeeByIdTool.js";
import * as GetPayeeLocationByIdTool from "../../src/tools/GetPayeeLocationByIdTool.js";
import * as GetPayeeLocationsByPayeeTool from "../../src/tools/GetPayeeLocationsByPayeeTool.js";
import * as GetScheduledTransactionByIdTool from "../../src/tools/GetScheduledTransactionByIdTool.js";
import * as GetTransactionsTool from "../../src/tools/GetTransactionsTool.js";
import * as GetUnapprovedTransactionsTool from "../../src/tools/GetUnapprovedTransactionsTool.js";
import * as GetUserTool from "../../src/tools/GetUserTool.js";
import * as ImportTransactionsTool from "../../src/tools/ImportTransactionsTool.js";
import * as ListAccountsTool from "../../src/tools/ListAccountsTool.js";
import * as ListBudgetsTool from "../../src/tools/ListBudgetsTool.js";
import * as ListCategoriesTool from "../../src/tools/ListCategoriesTool.js";
import * as ListMonthsTool from "../../src/tools/ListMonthsTool.js";
import * as ListPayeeLocationsTool from "../../src/tools/ListPayeeLocationsTool.js";
import * as ListPayeesTool from "../../src/tools/ListPayeesTool.js";
import * as ListScheduledTransactionsTool from "../../src/tools/ListScheduledTransactionsTool.js";
import * as UpdateCategoryBudgetTool from "../../src/tools/UpdateCategoryBudgetTool.js";
import * as UpdateCategoryGroupTool from "../../src/tools/UpdateCategoryGroupTool.js";
import * as UpdateCategoryTool from "../../src/tools/UpdateCategoryTool.js";
import * as UpdatePayeeTool from "../../src/tools/UpdatePayeeTool.js";
import * as UpdateScheduledTransactionTool from "../../src/tools/UpdateScheduledTransactionTool.js";
import * as UpdateTransactionTool from "../../src/tools/UpdateTransactionTool.js";

interface ToolModule {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any, api: ynab.API) => Promise<unknown>;
}

const tools: ToolModule[] = [
  // Budgets
  ListBudgetsTool,
  GetBudgetByIdTool,
  GetBudgetSettingsTool,
  BudgetSummaryTool,
  // Transactions
  GetTransactionsTool,
  GetUnapprovedTransactionsTool,
  CreateTransactionTool,
  UpdateTransactionTool,
  DeleteTransactionTool,
  ApproveTransactionTool,
  BulkApproveTransactionsTool,
  ImportTransactionsTool,
  // Categories
  ListCategoriesTool,
  GetCategoryByIdTool,
  GetMonthCategoryByIdTool,
  CreateCategoryTool,
  CreateCategoryGroupTool,
  UpdateCategoryTool,
  UpdateCategoryGroupTool,
  UpdateCategoryBudgetTool,
  // Accounts
  ListAccountsTool,
  GetAccountByIdTool,
  CreateAccountTool,
  // Payees
  ListPayeesTool,
  GetPayeeByIdTool,
  CreatePayeeTool,
  UpdatePayeeTool,
  ListPayeeLocationsTool,
  GetPayeeLocationByIdTool,
  GetPayeeLocationsByPayeeTool,
  // Scheduled Transactions
  ListScheduledTransactionsTool,
  GetScheduledTransactionByIdTool,
  CreateScheduledTransactionTool,
  UpdateScheduledTransactionTool,
  DeleteScheduledTransactionTool,
  // Months
  ListMonthsTool,
  // User
  GetUserTool,
  // Money Movements
  GetMoneyMovementsTool,
  GetMoneyMovementGroupsTool,
] as ToolModule[];

// Tools that change data in YNAB. Hidden unless YNAB_ALLOW_WRITES=true, so a
// leaked credential can read the budget but can't create, edit or delete anything.
const WRITE_TOOL = /^ynab_(create|update|delete|approve|bulk_approve|import)_/;
const writesAllowed = process.env.YNAB_ALLOW_WRITES === "true";
const exposedTools = writesAllowed
  ? tools
  : tools.filter((tool) => !WRITE_TOOL.test(tool.name));

const handler = createMcpHandler(
  (server) => {
    const ynabToken = process.env.YNAB_API_TOKEN;
    if (!ynabToken) {
      throw new Error(
        "YNAB_API_TOKEN env var is required. Set it in the Vercel project settings.",
      );
    }
    const api = new ynab.API(ynabToken);

    for (const tool of exposedTools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          inputSchema: tool.inputSchema as any,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (input: any) =>
          (await tool.execute(input, api)) as {
            content: Array<{ type: "text"; text: string }>;
          },
      );
    }
  },
  {},
  {
    basePath: "",
    maxDuration: 60,
    verboseLogs: false,
  },
);

const authHandler = withMcpAuth(handler, verifyBearer, {
  required: true,
  // Point the 401's resource_metadata at the configured public URL rather than
  // trusting forwarded host headers.
  resourceUrl: process.env.MCP_PUBLIC_URL?.replace(/\/+$/, "") || undefined,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
