import { timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import * as ynab from "ynab";

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

const handler = createMcpHandler(
  (server) => {
    const ynabToken = process.env.YNAB_API_TOKEN;
    if (!ynabToken) {
      throw new Error(
        "YNAB_API_TOKEN env var is required. Set it in the Vercel project settings.",
      );
    }
    const api = new ynab.API(ynabToken);

    for (const tool of tools) {
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

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  const expected = process.env.MCP_API_KEY;
  if (!expected) {
    throw new Error(
      "MCP_API_KEY env var is required. Set it in the Vercel project settings.",
    );
  }
  if (!bearerToken) return undefined;
  if (!timingSafeCompare(bearerToken, expected)) return undefined;

  return {
    token: bearerToken,
    scopes: ["ynab:full"],
    clientId: "ynab-mcp-server",
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
