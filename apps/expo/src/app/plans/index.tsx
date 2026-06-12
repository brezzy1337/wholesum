import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { formatDate, Overline, StatusChip } from "~/components/plan-ui";
import { SessionGate } from "~/components/session-gate";
import { trpc } from "~/utils/api";

// Mirrors apps/nextjs plans-list.tsx. No analytics (out of scope on mobile).

function PlansList() {
  const router = useRouter();
  const plansQuery = useQuery(trpc.plan.list.queryOptions());

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex flex-col gap-6 px-6 pt-12 pb-8"
      >
        <View className="flex flex-col gap-2">
          <Overline>Wholesum</Overline>
          <View className="flex flex-row items-center justify-between gap-3">
            <Text className="text-ink text-2xl font-bold">Your plans</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/plans/new")}
              className="bg-sprout rounded-full px-5 py-2.5 active:opacity-80"
            >
              <Text className="text-spruce text-sm font-semibold">
                New plan
              </Text>
            </Pressable>
          </View>
        </View>

        {plansQuery.isPending ? (
          <Text className="text-content-secondary animate-pulse text-sm">
            Loading your plans…
          </Text>
        ) : plansQuery.error ? (
          <View className="bg-negative/10 flex flex-col items-start gap-3 rounded-2xl p-4">
            <Text className="text-negative text-sm">
              Could not load your plans. Please try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void plansQuery.refetch()}
              className="active:opacity-80"
            >
              <Text className="text-spruce text-sm font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : plansQuery.data.length === 0 ? (
          <View className="bg-surface-neutral flex flex-col items-start gap-4 rounded-3xl p-6">
            <Text className="text-ink text-lg font-semibold">No plans yet</Text>
            <Text className="text-content-secondary text-sm">
              Turn your budget and household profile into a grocery plan you can
              send to Instacart.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/plans/new")}
              className="bg-sprout rounded-full px-6 py-3 active:opacity-80"
            >
              <Text className="text-spruce text-center text-base font-semibold">
                Generate your first plan
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex flex-col gap-3">
            {plansQuery.data.map((plan) => (
              <Pressable
                key={plan.id}
                accessibilityRole="button"
                onPress={() => router.push(`/plans/${plan.id}`)}
                className="flex flex-col gap-2 rounded-2xl border border-[rgba(15,19,17,0.12)] bg-white px-4 py-4 active:opacity-80"
              >
                <View className="flex flex-row items-center justify-between gap-3">
                  <StatusChip status={plan.status} />
                  <Text className="text-content-tertiary text-xs">
                    {formatDate(plan.createdAt)}
                  </Text>
                </View>
                {plan.retailerKey ? (
                  <Text className="text-content-secondary text-sm">
                    Store: {plan.retailerKey}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function PlansScreen() {
  return (
    <SessionGate>
      <PlansList />
    </SessionGate>
  );
}
