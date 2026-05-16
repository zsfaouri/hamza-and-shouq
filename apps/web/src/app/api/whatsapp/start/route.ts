import { requireAuth } from "@/lib/auth";
import { startPersonal } from "@/lib/personal-whatsapp";
import { loadState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  const state = await loadState();
  if (state.whatsapp.provider !== "personal") {
    return Response.json({ error: "Switch provider to Personal WhatsApp before starting a QR session." }, { status: 400 });
  }
  try {
    return Response.json(await startPersonal(state.whatsapp));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "WhatsApp session failed to start." }, { status: 400 });
  }
}
