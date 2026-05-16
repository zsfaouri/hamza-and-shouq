import { requireAuth } from "@/lib/auth";
import { activeTemplate, createTemplate, rebuildMessages, setActiveTemplate, upsertTemplate } from "@/lib/domain";
import { loadState, saveState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  const input = await request.json().catch(() => ({})) as {
    templateId?: string;
    body?: string;
    mediaUrl?: string;
    name?: string;
    createNew?: boolean;
    activateOnly?: boolean;
  };
  const state = await loadState();

  if (input.activateOnly) {
    if (!setActiveTemplate(state, String(input.templateId || ""))) {
      return Response.json({ error: "Template was not found." }, { status: 404 });
    }
    rebuildMessages(state.campaign, activeTemplate(state));
    await saveState(state);
    return Response.json({ ok: true, template: { ...activeTemplate(state), mediaData: "" }, messageCount: state.campaign.messages.length });
  }

  const body = String(input.body || "").trim();
  if (!body) return Response.json({ error: "Template body is required." }, { status: 400 });
  const current = input.createNew
    ? createTemplate(String(input.name || `Template ${state.templates.length + 1}`), body)
    : state.templates.find((item) => item.id === input.templateId) || activeTemplate(state);
  const nextMediaUrl = String(input.mediaUrl || "").trim();
  const keepUploadedMedia = Boolean(current.mediaData && nextMediaUrl && (nextMediaUrl === current.mediaUrl || nextMediaUrl.includes("/api/media/template")));
  const saved = upsertTemplate(state, {
    ...current,
    name: String(input.name || current.name || "Wedding invitation").trim(),
    body,
    mediaUrl: nextMediaUrl,
    mediaName: keepUploadedMedia ? current.mediaName : "",
    mediaMimeType: keepUploadedMedia ? current.mediaMimeType : "",
    mediaData: keepUploadedMedia ? current.mediaData : "",
    includeRsvpLinks: true,
    updatedAt: current.updatedAt,
  }, true);
  rebuildMessages(state.campaign, saved);
  await saveState(state);
  return Response.json({ ok: true, template: { ...saved, mediaData: "" }, messageCount: state.campaign.messages.length });
}
