function apiBase() {
  return (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100").replace(/\/$/, "");
}

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  const path = params.path?.join("/") ?? "";
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${apiBase()}/api/reminders${path ? `/${path}` : ""}`);
  targetUrl.search = sourceUrl.search;

  const headers = new Headers();
  const actor = request.headers.get("x-actor") || sourceUrl.searchParams.get("actor");
  if (actor) headers.set("x-actor", actor);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    cache: "no-store",
  });

  const body = await response.arrayBuffer();
  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const PUT = proxy;
export const POST = proxy;
export const DELETE = proxy;
