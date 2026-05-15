import { createSessionToken, sessionCookie } from "@/lib/auth";
import { json, hydrateStore } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json() as { username?: string; password?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const data = await hydrateStore();
  const user = data.accessUsers.find((item) => item.active && item.username.toLowerCase() === username && item.password === password);
  if (!user) return json({ error: "Invalid username or password" }, { status: 401 });

  const secure = new URL(request.url).protocol === "https:";
  return json(
    { ok: true, user: { id: user.id, name: user.name, username: user.username, role: user.role, allowedTabs: user.allowedTabs } },
    { headers: { "Set-Cookie": sessionCookie(createSessionToken(user.id), secure) } },
  );
}
