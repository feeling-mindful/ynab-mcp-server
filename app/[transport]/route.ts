import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import * as ynab from "ynab";

import * as ApproveTransactionTool from "../../src/tools/ApproveTransactionTool.js";
import * as BudgetSummaryTool from "../../src/tools/BudgetSummaryTool.js";
import * as BulkApproveTransactionsTool from "../../src/tools/BulkApproveTransactionsTool.js";
import * as CreateTransactionTool from "../../src/tools/CreateTransactionTool.js";
import * as DeleteTransactionTool from "../../src/tools/DeleteTransactionTool.js";
import * as GetTransactionsTool from "../../src/tools/GetTransactionsTool.js";
import * as GetUnapprovedTransactionsTool from "../../src/tools/GetUnapprovedTransactionsTool.js";
import * as ImportTransactionsTool from "../../src/tools/ImportTransactionsTool.js";
import * as ListAccountsTool from "../../src/tools/ListAccountsTool.js";
import * as ListBudgetsTool from "../../src/tools/ListBudgetsTool.js";
import * as ListCategoriesTool from "../../src/tools/ListCategoriesTool.js";
import * as ListMonthsTool from "../../src/tools/ListMonthsTool.js";
import * as ListPayeesTool from "../../src/tools/ListPayeesTool.js";
import * as ListScheduledTransactionsTool from "../../src/tools/ListScheduledTransactionsTool.js";
import * as UpdateCategoryBudgetTool from "../../src/tools/UpdateCategoryBudgetTool.js";
import * as UpdateTransactionTool from "../../src/tools/UpdateTransactionTool.js";

interface ToolModule {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any, api: ynab.API) => Promise<unknown>;
}

const tools: ToolModule[] = [
  ListBudgetsTool,
  GetUnapprovedTransactionsTool,
  BudgetSummaryTool,
  CreateTransactionTool,
  ApproveTransactionTool,
  UpdateCategoryBudgetTool,
  UpdateTransactionTool,
  BulkApproveTransactionsTool,
  ListPayeesTool,
  GetTransactionsTool,
  DeleteTransactionTool,
  ListCategoriesTool,
  ListAccountsTool,
  ListScheduledTransactionsTool,
  ImportTransactionsTool,
  ListMonthsTool,
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
  if (bearerToken !== expected) return undefined;

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
