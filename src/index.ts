#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as ynab from "ynab";

// Import all tools
import * as ListBudgetsTool from "./tools/ListBudgetsTool.js";
import * as GetBudgetByIdTool from "./tools/GetBudgetByIdTool.js";
import * as GetBudgetSettingsTool from "./tools/GetBudgetSettingsTool.js";
import * as GetUnapprovedTransactionsTool from "./tools/GetUnapprovedTransactionsTool.js";
import * as BudgetSummaryTool from "./tools/BudgetSummaryTool.js";
import * as CreateTransactionTool from "./tools/CreateTransactionTool.js";
import * as ApproveTransactionTool from "./tools/ApproveTransactionTool.js";
import * as UpdateCategoryBudgetTool from "./tools/UpdateCategoryBudgetTool.js";
import * as UpdateCategoryTool from "./tools/UpdateCategoryTool.js";
import * as UpdateTransactionTool from "./tools/UpdateTransactionTool.js";
import * as BulkApproveTransactionsTool from "./tools/BulkApproveTransactionsTool.js";
import * as ListPayeesTool from "./tools/ListPayeesTool.js";
import * as GetPayeeByIdTool from "./tools/GetPayeeByIdTool.js";
import * as UpdatePayeeTool from "./tools/UpdatePayeeTool.js";
import * as ListPayeeLocationsTool from "./tools/ListPayeeLocationsTool.js";
import * as GetTransactionsTool from "./tools/GetTransactionsTool.js";
import * as DeleteTransactionTool from "./tools/DeleteTransactionTool.js";
import * as ListCategoriesTool from "./tools/ListCategoriesTool.js";
import * as GetCategoryByIdTool from "./tools/GetCategoryByIdTool.js";
import * as GetMonthCategoryByIdTool from "./tools/GetMonthCategoryByIdTool.js";
import * as ListAccountsTool from "./tools/ListAccountsTool.js";
import * as GetAccountByIdTool from "./tools/GetAccountByIdTool.js";
import * as CreateAccountTool from "./tools/CreateAccountTool.js";
import * as ListScheduledTransactionsTool from "./tools/ListScheduledTransactionsTool.js";
import * as GetScheduledTransactionByIdTool from "./tools/GetScheduledTransactionByIdTool.js";
import * as CreateScheduledTransactionTool from "./tools/CreateScheduledTransactionTool.js";
import * as UpdateScheduledTransactionTool from "./tools/UpdateScheduledTransactionTool.js";
import * as DeleteScheduledTransactionTool from "./tools/DeleteScheduledTransactionTool.js";
import * as ImportTransactionsTool from "./tools/ImportTransactionsTool.js";
import * as ListMonthsTool from "./tools/ListMonthsTool.js";
import * as GetUserTool from "./tools/GetUserTool.js";

const server = new McpServer({
  name: "ynab-mcp-server",
  version: "0.1.2",
});

// Initialize YNAB API
const api = new ynab.API(process.env.YNAB_API_TOKEN || "");

// Register all tools
server.registerTool(ListBudgetsTool.name, {
  title: "List Budgets",
  description: ListBudgetsTool.description,
  inputSchema: ListBudgetsTool.inputSchema,
}, async (input) => ListBudgetsTool.execute(input, api));

server.registerTool(GetBudgetByIdTool.name, {
  title: "Get Budget By ID",
  description: GetBudgetByIdTool.description,
  inputSchema: GetBudgetByIdTool.inputSchema,
}, async (input) => GetBudgetByIdTool.execute(input, api));

server.registerTool(GetBudgetSettingsTool.name, {
  title: "Get Budget Settings",
  description: GetBudgetSettingsTool.description,
  inputSchema: GetBudgetSettingsTool.inputSchema,
}, async (input) => GetBudgetSettingsTool.execute(input, api));

server.registerTool(GetUnapprovedTransactionsTool.name, {
  title: "Get Unapproved Transactions",
  description: GetUnapprovedTransactionsTool.description,
  inputSchema: GetUnapprovedTransactionsTool.inputSchema,
}, async (input) => GetUnapprovedTransactionsTool.execute(input, api));

server.registerTool(BudgetSummaryTool.name, {
  title: "Budget Summary",
  description: BudgetSummaryTool.description,
  inputSchema: BudgetSummaryTool.inputSchema,
}, async (input) => BudgetSummaryTool.execute(input, api));

server.registerTool(CreateTransactionTool.name, {
  title: "Create Transaction",
  description: CreateTransactionTool.description,
  inputSchema: CreateTransactionTool.inputSchema,
}, async (input) => CreateTransactionTool.execute(input, api));

server.registerTool(ApproveTransactionTool.name, {
  title: "Approve Transaction",
  description: ApproveTransactionTool.description,
  inputSchema: ApproveTransactionTool.inputSchema,
}, async (input) => ApproveTransactionTool.execute(input, api));

server.registerTool(UpdateCategoryBudgetTool.name, {
  title: "Update Category Budget",
  description: UpdateCategoryBudgetTool.description,
  inputSchema: UpdateCategoryBudgetTool.inputSchema,
}, async (input) => UpdateCategoryBudgetTool.execute(input, api));

server.registerTool(UpdateCategoryTool.name, {
  title: "Update Category",
  description: UpdateCategoryTool.description,
  inputSchema: UpdateCategoryTool.inputSchema,
}, async (input) => UpdateCategoryTool.execute(input, api));

server.registerTool(UpdateTransactionTool.name, {
  title: "Update Transaction",
  description: UpdateTransactionTool.description,
  inputSchema: UpdateTransactionTool.inputSchema,
}, async (input) => UpdateTransactionTool.execute(input, api));

server.registerTool(BulkApproveTransactionsTool.name, {
  title: "Bulk Approve Transactions",
  description: BulkApproveTransactionsTool.description,
  inputSchema: BulkApproveTransactionsTool.inputSchema,
}, async (input) => BulkApproveTransactionsTool.execute(input, api));

server.registerTool(ListPayeesTool.name, {
  title: "List Payees",
  description: ListPayeesTool.description,
  inputSchema: ListPayeesTool.inputSchema,
}, async (input) => ListPayeesTool.execute(input, api));

server.registerTool(GetPayeeByIdTool.name, {
  title: "Get Payee By ID",
  description: GetPayeeByIdTool.description,
  inputSchema: GetPayeeByIdTool.inputSchema,
}, async (input) => GetPayeeByIdTool.execute(input, api));

server.registerTool(UpdatePayeeTool.name, {
  title: "Update Payee",
  description: UpdatePayeeTool.description,
  inputSchema: UpdatePayeeTool.inputSchema,
}, async (input) => UpdatePayeeTool.execute(input, api));

server.registerTool(ListPayeeLocationsTool.name, {
  title: "List Payee Locations",
  description: ListPayeeLocationsTool.description,
  inputSchema: ListPayeeLocationsTool.inputSchema,
}, async (input) => ListPayeeLocationsTool.execute(input, api));

server.registerTool(GetTransactionsTool.name, {
  title: "Get Transactions",
  description: GetTransactionsTool.description,
  inputSchema: GetTransactionsTool.inputSchema,
}, async (input) => GetTransactionsTool.execute(input, api));

server.registerTool(DeleteTransactionTool.name, {
  title: "Delete Transaction",
  description: DeleteTransactionTool.description,
  inputSchema: DeleteTransactionTool.inputSchema,
}, async (input) => DeleteTransactionTool.execute(input, api));

server.registerTool(ListCategoriesTool.name, {
  title: "List Categories",
  description: ListCategoriesTool.description,
  inputSchema: ListCategoriesTool.inputSchema,
}, async (input) => ListCategoriesTool.execute(input, api));

server.registerTool(GetCategoryByIdTool.name, {
  title: "Get Category By ID",
  description: GetCategoryByIdTool.description,
  inputSchema: GetCategoryByIdTool.inputSchema,
}, async (input) => GetCategoryByIdTool.execute(input, api));

server.registerTool(GetMonthCategoryByIdTool.name, {
  title: "Get Month Category By ID",
  description: GetMonthCategoryByIdTool.description,
  inputSchema: GetMonthCategoryByIdTool.inputSchema,
}, async (input) => GetMonthCategoryByIdTool.execute(input, api));

server.registerTool(ListAccountsTool.name, {
  title: "List Accounts",
  description: ListAccountsTool.description,
  inputSchema: ListAccountsTool.inputSchema,
}, async (input) => ListAccountsTool.execute(input, api));

server.registerTool(GetAccountByIdTool.name, {
  title: "Get Account By ID",
  description: GetAccountByIdTool.description,
  inputSchema: GetAccountByIdTool.inputSchema,
}, async (input) => GetAccountByIdTool.execute(input, api));

server.registerTool(CreateAccountTool.name, {
  title: "Create Account",
  description: CreateAccountTool.description,
  inputSchema: CreateAccountTool.inputSchema,
}, async (input) => CreateAccountTool.execute(input, api));

server.registerTool(ListScheduledTransactionsTool.name, {
  title: "List Scheduled Transactions",
  description: ListScheduledTransactionsTool.description,
  inputSchema: ListScheduledTransactionsTool.inputSchema,
}, async (input) => ListScheduledTransactionsTool.execute(input, api));

server.registerTool(GetScheduledTransactionByIdTool.name, {
  title: "Get Scheduled Transaction By ID",
  description: GetScheduledTransactionByIdTool.description,
  inputSchema: GetScheduledTransactionByIdTool.inputSchema,
}, async (input) => GetScheduledTransactionByIdTool.execute(input, api));

server.registerTool(CreateScheduledTransactionTool.name, {
  title: "Create Scheduled Transaction",
  description: CreateScheduledTransactionTool.description,
  inputSchema: CreateScheduledTransactionTool.inputSchema,
}, async (input) => CreateScheduledTransactionTool.execute(input, api));

server.registerTool(UpdateScheduledTransactionTool.name, {
  title: "Update Scheduled Transaction",
  description: UpdateScheduledTransactionTool.description,
  inputSchema: UpdateScheduledTransactionTool.inputSchema,
}, async (input) => UpdateScheduledTransactionTool.execute(input, api));

server.registerTool(DeleteScheduledTransactionTool.name, {
  title: "Delete Scheduled Transaction",
  description: DeleteScheduledTransactionTool.description,
  inputSchema: DeleteScheduledTransactionTool.inputSchema,
}, async (input) => DeleteScheduledTransactionTool.execute(input, api));

server.registerTool(ImportTransactionsTool.name, {
  title: "Import Transactions",
  description: ImportTransactionsTool.description,
  inputSchema: ImportTransactionsTool.inputSchema,
}, async (input) => ImportTransactionsTool.execute(input, api));

server.registerTool(ListMonthsTool.name, {
  title: "List Months",
  description: ListMonthsTool.description,
  inputSchema: ListMonthsTool.inputSchema,
}, async (input) => ListMonthsTool.execute(input, api));

server.registerTool(GetUserTool.name, {
  title: "Get User",
  description: GetUserTool.description,
  inputSchema: GetUserTool.inputSchema,
}, async (input) => GetUserTool.execute(input, api));

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("YNAB MCP server running on stdio");
}

main().catch(console.error);
