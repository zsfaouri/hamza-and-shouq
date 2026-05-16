import { requireAuth } from "@/lib/auth";
import { nowIso } from "@/lib/domain";
import { loadState, saveState } from "@/lib/store";
import { sendWhatsAppText, whatsappConfigured } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  const input = await request.json().catch(() => ({})) as { messageIds?: string[]; confirmText?: string };
  const messageIds = Array.isArray(input.messageIds) ? input.messageIds.map(String) : [];
  if (input.confirmText !== "SEND SELECTED") return Response.json({ error: "Type SEND SELECTED before sending." }, { status: 400 });
  if (!messageIds.length) return Response.json({ error: "Select at least one message." }, { status: 400 });

  const state = await loadState();
  if (!whatsappConfigured(state.whatsapp)) {
    return Response.json({ error: "WhatsApp is not configured for the selected provider." }, { status: 400 });
  }
  let sent = 0;
  let failed = 0;
  for (const id of messageIds) {
    const message = state.campaign.messages.find((item) => item.id === id);
    if (!message || message.status === "SENT") continue;
    const contact = state.campaign.contacts.find((item) => item.id === message.contactId);
    if (!contact) continue;
    try {
      message.providerMessageId = await sendWhatsAppText(state.whatsapp, contact.phone, message.body, state.template.mediaUrl);
      message.status = "SENT";
      message.error = "";
      message.sentAt = nowIso();
      sent += 1;
    } catch (error) {
      message.status = "FAILED";
      message.error = error instanceof Error ? error.message : "Send failed.";
      failed += 1;
    }
  }
  await saveState(state);
  return Response.json({ sent, failed });
}
