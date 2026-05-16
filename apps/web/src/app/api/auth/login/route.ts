import { appCredentials, createSessionToken, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  const credentials = appCredentials();
  if (String(body.username || "").trim() !== credentials.username || String(body.password || "") !== credentials.password) {
    return Response.json({ error: "Invalid username or password." }, { status: 401 });
  }
  const secure = new URL(request.url).protocol === "https:";
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(createSessionToken(), secure) } });
}
