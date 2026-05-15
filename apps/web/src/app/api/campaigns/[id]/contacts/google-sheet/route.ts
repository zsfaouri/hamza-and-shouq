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
    worksheets: preview.worksheets,
    contacts: contacts.map((contact) => ({ id: contact.id, name: contact.name, phone: contact.phone })),
    message: contacts.length
      ? `Read ${contacts.length} contact${contacts.length === 1 ? "" : "s"} from ${preview.worksheets.length} worksheet${preview.worksheets.length === 1 ? "" : "s"}.`
      : `Google Sheet is reachable. Read ${preview.worksheets.length} worksheet${preview.worksheets.length === 1 ? "" : "s"}, but found no rows with both name and number.`,
  });
}
