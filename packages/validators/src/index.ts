import { z } from "zod/v4";

export const UpsertProfileSchema = z.object({
  monthlyBudgetCents: z.int().positive().nullable(),
  householdSize: z.int().min(1).max(20),
  dietaryRestrictions: z.array(z.string().trim().min(1).max(100)).max(50),
});

export type UpsertProfileInput = z.infer<typeof UpsertProfileSchema>;
