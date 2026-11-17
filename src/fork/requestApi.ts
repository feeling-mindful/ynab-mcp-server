import * as ynab from "ynab";

import { ynabTokenContext } from "./tools/apiUtils.js";

const MAX_CACHED_CLIENTS = 8;
const clients = new Map<string, ynab.API>();

function clientFor(token: string): ynab.API {
  const cached = clients.get(token);
  if (cached) return cached;
  if (clients.size >= MAX_CACHED_CLIENTS) clients.clear();
  const client = new ynab.API(token);
  clients.set(token, client);
  return client;
}

/**
 * A YNAB client that acts as whoever the current request signed in as.
 *
 * Upstream's registry binds one client when tools are registered, which suits
 * a single-user process. This server learns the user per request, so tools get
 * this stand-in: each property read is forwarded to the client for the token in
 * `ynabTokenContext`. Outside a request there is no token and it throws.
 */
export function requestScopedApi(): ynab.API {
  return new Proxy({} as ynab.API, {
    get(_target, property) {
      const token = ynabTokenContext.getStore();
      if (!token) throw new Error("No YNAB token for this request. Sign in again.");
      return Reflect.get(clientFor(token), property);
    },
  });
}
