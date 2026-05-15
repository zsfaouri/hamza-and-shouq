import { hydrateStore, id, json, persistStore, store } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return json((await hydrateStore()).templates);
}

export async function POST(request: Request) {
  const body = await request.json();
  const template = {
    id: id("template"),
    name: String(body.name ?? "Untitled template"),
    bodyEn: String(body.bodyEn ?? ""),
    bodyAr: body.bodyAr ? String(body.bodyAr) : null,
    mediaUrl: body.mediaUrl ? String(body.mediaUrl) : null,
    mediaType: body.mediaType ? String(body.mediaType) : null,
  };
  store().templates.unshift(template);
  await persistStore();
  return json(template);
}
