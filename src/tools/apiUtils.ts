const BASE_URL = "https://api.ynab.com/v1";

/**
 * Makes an authenticated request to the YNAB API for endpoints
 * not yet covered by the ynab SDK.
 */
export async function ynabFetch(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
  } = {}
): Promise<unknown> {
  const token = process.env.YNAB_API_TOKEN;
  if (!token) {
    throw new Error("YNAB_API_TOKEN environment variable is not set");
  }

  const url = `${BASE_URL}${path}`;
  const fetchOptions: RequestInit = {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (options.body && options.method !== "GET") {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const errorBody = await response.text();
    let errorDetail = `${response.status} ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.detail) {
        errorDetail = parsed.error.detail;
      } else if (parsed.error?.name) {
        errorDetail = parsed.error.name;
      }
    } catch {
      // Use raw error status
    }
    throw new Error(`YNAB API error: ${errorDetail}`);
  }

  return response.json();
}
