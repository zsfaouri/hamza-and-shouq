import { json, metaStatus, personalStatus, settings } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const current = settings();
  return json({
    provider: current.provider,
    personal: await personalStatus(),
    meta: metaStatus(),
  });
}
