"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import {
  formatDate,
  Overline,
  PillLink,
  StatusChip,
} from "./_components/plan-ui";

export function PlansList() {
  const trpc = useTRPC();
  const plansQuery = useQuery(trpc.plan.list.queryOptions());

  return (
    <main className="text-ink min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-6 pt-12 pb-8">
        <header className="flex flex-col gap-2">
          <Overline>Wholesum</Overline>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold">Your plans</h1>
            <Link
              href="/plans/new"
              className="bg-sprout text-spruce rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap"
            >
              New plan
            </Link>
          </div>
        </header>

        {plansQuery.isPending ? (
          <p
            className="text-content-secondary animate-pulse text-sm"
            role="status"
          >
            Loading your plans…
          </p>
        ) : plansQuery.error ? (
          <div className="bg-negative/10 flex flex-col items-start gap-3 rounded-2xl p-4">
            <p className="text-negative text-sm">
              Could not load your plans. Please try again.
            </p>
            <button
              type="button"
              onClick={() => void plansQuery.refetch()}
              className="text-spruce text-sm font-semibold"
            >
              Retry
            </button>
          </div>
        ) : plansQuery.data.length === 0 ? (
          <div className="bg-surface-neutral flex flex-col items-start gap-4 rounded-3xl p-6">
            <h2 className="text-lg font-semibold">No plans yet</h2>
            <p className="text-content-secondary text-sm">
              Turn your budget and household profile into a grocery plan you
              can send to Instacart.
            </p>
            <PillLink href="/plans/new">Generate your first plan</PillLink>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {plansQuery.data.map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/plans/${plan.id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-[rgba(15,19,17,0.12)] bg-white px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <StatusChip status={plan.status} />
                    <span className="text-content-tertiary text-xs">
                      {formatDate(plan.createdAt)}
                    </span>
                  </div>
                  {plan.retailerKey ? (
                    <p className="text-content-secondary text-sm">
                      Store: {plan.retailerKey}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
