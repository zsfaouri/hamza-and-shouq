import { json, sendMetaMessage, store } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const campaign = store().campaigns.find((item) => item.id === id);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });
  campaign.status = "SENDING";
  for (const message of campaign.messages.filter((item) => item.status === "PENDING")) {
    try {
      await sendMetaMessage(message.contact.phone, message.body, campaign.template?.mediaUrl);
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
  return json({ queued: campaign.messages.length, sent: campaign.sentCount, failed: campaign.failedCount });
}
