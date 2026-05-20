import { requireAuth } from "@/lib/auth";
import { activeTemplate, nowIso } from "@/lib/domain";
import { loadState, saveStateStrict } from "@/lib/store";
import { sendWhatsAppText, whatsappConfigured, type MediaAttachment } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  try {
    const input = await request.json().catch(() => ({})) as { messageIds?: string[]; confirmText?: string };
    const messageIds = Array.isArray(input.messageIds) ? input.messageIds.map(String) : [];
    if (!messageIds.length) return Response.json({ error: "Select at least one message." }, { status: 400 });

    const state = await loadState();
    if (!whatsappConfigured(state.whatsapp)) {
      return Response.json({ error: "WhatsApp is not configured for the selected provider." }, { status: 400 });
    }

    // Build media attachment from the active template's stored data
    const template = activeTemplate(state);
    const media: MediaAttachment | undefined = template.mediaData
      ? {
          mediaUrl: template.mediaUrl,
          mediaData: template.mediaData,
          mediaMimeType: template.mediaMimeType,
          mediaName: template.mediaName,
        }
      : template.mediaUrl
        ? { mediaUrl: template.mediaUrl }
        : undefined;

    // Throttle delay for OpenWA/personal to avoid WhatsApp anti-spam (3s between messages)
    const throttleMs = state.whatsapp.provider === "meta" ? 200 : 3000;
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    let sent = 0;
    let failed = 0;
    let isFirst = true;
    for (const id of messageIds) {
      const message = state.campaign.messages.find((item) => item.id === id);
      if (!message || message.status === "SENT") continue;
      const contact = state.campaign.contacts.find((item) => item.id === message.contactId);
      if (!contact) continue;
      message.recipientName = contact.name;
      message.recipientPhone = contact.phone;

      // Throttle between messages (skip delay for the first one)
      if (!isFirst) await sleep(throttleMs);
      isFirst = false;

      try {
        message.providerMessageId = await sendWhatsAppText(state.whatsapp, contact.phone, message.body, media);
        message.status = "SENT";
        message.error = "";
        message.sentAt = nowIso();
        sent += 1;
      } catch (error) {
        message.status = "FAILED";
        message.error = error instanceof Error ? error.message : "Send failed.";
        failed += 1;
      }

      // Save progress every 10 messages so we don't lose state on timeout
      if ((sent + failed) % 10 === 0) {
        await saveStateStrict(state).catch(() => {});
      }
    }
    await saveStateStrict(state);
    return Response.json({ sent, failed });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Send failed." }, { status: 500 });
  }
}
