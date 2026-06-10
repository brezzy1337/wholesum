import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { PlanDetail } from "./plan-detail";

export default async function PlanPage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const { id } = await props.params;
  return <PlanDetail planId={id} />;
}
