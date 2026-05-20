import { ensureInvitationMessage, setRsvp } from "@/lib/domain";
import { loadState, saveStateStrict } from "@/lib/store";
import type { RsvpResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = (await request.json().catch(() => ({}))) as {
      token?: string;
      response?: string;
    };
    const token = String(input.token || "").trim();
    const response = String(input.response || "").toUpperCase();
    if (!token) return Response.json({ error: "Missing token." }, { status: 400 });
    if (response !== "YES" && response !== "NO") {
      return Response.json({ error: "Response must be YES or NO." }, { status: 400 });
    }

    const state = await loadState({ fresh: true });
    const message = ensureInvitationMessage(state, token);
    if (!message) return Response.json({ error: "Invalid token." }, { status: 404 });

    setRsvp(state, token, response as RsvpResponse);
    await saveStateStrict(state);

    const contact = state.campaign.contacts.find((c) => c.id === message.contactId);
    return Response.json({
      ok: true,
      name: contact?.name || "",
      rsvp: message.rsvp,
      rsvpAt: message.rsvpAt,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "RSVP failed." },
      { status: 500 }
    );
  }
}
