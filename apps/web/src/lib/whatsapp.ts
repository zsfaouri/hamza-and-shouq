import { normalizePhone } from "./sheets";
import { personalStatus, sendPersonal, type MediaAttachment } from "./personal-whatsapp";
import { openwaConfigured, openwaStatus, sendOpenwa } from "./openwa";
import type { WhatsAppSettings, WhatsAppStatus } from "./types";

export type { MediaAttachment } from "./personal-whatsapp";

export function whatsappConfigured(settings: WhatsAppSettings) {
  if (settings.provider === "openwa") return openwaConfigured(settings);
  if (settings.provider === "personal") return Boolean(settings.personalBridgeUrl.trim()) || !process.env.VERCEL;
  return Boolean(settings.phoneNumberId && settings.accessToken);
}

export async function whatsappStatus(settings: WhatsAppSettings): Promise<WhatsAppStatus> {
  if (settings.provider === "openwa") return openwaStatus(settings);
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

async function uploadMediaToMeta(settings: WhatsAppSettings, mediaData: string, mediaMimeType: string, mediaName: string): Promise<string> {
  const buffer = Buffer.from(mediaData, "base64");
  const blob = new Blob([buffer], { type: mediaMimeType });
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mediaMimeType);
  form.append("file", blob, mediaName || "media");

  const response = await fetch(`https://graph.facebook.com/${settings.graphVersion}/${settings.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.accessToken}` },
    body: form,
  });
  const data = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Meta media upload failed: ${response.status}`);
  return data.id || "";
}

export async function sendWhatsAppText(settings: WhatsAppSettings, to: string, body: string, media?: MediaAttachment) {
  if (settings.provider === "openwa") return sendOpenwa(settings, normalizePhone(to), body, media);
  if (settings.provider === "personal") return sendPersonal(settings, normalizePhone(to), body, media);
  if (!whatsappConfigured(settings)) throw new Error("WhatsApp Cloud API is not configured.");

  const hasMedia = Boolean(media?.mediaData || media?.mediaUrl);
  let payload: Record<string, unknown>;

  if (hasMedia) {
    let mediaId = "";
    if (media?.mediaData && media.mediaMimeType) {
      mediaId = await uploadMediaToMeta(settings, media.mediaData, media.mediaMimeType, media.mediaName || "media");
    }

    const imagePayload = mediaId
      ? { id: mediaId, caption: body }
      : { link: media?.mediaUrl || "", caption: body };

    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhone(to),
      type: "image",
      image: imagePayload,
    };
  } else {
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhone(to),
      type: "text",
      text: { preview_url: true, body },
    };
  }

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
