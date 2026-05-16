import { requireAuth } from "@/lib/auth";
import { readGoogleSheetPreview } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  try {
    const input = await request.json().catch(() => ({})) as { url?: string };
    const preview = await readGoogleSheetPreview({ url: String(input.url || "") });
    return Response.json({ sheetId: preview.sheetId, tabs: preview.tabs, headers: preview.headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google Sheet detection failed." }, { status: 400 });
  }
}
