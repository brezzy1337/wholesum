import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Plan, PlanPayload } from "~/components/plan-ui";
import {
  formatCents,
  Overline,
  PrimaryButton,
  SecondaryButton,
  StatusChip,
} from "~/components/plan-ui";
import { SessionGate } from "~/components/session-gate";
import { trpc } from "~/utils/api";

// Mirrors apps/nextjs plans/[id]/plan-detail.tsx. Deliberate divergences:
// - No analytics (PostHog mobile is out of scope).
// - Cart opens via expo-web-browser's in-app browser instead of window.open,
//   so the web's "new tab didn't open?" popup-blocker fallback link is
//   unnecessary; the cached-link "Open your cart again" behavior is kept.

function NutritionTile(props: { value: string; label: string }) {
  return (
    <View className="bg-surface-neutral flex w-[48%] grow flex-col gap-1 rounded-2xl p-4">
      <Text className="text-ink text-xl font-bold">{props.value}</Text>
      <Text className="text-content-secondary text-xs">{props.label}</Text>
    </View>
  );
}

function ShoppingList(props: { payload: PlanPayload }) {
  const { payload } = props;
  return (
    <>
      <View className="flex flex-row flex-wrap gap-3">
        <NutritionTile
          value={payload.nutrition.caloriesPerDayPerPerson.toLocaleString(
            "en-US",
          )}
          label="Calories / day per person"
        />
        <NutritionTile
          value={`${payload.nutrition.proteinGramsPerDayPerPerson} g`}
          label="Protein / day per person"
        />
        <NutritionTile
          value={`${Math.round(payload.nutrition.percentOrganic)}%`}
          label="Organic items"
        />
        <NutritionTile
          value={String(payload.nutrition.itemCount)}
          label="Items"
        />
      </View>

      <View className="flex flex-col">
        {payload.items.map((item, index) => (
          <View
            key={`${item.name}-${index}`}
            className={
              index === 0
                ? "flex flex-row items-center justify-between gap-4 py-3"
                : "flex flex-row items-center justify-between gap-4 border-t border-[rgba(15,19,17,0.08)] py-3"
            }
          >
            <View className="flex flex-1 flex-col gap-1">
              <Text className="text-ink font-medium">{item.name}</Text>
              <View className="flex flex-row items-center gap-2">
                <Text className="text-content-tertiary text-sm">
                  {item.quantity}
                </Text>
                {item.isOrganic ? (
                  <Text className="bg-positive/10 text-positive overflow-hidden rounded-full px-2 py-0.5 text-xs font-semibold">
                    Organic
                  </Text>
                ) : null}
              </View>
            </View>
            <Text className="text-ink font-medium">
              {formatCents(item.estimatedPriceCents)}
            </Text>
          </View>
        ))}
      </View>

      <View className="flex flex-col gap-2 border-t border-[rgba(15,19,17,0.12)] pt-4">
        <View className="flex flex-row items-baseline justify-between gap-4">
          <Text className="text-ink font-semibold">Estimated total</Text>
          <Text className="text-ink text-xl font-bold">
            {formatCents(payload.estimatedTotalCents)}
          </Text>
        </View>
        <Text className="text-content-secondary text-sm">
          Estimated until checkout — final prices and delivery fees are set by
          Instacart.
        </Text>
      </View>
    </>
  );
}

function LoadedPlan(props: { plan: Plan }) {
  const { plan } = props;
  const router = useRouter();
  const queryClient = useQueryClient();

  const isInFlight = plan.status === "pending" || plan.status === "processing";

  const cancelPlan = useMutation(
    trpc.plan.cancel.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.plan.get.queryKey({ id: plan.id }),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.plan.list.queryKey(),
          }),
        ]);
      },
    }),
  );

  const regeneratePlan = useMutation(
    trpc.plan.regenerate.mutationOptions({
      onSuccess: (newPlan) => {
        void queryClient.invalidateQueries({
          queryKey: trpc.plan.list.queryKey(),
        });
        router.push(`/plans/${newPlan.id}`);
      },
    }),
  );

  const createCartLink = useMutation(
    trpc.orders.createCartLink.mutationOptions({
      onSuccess: ({ url }) => {
        void WebBrowser.openBrowserAsync(url);
      },
    }),
  );
  // Reuse the minted link on repeat clicks instead of re-minting (links
  // expire on their own; one per plan view is plenty).
  const cartUrl = createCartLink.data?.url ?? null;
  const openCart = () => {
    if (cartUrl) {
      void WebBrowser.openBrowserAsync(cartUrl);
      return;
    }
    createCartLink.mutate({ id: plan.id });
  };

  // On a ready plan, checkout is the primary action; Regenerate is secondary.
  const isReadyWithPayload = plan.status === "ready" && plan.payload != null;
  const RegenerateButton = isReadyWithPayload ? SecondaryButton : PrimaryButton;

  const regenerateSection = (
    <View className="flex flex-col gap-3">
      {regeneratePlan.error ? (
        <Text className="text-negative text-sm">
          Could not start a new plan. Please try again.
        </Text>
      ) : null}
      <RegenerateButton
        onPress={() => regeneratePlan.mutate({ id: plan.id })}
        disabled={regeneratePlan.isPending}
      >
        {regeneratePlan.isPending
          ? "Starting…"
          : plan.status === "ready"
            ? "Regenerate"
            : plan.status === "failed"
              ? "Try again"
              : "Generate again"}
      </RegenerateButton>
    </View>
  );

  if (isInFlight) {
    return (
      <View className="flex flex-1 flex-col items-center justify-center gap-4">
        <View className="bg-sprout/15 h-16 w-16 animate-pulse rounded-full" />
        <Text className="text-ink text-center text-2xl font-bold">
          Putting your plan together…
        </Text>
        <Text className="text-content-secondary text-center text-sm">
          This usually takes a minute. You can leave and come back.
        </Text>
        {cancelPlan.error ? (
          <Text className="text-negative text-center text-sm">
            Could not cancel this plan. Please try again.
          </Text>
        ) : null}
        <SecondaryButton
          onPress={() => cancelPlan.mutate({ id: plan.id })}
          disabled={cancelPlan.isPending}
        >
          {cancelPlan.isPending ? "Cancelling…" : "Cancel"}
        </SecondaryButton>
      </View>
    );
  }

  if (plan.status === "failed") {
    return (
      <View className="flex flex-1 flex-col gap-6">
        <Text className="text-ink text-2xl font-bold">
          Plan generation failed
        </Text>
        <View className="bg-negative/10 flex flex-col gap-2 rounded-3xl p-6">
          <Text className="text-negative text-sm font-semibold">
            We couldn&apos;t generate this plan.
          </Text>
          {plan.error ? (
            <Text className="text-content-secondary text-sm">
              {plan.error}
            </Text>
          ) : null}
        </View>
        {regenerateSection}
      </View>
    );
  }

  if (plan.status === "cancelled") {
    return (
      <View className="flex flex-1 flex-col gap-6">
        <Text className="text-ink text-2xl font-bold">Plan cancelled</Text>
        <View className="bg-surface-neutral rounded-3xl p-6">
          <Text className="text-content-secondary text-sm">
            This plan was cancelled before it finished generating.
          </Text>
        </View>
        {regenerateSection}
      </View>
    );
  }

  if (!plan.payload) {
    return (
      <View className="flex flex-1 flex-col gap-6">
        <Text className="text-ink text-2xl font-bold">
          Plan data is missing
        </Text>
        <View className="bg-surface-neutral rounded-3xl p-6">
          <Text className="text-content-secondary text-sm">
            This plan is marked ready but its contents are missing. Regenerate
            to get a fresh one.
          </Text>
        </View>
        {regenerateSection}
      </View>
    );
  }

  return (
    <View className="flex flex-1 flex-col gap-6">
      <View className="flex flex-col gap-2">
        <Overline>Your grocery plan</Overline>
        <Text className="text-ink text-2xl font-bold">Shopping list</Text>
      </View>

      {plan.retailerKey ? (
        <View className="bg-surface-neutral flex flex-row items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <Text className="text-ink text-sm font-medium">
            {plan.retailerKey}
          </Text>
          <Text className="bg-sprout/15 text-spruce overflow-hidden rounded-full px-3 py-1 text-xs font-semibold">
            Selected
          </Text>
        </View>
      ) : null}

      <ShoppingList payload={plan.payload} />

      <View className="flex flex-col gap-3">
        {createCartLink.error ? (
          <Text className="text-negative text-sm">
            {createCartLink.error.message}
          </Text>
        ) : null}
        <PrimaryButton onPress={openCart} disabled={createCartLink.isPending}>
          {createCartLink.isPending
            ? "Preparing your cart…"
            : cartUrl
              ? "Open your cart again"
              : "Open in Instacart"}
        </PrimaryButton>
        <Text className="text-content-tertiary text-xs">
          You&apos;ll pick your store and check out on Instacart. Prices are
          estimates until checkout — items may vary by store.
        </Text>
      </View>

      {regenerateSection}
    </View>
  );
}

function PlanDetail(props: { planId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const planQuery = useQuery(trpc.plan.get.queryOptions({ id: props.planId }));
  const currentStatus = planQuery.data?.status;
  const isInFlight =
    currentStatus === "pending" || currentStatus === "processing";

  const statusQuery = useQuery(
    trpc.plan.status.queryOptions(
      { id: props.planId },
      { enabled: isInFlight, refetchInterval: 2500 },
    ),
  );
  const polledStatus = statusQuery.data?.status;

  useEffect(() => {
    if (currentStatus && polledStatus && polledStatus !== currentStatus) {
      void queryClient.invalidateQueries({
        queryKey: trpc.plan.get.queryKey({ id: props.planId }),
      });
    }
  }, [currentStatus, polledStatus, queryClient, props.planId]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex grow flex-col gap-6 px-6 pt-12 pb-8"
      >
        <View className="flex flex-row items-center justify-between gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/plans")}
            className="active:opacity-80"
          >
            <Text className="text-spruce text-sm font-semibold">
              All plans
            </Text>
          </Pressable>
          {planQuery.data ? (
            <StatusChip status={planQuery.data.status} />
          ) : null}
        </View>

        {planQuery.isPending ? (
          <Text className="text-content-secondary animate-pulse text-sm">
            Loading your plan…
          </Text>
        ) : planQuery.error ? (
          <View className="bg-negative/10 flex flex-col items-start gap-3 rounded-2xl p-4">
            <Text className="text-negative text-sm">
              Could not load this plan. {planQuery.error.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void planQuery.refetch()}
              className="active:opacity-80"
            >
              <Text className="text-spruce text-sm font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <LoadedPlan plan={planQuery.data} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SessionGate>
      <PlanDetail planId={id} />
    </SessionGate>
  );
}
