import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { skipToken, useMutation, useQuery } from "@tanstack/react-query";

import { cn, Overline, PrimaryButton } from "~/components/plan-ui";
import { SessionGate } from "~/components/session-gate";
import { trpc } from "~/utils/api";

// Mirrors apps/nextjs plans/new/new-plan-flow.tsx. No analytics (out of
// scope on mobile).

type CountryCode = "US" | "CA";

interface StoreSearch {
  postalCode: string;
  countryCode: CountryCode;
}

// Token: --color-content-tertiary (placeholder color must be a prop in RN).
const PLACEHOLDER_COLOR = "#6b736f";

function NewPlanFlow() {
  const router = useRouter();

  const [postalCode, setPostalCode] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>("US");
  const [search, setSearch] = useState<StoreSearch | null>(null);
  const [selectedRetailerKey, setSelectedRetailerKey] = useState<
    string | null
  >(null);
  const [storeSkipped, setStoreSkipped] = useState(false);

  const storesQuery = useQuery(
    trpc.stores.nearby.queryOptions(search ?? skipToken),
  );

  const createPlan = useMutation(
    trpc.plan.create.mutationOptions({
      onSuccess: (plan) => {
        router.push(`/plans/${plan.id}`);
      },
    }),
  );

  const trimmedPostal = postalCode.trim();
  // Mirrors the server-side NearbyRetailersInputSchema bounds + regex so the
  // user gets a disabled button, not a raw zod error from the server.
  const canSearch =
    trimmedPostal.length >= 3 &&
    trimmedPostal.length <= 10 &&
    /^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(trimmedPostal);
  const canGenerate =
    (selectedRetailerKey !== null || storeSkipped) && !createPlan.isPending;

  const handleFindStores = () => {
    if (!canSearch) return;
    setSelectedRetailerKey(null);
    setSearch({ postalCode: trimmedPostal, countryCode });
  };

  const needsOnboarding =
    createPlan.error?.data?.code === "PRECONDITION_FAILED";

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex grow flex-col gap-6 px-6 pt-12 pb-8"
      >
        <View className="flex flex-col gap-2">
          <View className="flex flex-row items-center justify-between gap-3">
            <Overline>New plan</Overline>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/plans")}
              className="active:opacity-80"
            >
              <Text className="text-spruce text-sm font-semibold">
                All plans
              </Text>
            </Pressable>
          </View>
          <Text className="text-ink text-2xl font-bold">Pick your store</Text>
          <Text className="text-content-secondary text-sm">
            We&apos;ll build your plan for the store you choose. You can also
            skip this and pick one later.
          </Text>
        </View>

        <View className="flex flex-col gap-3">
          <Text className="text-content-secondary text-sm">Postal code</Text>
          <View className="flex flex-row items-center gap-2">
            <TextInput
              autoComplete="postal-code"
              placeholder="e.g. 94103"
              placeholderTextColor={PLACEHOLDER_COLOR}
              // CA postal codes are alphanumeric, so the numeric keyboard is
              // US-only (web uses a plain text input for both).
              keyboardType={countryCode === "US" ? "number-pad" : "default"}
              autoCapitalize="characters"
              returnKeyType="search"
              value={postalCode}
              onChangeText={(value) => {
                setPostalCode(value.slice(0, 10));
                // A store picked for the previous postal code must not
                // silently ride along with a new one.
                setSelectedRetailerKey(null);
              }}
              onSubmitEditing={handleFindStores}
              className="bg-surface-neutral text-ink flex-1 rounded-2xl px-4 py-3"
            />
            <View className="flex shrink-0 flex-row gap-1">
              {(["US", "CA"] as const).map((code) => (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: countryCode === code }}
                  onPress={() => setCountryCode(code)}
                  className={cn(
                    "rounded-full px-3 py-2 active:opacity-80",
                    countryCode === code && "bg-sprout/15",
                  )}
                >
                  <Text
                    className={cn(
                      "text-sm font-semibold",
                      countryCode === code
                        ? "text-spruce"
                        : "text-content-secondary",
                    )}
                  >
                    {code}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={handleFindStores}
            disabled={!canSearch || storesQuery.isFetching}
            className={cn(
              "w-full items-center rounded-full border border-[rgba(15,19,17,0.12)] py-3 active:opacity-80",
              (!canSearch || storesQuery.isFetching) && "opacity-50",
            )}
          >
            <Text className="text-spruce text-base font-semibold">
              {storesQuery.isFetching ? "Finding stores…" : "Find stores"}
            </Text>
          </Pressable>
        </View>

        {search ? (
          storesQuery.isPending ? (
            <Text className="text-content-secondary animate-pulse text-sm">
              Finding stores near {search.postalCode}…
            </Text>
          ) : storesQuery.error ? (
            <View className="bg-negative/10 flex flex-col items-start gap-3 rounded-2xl p-4">
              <Text className="text-negative text-sm">
                {storesQuery.error.message}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void storesQuery.refetch()}
                className="active:opacity-80"
              >
                <Text className="text-spruce text-sm font-semibold">
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : storesQuery.data.length === 0 ? (
            <Text className="text-content-secondary text-sm">
              No stores found for {search.postalCode}. Try another postal code.
            </Text>
          ) : (
            <View className="flex flex-col gap-3">
              {storesQuery.data.map((store) => {
                const selected = store.retailerKey === selectedRetailerKey;
                return (
                  <Pressable
                    key={store.retailerKey}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setSelectedRetailerKey(store.retailerKey);
                      setStoreSkipped(false);
                    }}
                    className={cn(
                      "flex w-full flex-row items-center gap-3 rounded-2xl border px-4 py-3 active:opacity-80",
                      selected
                        ? "border-sprout bg-sprout/10"
                        : "border-[rgba(15,19,17,0.12)] bg-white",
                    )}
                  >
                    {store.retailerLogoUrl ? (
                      <Image
                        source={{ uri: store.retailerLogoUrl }}
                        accessibilityIgnoresInvertColors
                        resizeMode="contain"
                        className="h-10 w-10 shrink-0 rounded-full bg-white"
                      />
                    ) : (
                      <View className="bg-surface-neutral h-10 w-10 shrink-0 items-center justify-center rounded-full">
                        <Text className="text-spruce font-semibold">
                          {store.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text className="text-ink flex-1 font-medium">
                      {store.name}
                    </Text>
                    {selected ? (
                      <Text className="bg-sprout/15 text-spruce overflow-hidden rounded-full px-3 py-1 text-xs font-semibold">
                        Selected
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )
        ) : null}

        <View className="flex flex-col items-start gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setStoreSkipped(true);
              setSelectedRetailerKey(null);
            }}
            className="active:opacity-80"
          >
            <Text className="text-content-secondary text-sm underline">
              Skip — choose store later
            </Text>
          </Pressable>
          {storeSkipped ? (
            <Text className="text-content-secondary text-sm">
              No store selected — your plan will be generated without one.
            </Text>
          ) : null}
        </View>

        <View className="mt-auto flex flex-col gap-3 pt-8">
          {needsOnboarding ? (
            <Text className="text-negative text-sm">
              Finish onboarding first —{" "}
              <Text
                className="font-semibold underline"
                onPress={() => router.push("/onboarding")}
              >
                set your budget
              </Text>{" "}
              to generate a plan.
            </Text>
          ) : createPlan.error ? (
            <Text className="text-negative text-sm">
              Could not create your plan. Please try again.
            </Text>
          ) : null}
          <PrimaryButton
            onPress={() =>
              createPlan.mutate({ retailerKey: selectedRetailerKey })
            }
            disabled={!canGenerate}
          >
            {createPlan.isPending ? "Creating…" : "Generate my plan"}
          </PrimaryButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function NewPlanScreen() {
  return (
    <SessionGate>
      <NewPlanFlow />
    </SessionGate>
  );
}
