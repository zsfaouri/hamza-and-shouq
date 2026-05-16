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
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canEditTemplates) return forbidden();
  const body = await request.json();
  const template = {
    id: id("template"),
    name: String(body.name ?? "Untitled template"),
    type: String(body.type ?? "wedding_invitation"),
    languageMode: String(body.languageMode ?? "english_only"),
    bodyEn: String(body.bodyEn ?? ""),
    bodyAr: body.bodyAr ? String(body.bodyAr) : null,
    mediaUrl: body.mediaUrl ? String(body.mediaUrl) : null,
    mediaType: body.mediaType ? String(body.mediaType) : null,
    guestNameMode: String(body.guestNameMode ?? "auto"),
    manualGuestName: body.manualGuestName ? String(body.manualGuestName) : null,
    attendeesCountMode: String(body.attendeesCountMode ?? "none"),
    manualAttendeesCount: body.manualAttendeesCount ? String(body.manualAttendeesCount) : null,
    includeRsvpLink: body.includeRsvpLink !== false,
    includeLocationLink: body.includeLocationLink === true,
    includeMedia: body.includeMedia === true,
    locationLink: body.locationLink ? String(body.locationLink) : null,
    hostNames: body.hostNames ? String(body.hostNames) : null,
    weddingDate: body.weddingDate ? String(body.weddingDate) : null,
    venue: body.venue ? String(body.venue) : null,
    variablesUsed: Array.isArray(body.variablesUsed) ? body.variablesUsed.map(String) : [],
    createdBy: user.username,
  };
  store().templates.unshift(template);
  await persistStore();
  return json(template);
}
