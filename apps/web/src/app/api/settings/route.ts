import { requireAuth } from "@/lib/auth";
import { loadState, saveState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  const input = await request.json().catch(() => ({})) as Record<string, string>;
  const state = await loadState();
  state.whatsapp = {
    ...state.whatsapp,
    graphVersion: String(input.graphVersion || state.whatsapp.graphVersion).trim() || "v23.0",
    phoneNumberId: String(input.phoneNumberId || state.whatsapp.phoneNumberId).trim(),
    accessToken: String(input.accessToken || "").trim() || state.whatsapp.accessToken,
    verifyToken: String(input.verifyToken || state.whatsapp.verifyToken).trim() || "hamza-shouq-webhook",
    senderPhone: String(input.senderPhone || state.whatsapp.senderPhone).trim(),
  };
  await saveState(state);
  return Response.json({ ok: true });
}
