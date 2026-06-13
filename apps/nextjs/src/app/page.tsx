import Link from "next/link";

import { getSession } from "~/auth/server";
import { HydrateClient } from "~/trpc/server";
import { AuthShowcase } from "./_components/auth-showcase";

// TODO(mobile-parity): promote BigLeaf/SmallLeaf + the wordmark into a shared
// @acme/ui logo component before mirroring this screen on Expo, so the SVG
// path data lives in exactly one place.
function BigLeaf({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 22C5 16 4 7 18 2C20 13 18 17 12 22Z" />
    </svg>
  );
}

function SmallLeaf({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6 11C2.5 8 2 3.5 9 1C10 6.5 9 8.5 6 11Z" />
    </svg>
  );
}

export default async function HomePage() {
  const session = await getSession();

  return (
    <HydrateClient>
      <main className="bg-cream flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <span className="text-spruce text-6xl font-bold leading-none">
                W
              </span>
              <BigLeaf className="text-sprout absolute -top-1 -right-3 h-6 w-6" />
            </div>
            <div className="flex items-end gap-1">
              <span className="text-spruce text-xl font-semibold tracking-tight">
                wholesum
              </span>
              <SmallLeaf className="text-sprout mb-1 h-3 w-3" />
            </div>
          </div>

          {/* Headline */}
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-spruce text-3xl font-bold">
              Eat well, spend smart.
            </h1>
            <p className="text-content-secondary text-sm">
              Tell us your budget and how you eat — we&apos;ll plan a healthy
              cart that fits, then hand it to Instacart.
            </p>
          </div>

          {/* Budget illustration card */}
          <div className="bg-surface-neutral flex w-full flex-col gap-3 rounded-2xl p-6">
            <span className="text-clay text-xs font-bold uppercase tracking-wide">
              Your monthly budget
            </span>
            <span className="text-spruce text-4xl font-semibold">$400</span>
            <div className="bg-white h-2 w-full overflow-hidden rounded-full">
              <div className="bg-sprout h-2 w-[65%] rounded-full" />
            </div>
            <span className="text-content-secondary text-xs">
              becomes a full, healthy cart
            </span>
          </div>

          {/* Step chips */}
          <div className="flex w-full gap-3">
            {[
              // numeral color tracks circle lightness (Figma fidelity + AA
              // contrast): dark circles take white, the light gold takes spruce.
              { n: 1, label: "Budget", circle: "bg-clay", numText: "text-white" },
              { n: 2, label: "Cart", circle: "bg-gold", numText: "text-spruce" },
              {
                n: 3,
                label: "Instacart",
                circle: "bg-spruce",
                numText: "text-white",
              },
            ].map((step) => (
              <div
                key={step.n}
                className="bg-surface-neutral flex flex-1 flex-col items-center gap-2 rounded-xl px-2 py-4"
              >
                <span
                  className={`${step.circle} ${step.numText} flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold`}
                >
                  {step.n}
                </span>
                <span className="text-content-secondary text-xs">
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Microcopy */}
          <span className="text-content-tertiary text-xs">About 5 minutes</span>

          {/* Primary action */}
          <div className="flex w-full flex-col items-center gap-3">
            {session ? (
              <>
                <Link
                  href="/onboarding"
                  className="bg-sprout text-spruce w-full rounded-full py-3 text-center font-semibold transition-opacity hover:opacity-90"
                >
                  Get started
                </Link>
                <Link
                  href="/plans"
                  className="text-spruce text-sm font-semibold underline-offset-4 hover:underline"
                >
                  Your plans
                </Link>
                <AuthShowcase />
              </>
            ) : (
              <AuthShowcase />
            )}
          </div>
        </div>
      </main>
    </HydrateClient>
  );
}
