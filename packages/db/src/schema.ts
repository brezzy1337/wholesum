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
 * it never inserts a second row for the same action. On a state-transition
 * upsert, the monetary columns (`orderAmountCents`, `payoutCents`) are
 * overwritten too, not just `state` — a PENDING action may carry provisional
 * amounts that the APPROVED/REVERSED postback finalizes.
 *
 * FK/check interaction: both `userId` and `planId` are `onDelete: "set null"`,
 * with a CHECK requiring at least one to be non-null. Postgres re-evaluates
 * the CHECK when a referential action updates the row, so deleting the second
 * parent of an already-half-orphaned row fails loudly rather than silently
 * orphaning the conversion. No delete paths exist in MVP; any future
 * user/plan hard-delete flow must handle that failure mode.
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
    // TRAP: Drizzle's $onUpdateFn fires only on db.update() — NOT on
    // insert().onConflictDoUpdate(). The future Impact-postback processor
    // upserts, so its `set` clause MUST explicitly include `updatedAt`.
    // .defaultNow() covers the initial insert; $onUpdateFn covers plain
    // updates only.
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdateFn(() => sql`now()`),
  }),
  (t) => [
    index("conversions_plan_id_idx").on(t.planId),
    index("conversions_user_id_idx").on(t.userId),
    // Reconciliation sweep: "pending conversions older than N days".
    index("conversions_state_created_at_idx").on(t.state, t.createdAt),
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
 *
 * Multiple rows per plan are expected — links are minted on demand and client
 * retries mint fresh links. Reconciliation must tolerate that and pick the
 * nearest-in-time link.
 */
export const cartLinks = pgTable(
  "cart_links",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    // Nullable + set-null (matching `conversions`): a plan hard-delete must
    // not destroy the reconciliation anchor before a late Impact postback
    // arrives — the real join key is (userId, createdAt), which survives.
    planId: t.uuid().references(() => plans.id, { onDelete: "set null" }),
    // Cascade is intentional here: user deletion purging their links is the
    // privacy posture we want.
    userId: t
      .text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    expiresAt: t.timestamp({ withTimezone: true }).notNull(),
  }),
  (t) => [
    index("cart_links_plan_id_idx").on(t.planId),
    index("cart_links_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export * from "./auth-schema";
