"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { analytics } from "~/analytics/events";
import { useTRPC } from "~/trpc/react";

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

function StepChip(props: { step: number }) {
  return (
    <span className="bg-surface-neutral text-spruce rounded-full px-3 py-1 text-xs font-semibold">
      {props.step} / 3
    </span>
  );
}

function Overline(props: { children: React.ReactNode }) {
  return (
    <p className="text-content-secondary text-xs font-semibold tracking-[0.14em] uppercase">
      {props.children}
    </p>
  );
}

function PrimaryButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="bg-sprout text-spruce w-full rounded-full py-4 text-base font-semibold transition-opacity disabled:opacity-60"
    >
      {props.children}
    </button>
  );
}

function Chip(props: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-pressed={props.selected}
      className={cn(
        "rounded-full px-4 py-2 text-sm transition-colors",
        props.selected
          ? "bg-sprout/15 text-spruce border border-transparent font-semibold"
          : "text-ink border border-[rgba(15,19,17,0.12)] bg-white",
      )}
    >
      {props.label}
    </button>
  );
}

function ChipGroup(props: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-content-secondary text-sm">{props.label}</p>
      <div className="flex flex-wrap gap-2">
        {props.options.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={props.selected.includes(option)}
            onToggle={() => props.onToggle(option)}
          />
        ))}
      </div>
    </div>
  );
}

function StepperButton(props: {
  label: string;
  symbol: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      className="bg-surface-neutral text-spruce flex h-14 w-14 items-center justify-center rounded-full text-2xl font-semibold transition-opacity disabled:opacity-40"
    >
      {props.symbol}
    </button>
  );
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export function OnboardingWizard() {
  const router = useRouter();
  const trpc = useTRPC();

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
        router.refresh();
      },
    }),
  );

  const handleBudgetChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digitsAndDot = event.target.value.replace(/[^0-9.]/g, "");
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
    <main className="text-ink min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-12 pb-8">
        <header className="flex items-center gap-3">
          <StepChip step={step} />
          <h1 className="text-ink text-2xl font-bold">{titles[step]}</h1>
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step === 3 ? 2 : 1)}
              className="text-spruce ml-auto text-sm font-semibold"
            >
              Back
            </button>
          ) : null}
        </header>

        {step === 1 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <Overline>Monthly grocery budget</Overline>
            <div className="flex items-baseline justify-center">
              <span className="text-ink text-4xl font-bold">$</span>
              <input
                type="text"
                inputMode="decimal"
                aria-label="Monthly grocery budget in dollars"
                value={budget}
                onChange={handleBudgetChange}
                className="text-ink field-sizing-content min-w-[1ch] bg-transparent text-[64px] leading-none font-bold focus:outline-none"
              />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <Overline>People in your household</Overline>
            <div className="flex items-center gap-8">
              <StepperButton
                label="Decrease household size"
                symbol="−"
                onClick={() => setHouseholdSize(Math.max(1, householdSize - 1))}
                disabled={householdSize <= 1}
              />
              <span className="text-ink min-w-[2ch] text-center text-[64px] leading-none font-bold">
                {householdSize}
              </span>
              <StepperButton
                label="Increase household size"
                symbol="+"
                onClick={() =>
                  setHouseholdSize(Math.min(20, householdSize + 1))
                }
                disabled={householdSize >= 20}
              />
            </div>
            <p className="text-content-secondary text-sm">
              We&apos;ll size portions and budget for everyone.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-1 flex-col gap-6 pt-8">
            <ChipGroup
              label="Allergens to avoid"
              options={ALLERGENS}
              selected={allergens}
              onToggle={(option) =>
                setAllergens(toggleInList(allergens, option))
              }
            />
            <div className="border-t border-[rgba(15,19,17,0.12)]" />
            <ChipGroup
              label="Preferences"
              options={PREFERENCES}
              selected={preferences}
              onToggle={(option) =>
                setPreferences(toggleInList(preferences, option))
              }
            />
            <div className="border-t border-[rgba(15,19,17,0.12)]" />
            <div className="flex flex-col gap-3">
              <label
                htmlFor="excluded-foods"
                className="text-content-secondary text-sm"
              >
                Foods to exclude
              </label>
              <input
                id="excluded-foods"
                type="text"
                placeholder="Add ingredients…"
                value={excludedFoods}
                onChange={(event) => setExcludedFoods(event.target.value)}
                className="bg-surface-neutral text-ink placeholder:text-content-tertiary w-full rounded-2xl border-0 px-4 py-3 focus:outline-none"
              />
            </div>
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-3 pt-8">
          {step === 3 && upsertProfile.error ? (
            <p className="text-content-secondary text-sm">
              Something went wrong saving your profile. Please try again.
            </p>
          ) : null}
          {step < 3 ? (
            <PrimaryButton
              onClick={() => {
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
              onClick={handleFinish}
              disabled={upsertProfile.isPending}
            >
              {upsertProfile.isPending ? "Finishing…" : "Finish"}
            </PrimaryButton>
          )}
        </div>
      </div>
    </main>
  );
}
