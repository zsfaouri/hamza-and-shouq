import { applyInboundRsvp } from "@/lib/rsvp-inbound";
import { loadState, saveState } from "@/lib/store";
import type { AppState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function activeToken(state: AppState) {
  return [process.env.PERSONAL_WHATSAPP_TOKEN, process.env.BRIDGE_TOKEN, state.whatsapp.personalBridgeToken]
    .map((value) => String(value || "").trim())
    .find((value) => value && value !== "SET") || "";
}

function authorized(request: Request, state: AppState) {
  const token = activeToken(state);
  if (!token) return !process.env.VERCEL;
  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${token}` || request.headers.get("x-bridge-token") === token;
}

export async function POST(request: Request) {
  const state = await loadState();
  if (!authorized(request, state)) return Response.json({ error: "Unauthorized inbound RSVP." }, { status: 401 });

  const input = await request.json().catch(() => ({})) as { phone?: string; text?: string };
  const result = applyInboundRsvp(state, String(input.phone || ""), String(input.text || ""));
  if (result.updated) await saveState(state);
  return Response.json({ ok: true, ...result });
}
