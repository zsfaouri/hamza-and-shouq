import { requireAuth } from "@/lib/auth";
import { storageDiagnostics } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth) return auth;
  return Response.json(await storageDiagnostics());
}
