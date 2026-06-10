"use client";

import Link from "next/link";

import { cn } from "@acme/ui";
import type { PlanStatus } from "@acme/validators";

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_CHIP: Record<PlanStatus, { label: string; className: string }> = {
  pending: {
    label: "Generating…",
    className: "bg-surface-neutral text-content-secondary",
  },
  processing: {
    label: "Generating…",
    className: "bg-surface-neutral text-content-secondary",
  },
  ready: { label: "Ready", className: "bg-positive/10 text-positive" },
  failed: { label: "Failed", className: "bg-negative/10 text-negative" },
  cancelled: {
    label: "Cancelled",
    className: "bg-surface-neutral text-content-tertiary",
  },
};

export function StatusChip(props: { status: PlanStatus }) {
  const chip = STATUS_CHIP[props.status];
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold",
        chip.className,
      )}
    >
      {chip.label}
    </span>
  );
}

export function Overline(props: { children: React.ReactNode }) {
  return (
    <p className="text-content-secondary text-xs font-semibold tracking-[0.14em] uppercase">
      {props.children}
    </p>
  );
}

export function PrimaryButton(props: {
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

export function SecondaryButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="text-spruce w-full rounded-full border border-[rgba(15,19,17,0.12)] py-4 text-base font-semibold transition-opacity disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

export function PillLink(props: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={props.href}
      className="bg-sprout text-spruce rounded-full px-6 py-3 text-center text-base font-semibold"
    >
      {props.children}
    </Link>
  );
}
