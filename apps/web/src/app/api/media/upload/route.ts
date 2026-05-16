import { requireAuth } from "@/lib/auth";
import { nowIso, rebuildMessages, siteUrl } from "@/lib/domain";
import { loadState, saveState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxImageBytes = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;

  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "Image file is required." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Only image uploads are supported." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > maxImageBytes) {
    return Response.json({ error: "Image must be 2 MB or smaller." }, { status: 400 });
  }

  const state = await loadState();
  const updatedAt = nowIso();
  const mediaUrl = `${siteUrl()}/api/media/template?v=${encodeURIComponent(updatedAt)}`;
  state.template = {
    ...state.template,
    mediaUrl,
    mediaName: file.name || "template-image",
    mediaMimeType: file.type,
    mediaData: buffer.toString("base64"),
    updatedAt,
  };
  rebuildMessages(state.campaign, state.template);
  await saveState(state);

  return Response.json({
    ok: true,
    mediaUrl,
    mediaName: state.template.mediaName,
    mediaMimeType: state.template.mediaMimeType,
    bytes: buffer.length,
  });
}
