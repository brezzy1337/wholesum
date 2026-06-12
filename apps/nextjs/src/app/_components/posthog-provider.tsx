"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { analytics, analyticsEnabled, initAnalytics } from "~/analytics/events";
import { authClient } from "~/auth/client";

/**
 * Manual `$pageview` capture on App Router route changes (automatic capture
 * is disabled at init — it only fires on full page loads).
 */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const query = searchParams.toString();
    analytics.pageview(window.origin + pathname + (query ? `?${query}` : ""));
  }, [pathname, searchParams]);

  return null;
}

/** Ties PostHog's person to the signed-in user; resets on sign-out. */
function IdentityTracker() {
  const { data: session } = authClient.useSession();
  const identifiedUserId = useRef<string | null>(null);

  // Depend on the primitives, not the session object — the session object is
  // re-created on every poll and would re-enter the effect needlessly.
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? "";
  const name = session?.user.name ?? "";

  useEffect(() => {
    if (!analyticsEnabled) return;
    if (userId !== null) {
      if (identifiedUserId.current !== userId) {
        analytics.identify(userId, { email, name });
        identifiedUserId.current = userId;
      }
    } else if (identifiedUserId.current !== null) {
      analytics.reset();
      identifiedUserId.current = null;
    }
  }, [userId, email, name]);

  return null;
}

/**
 * Provides the PostHog client to the tree and owns its initialization —
 * `initAnalytics` is idempotent and runs after mount, so importing the
 * analytics module has no side effects. When `NEXT_PUBLIC_POSTHOG_KEY` is
 * unset the client stays uninitialized and both trackers no-op.
 */
export function AnalyticsProvider(props: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <PostHogProvider client={posthog}>
      {/* useSearchParams requires a Suspense boundary. */}
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <IdentityTracker />
      {props.children}
    </PostHogProvider>
  );
}
