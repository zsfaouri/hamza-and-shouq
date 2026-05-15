import { hydrateStore, json, persistStore, saveSettings, settings } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET() {
  await hydrateStore();
  return json(settings());
}

export async function PUT(request: Request) {
  await hydrateStore();
  const saved = saveSettings(await request.json());
  await persistStore();
  return json(saved);
}
