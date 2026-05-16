import { setRsvp } from "@/lib/domain";
import { loadState, saveState } from "@/lib/store";
import type { RsvpResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseReply(value: string): RsvpResponse | "" {
  const text = value.toLowerCase().trim();
  if (["yes", "y", "attending", "confirm", "confirmed", "1"].includes(text)) return "YES";
  if (["no", "n", "not attending", "decline", "declined", "0"].includes(text)) return "NO";
  return "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = await loadState();
  if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === state.whatsapp.verifyToken) {
    return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as {
    entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ from?: string; text?: { body?: string }; button?: { text?: string; payload?: string }; interactive?: { button_reply?: { title?: string; id?: string } } }> } }> }>;
  };
  const state = await loadState();
  let changed = false;
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      for (const inbound of change.value?.messages || []) {
        const from = inbound.from || "";
        const text = inbound.text?.body || inbound.button?.payload || inbound.button?.text || inbound.interactive?.button_reply?.id || inbound.interactive?.button_reply?.title || "";
        const response = parseReply(text);
        if (!response) continue;
        const contact = state.campaign.contacts.find((item) => item.phone.endsWith(from.slice(-9)) || from.endsWith(item.phone.slice(-9)));
        const message = contact ? state.campaign.messages.find((item) => item.contactId === contact.id) : null;
        if (message && setRsvp(state, message.token, response)) changed = true;
      }
    }
  }
  if (changed) await saveState(state);
  return Response.json({ ok: true });
}
