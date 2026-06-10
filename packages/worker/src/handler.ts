import type { SQSBatchItemFailure, SQSHandler } from "aws-lambda";
import { z } from "zod/v4";

import { processPlan } from "./processor";

const PlanMessageSchema = z.object({ planId: z.uuid() });

/**
 * SQS Lambda entrypoint for plan generation. The api's plan router enqueues
 * `{ "planId": "<uuid>" }` messages; this handler runs the Bedrock plan
 * engine for each one.
 *
 * Required Lambda environment:
 * - `POSTGRES_URL` — read inside `@acme/db` at import time.
 * - `BEDROCK_MODEL_ID` (optional) — overrides the default Bedrock model id
 *   (`anthropic.claude-sonnet-4-6`; Bedrock model ids carry the `anthropic.`
 *   vendor prefix — see src/engine-bedrock.ts). AWS region/credentials
 *   resolve from the execution role via the SDK.
 *
 * INFRA CONTRACT (future `infra` slice): this handler returns PARTIAL BATCH
 * RESPONSES — the event source mapping MUST enable `ReportBatchItemFailures`,
 * otherwise returning `batchItemFailures` does nothing and a single failed
 * record would never be retried independently.
 *
 * Per-record semantics:
 * - Malformed body → log + drop (poison message; retrying cannot fix it).
 * - `processPlan` throw (infrastructural) → reported in `batchItemFailures`
 *   so SQS redelivers just that record.
 */
export const handler: SQSHandler = async (event) => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    let planId: string;
    try {
      const parsed = PlanMessageSchema.parse(
        JSON.parse(record.body) as unknown,
      );
      planId = parsed.planId;
    } catch (cause) {
      console.error("[worker] malformed SQS message body — dropping", {
        messageId: record.messageId,
        cause,
      });
      continue;
    }

    try {
      await processPlan(planId);
    } catch (cause) {
      console.error("[worker] processPlan threw — marking for retry", {
        messageId: record.messageId,
        planId,
        cause,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
