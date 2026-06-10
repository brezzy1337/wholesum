import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { PlansList } from "./plans-list";

export default async function PlansPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return <PlansList />;
}
