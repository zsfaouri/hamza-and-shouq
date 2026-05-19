import { requireAuth } from "@/lib/auth";
import { loadState, publicState, storageDiagnostics } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  const state = publicState(await loadState({ fresh: true }));
  const storage = await storageDiagnostics();
  return Response.json({ ...state, _storage: { configured: storage.configured, healthy: storage.selectOk && storage.writeOk, error: storage.error } });
}
