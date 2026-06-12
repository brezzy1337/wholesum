import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";

import { AnalyticsTracker } from "~/components/analytics-tracker";
import { queryClient } from "~/utils/api";

import "../styles.css";

// This is the main layout of the app. It wraps your pages with the providers
// they need.
//
// tRPC note: `~/utils/api` builds its hooks with `createTRPCOptionsProxy`
// over a standalone tRPC client bound to this same `queryClient`, so the only
// provider tRPC needs here is the QueryClientProvider below — there is no
// separate TRPCProvider component to mount.
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* $screen tracking + PostHog identify/reset; a no-op without
          EXPO_PUBLIC_POSTHOG_KEY. */}
      <AnalyticsTracker />
      {/*
          The Stack component displays the current page. Screens render their
          own Wholesum-branded headers (mirroring the web layouts), so the
          native header stays hidden.
        */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: "#FFFFFF",
          },
        }}
      />
      <StatusBar style="dark" />
    </QueryClientProvider>
  );
}
