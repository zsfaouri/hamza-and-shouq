import { userCanImportTabs } from "@/lib/access-control";
import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import { hydrateStore, json, persistStore, readGoogleSheetPreview } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canImportContacts) return forbidden();
  const campaign = data.campaigns.find((item) => item.id === id);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });
  const input = await request.json() as { url?: string; sheetId?: string; gid?: string; selectedTabs?: string[] };
  const selectedTabs = Array.isArray(input.selectedTabs)
    ? input.selectedTabs.map((tab) => tab.trim()).filter(Boolean)
    : undefined;
  if (selectedTabs && !userCanImportTabs(user, selectedTabs)) return forbidden();
  const preview = await readGoogleSheetPreview({ ...input, selectedTabs });
  if (!selectedTabs && user.role !== "admin") {
    const previewTabs = preview.worksheets.map((worksheet) => worksheet.title);
    if (!userCanImportTabs(user, previewTabs)) return forbidden();
  }
  const importBatchId = crypto.randomUUID();
  const importedAt = new Date().toISOString();
  const contacts = preview.contacts.map((contact) => ({
    ...contact,
    importBatchId,
    importedAt,
  }));
  campaign.contacts = contacts;
  campaign.messages = [];
  campaign.status = contacts.length ? "READY" : "DRAFT";
  campaign.totalCount = contacts.length;
  await persistStore();
  const tabs = preview.worksheets.map((worksheet) => ({
    name: worksheet.title,
    gid: worksheet.gid,
    imported: worksheet.contactCount,
    rowCount: worksheet.rowCount,
    contactCount: worksheet.contactCount,
    preview: worksheet.preview,
  }));
  return json({
    imported: contacts.length,
    totalCount: contacts.length,
    importBatchId,
    tabs,
    headers: preview.headers,
    worksheets: preview.worksheets,
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      sourceTab: contact.sourceTab ?? null,
    })),
    message: contacts.length
      ? `Read ${contacts.length} contact${contacts.length === 1 ? "" : "s"} from ${preview.worksheets.length} worksheet${preview.worksheets.length === 1 ? "" : "s"}.`
      : `Google Sheet is reachable. Read ${preview.worksheets.length} worksheet${preview.worksheets.length === 1 ? "" : "s"}, but found no rows with both name and number.`,
  });
}
