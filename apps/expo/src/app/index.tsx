import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { Overline } from "~/components/plan-ui";
import { authClient } from "~/utils/auth";

function MobileAuth() {
  const { data: session } = authClient.useSession();

  return (
    <View className="flex flex-col gap-3">
      <Text className="text-content-secondary pb-2 text-center text-base">
        {session?.user.name ? `Hello, ${session.user.name}` : "Not logged in"}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          session
            ? authClient.signOut()
            : authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
              })
        }
        className={
          session
            ? "items-center rounded-full border border-[rgba(15,19,17,0.12)] py-4 active:opacity-80"
            : "bg-sprout items-center rounded-full py-4 active:opacity-80"
        }
      >
        <Text className="text-spruce text-base font-semibold">
          {session ? "Sign Out" : "Sign In With Google"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function Index() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex h-full w-full flex-col gap-6 px-6 pt-12 pb-8">
        <View className="flex flex-col items-center gap-2">
          <Overline>Eat well, spend smart</Overline>
          <Text className="text-ink text-center text-5xl font-bold">
            Wholesum
          </Text>
        </View>

        <MobileAuth />

        {session ? (
          <View className="flex flex-col items-center gap-4">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/onboarding")}
              className="bg-sprout w-full items-center rounded-full py-4 active:opacity-80"
            >
              <Text className="text-spruce text-base font-semibold">
                Get started
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/plans")}
              className="active:opacity-80"
            >
              <Text className="text-spruce text-base font-semibold">
                Your plans
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
