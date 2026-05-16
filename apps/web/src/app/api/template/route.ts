import { requireAuth } from "@/lib/auth";
import { nowIso, rebuildMessages } from "@/lib/domain";
import { loadState, saveState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  const input = await request.json().catch(() => ({})) as { body?: string; mediaUrl?: string; name?: string };
  const body = String(input.body || "").trim();
  if (!body) return Response.json({ error: "Template body is required." }, { status: 400 });
  const state = await loadState();
  const nextMediaUrl = String(input.mediaUrl || "").trim();
  const keepUploadedMedia = Boolean(state.template.mediaData && nextMediaUrl && (nextMediaUrl === state.template.mediaUrl || nextMediaUrl.includes("/api/media/template")));
  state.template = {
    ...state.template,
    name: String(input.name || state.template.name || "Wedding invitation").trim(),
    body,
    mediaUrl: nextMediaUrl,
    mediaName: keepUploadedMedia ? state.template.mediaName : "",
    mediaMimeType: keepUploadedMedia ? state.template.mediaMimeType : "",
    mediaData: keepUploadedMedia ? state.template.mediaData : "",
    includeRsvpLinks: true,
    updatedAt: nowIso(),
  };
  rebuildMessages(state.campaign, state.template);
  await saveState(state);
  return Response.json({ ok: true, messageCount: state.campaign.messages.length });
}
