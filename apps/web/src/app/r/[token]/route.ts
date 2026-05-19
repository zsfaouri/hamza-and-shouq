import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const url = new URL(request.url);
  // Redirect to canonical ?t= URL so middleware handles the rewrite to /rsvp/[token]
  return NextResponse.redirect(new URL(`/?t=${encodeURIComponent(token)}`, url.origin), 307);
}
