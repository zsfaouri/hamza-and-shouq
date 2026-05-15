import { hydrateStore, json, persistStore, readGoogleSheetPreview } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = (await hydrateStore()).campaigns.find((item) => item.id === id);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });
  const input = await request.json();
  const preview = await readGoogleSheetPreview(input);
  const contacts = preview.contacts;
  campaign.contacts = contacts;
  campaign.messages = [];
  campaign.status = contacts.length ? "READY" : "DRAFT";
  campaign.totalCount = contacts.length;
  await persistStore();
  return json({
    imported: contacts.length,
    totalCount: contacts.length,
    headers: preview.headers,
    contacts: contacts.map((contact) => ({ id: contact.id, name: contact.name, phone: contact.phone })),
    message: contacts.length
      ? `Read ${contacts.length} contact${contacts.length === 1 ? "" : "s"} from Google Sheets.`
      : `Google Sheet is reachable. Headers read: ${preview.headers.join(", ") || "none"}. No contact rows found.`,
  });
}
