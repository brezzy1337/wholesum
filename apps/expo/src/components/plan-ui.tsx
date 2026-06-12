import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";

import type { RouterOutputs } from "~/utils/api";

// Types derived from the API contract instead of importing @acme/validators
// (which is not a dependency of this app) — same shapes, zero new deps.
export type Plan = RouterOutputs["plan"]["get"];
export type PlanStatus = Plan["status"];
export type PlanPayload = NonNullable<Plan["payload"]>;

/** Minimal className joiner (the web app's `cn` lives in @acme/ui, which this app does not depend on). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Same formatting math as the web app's plan-ui helpers — all monetary
// display derives from cents.
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
    <Text
      className={cn(
        "overflow-hidden rounded-full px-3 py-1 text-xs font-semibold",
        chip.className,
      )}
    >
      {chip.label}
    </Text>
  );
}

export function Overline(props: { children: ReactNode }) {
  return (
    <Text className="text-content-secondary text-xs font-semibold tracking-[0.14em] uppercase">
      {props.children}
    </Text>
  );
}

export function PrimaryButton(props: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled}
      className={cn(
        "bg-sprout w-full items-center rounded-full py-4 active:opacity-80",
        props.disabled && "opacity-60",
      )}
    >
      <Text className="text-spruce text-base font-semibold">
        {props.children}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton(props: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled}
      className={cn(
        "w-full items-center rounded-full border border-[rgba(15,19,17,0.12)] py-4 active:opacity-80",
        props.disabled && "opacity-50",
      )}
    >
      <Text className="text-spruce text-base font-semibold">
        {props.children}
      </Text>
    </Pressable>
  );
}
