import { postgresUrl } from "./database";
import { planQueue } from "./queue";
import {
  appUrl,
  authGoogleId,
  authGoogleSecret,
  authSecret,
  instacartApiKey,
} from "./secrets";
import { vpc } from "./vpc";

/**
 * The Next.js app (OpenNext on Lambda + CloudFront/S3).
 *
 * - `vpc` — the server function must reach RDS; outbound calls (Google
 *   OAuth, Instacart IDP) ride the VPC's NAT instance.
 * - `link: [planQueue]` — grants the server function `sqs:SendMessage` on
 *   the plan queue via IAM. The enqueue seam
 *   (`packages/api/src/services/plan-queue.ts`) does NOT use the SST SDK —
 *   it reads the plain `PLAN_QUEUE_URL` env var and a default-credentials
 *   `SQSClient` — so the URL is also passed explicitly below; the link
 *   exists purely for the IAM grant.
 * - `APP_URL` — the app's public base URL; the web app prefers it over the
 *   Vercel-only vars when deriving the Better Auth base/production URL.
 *   Self-referencing `web.url` here is circular, so it's the `AppUrl`
 *   secret, set after the first deploy (see the runbook in infra/README.md).
 * - All env names match the consumers exactly: `apps/nextjs/src/env.ts`
 *   (POSTGRES_URL), `packages/auth/env.ts` (AUTH_*), and
 *   `packages/api/src/services/instacart.ts` (INSTACART_API_KEY).
 */
export const web = new sst.aws.Nextjs("Web", {
  path: "apps/nextjs",
  vpc,
  link: [planQueue],
  environment: {
    POSTGRES_URL: postgresUrl,
    APP_URL: appUrl.value,
    AUTH_SECRET: authSecret.value,
    AUTH_GOOGLE_ID: authGoogleId.value,
    AUTH_GOOGLE_SECRET: authGoogleSecret.value,
    INSTACART_API_KEY: instacartApiKey.value,
    PLAN_QUEUE_URL: planQueue.url,
  },
});
