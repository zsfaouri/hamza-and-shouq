import {
  ensureStarterCampaignContactsFromGoogleSheet,
  hydrateStore,
  json,
  persistStore,
  prepareCampaignMessages,
} from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = (await hydrateStore()).campaigns.find((item) => item.id === id);
  if (!campaign?.template) return json({ error: "Campaign or template not found" }, { status: 404 });
  await ensureStarterCampaignContactsFromGoogleSheet(campaign);
  prepareCampaignMessages(campaign);
  await persistStore();
  return json({ prepared: campaign.messages.length });
}
