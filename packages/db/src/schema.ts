import { sql } from "drizzle-orm";
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
  weeklyBudgetCents: t.integer(),
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
    payload: t.jsonb(),
    error: t.text(),
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

export const conversions = pgTable(
  "conversions",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    userId: t.text().references(() => user.id, { onDelete: "set null" }),
    planId: t.uuid().references(() => plans.id, { onDelete: "set null" }),
    instacartEventId: t.text().notNull().unique(),
    amountCents: t.integer().notNull(),
    currency: t.text().notNull().default("USD"),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
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
});

export * from "./auth-schema";
