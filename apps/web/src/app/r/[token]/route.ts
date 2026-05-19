import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const url = new URL(request.url);
  return NextResponse.rewrite(new URL(`/rsvp/${encodeURIComponent(token)}`, url.origin));
}
