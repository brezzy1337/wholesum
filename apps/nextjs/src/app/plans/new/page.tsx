import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { NewPlanFlow } from "./new-plan-flow";

export default async function NewPlanPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return <NewPlanFlow />;
}
