import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { plans } from "@acme/db/schema";
import { PlanInputSnapshotSchema, PlanStatusSchema } from "@acme/validators";

import type { PlanEngine } from "./engine";
import { PlanGenerationError } from "./engine";
import { createBedrockPlanEngine } from "./engine-bedrock";

const { pending, processing, ready, failed } = PlanStatusSchema.enum;

/** Lazily constructed so importing this module has no side effects. */
let defaultEngine: PlanEngine | undefined;
function getEngine(): PlanEngine {
  defaultEngine ??= createBedrockPlanEngine();
  return defaultEngine;
}

/**
 * Mark a plan failed with a human-safe error message.
 *
 * Conditional on `status = 'processing'` so a concurrent cancel wins. A throw
 * from here is a DB-infrastructure failure and propagates to the caller.
 */
async function markFailed(planId: string, userMessage: string): Promise<void> {
  await db
    .update(plans)
    .set({ status: failed, error: userMessage })
    .where(and(eq(plans.id, planId), eq(plans.status, processing)));
}

/**
 * Process one `{ planId }` SQS message: claim the pending plan, run the plan
 * engine on its input snapshot, persist the payload (`ready`) or a human-safe
 * error (`failed`).
 *
 * Semantics:
 * - Missing row or terminal status → log and return (idempotent on SQS
 *   redelivery; respects user cancel; no retry value in poison messages).
 * - Failures are VISIBLE (`failed` + human-safe `error`) — never a degraded
 *   fallback plan.
 * - Throws ONLY on infrastructural failures (DB writes), so SQS retries
 *   those and only those; deterministic engine failures are swallowed after
 *   being persisted (no retry storm).
 */
export async function processPlan(planId: string): Promise<void> {
  const row = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
  if (!row) {
    console.error("[worker] plan not found — dropping message", { planId });
    return;
  }
  if (row.status !== pending && row.status !== processing) {
    console.log("[worker] plan not in a processable status — skipping", {
      planId,
      status: row.status,
    });
    return;
  }

  // Race-safe claim: the status condition lives inside the UPDATE. A row
  // already in 'processing' (redelivery after a crashed invocation) is
  // reprocessed without re-claiming.
  if (row.status === pending) {
    const claimed = await db
      .update(plans)
      .set({ status: processing })
      .where(and(eq(plans.id, planId), eq(plans.status, pending)))
      .returning({ id: plans.id });
    if (claimed.length === 0) {
      const recheck = await db.query.plans.findFirst({
        where: eq(plans.id, planId),
        columns: { status: true },
      });
      if (recheck?.status !== processing) {
        console.log("[worker] lost claim race — skipping", {
          planId,
          status: recheck?.status,
        });
        return;
      }
    }
  }

  const snapshot = PlanInputSnapshotSchema.safeParse(row.input);
  if (!snapshot.success) {
    console.error("[worker] corrupt plan input snapshot", {
      planId,
      cause: snapshot.error,
    });
    await markFailed(planId, "Plan input was invalid. Create a new plan.");
    return;
  }

  let payload;
  try {
    payload = await getEngine().generate(snapshot.data);
  } catch (err) {
    if (err instanceof PlanGenerationError) {
      console.error("[worker] plan generation failed", {
        planId,
        message: err.message,
        cause: err.cause,
      });
      await markFailed(planId, err.userMessage);
      return;
    }
    console.error("[worker] unexpected plan generation error", {
      planId,
      cause: err,
    });
    // If this write itself throws, that's infrastructural — propagate so SQS
    // retries. Otherwise the failure is persisted and visible; swallow.
    await markFailed(planId, "Plan generation failed. Try regenerating.");
    return;
  }

  const updated = await db
    .update(plans)
    .set({ payload, status: ready, error: null })
    .where(and(eq(plans.id, planId), eq(plans.status, processing)))
    .returning({ id: plans.id });
  if (updated.length === 0) {
    // A cancel slipped in while generating — the cancel wins; leave it.
    console.log("[worker] plan left processing before completion — skipping", {
      planId,
    });
  }
}
