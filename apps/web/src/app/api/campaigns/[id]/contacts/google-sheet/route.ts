import { hydrateStore, json, persistStore, readGoogleSheetContacts } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = (await hydrateStore()).campaigns.find((item) => item.id === id);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });
  const input = await request.json();
  const contacts = await readGoogleSheetContacts(input);
  campaign.contacts = contacts;
  campaign.messages = [];
  campaign.status = contacts.length ? "READY" : "DRAFT";
  campaign.totalCount = contacts.length;
  await persistStore();
  return json({ imported: contacts.length, totalCount: contacts.length });
}
