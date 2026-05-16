import { filterMessagesForUser, userCanReadSourceTab } from "@/lib/access-control";
import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import {
  assertPersonalReady,
  ensureStarterCampaignContactsFromGoogleSheet,
  hydrateStore,
  json,
  persistStore,
  prepareCampaignMessages,
  sendMetaMessage,
  sendPersonalMessage,
  settings,
  templateMediaUrl,
} from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const data = await hydrateStore();
  const user = userFromRequest(_request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canSendMessages) return forbidden();
  const campaign = data.campaigns.find((item) => item.id === id);
  if (!campaign) return json({ error: "Campaign not found" }, { status: 404 });
  const provider = settings().provider;
  if (provider === "personal") {
    try {
      await assertPersonalReady();
    } catch (error) {
      const visible = filterMessagesForUser(campaign.messages, user);
      return json({
        queued: visible.filter((message) => message.status === "PENDING").length,
        sent: visible.filter((message) => message.status === "SENT").length,
        failed: visible.filter((message) => message.status === "FAILED").length,
        error: error instanceof Error ? error.message : "WhatsApp is not ready",
      }, { status: 409 });
    }
  }
  await ensureStarterCampaignContactsFromGoogleSheet(campaign);
  if (!campaign.messages.length) prepareCampaignMessages(campaign, (contact) => userCanReadSourceTab(user, contact.sourceTab));
  const pending = filterMessagesForUser(campaign.messages, user).filter((item) => item.status === "PENDING");
  campaign.status = "SENDING";
  for (const message of pending) {
    try {
      if (provider === "personal") {
        await sendPersonalMessage(message.contact.phone, message.body);
      } else {
        await sendMetaMessage(message.contact.phone, message.body, templateMediaUrl(campaign.template));
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
  const visible = filterMessagesForUser(campaign.messages, user);
  return json({
    queued: pending.length,
    sent: visible.filter((message) => message.status === "SENT").length,
    failed: visible.filter((message) => message.status === "FAILED").length,
  });
}
