import { json, metaStatus } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function POST() {
  return json({
    provider: "meta",
    personal: {
      state: "disabled",
      qr: null,
      error: "Personal QR mode is not supported on Vercel. Use Meta WhatsApp API for the Vercel deployment.",
    },
    meta: metaStatus(),
  });
}
