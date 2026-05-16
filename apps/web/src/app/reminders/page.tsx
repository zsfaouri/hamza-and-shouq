import { redirect } from "next/navigation";
import { RemindersPage } from "@/components/reminders/RemindersPage";
import { userFromCookies } from "@/lib/auth";
import { hydrateStore } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export default async function RemindersRoute() {
  const data = await hydrateStore();
  const user = await userFromCookies(data.accessUsers);
  if (!user) redirect("/login?next=/reminders");
  if (!user.permissions.canViewReminders && !user.permissions.canManageReminders) redirect("/");
  return <RemindersPage initialUser={user} />;
}
