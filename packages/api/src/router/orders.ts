import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { and, eq } from "@acme/db";
import { plans } from "@acme/db/schema";
import { InstacartApiError } from "@acme/integrations-instacart";
import {
  PlanIdInputSchema,
  PlanPayloadSchema,
  PlanStatusSchema,
} from "@acme/validators";

import { getInstacartClient } from "../services/instacart";
import { protectedProcedure } from "../trpc";

/** Instacart caps `expires_in` at 365; 30 days covers a weekly-plan cycle. */
const LINK_EXPIRES_IN_DAYS = 30;

export const ordersRouter = {
  /**
   * Cart handoff (MVP scope of the "orders" module — NOT order tracking):
   * turns a READY plan into an Instacart products-link URL the user checks
   * out on.
   *
   * Quantity caveat: PlanPayload v1 carries a human-readable quantity STRING
   * ("2 lb"), not a structured amount, so it travels in `displayText` and the
   * numeric `quantity`/`unit` fields stay omitted (Instacart defaults to
   * 1 "each"). Structured quantity/unit is a PlanPayload v2 follow-up.
   *
   * No retailer targeting: the public products-link API has no retailer
   * field — the user picks their store on the Instacart page itself, so the
   * plan's `retailerKey` is deliberately unused here (revisit with the
   * post-MVP Catalog/Connect API swap).
   *
   * No caching/persistence: links are created on demand and expire — a
   * deliberate MVP choice; re-invoking simply mints a fresh link.
   */
  createCartLink: protectedProcedure
    .input(PlanIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Ownership-scoped load — NOT_FOUND for both "doesn't exist" and "not
      // yours", never leaking existence.
      const row = await ctx.db.query.plans.findFirst({
        where: and(
          eq(plans.id, input.id),
          eq(plans.userId, ctx.session.user.id),
        ),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      if (row.status !== PlanStatusSchema.enum.ready) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Plan isn't ready yet",
        });
      }

      // Failures stay visible — a ready plan without a valid payload is a
      // server-side defect, never something to paper over with a fabricated
      // cart.
      const payload = PlanPayloadSchema.safeParse(row.payload);
      if (!payload.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Plan payload corrupted",
        });
      }

      try {
        const { url } = await getInstacartClient().createProductsLink({
          title: "Wholesum — weekly groceries",
          expiresInDays: LINK_EXPIRES_IN_DAYS,
          lineItems: payload.data.items.map((item) => ({
            name: item.name,
            displayText: `${item.name} — ${item.quantity}`,
          })),
        });
        return { url };
      } catch (error) {
        if (error instanceof InstacartApiError) {
          console.error(
            "[orders.createCartLink] Instacart error (status %s): %s",
            error.status,
            error.message,
          );
          if (error.status === 429) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "Too many requests — try again shortly",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create the Instacart cart link",
          });
        }
        // TRPCError from the config accessor passes through; anything else
        // propagates as an unexpected error.
        throw error;
      }
    }),
} satisfies TRPCRouterRecord;
