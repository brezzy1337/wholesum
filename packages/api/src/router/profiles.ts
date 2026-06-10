import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { eq, sql } from "@acme/db";
import { profiles } from "@acme/db/schema";
import { UpsertProfileSchema } from "@acme/validators";

import { protectedProcedure } from "../trpc";

export const profilesRouter = {
  get: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.query.profiles.findFirst({
      where: eq(profiles.userId, ctx.session.user.id),
    });
    return profile ?? null;
  }),
  upsert: protectedProcedure
    .input(UpsertProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const [profile] = await ctx.db
        .insert(profiles)
        .values({
          userId: ctx.session.user.id,
          monthlyBudgetCents: input.monthlyBudgetCents,
          householdSize: input.householdSize,
          dietaryRestrictions: input.dietaryRestrictions,
        })
        .onConflictDoUpdate({
          target: profiles.userId,
          set: {
            monthlyBudgetCents: input.monthlyBudgetCents,
            householdSize: input.householdSize,
            dietaryRestrictions: input.dietaryRestrictions,
            updatedAt: sql`now()`,
          },
        })
        .returning();

      if (!profile) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upsert profile",
        });
      }
      return profile;
    }),
} satisfies TRPCRouterRecord;
