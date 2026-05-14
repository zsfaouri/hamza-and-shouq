import qrcode from "qrcode";
import { existsSync } from "node:fs";
import type { Client as WhatsAppClient } from "whatsapp-web.js";

type SessionState = "booting" | "qr" | "ready" | "disconnected" | "disabled";

let client: WhatsAppClient | null = null;
let latestQr: string | null = null;
let state: SessionState = "disabled";
let lastError: string | null = null;
let whatsappModule: typeof import("whatsapp-web.js") | null = null;

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

  client.initialize().catch((error) => {
    lastError = error instanceof Error ? error.message : "WhatsApp session failed";
    state = "disconnected";
  });
}

export async function getWhatsAppStatus() {
  const qrDataUrl = latestQr ? await qrcode.toDataURL(latestQr) : null;
  return { state, qr: qrDataUrl, error: lastError };
}

export async function sendWhatsAppMessage(toPhone: string, body: string, mediaUrl?: string | null) {
  if (!client || state !== "ready") throw new Error("WhatsApp session is not ready");

  const { MessageMedia } = await loadWhatsApp();
  const chatId = `${toPhone.replace(/[^\d]/g, "")}@c.us`;
  if (mediaUrl) {
    const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
    return client.sendMessage(chatId, media, { caption: body });
  }
  return client.sendMessage(chatId, body);
}
