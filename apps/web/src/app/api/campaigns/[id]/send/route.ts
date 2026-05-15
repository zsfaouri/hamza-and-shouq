import { sendPersonalWhatsAppMessage } from "@/lib/personal-whatsapp";
import { hydrateStore, json, persistStore, sendMetaMessage, settings } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = (await hydrateStore()).campaigns.find((item) => item.id === id);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });
  const provider = settings().provider;
  campaign.status = "SENDING";
  for (const message of campaign.messages.filter((item) => item.status === "PENDING")) {
    try {
      if (provider === "personal") {
        await sendPersonalWhatsAppMessage(message.contact.phone, message.body);
      } else {
        await sendMetaMessage(message.contact.phone, message.body, campaign.template?.mediaUrl);
      }
      message.status = "SENT";
      message.error = null;
    } catch (error) {
      message.status = "FAILED";
      message.error = error instanceof Error ? error.message : "Send failed";
    }
  }
  campaign.sentCount = campaign.messages.filter((message) => message.status === "SENT").length;
  campaign.failedCount = campaign.messages.filter((message) => message.status === "FAILED").length;
  campaign.status = campaign.failedCount ? "FAILED" : "SENT";
  await persistStore();
  return json({ queued: campaign.messages.length, sent: campaign.sentCount, failed: campaign.failedCount });
}
