import { setRsvp } from "@/lib/domain";
import { loadState, saveStateStrict } from "@/lib/store";
import type { RsvpResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseResponse(value: string | null): RsvpResponse | "" {
  const text = String(value || "").toUpperCase();
  return text === "YES" || text === "NO" ? text : "";
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const response = parseResponse(new URL(request.url).searchParams.get("response"));
  const state = await loadState();
  const message = state.campaign.messages.find((item) => item.token === token);
  if (!message) return new Response("<h1>RSVP not found</h1>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (response) {
    setRsvp(state, token, response);
    await saveStateStrict(state);
  }
  const contact = state.campaign.contacts.find((item) => item.id === message.contactId);
  const status = response || message.rsvp || "Pending";
  return new Response(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>RSVP</title>
<style>body{font-family:Arial,sans-serif;background:#f6f7f9;color:#111827;margin:0;display:grid;min-height:100vh;place-items:center}.card{background:#fff;border:1px solid #d9dee7;border-radius:8px;padding:28px;width:min(460px,calc(100% - 32px));box-shadow:0 8px 30px rgba(15,23,42,.06)}a{display:inline-block;margin:6px 6px 0 0;padding:10px 13px;border-radius:8px;text-decoration:none;color:#fff;background:#128c4a}.no{background:#b42318}</style>
</head><body><main class="card"><h1>RSVP recorded</h1><p>${contact?.name || "Guest"}: ${status}</p><a href="?response=YES">Attending</a><a class="no" href="?response=NO">Not attending</a></main></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
