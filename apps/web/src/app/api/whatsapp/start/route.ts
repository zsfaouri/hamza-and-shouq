import { hydrateStore, json, metaStatus, personalStatus, settings, startPersonalSession } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  await hydrateStore();
  const current = settings();
  return json({
    provider: current.provider,
    personal: current.provider === "personal" ? await startPersonalSession() : await personalStatus(),
    meta: metaStatus(),
  });
}
