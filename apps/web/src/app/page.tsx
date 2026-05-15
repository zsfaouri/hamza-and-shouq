import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { userFromCookies } from "@/lib/auth";
import { hydrateStore } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await hydrateStore();
  const user = await userFromCookies(data.accessUsers);
  if (!user) redirect("/login");
  return <Dashboard initialUser={user} />;
}
