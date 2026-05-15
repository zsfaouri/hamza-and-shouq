import { json, metaStatus } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({
    provider: "meta",
    personal: {
      state: "disabled",
      qr: null,
      error: "Personal QR mode requires a persistent Node backend. Vercel serverless cannot keep a WhatsApp Web browser session alive.",
    },
    meta: metaStatus(),
  });
}
