import { requireAuth } from "@/lib/auth";
import { pruneUnsavedGuestInvitations, repairLegacyInvitations } from "@/lib/domain";
import { loadState, publicState, saveStateStrict, storageDiagnostics } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  const rawState = await loadState({ fresh: true });
  const changed = repairLegacyInvitations(rawState) || pruneUnsavedGuestInvitations(rawState);
  if (changed) await saveStateStrict(rawState);
  const state = publicState(rawState);
  const storage = await storageDiagnostics();
  return Response.json({ ...state, _storage: { configured: storage.configured, healthy: storage.selectOk && storage.writeOk, error: storage.error } });
}
