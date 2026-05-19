import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t");
  if (t) {
    return NextResponse.rewrite(new URL(`/r/${encodeURIComponent(t)}`, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
