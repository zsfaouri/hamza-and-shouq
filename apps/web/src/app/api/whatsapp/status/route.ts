import { hydrateStore, json, metaStatus, personalStatus, settings } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  await hydrateStore();
  const current = settings();
  return json({
    provider: current.provider,
    personal: await personalStatus(),
    meta: metaStatus(),
  });
}
