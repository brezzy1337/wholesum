/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Wholesum — SST v3 (Pulumi engine, npm `sst@4.x`) IaC entrypoint.
 *
 * Kept deliberately thin: every resource lives in `infra/*.ts` (the SST v3
 * monorepo convention) and is pulled in via the dynamic import below. See
 * `infra/README.md` for the resource map, env-var contract, and the deploy
 * runbook.
 *
 * Region is pinned to us-east-1 for Anthropic-on-Bedrock model availability
 * (the plan-engine worker invokes Claude via Bedrock).
 */
export default $config({
  app(input) {
    return {
      name: "wholesum",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
      // Production state is sacred: never delete data-bearing resources on
      // `sst remove`, and protect them from accidental replacement. Every
      // other stage (dev/PR stages) cleans up after itself.
      removal: input.stage === "production" ? "retain" : "remove",
      protect: input.stage === "production",
    };
  },
  async run() {
    const infra = await import("./infra");

    return {
      web: infra.web.url,
      planQueue: infra.planQueue.url,
      postgresHost: infra.postgres.host,
    };
  },
});
