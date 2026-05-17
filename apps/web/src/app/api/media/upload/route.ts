import { requireAuth } from "@/lib/auth";
import { activeTemplate, imageDataUrl, nowIso, rebuildMessages, siteUrl, upsertTemplate } from "@/lib/domain";
import { loadState, saveStateStrict } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxImageBytes = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
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
    const current = activeTemplate(state);
    const updatedAt = nowIso();
    const mediaData = buffer.toString("base64");
    const mediaUrl = `${siteUrl()}/api/media/template?id=${encodeURIComponent(current.id)}&v=${encodeURIComponent(updatedAt)}`;
    const template = upsertTemplate(state, {
      ...current,
      mediaUrl,
      mediaName: file.name || "template-image",
      mediaMimeType: file.type,
      mediaData,
      updatedAt,
    }, true);
    rebuildMessages(state.campaign, template);
    const persisted = await saveStateStrict(state);
    const previewUrl = imageDataUrl(file.type, mediaData);

    return Response.json({
      ok: true,
      mediaUrl: persisted ? mediaUrl : previewUrl,
      previewUrl,
      persisted,
      templateId: template.id,
      mediaName: template.mediaName,
      mediaMimeType: template.mediaMimeType,
      bytes: buffer.length,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Image upload failed." }, { status: 500 });
  }
}
