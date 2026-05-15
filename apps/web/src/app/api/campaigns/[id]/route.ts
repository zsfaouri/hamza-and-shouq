import {
  ensureStarterCampaignContactsFromGoogleSheet,
  hydrateStore,
  json,
  persistStore,
  prepareCampaignMessages,
} from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = (await hydrateStore()).campaigns.find((item) => item.id === id);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });
  let changed = await ensureStarterCampaignContactsFromGoogleSheet(campaign);
  if (campaign.contacts.length && !campaign.messages.length) {
    prepareCampaignMessages(campaign);
    changed = true;
  }
  if (changed) await persistStore();
  return json(campaign);
}
