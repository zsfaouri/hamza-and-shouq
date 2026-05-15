import crypto from "node:crypto";
import { cookies } from "next/headers";
import { publicUser, type AccessUserRecord, type SessionUser } from "@/lib/access-control";

const cookieName = "hs_session";
const maxAgeSeconds = 60 * 60 * 12;

type SessionPayload = {
  userId: string;
  exp: number;
};

function secret() {
  return process.env.AUTH_SECRET || "hamza-shouq-local-access-secret";
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function parseCookie(header: string | null, name: string) {
  if (!header) return "";
  const found = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}

export function createSessionToken(userId: string) {
  const payload = base64Url(JSON.stringify({ userId, exp: Date.now() + maxAgeSeconds * 1000 } satisfies SessionPayload));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.userId || parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function userFromSessionToken(token: string, users: AccessUserRecord[]): SessionUser | null {
  const session = verifySessionToken(token);
  if (!session) return null;
  const user = users.find((item) => item.id === session.userId && item.active);
  return user ? publicUser(user) : null;
}

export function userFromRequest(request: Request, users: AccessUserRecord[]) {
  return userFromSessionToken(parseCookie(request.headers.get("cookie"), cookieName), users);
}

export async function userFromCookies(users: AccessUserRecord[]) {
  const cookieStore = await cookies();
  return userFromSessionToken(cookieStore.get(cookieName)?.value ?? "", users);
}

export function sessionCookie(token: string, secure: boolean) {
  return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
