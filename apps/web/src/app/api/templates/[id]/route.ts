import { json, store } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const data = store();
  const index = data.templates.findIndex((template) => template.id === id);
  if (index === -1) return json({ error: "Template not found" }, { status: 404 });
  const body = await request.json();
  data.templates[index] = {
    ...data.templates[index],
    name: String(body.name ?? data.templates[index].name),
    bodyEn: String(body.bodyEn ?? data.templates[index].bodyEn),
    bodyAr: body.bodyAr ? String(body.bodyAr) : null,
    mediaUrl: body.mediaUrl ? String(body.mediaUrl) : null,
    mediaType: body.mediaType ? String(body.mediaType) : null,
  };
  return json(data.templates[index]);
}
