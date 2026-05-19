import { activeTemplate } from "@/lib/domain";
import { loadState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await loadState();
  const template = activeTemplate(state);
  if (!template.mediaData || !template.mediaMimeType) {
    return new Response("No media", { status: 404 });
  }
  const buffer = Buffer.from(template.mediaData, "base64");
  return new Response(buffer, {
    headers: {
      "Content-Type": template.mediaMimeType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
