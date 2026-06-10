import type { PlanInputSnapshot, PlanPayload } from "@acme/validators";

/**
 * The plan-engine seam (CLAUDE.md Feature 5): everything downstream of the
 * SQS handler talks to `PlanEngine.generate(input) → PlanPayload`, so the
 * Bedrock implementation can later be swapped (cost ladder, hybrid engine,
 * Catalog API) without touching the processor or handler.
 */
export interface PlanEngine {
  generate(input: PlanInputSnapshot): Promise<PlanPayload>;
}

/**
 * Engine failure carrying a human-safe message for the plan row's `error`
 * column.
 *
 * SECURITY: `userMessage` is shown to end users and persisted in the DB —
 * it must NEVER contain raw engine output, stack traces, or API error
 * bodies. Put diagnostic detail in `cause` (server-side logs only).
 */
export class PlanGenerationError extends Error {
  readonly userMessage: string;

  constructor(
    message: string,
    options: { userMessage: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "PlanGenerationError";
    this.userMessage = options.userMessage;
  }
}
