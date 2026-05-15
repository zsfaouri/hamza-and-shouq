import { json, saveSettings, settings } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(settings());
}

export async function PUT(request: Request) {
  return json(saveSettings(await request.json()));
}
