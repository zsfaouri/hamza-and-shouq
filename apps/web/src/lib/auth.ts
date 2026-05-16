import crypto from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "hs_session";
const sessionHours = 12;

function secret() {
  return process.env.AUTH_SECRET || "replace-this-auth-secret";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function appCredentials() {
  return {
    username: process.env.APP_USERNAME || "admin",
    password: process.env.APP_PASSWORD || "admin123",
  };
}

export function createSessionToken() {
  const payload = encode({ exp: Date.now() + sessionHours * 60 * 60 * 1000 });
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export async function isAuthenticated() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value || "";
  return verifySessionToken(token);
}

export function sessionCookie(token: string, secure: boolean) {
  const maxAge = sessionHours * 60 * 60;
  return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function tokenFromRequest(request: Request) {
  const header = request.headers.get("cookie") || "";
  const part = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`));
  return part ? decodeURIComponent(part.slice(cookieName.length + 1)) : "";
}

export function requireAuth(request: Request) {
  if (!verifySessionToken(tokenFromRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
