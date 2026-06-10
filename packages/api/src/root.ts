import { authRouter } from "./router/auth";
import { planRouter } from "./router/plan";
import { profilesRouter } from "./router/profiles";
import { storesRouter } from "./router/stores";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  plan: planRouter,
  profiles: profilesRouter,
  stores: storesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
