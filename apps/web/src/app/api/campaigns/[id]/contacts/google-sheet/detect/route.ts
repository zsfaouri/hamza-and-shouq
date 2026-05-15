import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import { detectGoogleSheetTabs, hydrateStore, json } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canImportContacts) return forbidden();
  const campaign = data.campaigns.find((item) => item.id === id);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });

  try {
    const input = await request.json() as { url?: string; sheetId?: string };
    const result = await detectGoogleSheetTabs(input);
    return json({
      ...result,
      tabs: user.role === "admin" ? result.tabs : result.tabs.filter((tab) => user.allowedTabs.includes(tab.name)),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Google Sheet tab detection failed" },
      { status: 400 },
    );
  }
}
