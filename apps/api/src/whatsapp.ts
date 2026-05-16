import qrcode from "qrcode";
import { existsSync } from "node:fs";
import type { Client as WhatsAppClient } from "whatsapp-web.js";

type SessionState = "booting" | "qr" | "ready" | "disconnected" | "disabled";
export type IncomingWhatsAppMessage = {
  from: string;
  body: string;
  messageId?: string;
};

let client: WhatsAppClient | null = null;
let latestQr: string | null = null;
let state: SessionState = "disabled";
let lastError: string | null = null;
let whatsappModule: typeof import("whatsapp-web.js") | null = null;
let incomingHandler: ((message: IncomingWhatsAppMessage) => Promise<void> | void) | null = null;

export function setIncomingWhatsAppHandler(handler: ((message: IncomingWhatsAppMessage) => Promise<void> | void) | null) {
  incomingHandler = handler;
}

function assertAllowedMediaUrl(mediaUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    throw new Error("Media URL is invalid");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Media URL must use HTTP or HTTPS");
  }

  const publicApiUrl = process.env.API_PUBLIC_URL ? new URL(process.env.API_PUBLIC_URL) : null;
  const isLocalUpload = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) && parsed.pathname.startsWith("/uploads/");
  const isOwnUpload = parsed.pathname.startsWith("/uploads/") && Boolean(publicApiUrl && parsed.origin === publicApiUrl.origin);
  const isCloudinary = parsed.protocol === "https:" && parsed.hostname.endsWith(".cloudinary.com");

  if (!isOwnUpload && !isLocalUpload && !isCloudinary) {
    throw new Error("Media URL must be an uploaded file from this API or Cloudinary");
  }
}

async function loadWhatsApp() {
  if (!whatsappModule) {
    const imported = await import("whatsapp-web.js");
    whatsappModule = (imported.default ?? imported) as typeof import("whatsapp-web.js");
  }
  return whatsappModule;
}

export async function initWhatsApp() {
  if (client && state !== "disconnected") return;
  if (client) {
    await client.destroy().catch(() => undefined);
    client = null;
  }

  const { Client, LocalAuth } = await loadWhatsApp();
  const chromePath = process.env.CHROME_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  state = "booting";
  lastError = null;
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "hamza-and-shouq",
      dataPath: process.env.WHATSAPP_SESSION_PATH ?? ".wwebjs_auth",
    }),
    puppeteer: {
      headless: true,
      executablePath: existsSync(chromePath) ? chromePath : undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr) => {
    latestQr = qr;
    state = "qr";
  });

  client.on("ready", () => {
    latestQr = null;
    state = "ready";
  });

  client.on("disconnected", () => {
    state = "disconnected";
    latestQr = null;
  });

  client.on("message", async (message) => {
    const handler = incomingHandler;
    if (!handler) return;
    const from = message.from ?? "";
    if (!from.endsWith("@c.us")) return;
    const body = message.body?.trim();
    if (!body) return;

    try {
      await handler({
        from: from.replace(/@c\.us$/, ""),
        body,
        messageId: message.id?._serialized,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Incoming WhatsApp message handling failed";
      console.error(error);
    }
  });

  client.initialize().catch((error) => {
    lastError = error instanceof Error ? error.message : "WhatsApp session failed";
    state = "disconnected";
  });
}

export async function getWhatsAppStatus() {
  const qrDataUrl = latestQr ? await qrcode.toDataURL(latestQr) : null;
  const info = client?.info;
  return {
    state,
    qr: qrDataUrl,
    error: lastError,
    accountPhone: info?.wid?.user ?? null,
    displayName: info?.pushname ?? null,
  };
}

export async function assertWhatsAppReady() {
  const status = await getWhatsAppStatus();
  if (status.state !== "ready") {
    throw new Error(status.qr
      ? "WhatsApp is waiting for QR scan. Open WhatsApp Settings and scan the QR before sending."
      : status.error ?? `WhatsApp is not ready. Current state: ${status.state}`);
  }
  return status;
}

export async function waitForWhatsAppQr(timeoutMs = 50_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getWhatsAppStatus();
    if (status.qr || status.state === "ready" || status.state === "disconnected") return status;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (state === "booting") {
    lastError = "WhatsApp QR was not generated before the request timed out.";
    state = "disconnected";
  }
  return getWhatsAppStatus();
}

export async function sendWhatsAppMessage(toPhone: string, body: string, mediaUrl?: string | null) {
  await assertWhatsAppReady();
  if (!client) throw new Error("WhatsApp client is not initialized");

  const { MessageMedia } = await loadWhatsApp();
  const digits = toPhone.replace(/[^\d]/g, "");
  const numberId = await client.getNumberId(digits);
  if (!numberId?._serialized) throw new Error(`WhatsApp number is not registered: ${digits}`);
  const chatId = numberId._serialized;
  if (mediaUrl) {
    assertAllowedMediaUrl(mediaUrl);
    const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
    return client.sendMessage(chatId, media, { caption: body });
  }
  return client.sendMessage(chatId, body);
}
