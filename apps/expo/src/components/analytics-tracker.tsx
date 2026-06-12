import { useEffect, useRef } from "react";
import { usePathname } from "expo-router";

import { analytics, analyticsEnabled } from "~/utils/analytics";
import { authClient } from "~/utils/auth";

// Mirrors apps/nextjs/src/app/_components/posthog-provider.tsx, adapted to
// Expo Router: `$screen` instead of `$pageview` (PostHog's mobile
// convention), and no provider component — the client lives as a lazy
// singleton in ~/utils/analytics, so there is nothing to initialize on mount.

/** Captures a `$screen` event on every Expo Router path change. */
function ScreenTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!analyticsEnabled) return;
    analytics.screen(pathname);
  }, [pathname]);

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

/** Mount once in the root layout, inside the QueryClientProvider tree. */
export function AnalyticsTracker() {
  return (
    <>
      <ScreenTracker />
      <IdentityTracker />
    </>
  );
}
