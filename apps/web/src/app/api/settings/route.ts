import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import { hydrateStore, json, persistStore, saveSettings, settings } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  return json(settings());
}

export async function PUT(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canManageWhatsApp) return forbidden();
  const saved = saveSettings(await request.json());
  await persistStore();
  return json(saved);
}
