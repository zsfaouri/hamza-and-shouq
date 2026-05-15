import { existsSync } from "node:fs";

type SessionState = "booting" | "qr" | "ready" | "disconnected" | "disabled" | "error";

type RuntimeState = {
  client: unknown;
  state: SessionState;
  qr: string | null;
  error: string | null;
  initializing: boolean;
};

const globalRuntime = globalThis as typeof globalThis & { __hsPersonalWhatsApp?: RuntimeState };

function runtime() {
  if (!globalRuntime.__hsPersonalWhatsApp) {
    globalRuntime.__hsPersonalWhatsApp = {
      client: null,
      state: "disabled",
      qr: null,
      error: null,
      initializing: false,
    };
  }
  return globalRuntime.__hsPersonalWhatsApp;
}

async function puppeteerOptions() {
  const isVercel = Boolean(process.env.VERCEL);
  if (isVercel) {
    const chromium = await import("@sparticuz/chromium");
    return {
      args: [...chromium.default.args, "--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: await chromium.default.executablePath(),
      headless: true,
    };
  }

  const chromePath = process.env.CHROME_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: existsSync(chromePath) ? chromePath : undefined,
    headless: true,
  };
}

export async function initPersonalWhatsApp() {
  const state = runtime();
  if (state.initializing || (state.client && state.state !== "disconnected" && state.state !== "error")) return;

  state.initializing = true;
  state.state = "booting";
  state.qr = null;
  state.error = null;

  try {
    const [qrcode, whatsapp] = await Promise.all([
      import("qrcode"),
      import("whatsapp-web.js"),
    ]);
    const whatsappModule = (whatsapp.default ?? whatsapp) as typeof import("whatsapp-web.js");
    const { Client, LocalAuth } = whatsappModule;
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: "hamza-and-shouq-vercel",
        dataPath: process.env.WHATSAPP_SESSION_PATH ?? "/tmp/hamza-and-shouq-wwebjs-auth",
      }),
      puppeteer: await puppeteerOptions(),
    });

    client.on("qr", async (qr) => {
      state.qr = await qrcode.toDataURL(qr);
      state.state = "qr";
    });

    client.on("ready", () => {
      state.qr = null;
      state.state = "ready";
      state.error = null;
    });

    client.on("disconnected", () => {
      state.qr = null;
      state.state = "disconnected";
    });

    client.on("auth_failure", (message) => {
      state.error = String(message || "WhatsApp authentication failed");
      state.state = "error";
    });

    state.client = client;
    client.initialize().catch((error) => {
      state.error = error instanceof Error ? error.message : "WhatsApp session failed";
      state.state = "error";
    });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "WhatsApp runtime failed";
    state.state = "error";
  } finally {
    state.initializing = false;
  }
}

export async function personalWhatsAppStatus() {
  const state = runtime();
  return {
    state: state.state,
    qr: state.qr,
    error: state.error,
  };
}

export async function sendPersonalWhatsAppMessage(toPhone: string, body: string) {
  const state = runtime();
  if (!state.client || state.state !== "ready") throw new Error("Personal WhatsApp session is not ready");
  const client = state.client as { sendMessage: (chatId: string, body: string) => Promise<{ id?: unknown }> };
  return client.sendMessage(`${toPhone.replace(/[^\d]/g, "")}@c.us`, body);
}
