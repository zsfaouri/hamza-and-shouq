import { redirect } from "next/navigation";
import { BudgetPageClient } from "@/components/budget/BudgetPage";
import { userFromCookies } from "@/lib/auth";
import { hydrateStore } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const data = await hydrateStore();
  const user = await userFromCookies(data.accessUsers);
  if (!user) redirect("/login?next=/budget");
  if (!user.permissions.canAccessBudgetTracker) redirect("/");
  return <BudgetPageClient initialUser={user} />;
}
