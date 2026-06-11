import { postgresUrl } from "./database";
import { vpc } from "./vpc";

/**
 * Plan-generation pipeline: standard SQS queue + the Bedrock worker Lambda.
 *
 * Message contract (producer: `packages/api/src/services/plan-queue.ts`;
 * consumer: `packages/worker/src/handler.ts`): one message per plan, body
 * `JSON.stringify({ planId })`.
 */

/**
 * Dead-letter queue. The worker already drops malformed bodies itself
 * (poison messages are logged, never retried), so anything landing here is
 * a plan that failed infrastructure-level processing 3 times — worth a
 * human look before redrive.
 */
export const planDlq = new sst.aws.Queue("PlanDlq");

/**
 * `visibilityTimeout`: AWS's rule of thumb is ≥ 6× the consumer's function
 * timeout so an in-flight (possibly retried-by-Lambda) message can never
 * become visible to a second consumer mid-processing. Worker timeout is
 * 120s → 6 × 120s = 12 minutes.
 */
export const planQueue = new sst.aws.Queue("PlanQueue", {
  visibilityTimeout: "12 minutes",
  dlq: {
    queue: planDlq.arn,
    retry: 3,
  },
});

/**
 * The plan-engine worker.
 *
 * - `vpc` — needs RDS access; outbound to Bedrock rides the VPC's NAT
 *   instance (see infra/vpc.ts for the cost note).
 * - `timeout: 120s` — generous: one Bedrock invocation (non-streaming,
 *   Sonnet-class) per plan plus DB writes.
 * - `batch.size: 1` — one plan per message is the contract, so one message
 *   per invocation: a crash/timeout mid-batch must never re-drive other
 *   plans' Bedrock invocations (the default batch of 10 would amplify
 *   retry spend 10×).
 * - `partialResponses: true` — REQUIRED. The handler returns
 *   `batchItemFailures` (ReportBatchItemFailures); without this flag SQS
 *   ignores the partial response and a failure would retry the whole
 *   delivery (documented contract in packages/worker/src/handler.ts).
 * - Bedrock IAM is scoped to InvokeModel on Anthropic foundation models and
 *   this account's inference profiles (cross-region profiles resolve to an
 *   `inference-profile/*` ARN under the deploying account; the engine
 *   defaults to `anthropic.claude-sonnet-4-6`, overridable via
 *   BEDROCK_MODEL_ID).
 * - `BEDROCK_MODEL_ID` is intentionally NOT set — the engine's in-code
 *   default is the source of truth; set it here only to pin/override.
 */
const callerIdentity = aws.getCallerIdentityOutput();

export const planWorker = planQueue.subscribe(
  {
    handler: "packages/worker/src/handler.handler",
    runtime: "nodejs22.x",
    timeout: "120 seconds",
    memory: "1024 MB",
    vpc,
    environment: {
      POSTGRES_URL: postgresUrl,
    },
    permissions: [
      {
        actions: ["bedrock:InvokeModel"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/anthropic.*",
          $interpolate`arn:aws:bedrock:*:${callerIdentity.accountId}:inference-profile/*`,
        ],
      },
    ],
  },
  {
    batch: {
      size: 1,
      partialResponses: true,
    },
  },
);
