import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Redirect } from "expo-router";

import { authClient } from "~/utils/auth";

/**
 * Gates a screen on an authenticated session, mirroring the web app's
 * server-side session checks: signed-out users on a gated screen are
 * redirected to the home screen (which owns sign-in).
 */
export function SessionGate(props: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-content-secondary text-sm">Loading…</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/" />;
  }

  return <>{props.children}</>;
}
