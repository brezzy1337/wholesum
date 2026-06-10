import { TRPCError } from "@trpc/server";

import type { InstacartClient } from "@acme/integrations-instacart";
import { createInstacartClient } from "@acme/integrations-instacart";

/**
 * Lazy singleton accessor for the Instacart IDP client.
 *
 * Env is read at FIRST CALL, not at module import, so importing the api
 * package never crashes in builds/environments without Instacart env set.
 *
 * Configuration:
 * - `INSTACART_API_KEY` (required) — note that Instacart's development and
 *   production environments use SEPARATE API keys; one will not work against
 *   the other's base URL.
 * - `INSTACART_API_BASE_URL` (optional) — defaults to the production base
 *   URL. When using a dev key, point this at the dev server
 *   (`INSTACART_DEV_BASE_URL` from `@acme/integrations-instacart`).
 */
let client: InstacartClient | null = null;

export function getInstacartClient(): InstacartClient {
  if (client) return client;

  const apiKey = process.env.INSTACART_API_KEY;
  if (!apiKey) {
    // Failures stay visible — never a fabricated retailer list. Message is
    // deliberately generic; no env-var names or secrets reach the client.
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Store lookup is not configured",
    });
  }

  client = createInstacartClient({
    apiKey,
    baseUrl: process.env.INSTACART_API_BASE_URL,
  });
  return client;
}
