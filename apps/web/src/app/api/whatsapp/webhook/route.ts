import { applyInboundRsvp } from "@/lib/rsvp-inbound";
import { loadState, saveStateStrict } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        const result = applyInboundRsvp(state, from, text);
        if (result.updated) changed = true;
      }
    }
  }
  if (changed) await saveStateStrict(state);
  return Response.json({ ok: true });
}
