import { unauthorized, userFromRequest } from "@/lib/auth";
import { hydrateStore, json, metaStatus, personalStatus, settings } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  const current = settings();
  return json({
    provider: current.provider,
    personal: await personalStatus(),
    meta: metaStatus(),
  });
}
