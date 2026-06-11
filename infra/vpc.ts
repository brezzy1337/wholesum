/**
 * Shared VPC — required by RDS, and therefore by every Lambda that talks to
 * the database (the Next.js server function and the plan worker).
 *
 * NAT cost tradeoff (deliberate): those same in-VPC Lambdas also need
 * OUTBOUND internet — the worker calls the Bedrock endpoint and the web
 * server function calls the Instacart IDP API — and a Lambda in private
 * subnets has no internet path without NAT. Options were:
 *
 *   - `nat: "managed"` — AWS managed NAT Gateway, ~$32/mo + per-GB. Most
 *     robust, overkill for an MVP.
 *   - `nat: "ec2"`     — a t4g.nano NAT instance, ~$3/mo. Single instance =
 *     a brief outage window if the instance is replaced; acceptable for MVP
 *     traffic. ← chosen.
 *   - VPC endpoints (Bedrock interface endpoint etc.) — ~$7/mo *per
 *     endpoint per AZ* and would still leave Instacart unreachable; not
 *     cheaper here.
 *
 * Revisit `nat: "managed"` for production hardening once traffic justifies
 * it (it is a per-stage decision we can make later without a topology
 * change).
 *
 * `bastion: true` adds a t4g.nano jump host so `npx sst tunnel` can reach
 * the private RDS instance from a dev machine — required for the
 * post-deploy `pnpm db:push` in the runbook (see infra/README.md).
 */
export const vpc = new sst.aws.Vpc("Vpc", {
  nat: "ec2",
  bastion: true,
});
