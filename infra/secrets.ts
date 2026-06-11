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
 */
export const authSecret = new sst.Secret("AuthSecret");
export const authGoogleId = new sst.Secret("AuthGoogleId");
export const authGoogleSecret = new sst.Secret("AuthGoogleSecret");
export const instacartApiKey = new sst.Secret("InstacartApiKey");
