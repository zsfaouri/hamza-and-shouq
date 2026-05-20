import { requireAuth } from "@/lib/auth";
import { stampRecipientSnapshot } from "@/lib/domain";
import { loadState, saveStateStrict } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const input = await request.json().catch(() => ({})) as { messageId?: string };
    const messageId = String(input.messageId || "");
    if (!messageId) return Response.json({ error: "Message is required." }, { status: 400 });

    const state = await loadState();
    const message = state.campaign.messages.find((item) => item.id === messageId);
    if (!message) return Response.json({ error: "Message not found." }, { status: 404 });

    const contact = state.campaign.contacts.find((item) => item.id === message.contactId);
    if (!contact) return Response.json({ error: "Recipient record not found." }, { status: 404 });

    stampRecipientSnapshot(state, message, contact);
    await saveStateStrict(state);

    const phone = contact.phone.replace(/[^\d]/g, "");
    if (!phone) return Response.json({ error: "Recipient phone is missing." }, { status: 400 });

    return Response.json({
      ok: true,
      messageId: message.id,
      recipientName: message.recipientName,
      recipientPhone: message.recipientPhone,
      recipientSnapshotAt: message.recipientSnapshotAt,
      waLink: `https://wa.me/${phone}?text=${encodeURIComponent(message.body)}`,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "WhatsApp link preparation failed." }, { status: 500 });
  }
}
