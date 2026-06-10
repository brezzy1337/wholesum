import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { db } from "@acme/db/client";
import type {
  PlanInputSnapshot,
  PlanPayload,
  PlanStatus,
} from "@acme/validators";
import { and, desc, eq, inArray } from "@acme/db";
import { plans, profiles } from "@acme/db/schema";
import {
  CreatePlanInputSchema,
  PlanIdInputSchema,
  PlanInputSnapshotSchema,
  PlanPayloadSchema,
  PlanStatusSchema,
} from "@acme/validators";

import {
  enqueuePlanGeneration,
  PlanEnqueueError,
} from "../services/plan-queue";
import { protectedProcedure } from "../trpc";

/** Statuses the engine still owns — no regenerate from, cancel only from. */
const IN_FLIGHT_STATUSES: PlanStatus[] = [
  PlanStatusSchema.enum.pending,
  PlanStatusSchema.enum.processing,
];

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

/**
 * Enqueue a freshly inserted plan, making enqueue failure VISIBLE (project
 * rule: failures are visible, never silent). On `PlanEnqueueError` the row is
 * flipped to `failed` (conditionally — only while still `pending`, so a
 * concurrent transition can't be clobbered) and the failed row is returned;
 * the UI's failed state + Regenerate is the recovery path, so this is not a
 * throw. Any other error propagates unchanged.
 */
async function enqueueOrMarkFailed(
  database: typeof db,
  plan: typeof plans.$inferSelect,
) {
  try {
    await enqueuePlanGeneration(plan.id);
    return plan;
  } catch (error) {
    if (!(error instanceof PlanEnqueueError)) throw error;

    const [failed] = await database
      .update(plans)
      .set({
        status: PlanStatusSchema.enum.failed,
        error: "Could not queue this plan for generation. Try regenerating.",
      })
      .where(
        and(
          eq(plans.id, plan.id),
          eq(plans.status, PlanStatusSchema.enum.pending),
        ),
      )
      .returning();
    return failed ?? plan;
  }
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

      const result = await enqueueOrMarkFailed(ctx.db, plan);
      // Re-type the jsonb columns so the client contract matches `get`
      // (drizzle types them `unknown`); a fresh row never has a payload.
      return { ...result, input: snapshot, payload: null };
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
      if (IN_FLIGHT_STATUSES.includes(source.status)) {
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

      const result = await enqueueOrMarkFailed(ctx.db, plan);
      // Same typed contract as `create`.
      return { ...result, input: snapshot, payload: null };
    }),

  cancel: protectedProcedure
    .input(PlanIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Race-safe by construction: the status condition lives inside the
      // UPDATE, so a concurrent transition can't be clobbered.
      const [cancelled] = await ctx.db
        .update(plans)
        .set({ status: PlanStatusSchema.enum.cancelled })
        .where(
          and(
            eq(plans.id, input.id),
            eq(plans.userId, ctx.session.user.id),
            inArray(plans.status, IN_FLIGHT_STATUSES),
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
