/**
 * Plan-generation enqueue seam.
 *
 * TODO(worker/infra): replace this stub with an SQS `SendMessage` once the
 * `worker` (packages/worker — Bedrock/Claude plan engine) and `infra`
 * (SST v3 — SQS queue) domains exist. Until then, created plans
 * INTENTIONALLY remain in status `pending` — there is no consumer.
 *
 * Contract for this stub:
 * - MUST NOT throw (creation must not fail because the queue doesn't exist).
 * - MUST NOT fake fulfillment or fabricate plan payloads.
 * - MUST NOT mutate plan status — visibility of "nothing is processing this
 *   yet" is the desired behavior, never a degraded fallback plan.
 */
export function enqueuePlanGeneration(planId: string): Promise<void> {
  console.log(
    "[plan-queue] enqueue stub: plan %s left pending (no SQS worker yet)",
    planId,
  );
  return Promise.resolve();
}
