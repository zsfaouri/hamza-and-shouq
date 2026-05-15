import { json, metaStatus, personalStatus, settings, startPersonalSession } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST() {
  const current = settings();
  return json({
    provider: current.provider,
    personal: current.provider === "personal" ? await startPersonalSession() : await personalStatus(),
    meta: metaStatus(),
  });
}
