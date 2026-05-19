import { setRsvp } from "@/lib/domain";
import { loadState, saveStateStrict } from "@/lib/store";
import type { RsvpResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OpenWA sends incoming messages as POST webhooks
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      event?: string;
      // OpenWA message shape
      from?: string;
      body?: string;
      text?: string;
      sender?: { id?: string; pushname?: string };
      chatId?: string;
      content?: string;
      type?: string;
    };

    // Only process text messages
    if (body.type && body.type !== "chat") {
      return Response.json({ ok: true, skipped: "not a text message" });
    }

    const messageText = (body.body || body.text || body.content || "").trim().toLowerCase();
    const senderPhone = (body.from || body.chatId || body.sender?.id || "").replace(/@c\.us$/, "").replace(/[^\d]/g, "");

    if (!messageText || !senderPhone) {
      return Response.json({ ok: true, skipped: "no text or sender" });
    }

    // Parse RSVP response from message text
    let rsvpResponse: RsvpResponse | null = null;
    const yesKeywords = ["1", "حاضر", "yes", "attending", "نعم", "اي", "موافق", "ان شاء الله", "إن شاء الله"];
    const noKeywords = ["2", "معتذر", "no", "decline", "لا", "اعتذر", "مش قادر"];

    if (yesKeywords.some((kw) => messageText === kw || messageText.startsWith(kw + " "))) {
      rsvpResponse = "YES";
    } else if (noKeywords.some((kw) => messageText === kw || messageText.startsWith(kw + " "))) {
      rsvpResponse = "NO";
    }

    if (!rsvpResponse) {
      return Response.json({ ok: true, skipped: "not an RSVP response" });
    }

    // Find the message by matching the sender phone number to a contact
    const state = await loadState({ fresh: true });
    const contact = state.campaign.contacts.find((c) => {
      const contactPhone = c.phone.replace(/[^\d]/g, "");
      return contactPhone === senderPhone || senderPhone.endsWith(contactPhone) || contactPhone.endsWith(senderPhone);
    });

    if (!contact) {
      return Response.json({ ok: true, skipped: "sender not in guest list" });
    }

    const message = state.campaign.messages.find((m) => m.contactId === contact.id);
    if (!message) {
      return Response.json({ ok: true, skipped: "no message for contact" });
    }

    setRsvp(state, message.token, rsvpResponse);
    await saveStateStrict(state);

    return Response.json({
      ok: true,
      contact: contact.name,
      rsvp: rsvpResponse,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed." },
      { status: 500 },
    );
  }
}

// Health check
export async function GET() {
  return Response.json({ ok: true, webhook: "openwa" });
}
