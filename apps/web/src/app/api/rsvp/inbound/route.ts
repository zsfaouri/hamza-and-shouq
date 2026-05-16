import { setRsvp } from "@/lib/domain";
import { loadState, saveState } from "@/lib/store";
import type { RsvpResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredToken() {
  return process.env.PERSONAL_WHATSAPP_TOKEN || process.env.BRIDGE_TOKEN || "";
}

function authorized(request: Request) {
  const token = configuredToken();
  if (!token) return true;
  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${token}` || request.headers.get("x-bridge-token") === token;
}

function parseReply(value: string): RsvpResponse | "" {
  const text = value.toLowerCase().trim();
  const yes = ["yes", "y", "attending", "confirm", "confirmed", "1", "نعم", "حاضر", "بحضر", "اكيد"];
  const no = ["no", "n", "not attending", "decline", "declined", "0", "لا", "معتذر", "لن احضر", "مش حاضر"];
  if (yes.includes(text)) return "YES";
  if (no.includes(text)) return "NO";
  return "";
}

function digits(value: string) {
  return value.replace(/[^\d]/g, "");
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized inbound RSVP." }, { status: 401 });
  const input = await request.json().catch(() => ({})) as { phone?: string; text?: string };
  const response = parseReply(String(input.text || ""));
  if (!response) return Response.json({ ok: true, updated: false, reason: "No RSVP intent detected." });

  const phone = digits(String(input.phone || ""));
  const state = await loadState();
  const contact = state.campaign.contacts.find((item) => {
    const contactPhone = digits(item.phone);
    return contactPhone.endsWith(phone.slice(-9)) || phone.endsWith(contactPhone.slice(-9));
  });
  if (!contact) return Response.json({ ok: true, updated: false, reason: "No matching contact." });

  const message = state.campaign.messages.find((item) => item.contactId === contact.id);
  if (!message) return Response.json({ ok: true, updated: false, reason: "No matching message." });

  setRsvp(state, message.token, response);
  await saveState(state);
  return Response.json({ ok: true, updated: true, response });
}
