import { clearSessionCookie } from "@/lib/auth";
import { json } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST() {
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
