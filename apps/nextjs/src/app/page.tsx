import Link from "next/link";

import { HydrateClient } from "~/trpc/server";
import { AuthShowcase } from "./_components/auth-showcase";

export default function HomePage() {
  return (
    <HydrateClient>
      <main className="container h-screen py-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Create <span className="text-primary">T3</span> Turbo
          </h1>
          <AuthShowcase />
          <Link
            href="/onboarding"
            className="bg-sprout text-spruce rounded-full px-8 py-3 font-semibold"
          >
            Get started
          </Link>
        </div>
      </main>
    </HydrateClient>
  );
}
