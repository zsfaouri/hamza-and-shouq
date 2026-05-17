import { requireAuth } from "@/lib/auth";
import { rebuildMessages } from "@/lib/domain";
import { readGoogleSheetPreview } from "@/lib/sheets";
import { loadState, saveStateStrict } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  const input = await request.json().catch(() => ({})) as { url?: string; selectedTabs?: string[] };
  const selectedTabs = Array.isArray(input.selectedTabs) ? input.selectedTabs.map(String).map((tab) => tab.trim()).filter(Boolean) : [];
  if (!selectedTabs.length) return Response.json({ error: "Check at least one detected tab before importing." }, { status: 400 });

  try {
    const preview = await readGoogleSheetPreview({ url: String(input.url || ""), selectedTabs });
    const found = new Set(preview.tabs.map((tab) => tab.name));
    const missing = selectedTabs.filter((tab) => !found.has(tab));
    if (missing.length) return Response.json({ error: `Selected tab not found: ${missing.join(", ")}` }, { status: 400 });
    if (!preview.contacts.length) return Response.json({ error: "Selected tabs were readable, but no contacts with both name and phone were found." }, { status: 400 });

    const state = await loadState();
    state.campaign.sheetUrl = String(input.url || "").trim();
    state.campaign.selectedTabs = selectedTabs;
    state.campaign.contacts = preview.contacts;
    rebuildMessages(state.campaign, state.template);
    await saveStateStrict(state);
    return Response.json({ imported: preview.contacts.length, tabs: preview.tabs });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google Sheet import failed." }, { status: 400 });
  }
}
