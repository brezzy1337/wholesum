import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { cn } from "@acme/ui";
import { ThemeProvider, ThemeToggle } from "@acme/ui/theme";
import { Toaster } from "@acme/ui/toast";

import { AnalyticsProvider } from "~/app/_components/posthog-provider";
import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";

import "~/app/styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL ?? "http://localhost:3000"),
  title: "Wholesum — Eat well, spend smart",
  description:
    "Turn your grocery budget and dietary needs into a healthy, budget-fit Instacart cart.",
  openGraph: {
    title: "Wholesum — Eat well, spend smart",
    description:
      "Turn your grocery budget and dietary needs into a healthy, budget-fit Instacart cart.",
    siteName: "Wholesum",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf5ec" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

// The shared Tailwind theme maps `--font-sans` → `--font-geist-sans`, so we bind
// Inter to that variable to render the whole app in Inter via the `font-sans` utility.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
          inter.variable,
        )}
      >
        <AnalyticsProvider>
          <ThemeProvider>
            <TRPCReactProvider>{props.children}</TRPCReactProvider>
            <div className="absolute right-4 bottom-4">
              <ThemeToggle />
            </div>
            <Toaster />
          </ThemeProvider>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
