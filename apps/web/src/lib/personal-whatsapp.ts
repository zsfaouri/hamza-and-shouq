import path from "node:path";
import type { WhatsAppSettings, WhatsAppStatus } from "./types";

type LocalState = {
  client: unknown;
  state: string;
  qr: string;
  qrDataUrl: string;
  error: string;
  accountPhone: string;
  displayName: string;
  starting: boolean;
};

function localRef() {
  const global = globalThis as typeof globalThis & { __hsPersonalWhatsApp?: LocalState };
  global.__hsPersonalWhatsApp ??= {
    client: null,
    state: "idle",
    qr: "",
    qrDataUrl: "",
    error: "",
    accountPhone: "",
    displayName: "",
    starting: false,
  };
  return global.__hsPersonalWhatsApp;
}

function asStatus(state: LocalState): WhatsAppStatus {
  return {
    provider: "personal",
    configured: true,
    state: state.state,
    qr: state.qr,
    qrDataUrl: state.qrDataUrl,
    accountPhone: state.accountPhone,
    displayName: state.displayName,
    error: state.error,
    mode: "local",
  };
}

function bridgeHeaders(settings: WhatsAppSettings) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.personalBridgeToken) headers.Authorization = `Bearer ${settings.personalBridgeToken}`;
  return headers;
}

function localBridgeUrl(settings: WhatsAppSettings) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(settings.personalBridgeUrl.trim());
}

async function bridgeRequest<T>(settings: WhatsAppSettings, pathName: string, init?: RequestInit): Promise<T> {
  const base = settings.personalBridgeUrl.trim().replace(/\/$/, "");
  if (!base) throw new Error("Personal WhatsApp bridge URL is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${base}${pathName}`, {
      ...init,
      headers: { ...bridgeHeaders(settings), ...(init?.headers || {}) },
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Personal WhatsApp bridge failed: ${response.status}`);
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBridgeStatus(data: Partial<WhatsAppStatus> & { personal?: Partial<WhatsAppStatus> }, configured: boolean): WhatsAppStatus {
  const source = data.personal || data;
  return {
    provider: "personal",
    configured,
    state: source.state || "unknown",
    qr: source.qr || "",
    qrDataUrl: source.qrDataUrl || "",
    accountPhone: source.accountPhone || "",
    displayName: source.displayName || "",
    error: source.error || "",
    mode: "bridge",
  };
}

export async function personalStatus(settings: WhatsAppSettings): Promise<WhatsAppStatus> {
  if (settings.personalBridgeUrl.trim()) {
    try {
      const data = await bridgeRequest<Partial<WhatsAppStatus> & { personal?: Partial<WhatsAppStatus> }>(settings, "/api/whatsapp/status");
      return normalizeBridgeStatus(data, true);
    } catch (error) {
      if (!process.env.VERCEL && localBridgeUrl(settings)) {
        const status = asStatus(localRef());
        const bridgeError = error instanceof Error ? error.message : "";
        const localError = status.error ? ` Local session: ${status.error}` : "";
        return {
          ...status,
          error: `Local bridge unavailable; using in-app local WhatsApp session. ${bridgeError}.${localError}`.trim(),
        };
      }
      throw error;
    }
  }
  if (process.env.VERCEL) {
    return {
      provider: "personal",
      configured: false,
      state: "bridge-required",
      qr: "",
      qrDataUrl: "",
      accountPhone: "",
      displayName: "",
      error: "Personal WhatsApp cannot run inside Vercel serverless. Configure a persistent personal bridge URL.",
      mode: "local",
    };
  }
  return asStatus(localRef());
}

export async function startPersonal(settings: WhatsAppSettings): Promise<WhatsAppStatus> {
  if (settings.personalBridgeUrl.trim()) {
    try {
      const data = await bridgeRequest<Partial<WhatsAppStatus> & { personal?: Partial<WhatsAppStatus> }>(settings, "/api/whatsapp/start", { method: "POST" });
      return normalizeBridgeStatus(data, true);
    } catch (error) {
      if (process.env.VERCEL || !localBridgeUrl(settings)) throw error;
    }
  }
  if (process.env.VERCEL) {
    throw new Error("Personal WhatsApp requires a persistent bridge URL on Vercel.");
  }

  const state = localRef();
  if (state.client || state.starting) return asStatus(state);
  state.starting = true;
  state.state = "starting";
  state.error = "";

  try {
    const [{ Client, LocalAuth }, qrcode] = await Promise.all([
      import("whatsapp-web.js"),
      import("qrcode"),
    ]);
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: "hamza-shouq",
        dataPath: path.join(process.cwd(), ".wwebjs_auth"),
      }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
    });
    state.client = client;
    client.on("qr", async (qr: string) => {
      state.state = "qr";
      state.qr = qr;
      state.qrDataUrl = await qrcode.toDataURL(qr);
    });
    client.on("ready", () => {
      const info = client.info;
      state.state = "ready";
      state.starting = false;
      state.qr = "";
      state.qrDataUrl = "";
      state.accountPhone = info?.wid?.user || "";
      state.displayName = info?.pushname || "";
      state.error = "";
    });
    client.on("auth_failure", (message: string) => {
      state.state = "auth_failure";
      state.error = message || "WhatsApp authentication failed.";
    });
    client.on("disconnected", (reason: string) => {
      state.state = "disconnected";
      state.error = reason || "WhatsApp disconnected.";
      state.client = null;
      state.starting = false;
    });
    client.initialize().catch((error: unknown) => {
      state.state = "error";
      state.error = error instanceof Error ? error.message : "WhatsApp session failed to start.";
      state.client = null;
      state.starting = false;
    });
  } catch (error) {
    state.state = "error";
    state.error = error instanceof Error ? error.message : "WhatsApp session failed to start.";
    state.client = null;
    state.starting = false;
  }

  return asStatus(state);
}

export type MediaAttachment = {
  mediaUrl?: string;
  mediaData?: string;
  mediaMimeType?: string;
  mediaName?: string;
};

export async function sendPersonal(settings: WhatsAppSettings, to: string, body: string, media?: MediaAttachment) {
  if (settings.personalBridgeUrl.trim()) {
    const data = await bridgeRequest<{ id?: string }>(settings, "/api/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({
        phone: to,
        message: body,
        mediaUrl: media?.mediaUrl || "",
        mediaData: media?.mediaData || "",
        mediaMimeType: media?.mediaMimeType || "",
        mediaName: media?.mediaName || "",
      }),
    });
    return data.id || "";
  }
  if (process.env.VERCEL) throw new Error("Personal WhatsApp requires a persistent bridge URL on Vercel.");

  const state = localRef();
  if (state.state !== "ready" || !state.client) throw new Error(`Personal WhatsApp is not ready. Current state: ${state.state}`);
  const { MessageMedia } = await import("whatsapp-web.js");
  const client = state.client as {
    sendMessage: (chatId: string, content: unknown, options?: { caption?: string }) => Promise<{ id?: { _serialized?: string } | string }>;
  };
  const chatId = `${to.replace(/[^\d]/g, "")}@c.us`;

  let resolvedMedia: unknown = null;
  if (media?.mediaData && media.mediaMimeType) {
    resolvedMedia = new MessageMedia(media.mediaMimeType, media.mediaData, media.mediaName || "media");
  } else if (media?.mediaUrl) {
    resolvedMedia = await MessageMedia.fromUrl(media.mediaUrl);
  }

  const result = resolvedMedia
    ? await client.sendMessage(chatId, resolvedMedia, { caption: body })
    : await client.sendMessage(chatId, body);
  return typeof result.id === "string" ? result.id : result.id?._serialized || "";
}
