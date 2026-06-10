import { authRouter } from "./router/auth";
import { profilesRouter } from "./router/profiles";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  profiles: profilesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
