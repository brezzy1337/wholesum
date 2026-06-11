/**
 * Stage-scoped secrets. Set per stage with:
 *
 *   npx sst secret set <Name> --stage <stage>
 *
 * Each maps 1:1 onto an env var consumed in app code (see the contract
 * table in infra/README.md):
 *
 *   AuthSecret       → AUTH_SECRET        (Better Auth session signing)
 *   AuthGoogleId     → AUTH_GOOGLE_ID     (Google OAuth client id)
 *   AuthGoogleSecret → AUTH_GOOGLE_SECRET (Google OAuth client secret)
 *   InstacartApiKey  → INSTACART_API_KEY  (Instacart IDP API key)
 *   AppUrl           → APP_URL            (public base URL for Better Auth
 *                                          OAuth callbacks)
 */
export const authSecret = new sst.Secret("AuthSecret");
export const authGoogleId = new sst.Secret("AuthGoogleId");
export const authGoogleSecret = new sst.Secret("AuthGoogleSecret");
export const instacartApiKey = new sst.Secret("InstacartApiKey");

/**
 * The app's public base URL (the CloudFront URL, or a custom domain once one
 * exists). Self-referencing `web.url` into Web's own `environment` would be
 * circular, so it's a secret set after the first deploy prints the URL —
 * see the runbook in infra/README.md. Defaults to localhost so a first
 * deploy succeeds before the value is known.
 */
export const appUrl = new sst.Secret("AppUrl", "http://localhost:3000");
