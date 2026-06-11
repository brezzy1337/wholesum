# infra — SST v3 IaC for wholesum

Entrypoint: `sst.config.ts` at the repo root (SST requires it there); it stays thin and imports
the resource modules in this directory. App `wholesum`, home `aws`, region `us-east-1` (pinned
for Anthropic-on-Bedrock availability). Production stage resources are `protect`ed and
`retain`ed on removal.

## Resources

| Module | Resource | What it is |
|---|---|---|
| `vpc.ts` | `sst.aws.Vpc` `Vpc` | Shared VPC; `nat: "ec2"` (t4g.nano, ~$3/mo — cost note in the file) gives in-VPC Lambdas outbound internet (Bedrock, Instacart); `bastion: true` enables `sst tunnel` for `db:push` |
| `database.ts` | `sst.aws.Postgres` `Postgres` | RDS Postgres, `db.t4g.micro` / 20 GB, no proxy; exports the derived `postgresUrl` connection string |
| `secrets.ts` | `sst.Secret` ×4 | `AuthSecret`, `AuthGoogleId`, `AuthGoogleSecret`, `InstacartApiKey` |
| `queue.ts` | `sst.aws.Queue` `PlanQueue` (+ `PlanDlq`) | Standard queue, 12 min visibility (6× worker timeout), DLQ after 3 receives |
| `queue.ts` | subscriber `packages/worker/src/handler.handler` | Plan-engine worker Lambda: nodejs22.x, 120 s timeout, in-VPC, `bedrock:InvokeModel`, **`partialResponses: true`** (the handler returns `batchItemFailures`) |
| `web.ts` | `sst.aws.Nextjs` `Web` | OpenNext on Lambda + CloudFront/S3, `path: apps/nextjs`, in-VPC, linked to `PlanQueue` for `sqs:SendMessage` |

## Env-var contract

| Env var | Source | Consumed by | Set on |
|---|---|---|---|
| `POSTGRES_URL` | derived from `Postgres` | `packages/db/src/client.ts`, `packages/db/drizzle.config.ts` | web, worker |
| `AUTH_SECRET` | secret `AuthSecret` | `packages/auth/env.ts` | web |
| `AUTH_GOOGLE_ID` | secret `AuthGoogleId` | `packages/auth/env.ts` | web |
| `AUTH_GOOGLE_SECRET` | secret `AuthGoogleSecret` | `packages/auth/env.ts` | web |
| `INSTACART_API_KEY` | secret `InstacartApiKey` | `packages/api/src/services/instacart.ts` | web |
| `PLAN_QUEUE_URL` | `PlanQueue.url` (plain URL; the seam uses a raw `SQSClient`, not the SST SDK) | `packages/api/src/services/plan-queue.ts` | web |
| `BEDROCK_MODEL_ID` | — (intentionally unset; engine default applies) | `packages/worker/src/engine-bedrock.ts` | worker (optional) |

Optional, not provisioned: `INSTACART_API_BASE_URL` (defaults to Instacart prod in code; set it
on `Web` to point a non-production stage at `connect.dev.instacart.tools`).

## Deploy runbook

Env hygiene: export `SST_TELEMETRY=0` first.

1. Set the secrets for the stage (each prompts/accepts a value):

   ```sh
   npx sst secret set AuthSecret --stage production
   npx sst secret set AuthGoogleId --stage production
   npx sst secret set AuthGoogleSecret --stage production
   npx sst secret set InstacartApiKey --stage production
   ```

2. Deploy:

   ```sh
   npx sst deploy --stage production
   ```

3. Push the Drizzle schema (first deploy and after any `packages/db` schema change). RDS is in
   private subnets, so go through the bastion tunnel:

   ```sh
   npx sst tunnel --stage production   # keep running in one shell
   POSTGRES_URL=<postgres url from deploy outputs> pnpm db:push
   ```

   If a client insists on strict TLS verification against RDS, use the RDS CA bundle rather
   than disabling verification; the URL deliberately omits `sslmode`.

## Known follow-ups (not infra-fixable)

- `packages/db/src/client.ts` uses `@vercel/postgres`, which speaks the Neon serverless
  protocol — it cannot connect to vanilla RDS Postgres over TCP. Before the first real deploy
  the **db** domain must swap the runtime driver (e.g. `drizzle-orm/node-postgres`). The
  `POSTGRES_URL` contract here is driver-agnostic and already correct.
