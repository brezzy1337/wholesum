import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { InstacartApiError } from "@acme/integrations-instacart";
import { NearbyRetailersInputSchema } from "@acme/validators";

import { getInstacartClient } from "../services/instacart";
import { protectedProcedure } from "../trpc";

export const storesRouter = {
  /**
   * Nearby Instacart retailers for a postal code. Read-only lookup — the
   * retailer choice is persisted later via `plan.create`'s `retailerKey`.
   *
   * Upstream errors are logged server-side and re-thrown with generic
   * messages; upstream status text, URLs, and bodies never reach the client.
   */
  nearby: protectedProcedure
    .input(NearbyRetailersInputSchema)
    .query(async ({ input }) => {
      try {
        return await getInstacartClient().getNearbyRetailers({
          postalCode: input.postalCode,
          countryCode: input.countryCode,
        });
      } catch (error) {
        if (error instanceof InstacartApiError) {
          console.error(
            "[stores.nearby] Instacart error (status %s): %s",
            error.status,
            error.message,
          );
          if (error.status === 429) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "Too many store lookups — try again shortly",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not fetch nearby retailers",
          });
        }
        // TRPCError from the config accessor passes through; anything else
        // propagates as an unexpected error.
        throw error;
      }
    }),
} satisfies TRPCRouterRecord;
