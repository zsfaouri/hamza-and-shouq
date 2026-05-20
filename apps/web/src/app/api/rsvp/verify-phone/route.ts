import { ensureInvitationMessage, repairLegacyInvitations, stampRecipientSnapshot } from "@/lib/domain";
import { findLegacyRecipientByPhone, legacyRecipientContact } from "@/lib/legacy-recipients";
import { loadState, saveStateStrict } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = await request.json().catch(() => ({})) as { token?: string; phone?: string };
    const token = String(input.token || "").trim();
    const phone = String(input.phone || "").trim();
    if (!token) return Response.json({ error: "Missing token." }, { status: 400 });
    if (!phone) return Response.json({ error: "Phone number is required." }, { status: 400 });

    const recipient = findLegacyRecipientByPhone(phone);
    if (!recipient) return Response.json({ error: "Phone number not found." }, { status: 404 });

    const state = await loadState({ fresh: true });
    repairLegacyInvitations(state);
    const message = ensureInvitationMessage(state, token);
    if (!message) return Response.json({ error: "Invalid token." }, { status: 404 });

    const contact = legacyRecipientContact(recipient, token);
    const existingContact = state.campaign.contacts.find((item) => item.id === contact.id);
    if (existingContact) {
      existingContact.name = contact.name;
      existingContact.phone = contact.phone;
      existingContact.sourceTab = contact.sourceTab;
      existingContact.fields = { ...(existingContact.fields || {}), ...contact.fields };
    } else {
      state.campaign.contacts.push(contact);
    }

    message.contactId = contact.id;
    stampRecipientSnapshot(state, message, contact);
    await saveStateStrict(state);

    return Response.json({
      ok: true,
      name: message.recipientName,
      phone: message.recipientPhone,
      token: message.token,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Phone verification failed." }, { status: 500 });
  }
}
