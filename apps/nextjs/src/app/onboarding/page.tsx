import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return <OnboardingWizard />;
}
