import { unauthorized, userFromRequest } from "@/lib/auth";
import { hydrateStore, json } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  return json({ user });
}
