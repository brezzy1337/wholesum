/**
 * Resource graph (imported by sst.config.ts `run()`):
 *
 *   vpc ─► postgres ─► { planQueue+worker, web }
 *   secrets ──────────────────────────► web
 *
 * Module order below follows that dependency chain.
 */
export { vpc } from "./vpc";
export {
  authGoogleId,
  authGoogleSecret,
  authSecret,
  instacartApiKey,
} from "./secrets";
export { postgres, postgresUrl } from "./database";
export { planDlq, planQueue, planWorker } from "./queue";
export { web } from "./web";
