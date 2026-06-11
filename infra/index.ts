/**
 * Resource graph (imported by sst.config.ts `run()`):
 *
 *   vpc ─► postgres ─► { planQueue+worker, web }
 *   secrets ──────────────────────────► web
 *
 * The barrel re-exports only what `run()` needs for its stage outputs.
 * Everything else (vpc, secrets, the worker subscriber, the DLQ — and
 * notably `postgresUrl`, which embeds the DB password and must not leak
 * into outputs) stays module-internal; those modules are still evaluated
 * via the import chain below (web ─► queue ─► database/secrets/vpc).
 */
export { postgres } from "./database";
export { planQueue } from "./queue";
export { web } from "./web";
