import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const cookieName = "hs_session";

function base64Url(input: ArrayBuffer) {
  const bytes = new Uint8Array(input);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.AUTH_SECRET || "hamza-shouq-local-access-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

type SessionPayload = { userId?: string; exp?: number };

async function sessionPayload(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(cookieName)?.value ?? "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature || signature !== await sign(payload)) return null;
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(normalized)) as SessionPayload;
    if (!parsed.userId || !parsed.exp || parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function canReachReminders(userId: string) {
  return userId === "user-admin" || userId === "user-zein" || userId === "user-hamza";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const budgetPath = pathname.startsWith("/budget") || pathname.startsWith("/api/budget");
  const reminderPath = pathname.startsWith("/reminders") || pathname.startsWith("/api/reminders");
  if (!budgetPath && !reminderPath) return NextResponse.next();

  const session = await sessionPayload(request);
  if (!session) {
    if (pathname.startsWith("/budget") || pathname.startsWith("/reminders")) return NextResponse.redirect(new URL("/", request.url));
    return new NextResponse(null, { status: 403 });
  }

  if (reminderPath && !canReachReminders(session.userId!)) {
    if (pathname.startsWith("/reminders")) return NextResponse.redirect(new URL("/", request.url));
    return new NextResponse(null, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/budget/:path*", "/api/budget/:path*", "/reminders/:path*", "/api/reminders/:path*"],
};
