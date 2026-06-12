"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { skipToken, useMutation, useQuery } from "@tanstack/react-query";

import { cn } from "@acme/ui";

import { analytics } from "~/analytics/events";
import { useTRPC } from "~/trpc/react";
import { Overline, PrimaryButton } from "../_components/plan-ui";

type CountryCode = "US" | "CA";

interface StoreSearch {
  postalCode: string;
  countryCode: CountryCode;
}

export function NewPlanFlow() {
  const router = useRouter();
  const trpc = useTRPC();

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
        analytics.planCreated({
          plan_id: plan.id,
          retailer_key: selectedRetailerKey,
          store_skipped: storeSkipped,
        });
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
    <main className="text-ink min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-6 pt-12 pb-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Overline>New plan</Overline>
            <Link href="/plans" className="text-spruce text-sm font-semibold">
              All plans
            </Link>
          </div>
          <h1 className="text-2xl font-bold">Pick your store</h1>
          <p className="text-content-secondary text-sm">
            We&apos;ll build your plan for the store you choose. You can also
            skip this and pick one later.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          <label htmlFor="postal-code" className="text-content-secondary text-sm">
            Postal code
          </label>
          <div className="flex items-center gap-2">
            <input
              id="postal-code"
              type="text"
              autoComplete="postal-code"
              placeholder="e.g. 94103"
              value={postalCode}
              onChange={(event) => {
                setPostalCode(event.target.value.slice(0, 10));
                // A store picked for the previous postal code must not
                // silently ride along with a new one.
                setSelectedRetailerKey(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleFindStores();
              }}
              className="bg-surface-neutral text-ink placeholder:text-content-tertiary w-full rounded-2xl border-0 px-4 py-3 focus:outline-none"
            />
            <div
              className="flex shrink-0 gap-1"
              role="group"
              aria-label="Country"
            >
              {(["US", "CA"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={countryCode === code}
                  onClick={() => setCountryCode(code)}
                  className={cn(
                    "rounded-full px-3 py-2 text-sm font-semibold transition-colors",
                    countryCode === code
                      ? "bg-sprout/15 text-spruce"
                      : "text-content-secondary",
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleFindStores}
            disabled={!canSearch || storesQuery.isFetching}
            className="text-spruce w-full rounded-full border border-[rgba(15,19,17,0.12)] py-3 text-base font-semibold transition-opacity disabled:opacity-50"
          >
            {storesQuery.isFetching ? "Finding stores…" : "Find stores"}
          </button>
        </div>

        {search ? (
          storesQuery.isPending ? (
            <p
              className="text-content-secondary animate-pulse text-sm"
              role="status"
            >
              Finding stores near {search.postalCode}…
            </p>
          ) : storesQuery.error ? (
            <div className="bg-negative/10 flex flex-col items-start gap-3 rounded-2xl p-4">
              <p className="text-negative text-sm">
                {storesQuery.error.message}
              </p>
              <button
                type="button"
                onClick={() => void storesQuery.refetch()}
                className="text-spruce text-sm font-semibold"
              >
                Retry
              </button>
            </div>
          ) : storesQuery.data.length === 0 ? (
            <p className="text-content-secondary text-sm">
              No stores found for {search.postalCode}. Try another postal
              code.
            </p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Nearby stores">
              {storesQuery.data.map((store) => {
                const selected = store.retailerKey === selectedRetailerKey;
                return (
                  <li key={store.retailerKey}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        analytics.storeSelected({
                          retailer_key: store.retailerKey,
                        });
                        setSelectedRetailerKey(store.retailerKey);
                        setStoreSkipped(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                        selected
                          ? "border-sprout bg-sprout/10"
                          : "border-[rgba(15,19,17,0.12)] bg-white",
                      )}
                    >
                      {store.retailerLogoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote logo hosts aren't in next.config remotePatterns
                        <img
                          src={store.retailerLogoUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full bg-white object-contain"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="bg-surface-neutral text-spruce flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold"
                        >
                          {store.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="flex-1 font-medium">{store.name}</span>
                      {selected ? (
                        <span className="bg-sprout/15 text-spruce rounded-full px-3 py-1 text-xs font-semibold">
                          Selected
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => {
              analytics.storeSkipped();
              setStoreSkipped(true);
              setSelectedRetailerKey(null);
            }}
            className="text-content-secondary text-sm underline underline-offset-4"
          >
            Skip — choose store later
          </button>
          {storeSkipped ? (
            <p className="text-content-secondary text-sm">
              No store selected — your plan will be generated without one.
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-8">
          {needsOnboarding ? (
            <p className="text-negative text-sm">
              Finish onboarding first —{" "}
              <Link
                href="/onboarding"
                className="font-semibold underline underline-offset-4"
              >
                set your budget
              </Link>{" "}
              to generate a plan.
            </p>
          ) : createPlan.error ? (
            <p className="text-negative text-sm">
              Could not create your plan. Please try again.
            </p>
          ) : null}
          <PrimaryButton
            onClick={() =>
              createPlan.mutate({ retailerKey: selectedRetailerKey })
            }
            disabled={!canGenerate}
          >
            {createPlan.isPending ? "Creating…" : "Generate my plan"}
          </PrimaryButton>
        </div>
      </div>
    </main>
  );
}
