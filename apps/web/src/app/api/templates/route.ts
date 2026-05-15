import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import { hydrateStore, id, json, persistStore, store } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  return json(data.templates);
}

export async function POST(request: Request) {
  const body = await request.json();
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canEditTemplates) return forbidden();
  const template = {
    id: id("template"),
    name: String(body.name ?? "Untitled template"),
    bodyEn: String(body.bodyEn ?? ""),
    bodyAr: body.bodyAr ? String(body.bodyAr) : null,
    mediaUrl: body.mediaUrl ? String(body.mediaUrl) : null,
    mediaType: body.mediaType ? String(body.mediaType) : null,
  };
  store().templates.unshift(template);
  await persistStore();
  return json(template);
}
