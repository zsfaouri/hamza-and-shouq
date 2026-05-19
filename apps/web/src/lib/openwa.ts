import type { WhatsAppSettings, WhatsAppStatus } from "./types";
import type { MediaAttachment } from "./personal-whatsapp";

function headers(settings: WhatsAppSettings): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.openwaApiKey) h["api_key"] = settings.openwaApiKey;
  return h;
}

function baseUrl(settings: WhatsAppSettings) {
  return (settings.openwaApiUrl || "").replace(/\/$/, "");
}

async function openwaRequest<T>(settings: WhatsAppSettings, path: string, init?: RequestInit): Promise<T> {
  const base = baseUrl(settings);
  if (!base) throw new Error("OpenWA API URL is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers(settings), ...(init?.headers || {}) },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data as { message?: string }).message || `OpenWA request failed: ${response.status}`);
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function openwaConfigured(settings: WhatsAppSettings): boolean {
  return Boolean(settings.openwaApiUrl?.trim());
}

export async function openwaStatus(settings: WhatsAppSettings): Promise<WhatsAppStatus> {
  if (!openwaConfigured(settings)) {
    return {
      provider: "openwa",
      configured: false,
      state: "missing-config",
      qr: "",
      qrDataUrl: "",
      accountPhone: "",
      displayName: "",
      error: "OpenWA API URL is not configured. Deploy OpenWA and enter its URL.",
      mode: "bridge",
    };
  }

  try {
    const data = await openwaRequest<{
      connected?: boolean;
      me?: { id?: string; pushname?: string; _serialized?: string };
      pushname?: string;
      hostDevice?: { id?: { user?: string }; pushname?: string };
      isConnected?: boolean;
    }>(settings, "/getConnectionState");

    const connected = data.connected ?? data.isConnected ?? false;
    const phone = data.me?.id?.split("@")?.[0] || data.me?._serialized?.split("@")?.[0] || data.hostDevice?.id?.user || "";
    const name = data.me?.pushname || data.pushname || data.hostDevice?.pushname || "";

    return {
      provider: "openwa",
      configured: true,
      state: connected ? "ready" : "disconnected",
      qr: "",
      qrDataUrl: "",
      accountPhone: phone,
      displayName: name || "OpenWA Session",
      error: connected ? "" : "OpenWA session is not connected. Scan the QR code in the OpenWA dashboard.",
      mode: "bridge",
    };
  } catch (error) {
    return {
      provider: "openwa",
      configured: true,
      state: "error",
      qr: "",
      qrDataUrl: "",
      accountPhone: "",
      displayName: "",
      error: error instanceof Error ? error.message : "Failed to connect to OpenWA.",
      mode: "bridge",
    };
  }
}

export async function sendOpenwa(
  settings: WhatsAppSettings,
  to: string,
  body: string,
  media?: MediaAttachment,
): Promise<string> {
  if (!openwaConfigured(settings)) throw new Error("OpenWA is not configured.");

  const phone = to.replace(/[^\d]/g, "");
  const chatId = `${phone}@c.us`;

  // Send image with caption if media is present
  if (media?.mediaData && media.mediaMimeType) {
    const data = await openwaRequest<{ id?: string; _serialized?: string }>(settings, "/sendImage", {
      method: "POST",
      body: JSON.stringify({
        args: {
          to: chatId,
          base64: `data:${media.mediaMimeType};base64,${media.mediaData}`,
          filename: media.mediaName || "invitation",
          caption: body,
        },
      }),
    });
    return data.id || data._serialized || "";
  }

  if (media?.mediaUrl) {
    const data = await openwaRequest<{ id?: string; _serialized?: string }>(settings, "/sendImage", {
      method: "POST",
      body: JSON.stringify({
        args: {
          to: chatId,
          url: media.mediaUrl,
          filename: media.mediaName || "invitation",
          caption: body,
        },
      }),
    });
    return data.id || data._serialized || "";
  }

  // Text-only message
  const data = await openwaRequest<{ id?: string; _serialized?: string }>(settings, "/sendText", {
    method: "POST",
    body: JSON.stringify({
      args: {
        to: chatId,
        content: body,
      },
    }),
  });
  return data.id || data._serialized || "";
}
