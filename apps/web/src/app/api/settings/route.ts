import { requireAuth } from "@/lib/auth";
import { loadState, saveStateStrict } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  try {
    const input = await request.json().catch(() => ({})) as Record<string, string>;
    const state = await loadState();
    const value = (key: string, fallback = "") => Object.prototype.hasOwnProperty.call(input, key) ? String(input[key] || "").trim() : fallback;
    state.whatsapp = {
      ...state.whatsapp,
      provider: input.provider === "personal" ? "personal" : "meta",
      graphVersion: value("graphVersion", state.whatsapp.graphVersion) || "v23.0",
      phoneNumberId: value("phoneNumberId", state.whatsapp.phoneNumberId),
      accessToken: value("accessToken") || state.whatsapp.accessToken,
      verifyToken: value("verifyToken", state.whatsapp.verifyToken) || "hamza-shouq-webhook",
      senderPhone: value("senderPhone", state.whatsapp.senderPhone),
      personalBridgeUrl: value("personalBridgeUrl", state.whatsapp.personalBridgeUrl),
      personalBridgeToken: value("personalBridgeToken") || state.whatsapp.personalBridgeToken,
    };
    await saveStateStrict(state);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Settings save failed." }, { status: 500 });
  }
}
