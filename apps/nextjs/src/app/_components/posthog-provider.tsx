"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { analytics, analyticsEnabled } from "~/analytics/events";
import { authClient } from "~/auth/client";

/**
 * Manual `$pageview` capture on App Router route changes (automatic capture
 * is disabled at init — it only fires on full page loads).
 */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!analyticsEnabled || !pathname) return;
    const query = searchParams.toString();
    analytics.pageview(
      window.origin + pathname + (query ? `?${query}` : ""),
    );
  }, [pathname, searchParams]);

  return null;
}

/** Ties PostHog's person to the signed-in user; resets on sign-out. */
function IdentityTracker() {
  const { data: session } = authClient.useSession();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!analyticsEnabled) return;
    const user = session?.user;
    if (user) {
      if (identifiedUserId.current !== user.id) {
        analytics.identify(user.id, { email: user.email, name: user.name });
        identifiedUserId.current = user.id;
      }
    } else if (identifiedUserId.current !== null) {
      analytics.reset();
      identifiedUserId.current = null;
    }
  }, [session]);

  return null;
}

/**
 * Provides the PostHog client to the tree. Initialization happens (at most
 * once) in `~/analytics/events` — when `NEXT_PUBLIC_POSTHOG_KEY` is unset the
 * client stays uninitialized and both trackers no-op.
 */
export function AnalyticsProvider(props: { children: React.ReactNode }) {
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
