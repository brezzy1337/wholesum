import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { cn, Overline, PrimaryButton } from "~/components/plan-ui";
import { SessionGate } from "~/components/session-gate";
import { analytics } from "~/utils/analytics";
import { trpc } from "~/utils/api";

// Mirrors apps/nextjs onboarding-wizard.tsx (reviewed product rules),
// including its funnel events.

const ALLERGENS = [
  "Peanuts",
  "Tree nuts",
  "Dairy",
  "Gluten",
  "Shellfish",
  "Soy",
];

const PREFERENCES = [
  "Vegan",
  "Keto",
  "Low sodium",
  "High protein",
  "Organic only",
];

const MAX_RESTRICTIONS = 50;
const MAX_RESTRICTION_LENGTH = 100;

// Token: --color-content-tertiary (placeholder color must be a prop in RN).
const PLACEHOLDER_COLOR = "#6b736f";

function StepChip(props: { step: number }) {
  return (
    <Text className="bg-surface-neutral text-spruce overflow-hidden rounded-full px-3 py-1 text-xs font-semibold">
      {props.step} / 3
    </Text>
  );
}

function Chip(props: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onToggle}
      className={cn(
        "rounded-full px-4 py-2 active:opacity-80",
        props.selected
          ? "bg-sprout/15 border border-transparent"
          : "border border-[rgba(15,19,17,0.12)] bg-white",
      )}
    >
      <Text
        className={cn(
          "text-sm",
          props.selected ? "text-spruce font-semibold" : "text-ink",
        )}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function ChipGroup(props: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <View className="flex flex-col gap-3">
      <Text className="text-content-secondary text-sm">{props.label}</Text>
      <View className="flex flex-row flex-wrap gap-2">
        {props.options.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={props.selected.includes(option)}
            onToggle={() => props.onToggle(option)}
          />
        ))}
      </View>
    </View>
  );
}

function StepperButton(props: {
  label: string;
  symbol: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      disabled={props.disabled}
      className={cn(
        "bg-surface-neutral h-14 w-14 items-center justify-center rounded-full active:opacity-80",
        props.disabled && "opacity-40",
      )}
    >
      <Text className="text-spruce text-2xl font-semibold">{props.symbol}</Text>
    </Pressable>
  );
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function OnboardingWizard() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [budget, setBudget] = useState("400");
  const [householdSize, setHouseholdSize] = useState(1);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [excludedFoods, setExcludedFoods] = useState("");

  const upsertProfile = useMutation(
    trpc.profiles.upsert.mutationOptions({
      onSuccess: () => {
        // Step 3 only counts as completed once the profile actually saved.
        analytics.onboardingStepCompleted({ step: 3, step_name: "dietary" });
        analytics.onboardingCompleted({ household_size: householdSize });
        router.push("/plans");
      },
    }),
  );

  const handleBudgetChange = (value: string) => {
    const digitsAndDot = value.replace(/[^0-9.]/g, "");
    const [whole, ...rest] = digitsAndDot.split(".");
    const sanitized =
      rest.length > 0 ? `${whole ?? ""}.${rest.join("")}` : (whole ?? "");
    setBudget(sanitized.slice(0, 8));
  };

  const handleFinish = () => {
    // PRIVACY: dietary/allergen/budget contents never go to analytics.
    const dollars = Number.parseFloat(budget);
    const monthlyBudgetCents =
      Number.isFinite(dollars) && dollars > 0
        ? Math.round(dollars * 100)
        : null;

    const dietaryRestrictions = [
      ...new Set(
        [...allergens, ...preferences, ...excludedFoods.split(",")]
          .map((entry) => entry.trim().slice(0, MAX_RESTRICTION_LENGTH))
          .filter((entry) => entry.length > 0),
      ),
    ].slice(0, MAX_RESTRICTIONS);

    upsertProfile.mutate({
      monthlyBudgetCents,
      householdSize,
      dietaryRestrictions,
    });
  };

  const titles: Record<typeof step, string> = {
    1: "Your budget",
    2: "Your household",
    3: "Dietary needs",
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex h-full w-full flex-col px-6 pt-12 pb-8">
        <View className="flex flex-row items-center gap-3">
          <StepChip step={step} />
          <Text className="text-ink text-2xl font-bold">{titles[step]}</Text>
          {step > 1 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep(step === 3 ? 2 : 1)}
              className="ml-auto active:opacity-80"
            >
              <Text className="text-spruce text-sm font-semibold">Back</Text>
            </Pressable>
          ) : null}
        </View>

        {step === 1 ? (
          <View className="flex flex-1 flex-col items-center justify-center gap-4">
            <Overline>Monthly grocery budget</Overline>
            <View className="flex flex-row items-baseline justify-center">
              <Text className="text-ink text-4xl font-bold">$</Text>
              <TextInput
                inputMode="decimal"
                keyboardType="decimal-pad"
                accessibilityLabel="Monthly grocery budget in dollars"
                value={budget}
                onChangeText={handleBudgetChange}
                className="text-ink min-w-16 bg-transparent text-[64px] font-bold"
              />
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View className="flex flex-1 flex-col items-center justify-center gap-6">
            <Overline>People in your household</Overline>
            <View className="flex flex-row items-center gap-8">
              <StepperButton
                label="Decrease household size"
                symbol="−"
                onPress={() => setHouseholdSize(Math.max(1, householdSize - 1))}
                disabled={householdSize <= 1}
              />
              <Text className="text-ink min-w-20 text-center text-[64px] font-bold">
                {householdSize}
              </Text>
              <StepperButton
                label="Increase household size"
                symbol="+"
                onPress={() =>
                  setHouseholdSize(Math.min(20, householdSize + 1))
                }
                disabled={householdSize >= 20}
              />
            </View>
            <Text className="text-content-secondary text-sm">
              We&apos;ll size portions and budget for everyone.
            </Text>
          </View>
        ) : null}

        {step === 3 ? (
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="flex flex-col gap-6 pt-8 pb-4"
          >
            <ChipGroup
              label="Allergens to avoid"
              options={ALLERGENS}
              selected={allergens}
              onToggle={(option) =>
                setAllergens(toggleInList(allergens, option))
              }
            />
            <View className="border-t border-[rgba(15,19,17,0.12)]" />
            <ChipGroup
              label="Preferences"
              options={PREFERENCES}
              selected={preferences}
              onToggle={(option) =>
                setPreferences(toggleInList(preferences, option))
              }
            />
            <View className="border-t border-[rgba(15,19,17,0.12)]" />
            <View className="flex flex-col gap-3">
              <Text className="text-content-secondary text-sm">
                Foods to exclude
              </Text>
              <TextInput
                placeholder="Add ingredients…"
                placeholderTextColor={PLACEHOLDER_COLOR}
                value={excludedFoods}
                onChangeText={setExcludedFoods}
                className="bg-surface-neutral text-ink w-full rounded-2xl px-4 py-3"
              />
            </View>
          </ScrollView>
        ) : null}

        <View className="mt-auto flex flex-col gap-3 pt-8">
          {step === 3 && upsertProfile.error ? (
            <Text className="text-content-secondary text-sm">
              Something went wrong saving your profile. Please try again.
            </Text>
          ) : null}
          {step < 3 ? (
            <PrimaryButton
              onPress={() => {
                analytics.onboardingStepCompleted({
                  step,
                  step_name: step === 1 ? "budget" : "household",
                });
                setStep(step === 1 ? 2 : 3);
              }}
            >
              Continue
            </PrimaryButton>
          ) : (
            <PrimaryButton
              onPress={handleFinish}
              disabled={upsertProfile.isPending}
            >
              {upsertProfile.isPending ? "Finishing…" : "Finish"}
            </PrimaryButton>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function OnboardingScreen(): ReactNode {
  return (
    <SessionGate>
      <OnboardingWizard />
    </SessionGate>
  );
}
