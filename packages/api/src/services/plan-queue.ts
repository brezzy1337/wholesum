import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

/**
 * Plan-generation enqueue seam.
 *
 * Message contract: body is `JSON.stringify({ planId })` where `planId` is the
 * plan row's uuid. Consumed by `@acme/worker`'s SQS handler (one message per
 * plan; the worker transitions the row pending → processing → ready/failed).
 *
 * The queue itself is provisioned by the `infra` slice (SST v3), which also
 * wires the worker's event-source mapping with `ReportBatchItemFailures`.
 * Until that exists, `PLAN_QUEUE_URL` is unset and this module is a logged
 * no-op — created plans INTENTIONALLY remain `pending` (dev mode; there is no
 * consumer). It never fakes fulfillment or mutates plan status.
 */

/** Thrown when an SQS send fails. Deliberately generic — no queue URL or AWS
 * details leak into the message (it can surface toward clients/logs). */
export class PlanEnqueueError extends Error {
  constructor() {
    super("Failed to enqueue plan for generation");
    this.name = "PlanEnqueueError";
  }
}

/**
 * Lazy module-local singleton. Constructed on first use, and only when
 * `PLAN_QUEUE_URL` is configured. Region/credentials resolve inside the AWS
 * SDK's default provider chain from the runtime env — never read here.
 */
let sqsClient: SQSClient | undefined;

function getSqsClient(): SQSClient {
  sqsClient ??= new SQSClient({});
  return sqsClient;
}

export async function enqueuePlanGeneration(planId: string): Promise<void> {
  const queueUrl = process.env.PLAN_QUEUE_URL;

  if (!queueUrl) {
    // Dev mode: no queue provisioned yet (infra slice). Visible no-op.
    console.log(
      "[plan-queue] no SQS configured (PLAN_QUEUE_URL unset): plan %s stays pending",
      planId,
    );
    return;
  }

  try {
    await getSqsClient().send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ planId }),
      }),
    );
  } catch (error) {
    // Log the underlying message only — never credentials or full request
    // context — then surface a generic, typed error for the router to handle.
    console.error(
      "[plan-queue] SQS send failed for plan %s: %s",
      planId,
      error instanceof Error ? error.message : String(error),
    );
    throw new PlanEnqueueError();
  }
}
