import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { check, index, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { user } from "./auth-schema";

export const profiles = pgTable("profiles", (t) => ({
  userId: t
    .text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  dietaryRestrictions: t.text({}).array(),
  householdSize: t.integer().notNull().default(1),
  monthlyBudgetCents: t.integer(),
  createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const CreateProfileSchema = createInsertSchema(profiles).omit({
  createdAt: true,
  updatedAt: true,
});

export const planStatus = pgEnum("plan_status", [
  "pending",
  "processing",
  "ready",
  "failed",
  "cancelled",
]);

export const plans = pgTable(
  "plans",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: planStatus().notNull().default("pending"),
    retailerKey: t.text(),
    input: t.jsonb().notNull(),
    payload: t.jsonb(),
    error: t.text(),
    regeneratedFromPlanId: t
      .uuid()
      .references((): AnyPgColumn => plans.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (t) => [index("plans_user_id_idx").on(t.userId)],
);

export const CreatePlanSchema = createInsertSchema(plans).omit({
  id: true,
  status: true,
  error: true,
  createdAt: true,
  updatedAt: true,
});

export const conversionState = pgEnum("conversion_state", [
  "pending",
  "approved",
  "reversed",
]);

/**
 * Affiliate conversions, modeled on the impact.com ("Tastemakers") Action
 * contract — Instacart's public IDP tier has no webhooks; conversions arrive
 * as impact.com postbacks after IDP production approval.
 *
 * Exactly-once semantics: the dedup anchor is `impactActionId` (one row per
 * action), but processing must be idempotent per (actionId, state) — a
 * reversal re-arrives as the SAME action id with a new state. The processor
 * (future worker slice) upserts on `impactActionId` and transitions `state`;
 * it never inserts a second row for the same action.
 */
export const conversions = pgTable(
  "conversions",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    planId: t.uuid().references(() => plans.id, { onDelete: "set null" }),
    impactActionId: t.text().notNull().unique(),
    state: conversionState().notNull().default("pending"),
    oid: t.text(),
    orderAmountCents: t.integer().notNull(),
    payoutCents: t.integer(),
    currency: t.text().notNull().default("USD"),
    eventDate: t.timestamp({ withTimezone: true }),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (t) => [
    index("conversions_plan_id_idx").on(t.planId),
    index("conversions_user_id_idx").on(t.userId),
    check(
      "conversions_attribution_check",
      sql`${t.userId} IS NOT NULL OR ${t.planId} IS NOT NULL`,
    ),
  ],
);

export const CreateConversionSchema = createInsertSchema(conversions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * One row per minted Instacart products-link — the durable server-side join
 * anchor for conversion reconciliation. Impact actions carry no plan id, so
 * we reconcile by user + time window: "this user's click-outs near this
 * conversion's EventDate". `orders.createCartLink` (api slice) inserts here;
 * links are minted with a 30-day expiry by the api.
 */
export const cartLinks = pgTable(
  "cart_links",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    planId: t
      .uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    expiresAt: t.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("cart_links_plan_id_idx").on(t.planId),
    index("cart_links_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export * from "./auth-schema";
