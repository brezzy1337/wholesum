import { PostHog } from "posthog-react-native";

// Mirrors apps/nextjs/src/analytics/events.ts — event names and property
// shapes must stay byte-identical across platforms so PostHog funnels
// aggregate web + mobile.

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

/**
 * Analytics is on only when a PostHog key is configured at build time.
 * Without `EXPO_PUBLIC_POSTHOG_KEY` the whole integration is a true no-op:
 * no client construction, no network calls, no console output.
 */
export const analyticsEnabled = key != null;

let client: PostHog | null = null;

/**
 * Lazily construct the PostHog client — only when a key exists, only once.
 * Gating is by never constructing the client without a key (not `disabled`).
 *
 * PRIVACY (security-review-mandated settings — do NOT relax any of these
 * without a security re-review; mirrors the web init in
 * apps/nextjs/src/analytics/events.ts):
 * - No `PostHogProvider`, no autocapture of any kind — no screen
 *   autocapture, no touch autocapture (touch capture would leak
 *   dietary/allergen chip labels like "Peanuts", "Vegan"). We capture
 *   explicit, typed events only.
 * - No session replay (the replay package is not installed) and
 *   `disableSurveys: true` — neither may record the budget input or
 *   dietary chips.
 * - `disableRemoteConfig: true` + `preloadFeatureFlags: false` — the
 *   mobile analogue of web's `disable_external_dependency_loading`; remote
 *   config must not be able to toggle replay/surveys on from the dashboard.
 * - `captureAppLifecycleEvents: false` — explicit events only, matching the
 *   web event dictionary exactly.
 */
function getClient(): PostHog | null {
  // `key == null` is implied by `analyticsEnabled` but repeated here so
  // TypeScript narrows `key` to a string.
  if (!analyticsEnabled || key == null) return null;
  client ??= new PostHog(key, {
    host,
    captureAppLifecycleEvents: false,
    disableSurveys: true,
    disableRemoteConfig: true,
    preloadFeatureFlags: false,
  });
  return client;
}

/** The single guard path — every PostHog call routes through here. */
function withClient(fn: (client: PostHog) => void) {
  const posthog = getClient();
  if (!posthog) return;
  fn(posthog);
}

function capture(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
) {
  withClient((posthog) => posthog.capture(event, properties));
}

/**
 * Typed, fire-and-forget event wrappers — event names live here and nowhere
 * else, and every call site is safe when PostHog is disabled.
 *
 * PRIVACY: never send dietary restriction strings, allergen lists, excluded
 * foods, or raw budget amounts as event properties. Counts are fine.
 */
export const analytics = {
  /** Mobile counterpart of web's `$pageview` — `$screen` per PostHog's
   * mobile convention, fired on Expo Router path changes. */
  screen(name: string) {
    withClient((posthog) => void posthog.screen(name));
  },
  identify(userId: string, properties: { email: string; name: string }) {
    withClient((posthog) => posthog.identify(userId, properties));
  },
  reset() {
    withClient((posthog) => posthog.reset());
  },

  onboardingStepCompleted(properties: {
    step: 1 | 2 | 3;
    step_name: "budget" | "household" | "dietary";
  }) {
    capture("onboarding_step_completed", properties);
  },
  onboardingCompleted(properties: { household_size: number }) {
    capture("onboarding_completed", properties);
  },
  storeSelected(properties: { retailer_key: string }) {
    capture("store_selected", properties);
  },
  storeSkipped() {
    capture("store_skipped");
  },
  planCreated(properties: {
    plan_id: string;
    retailer_key: string | null;
    store_skipped: boolean;
  }) {
    capture("plan_created", properties);
  },
  planRegenerated(properties: {
    plan_id: string;
    from_status: string;
    new_plan_id: string;
  }) {
    capture("plan_regenerated", properties);
  },
  planFailedViewed(properties: { plan_id: string }) {
    capture("plan_failed_viewed", properties);
  },
  sentToInstacart(properties: { plan_id: string; reopened: boolean }) {
    capture("sent_to_instacart", properties);
  },
};
