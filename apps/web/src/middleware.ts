import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t");
  if (t) {
    const url = request.nextUrl.clone();
    url.pathname = `/rsvp/${encodeURIComponent(t)}`;
    url.searchParams.delete("t");
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
