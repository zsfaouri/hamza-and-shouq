import { createHmac, timingSafeEqual } from "node:crypto";

import type { AppSettings } from "./settings.js";
import { normalizePhone } from "./template.js";

export type MetaStatus = {
  configured: boolean;
  phoneNumberId: string;
  graphVersion: string;
  sendMode: "text" | "template";
  templateName: string;
};

export function getMetaStatus(settings: AppSettings): MetaStatus {
  return {
    configured: Boolean(settings.meta.accessToken && settings.meta.phoneNumberId),
    phoneNumberId: settings.meta.phoneNumberId,
    graphVersion: settings.meta.graphVersion,
    sendMode: settings.meta.sendMode,
    templateName: settings.meta.templateName,
  };
}

export function verifyMetaSignature(appSecret: string, rawBody: Buffer, signature?: string) {
  if (!signature || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signature.replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function sendMetaWhatsAppMessage(toPhone: string, body: string, mediaUrl: string | null | undefined, settings: AppSettings) {
  const { accessToken, phoneNumberId, graphVersion, sendMode, templateName, templateLanguage } = settings.meta;
  if (!accessToken || !phoneNumberId) throw new Error("Meta WhatsApp API is not configured");
  const to = normalizePhone(toPhone, settings.defaultCountryCode);

  const requestBody =
    sendMode === "template" && templateName
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: body }],
              },
            ],
          },
        }
      : mediaUrl
        ? {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "image",
            image: { link: mediaUrl, caption: body },
          }
        : {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "text",
            text: { preview_url: true, body },
          };

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const json = (await response.json()) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message || "Meta WhatsApp API send failed");

  return { id: json.messages?.[0]?.id || "" };
}
