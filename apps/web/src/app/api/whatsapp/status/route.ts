import { requireAuth } from "@/lib/auth";
import { loadState } from "@/lib/store";
import { whatsappStatus } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  const state = await loadState();
  try {
    return Response.json(await whatsappStatus(state.whatsapp));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "WhatsApp status failed." }, { status: 400 });
  }
}
