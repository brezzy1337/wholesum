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
 * timeout so an in-flight (possibly retried-by-Lambda) batch can never
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
 * - `partialResponses: true` — REQUIRED. The handler returns
 *   `batchItemFailures` (ReportBatchItemFailures); without this flag SQS
 *   ignores the partial response and a single failure would retry the whole
 *   batch (documented contract in packages/worker/src/handler.ts).
 * - Bedrock IAM is scoped to InvokeModel on Anthropic foundation models and
 *   inference profiles (cross-region profiles resolve to an
 *   `inference-profile/*` ARN; the engine defaults to
 *   `anthropic.claude-sonnet-4-6`, overridable via BEDROCK_MODEL_ID).
 * - `BEDROCK_MODEL_ID` is intentionally NOT set — the engine's in-code
 *   default is the source of truth; set it here only to pin/override.
 */
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
          "arn:aws:bedrock:*:*:inference-profile/*",
        ],
      },
    ],
  },
  {
    batch: {
      partialResponses: true,
    },
  },
);
