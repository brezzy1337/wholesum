"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import type { PlanPayload } from "@acme/validators";

import { analytics } from "~/analytics/events";
import { useTRPC } from "~/trpc/react";
import {
  formatCents,
  Overline,
  PrimaryButton,
  SecondaryButton,
  StatusChip,
} from "../_components/plan-ui";

type Plan = RouterOutputs["plan"]["get"];

function NutritionTile(props: { value: string; label: string }) {
  return (
    <div className="bg-surface-neutral flex flex-col gap-1 rounded-2xl p-4">
      <p className="text-xl font-bold">{props.value}</p>
      <p className="text-content-secondary text-xs">{props.label}</p>
    </div>
  );
}

function ShoppingList(props: { payload: PlanPayload }) {
  const { payload } = props;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
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
      </div>

      <ul className="flex flex-col divide-y divide-[rgba(15,19,17,0.08)]">
        {payload.items.map((item, index) => (
          <li
            key={`${item.name}-${index}`}
            className="flex items-center justify-between gap-4 py-3"
          >
            <div className="flex flex-col gap-1">
              <p className="font-medium">{item.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-content-tertiary text-sm">
                  {item.quantity}
                </span>
                {item.isOrganic ? (
                  <span className="bg-positive/10 text-positive rounded-full px-2 py-0.5 text-xs font-semibold">
                    Organic
                  </span>
                ) : null}
              </div>
            </div>
            <p className="font-medium whitespace-nowrap">
              {formatCents(item.estimatedPriceCents)}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 border-t border-[rgba(15,19,17,0.12)] pt-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-semibold">Estimated total</p>
          <p className="text-xl font-bold">
            {formatCents(payload.estimatedTotalCents)}
          </p>
        </div>
        <p className="text-content-secondary text-sm">
          Estimated until checkout — final prices and delivery fees are set by
          Instacart.
        </p>
      </div>
    </>
  );
}

function LoadedPlan(props: { plan: Plan }) {
  const { plan } = props;
  const trpc = useTRPC();
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
        analytics.planRegenerated({
          plan_id: plan.id,
          from_status: plan.status,
          new_plan_id: newPlan.id,
        });
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
        window.open(url, "_blank", "noopener,noreferrer");
      },
    }),
  );
  // Reuse the minted link on repeat clicks instead of re-minting (links
  // expire on their own; one per plan view is plenty).
  const cartUrl = createCartLink.data?.url ?? null;
  const openCart = () => {
    analytics.sentToInstacart({ plan_id: plan.id, reopened: cartUrl != null });
    if (cartUrl) {
      window.open(cartUrl, "_blank", "noopener,noreferrer");
      return;
    }
    createCartLink.mutate({ id: plan.id });
  };

  // Log a failed plan view once per mount — not on every poll/render tick.
  const failedViewedRef = useRef(false);
  useEffect(() => {
    if (plan.status === "failed" && !failedViewedRef.current) {
      failedViewedRef.current = true;
      analytics.planFailedViewed({ plan_id: plan.id });
    }
  }, [plan.status, plan.id]);

  // On a ready plan, checkout is the primary action; Regenerate is secondary.
  const isReadyWithPayload = plan.status === "ready" && plan.payload != null;
  const RegenerateButton = isReadyWithPayload ? SecondaryButton : PrimaryButton;

  const regenerateSection = (
    <div className="flex flex-col gap-3">
      {regeneratePlan.error ? (
        <p className="text-negative text-sm">
          Could not start a new plan. Please try again.
        </p>
      ) : null}
      <RegenerateButton
        onClick={() => regeneratePlan.mutate({ id: plan.id })}
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
    </div>
  );

  if (isInFlight) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div
          className="bg-sprout/15 h-16 w-16 animate-pulse rounded-full"
          aria-hidden
        />
        <h1 className="text-2xl font-bold">Putting your plan together…</h1>
        <p className="text-content-secondary text-sm">
          This usually takes a minute. You can leave and come back.
        </p>
        {cancelPlan.error ? (
          <p className="text-negative text-sm">
            Could not cancel this plan. Please try again.
          </p>
        ) : null}
        <SecondaryButton
          onClick={() => cancelPlan.mutate({ id: plan.id })}
          disabled={cancelPlan.isPending}
        >
          {cancelPlan.isPending ? "Cancelling…" : "Cancel"}
        </SecondaryButton>
      </div>
    );
  }

  if (plan.status === "failed") {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <h1 className="text-2xl font-bold">Plan generation failed</h1>
        <div className="bg-negative/10 flex flex-col gap-2 rounded-3xl p-6">
          <p className="text-negative text-sm font-semibold">
            We couldn&apos;t generate this plan.
          </p>
          {plan.error ? (
            <p className="text-content-secondary text-sm">{plan.error}</p>
          ) : null}
        </div>
        {regenerateSection}
      </div>
    );
  }

  if (plan.status === "cancelled") {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <h1 className="text-2xl font-bold">Plan cancelled</h1>
        <div className="bg-surface-neutral rounded-3xl p-6">
          <p className="text-content-secondary text-sm">
            This plan was cancelled before it finished generating.
          </p>
        </div>
        {regenerateSection}
      </div>
    );
  }

  if (!plan.payload) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <h1 className="text-2xl font-bold">Plan data is missing</h1>
        <div className="bg-surface-neutral rounded-3xl p-6">
          <p className="text-content-secondary text-sm">
            This plan is marked ready but its contents are missing. Regenerate
            to get a fresh one.
          </p>
        </div>
        {regenerateSection}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Overline>Your grocery plan</Overline>
        <h1 className="text-2xl font-bold">Shopping list</h1>
      </header>

      {plan.retailerKey ? (
        <div className="bg-surface-neutral flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <p className="text-sm font-medium">{plan.retailerKey}</p>
          <span className="bg-sprout/15 text-spruce rounded-full px-3 py-1 text-xs font-semibold">
            Selected
          </span>
        </div>
      ) : null}

      <ShoppingList payload={plan.payload} />

      <div className="flex flex-col gap-3">
        {createCartLink.error ? (
          <p className="text-negative text-sm">
            {createCartLink.error.message}
          </p>
        ) : null}
        <PrimaryButton onClick={openCart} disabled={createCartLink.isPending}>
          {createCartLink.isPending
            ? "Preparing your cart…"
            : cartUrl
              ? "Open your cart again"
              : "Open in Instacart"}
        </PrimaryButton>
        {cartUrl ? (
          // Always offered once minted — covers blocked popups (Safari can
          // report success even when it blocked the tab).
          <a
            href={cartUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-spruce text-center text-sm font-semibold"
          >
            New tab didn&apos;t open? Use your cart link
          </a>
        ) : null}
        <p className="text-content-tertiary text-xs">
          You&apos;ll pick your store and check out on Instacart. Prices are
          estimates until checkout — items may vary by store.
        </p>
      </div>

      {regenerateSection}
    </div>
  );
}

export function PlanDetail(props: { planId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

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
  }, [currentStatus, polledStatus, queryClient, trpc, props.planId]);

  return (
    <main className="text-ink min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-6 pt-12 pb-8">
        <header className="flex items-center justify-between gap-3">
          <Link href="/plans" className="text-spruce text-sm font-semibold">
            All plans
          </Link>
          {planQuery.data ? <StatusChip status={planQuery.data.status} /> : null}
        </header>

        {planQuery.isPending ? (
          <p
            className="text-content-secondary animate-pulse text-sm"
            role="status"
          >
            Loading your plan…
          </p>
        ) : planQuery.error ? (
          <div className="bg-negative/10 flex flex-col items-start gap-3 rounded-2xl p-4">
            <p className="text-negative text-sm">
              Could not load this plan. {planQuery.error.message}
            </p>
            <button
              type="button"
              onClick={() => void planQuery.refetch()}
              className="text-spruce text-sm font-semibold"
            >
              Retry
            </button>
          </div>
        ) : (
          <LoadedPlan plan={planQuery.data} />
        )}
      </div>
    </main>
  );
}
