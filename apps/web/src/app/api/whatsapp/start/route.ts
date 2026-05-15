import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import { hydrateStore, json, metaStatus, personalStatus, settings, startPersonalSession } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canManageWhatsApp) return forbidden();
  const current = settings();
  return json({
    provider: current.provider,
    personal: current.provider === "personal" ? await startPersonalSession() : await personalStatus(),
    meta: metaStatus(),
  });
}
