import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";

export const name = "ynab_get_user";
export const description = "Returns information about the authenticated YNAB user.";
export const inputSchema = {};

export async function execute(_input: Record<string, unknown>, api: ynab.API) {
  try {
    if (!process.env.YNAB_API_TOKEN) {
      return {
        content: [{ type: "text" as const, text: "YNAB API Token is not set" }]
      };
    }

    console.error("Getting authenticated user info");
    const response = await api.user.getUser();

    const user = response.data.user;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          id: user.id,
        }, null, 2),
      }],
    };
  } catch (error) {
    console.error("Error getting user info:", error);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: false,
          error: getErrorMessage(error),
        }, null, 2),
      }],
    };
  }
}
