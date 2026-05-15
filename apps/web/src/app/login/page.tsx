import { redirect } from "next/navigation";
import { LoginClient } from "@/app/login/login-client";
import { userFromCookies } from "@/lib/auth";
import { hydrateStore } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const data = await hydrateStore();
  const currentUser = await userFromCookies(data.accessUsers);
  const params = await searchParams;
  if (currentUser) redirect(params.next || "/");

  return <LoginClient nextPath={params.next || "/"} />;
}
