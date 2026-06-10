import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { db } from "@acme/db/client";
import { and, desc, eq, inArray } from "@acme/db";
import { plans, profiles } from "@acme/db/schema";
import type { PlanInputSnapshot, PlanPayload } from "@acme/validators";
import {
  CreatePlanInputSchema,
  PlanIdInputSchema,
  PlanInputSnapshotSchema,
  PlanPayloadSchema,
} from "@acme/validators";

import { enqueuePlanGeneration } from "../services/plan-queue";
import { protectedProcedure } from "../trpc";

/**
 * Load the caller's profile and require it to be onboarding-complete (budget
 * set). Plan creation/regeneration snapshots are built from this — a fresh
 * read every time, so profile edits take effect on the next (re)generation.
 */
async function getCompleteProfile(database: typeof db, userId: string) {
  const profile = await database.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });
  if (profile?.monthlyBudgetCents == null) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Complete onboarding before requesting a plan — a monthly budget is required.",
    });
  }
  return profile;
}

function buildSnapshot(
  profile: Awaited<ReturnType<typeof getCompleteProfile>>,
  retailerKey: string | null,
): PlanInputSnapshot {
  // Belt-and-suspenders: guarantees what we persist matches the v1 contract.
  return PlanInputSnapshotSchema.parse({
    version: 1,
    householdSize: profile.householdSize,
    monthlyBudgetCents: profile.monthlyBudgetCents,
    dietaryRestrictions: profile.dietaryRestrictions ?? [],
    retailerKey,
  });
}

export const planRouter = {
  create: protectedProcedure
    .input(CreatePlanInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await getCompleteProfile(ctx.db, ctx.session.user.id);
      const snapshot = buildSnapshot(profile, input.retailerKey ?? null);

      const [plan] = await ctx.db
        .insert(plans)
        .values({
          userId: ctx.session.user.id,
          input: snapshot,
          retailerKey: snapshot.retailerKey,
        })
        .returning();

      if (!plan) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create plan",
        });
      }

      await enqueuePlanGeneration(plan.id);
      return plan;
    }),

  get: protectedProcedure
    .input(PlanIdInputSchema)
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.plans.findFirst({
        where: and(
          eq(plans.id, input.id),
          eq(plans.userId, ctx.session.user.id),
        ),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      const snapshot = PlanInputSnapshotSchema.safeParse(row.input);
      if (!snapshot.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Plan input snapshot corrupted",
        });
      }

      let payload: PlanPayload | null = null;
      if (row.payload !== null) {
        const parsed = PlanPayloadSchema.safeParse(row.payload);
        if (!parsed.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Plan payload corrupted",
          });
        }
        payload = parsed.data;
      }

      return { ...row, input: snapshot.data, payload };
    }),

  list: protectedProcedure.query(({ ctx }) => {
    // Lightweight projection — the jsonb columns (input/payload) stay out of
    // the list to keep it cheap; fetch a single plan via `get` for details.
    return ctx.db.query.plans.findMany({
      where: eq(plans.userId, ctx.session.user.id),
      columns: { input: false, payload: false },
      orderBy: desc(plans.createdAt),
      limit: 50,
    });
  }),

  status: protectedProcedure
    .input(PlanIdInputSchema)
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.plans.findFirst({
        where: and(
          eq(plans.id, input.id),
          eq(plans.userId, ctx.session.user.id),
        ),
        columns: { id: true, status: true, error: true, updatedAt: true },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }
      return row;
    }),

  regenerate: protectedProcedure
    .input(PlanIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.db.query.plans.findFirst({
        where: and(
          eq(plans.id, input.id),
          eq(plans.userId, ctx.session.user.id),
        ),
      });
      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }
      if (source.status === "pending" || source.status === "processing") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Plan is still being generated",
        });
      }

      // Fresh snapshot from the CURRENT profile (not a copy of the source
      // snapshot) so profile edits take effect; the retailer choice carries
      // over from the source plan.
      const profile = await getCompleteProfile(ctx.db, ctx.session.user.id);
      const snapshot = buildSnapshot(profile, source.retailerKey);

      const [plan] = await ctx.db
        .insert(plans)
        .values({
          userId: ctx.session.user.id,
          input: snapshot,
          retailerKey: snapshot.retailerKey,
          regeneratedFromPlanId: source.id,
        })
        .returning();

      if (!plan) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create regenerated plan",
        });
      }

      await enqueuePlanGeneration(plan.id);
      return plan;
    }),

  cancel: protectedProcedure
    .input(PlanIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Race-safe by construction: the status condition lives inside the
      // UPDATE, so a concurrent transition can't be clobbered.
      const [cancelled] = await ctx.db
        .update(plans)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(plans.id, input.id),
            eq(plans.userId, ctx.session.user.id),
            inArray(plans.status, ["pending", "processing"]),
          ),
        )
        .returning();

      if (cancelled) return cancelled;

      // No row matched — distinguish "not found / not owned" from "exists but
      // already terminal".
      const existing = await ctx.db.query.plans.findFirst({
        where: and(
          eq(plans.id, input.id),
          eq(plans.userId, ctx.session.user.id),
        ),
        columns: { id: true, status: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }
      throw new TRPCError({
        code: "CONFLICT",
        message: `Plan can no longer be cancelled (status: ${existing.status})`,
      });
    }),
} satisfies TRPCRouterRecord;
