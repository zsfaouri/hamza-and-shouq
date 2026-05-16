import { activeTemplate } from "@/lib/domain";
import { loadState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const state = await loadState();
  const url = new URL(request.url);
  const templateId = url.searchParams.get("id") || "";
  const template = state.templates.find((item) => item.id === templateId) || activeTemplate(state);
  if (!template.mediaData || !template.mediaMimeType) {
    return new Response("Template media not found.", { status: 404 });
  }

  const bytes = Buffer.from(template.mediaData, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": template.mediaMimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
