import { sql } from "drizzle-orm";
import { pgEnum, pgTable } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { user } from "./auth-schema";

export const Post = pgTable("post", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const CreatePostSchema = createInsertSchema(Post, {
  title: z.string().max(256),
  content: z.string().max(256),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const profiles = pgTable("profiles", (t) => ({
  userId: t
    .text()
    .primaryKey()
    .references(() => user.id),
  dietaryRestrictions: t.text({}).array(),
  householdSize: t.integer().notNull().default(1),
  weeklyBudgetCents: t.integer(),
  createdAt: t.timestamp().defaultNow().notNull(),
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
]);

export const plans = pgTable("plans", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t
    .text()
    .notNull()
    .references(() => user.id),
  status: planStatus().notNull().default("pending"),
  retailerKey: t.text(),
  payload: t.jsonb(),
  error: t.text(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const CreatePlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const conversions = pgTable("conversions", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  userId: t.text().references(() => user.id),
  planId: t.uuid().references(() => plans.id),
  instacartEventId: t.text().notNull().unique(),
  amountCents: t.integer().notNull(),
  currency: t.text().notNull().default("USD"),
  createdAt: t.timestamp().defaultNow().notNull(),
}));

export const CreateConversionSchema = createInsertSchema(conversions).omit({
  id: true,
  createdAt: true,
});

export * from "./auth-schema";
