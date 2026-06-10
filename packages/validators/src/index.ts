import { z } from "zod/v4";

export const UpsertProfileSchema = z.object({
  monthlyBudgetCents: z.int().positive().nullable(),
  householdSize: z.int().min(1).max(20),
  dietaryRestrictions: z.array(z.string().trim().min(1).max(100)).max(50),
});

export type UpsertProfileInput = z.infer<typeof UpsertProfileSchema>;

/**
 * Versioned (v1) immutable snapshot of the household profile, written at plan
 * creation and consumed by the plan engine. The router enforces profile
 * completeness before snapshotting, so `monthlyBudgetCents` is required here.
 *
 * Future versions can join a discriminated union on `version`.
 */
export const PlanInputSnapshotSchema = z.object({
  version: z.literal(1),
  householdSize: z.int().min(1).max(20),
  monthlyBudgetCents: z.int().positive(),
  // SECURITY: these entries are untrusted user text — the plan engine must
  // pass them to the LLM as a structured, demarcated input slot, never
  // interpolated into prompt prose.
  dietaryRestrictions: z.array(z.string().trim().min(1).max(100)).max(50),
  // Null until the stores feature lands.
  retailerKey: z.string().min(1).nullable(),
});

export type PlanInputSnapshot = z.infer<typeof PlanInputSnapshotSchema>;

/**
 * Versioned (v1) plan-engine output, persisted on the plan row when status
 * becomes `ready`. All prices/totals are ESTIMATES from our own pricing model
 * (no Instacart catalog access in MVP) — the UI frames them as "estimated
 * until checkout".
 *
 * Future versions can join a discriminated union on `version`.
 */
export const PlanPayloadSchema = z.object({
  version: z.literal(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        // Human-readable quantity, e.g. "2 lb".
        quantity: z.string().min(1).max(100),
        estimatedPriceCents: z.int().min(0),
        isOrganic: z.boolean(),
      }),
    )
    .min(1),
  nutrition: z.object({
    caloriesPerDayPerPerson: z.int().min(0),
    proteinGramsPerDayPerPerson: z.int().min(0),
    percentOrganic: z.number().min(0).max(100),
    // `items` requires at least one entry, so the count is at least 1.
    itemCount: z.int().min(1),
  }),
  // Estimate from our own pricing model — "estimated until checkout" in UI.
  estimatedTotalCents: z.int().min(0),
  // Engine/model identifier persisted for eval/attribution,
  // e.g. "bedrock:claude-sonnet-x".
  engineTag: z.string().min(1).max(100),
});

export type PlanPayload = z.infer<typeof PlanPayloadSchema>;

// Must match the `plan_status` pgEnum in @acme/db exactly (validators has no
// deps, so the values are duplicated here by contract).
export const PlanStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
  "cancelled",
]);

export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const CreatePlanInputSchema = z.object({
  // Optional until the stores feature lands.
  retailerKey: z.string().min(1).nullish(),
});

export type CreatePlanInput = z.infer<typeof CreatePlanInputSchema>;

export const PlanIdInputSchema = z.object({
  id: z.uuid(),
});
