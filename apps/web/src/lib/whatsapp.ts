import { normalizePhone } from "./sheets";
import { personalStatus, sendPersonal } from "./personal-whatsapp";
import type { WhatsAppSettings, WhatsAppStatus } from "./types";

export function whatsappConfigured(settings: WhatsAppSettings) {
  if (settings.provider === "personal") return Boolean(settings.personalBridgeUrl.trim()) || !process.env.VERCEL;
  return Boolean(settings.phoneNumberId && settings.accessToken);
}

export async function whatsappStatus(settings: WhatsAppSettings): Promise<WhatsAppStatus> {
  if (settings.provider === "personal") return personalStatus(settings);
  return {
    provider: "meta",
    configured: whatsappConfigured(settings),
    state: whatsappConfigured(settings) ? "configured" : "missing-config",
    qr: "",
    qrDataUrl: "",
    accountPhone: settings.senderPhone,
    displayName: "Meta WhatsApp Cloud API",
    error: whatsappConfigured(settings) ? "" : "Meta phone number ID and access token are required.",
    mode: "cloud",
  };
}

export async function sendWhatsAppText(settings: WhatsAppSettings, to: string, body: string, mediaUrl?: string) {
  if (settings.provider === "personal") return sendPersonal(settings, normalizePhone(to), body, mediaUrl);
  if (!whatsappConfigured(settings)) throw new Error("WhatsApp Cloud API is not configured.");
  const payload = mediaUrl
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "image",
        image: { link: mediaUrl, caption: body },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "text",
        text: { preview_url: true, body },
      };

  const response = await fetch(`https://graph.facebook.com/${settings.graphVersion}/${settings.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({})) as { messages?: Array<{ id: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `WhatsApp send failed: ${response.status}`);
  return data.messages?.[0]?.id || "";
}
