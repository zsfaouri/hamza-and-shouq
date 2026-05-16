import { normalizePhone } from "./sheets";
import type { WhatsAppSettings } from "./types";

export function whatsappConfigured(settings: WhatsAppSettings) {
  return Boolean(settings.phoneNumberId && settings.accessToken);
}

export async function sendWhatsAppText(settings: WhatsAppSettings, to: string, body: string, mediaUrl?: string) {
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
