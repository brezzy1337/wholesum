import posthog from "posthog-js";

import { env } from "~/env";

const key = env.NEXT_PUBLIC_POSTHOG_KEY;

/**
 * Analytics is on only in the browser and only when a PostHog key is
 * configured. Without `NEXT_PUBLIC_POSTHOG_KEY` the whole integration is a
 * true no-op: no SDK init, no network calls, no console output.
 */
export const analyticsEnabled = typeof window !== "undefined" && key != null;

let initialized = false;

/**
 * Initialize the PostHog client. Idempotent — safe to call from multiple
 * mounts. Importing this module has no side effects; `AnalyticsProvider`
 * calls this from a mount effect so init is owned by the React tree.
 *
 * PRIVACY (security-review-mandated settings — do NOT relax any of these
 * without a security re-review):
 * - `autocapture: false` — default autocapture sends `$el_text` on clicks,
 *   which would leak dietary/allergen chip labels ("Peanuts", "Vegan").
 *   We capture explicit, typed events only.
 * - `disable_session_recording: true` — session replay would record the
 *   budget input and dietary chips, and is otherwise one dashboard toggle
 *   away from being enabled remotely.
 * - `disable_external_dependency_loading: true` — blocks runtime remote
 *   `<script>` injection from the PostHog host (toolbar, remote config,
 *   recorder, etc.).
 */
export function initAnalytics() {
  // `key == null` is implied by `analyticsEnabled` but repeated here so
  // TypeScript narrows `key` to a string.
  if (!analyticsEnabled || initialized || key == null) return;
  initialized = true;
  posthog.init(key, {
    api_host: env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // The App Router needs manual pageviews — see PageviewTracker.
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    disable_external_dependency_loading: true,
  });
}

/** The single guard path — every PostHog call routes through here. */
function withClient(fn: (client: typeof posthog) => void) {
  if (!analyticsEnabled) return;
  fn(posthog);
}

function capture(event: string, properties?: Record<string, unknown>) {
  withClient((client) => client.capture(event, properties));
}

/**
 * Typed, fire-and-forget event wrappers — event names live here and nowhere
 * else, and every call site is safe when PostHog is disabled.
 *
 * PRIVACY: never send dietary restriction strings, allergen lists, excluded
 * foods, or raw budget amounts as event properties. Counts are fine.
 */
export const analytics = {
  pageview(currentUrl: string) {
    capture("$pageview", { $current_url: currentUrl });
  },
  identify(userId: string, properties: { email: string; name: string }) {
    withClient((client) => client.identify(userId, properties));
  },
  reset() {
    withClient((client) => client.reset());
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
