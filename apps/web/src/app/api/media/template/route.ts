import { loadState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await loadState();
  if (!state.template.mediaData || !state.template.mediaMimeType) {
    return new Response("Template media not found.", { status: 404 });
  }

  const bytes = Buffer.from(state.template.mediaData, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": state.template.mediaMimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
