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
| `secrets.ts` | `sst.Secret` ×5 | `AuthSecret`, `AuthGoogleId`, `AuthGoogleSecret`, `InstacartApiKey`, `AppUrl` (placeholder default `http://localhost:3000`; set post-deploy — see runbook) |
| `queue.ts` | `sst.aws.Queue` `PlanQueue` (+ `PlanDlq`) | Standard queue, 12 min visibility (6× worker timeout), DLQ after 3 receives |
| `queue.ts` | subscriber `packages/worker/src/handler.handler` | Plan-engine worker Lambda: nodejs22.x, 120 s timeout, in-VPC, `bedrock:InvokeModel` (foundation models + this account's inference profiles), **`batch.size: 1`** (one plan per invocation — no crash-retry Bedrock-spend amplification) + **`partialResponses: true`** (the handler returns `batchItemFailures`) |
| `web.ts` | `sst.aws.Nextjs` `Web` | OpenNext on Lambda + CloudFront/S3, `path: apps/nextjs`, in-VPC, linked to `PlanQueue` for `sqs:SendMessage` |

## Env-var contract

| Env var | Source | Consumed by | Set on |
|---|---|---|---|
| `POSTGRES_URL` | derived from `Postgres` | `packages/db/src/client.ts`, `packages/db/drizzle.config.ts` | web, worker |
| `APP_URL` | secret `AppUrl` | web app's Better Auth base/production URL (preferred over the Vercel-only vars) | web |
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

4. Point auth at the real URL. The first deploy prints the CloudFront URL (`web` output);
   `AppUrl` can't self-reference `web.url` into Web's own environment (circular), so it ships
   with a localhost placeholder. Set it to the printed URL and redeploy:

   ```sh
   npx sst secret set AppUrl <cloudfront url> --stage production
   npx sst deploy --stage production
   ```

   Until this step, Google OAuth callbacks resolve against the placeholder and sign-in on the
   deployed site will fail — expected on a first deploy.

## Known follow-ups (not infra-fixable)

- ~~Runtime driver swap~~ — done on this branch: `packages/db/src/client.ts` now uses
  `drizzle-orm/node-postgres` + a `pg` Pool, which connects to vanilla RDS over TCP. The
  `POSTGRES_URL` contract was driver-agnostic and is unchanged.
- **RDS TLS enforcement** — the connection is not yet forced over TLS. Deferred: set
  `rds.force_ssl` via a DB parameter group and ship the RDS CA bundle in the `pg` Pool config
  (db domain) so verification is strict rather than disabled.
- **Expo `trustedOrigins` narrowing** — the auth config's trusted origins must be tightened to
  the real app scheme/URLs before production EAS builds (auth domain).
