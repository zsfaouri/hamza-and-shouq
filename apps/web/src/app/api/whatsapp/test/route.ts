import { forbidden, unauthorized, userFromRequest } from "@/lib/auth";
import { assertPersonalReady, hydrateStore, json, sendMetaMessage, sendPersonalMessage, settings } from "@/lib/vercel-api-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const data = await hydrateStore();
  const user = userFromRequest(request, data.accessUsers);
  if (!user) return unauthorized();
  if (!user.permissions.canManageWhatsApp) return forbidden();

  const body = await request.json().catch(() => ({})) as { phone?: unknown; message?: unknown };
  const phone = String(body.phone ?? "").replace(/[^\d]/g, "");
  const message = String(body.message ?? "Hamza & Shouq WhatsApp API test.").trim();

  if (!phone) return json({ error: "Phone number is required" }, { status: 400 });
  if (!message) return json({ error: "Message is required" }, { status: 400 });

  try {
    const provider = settings().provider;
    if (provider === "personal") await assertPersonalReady();
    const id = provider === "personal"
      ? await sendPersonalMessage(phone, message)
      : await sendMetaMessage(phone, message);

    return json({ ok: true, provider, id });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp test send failed",
    }, { status: 409 });
  }
}
