import { detectGoogleSheetTabs, hydrateStore, json } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = (await hydrateStore()).campaigns.find((item) => item.id === id);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });

  try {
    const input = await request.json() as { url?: string; sheetId?: string };
    return json(await detectGoogleSheetTabs(input));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Google Sheet tab detection failed" },
      { status: 400 },
    );
  }
}
