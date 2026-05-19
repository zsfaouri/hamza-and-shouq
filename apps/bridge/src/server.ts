import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import qrcode from "qrcode";
import { z } from "zod";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth, MessageMedia } = pkg;

type BridgeState = {
  state: string;
  qr: string;
  qrDataUrl: string;
  error: string;
  accountPhone: string;
  displayName: string;
  starting: boolean;
  startedAt: string;
  lastReadyAt: string;
  lastMessageAt: string;
};

type SendResult = {
  id?: { _serialized?: string } | string;
};

type InboundMessage = {
  from?: string;
  fromMe?: boolean;
  isStatus?: boolean;
  body?: string;
  selectedButtonId?: string;
  buttonText?: string;
  type?: string;
};

const app = express();
const port = Number(process.env.BRIDGE_PORT || process.env.PORT || 4200);
const bridgeToken = process.env.BRIDGE_TOKEN || process.env.PERSONAL_WHATSAPP_TOKEN || "";
const webOrigin = process.env.WEB_ORIGIN || "https://web-zsfaouris-projects.vercel.app";
const appBaseUrl = (process.env.APP_BASE_URL || webOrigin).replace(/\/$/, "");
const sessionPath = process.env.WHATSAPP_SESSION_PATH || path.join(process.cwd(), ".wwebjs_auth");
const reconnectMs = Math.max(0, Number(process.env.BRIDGE_RECONNECT_MS || 15000));
const autoStart = process.env.BRIDGE_AUTO_START === "true";
const productionBridge = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
const securityError = productionBridge && !bridgeToken ? "BRIDGE_TOKEN is required in production." : "";
const allowedOrigins = new Set([
  webOrigin,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.BRIDGE_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean),
]);

let client: InstanceType<typeof Client> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const state: BridgeState = {
  state: "idle",
  qr: "",
  qrDataUrl: "",
  error: securityError,
  accountPhone: "",
  displayName: "",
  starting: false,
  startedAt: "",
  lastReadyAt: "",
  lastMessageAt: "",
};

app.use(express.json({ limit: "2mb" }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed."));
  },
}));

function nowIso() {
  return new Date().toISOString();
}

function authorize(req: Request, res: Response, next: NextFunction) {
  if (securityError) {
    res.status(503).json({ error: securityError });
    return;
  }
  if (!bridgeToken) {
    next();
    return;
  }
  const authorization = req.header("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const headerToken = req.header("x-bridge-token") || "";
  if (bearer === bridgeToken || headerToken === bridgeToken) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized bridge request." });
}

function publicStatus() {
  return {
    provider: "personal",
    configured: !securityError,
    state: state.state,
    qr: state.qr,
    qrDataUrl: state.qrDataUrl,
    accountPhone: state.accountPhone,
    displayName: state.displayName,
    error: state.error,
    mode: "bridge",
    startedAt: state.startedAt,
    lastReadyAt: state.lastReadyAt,
    lastMessageAt: state.lastMessageAt,
  };
}

function puppeteerOptions() {
  return {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  };
}

async function forwardInbound(from: string, text: string) {
  if (!appBaseUrl || !text.trim()) return;
  try {
    const response = await fetch(`${appBaseUrl}/api/rsvp/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bridgeToken ? { Authorization: `Bearer ${bridgeToken}` } : {}),
      },
      body: JSON.stringify({ phone: from, text }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      state.error = data.error || `Inbound RSVP forward failed: ${response.status}`;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Inbound RSVP forward failed.";
  }
}

function clearReconnect() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(reason: string) {
  if (!reconnectMs || reconnectTimer || securityError) return;
  if (/logout|auth/i.test(reason)) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startClient();
  }, reconnectMs);
}

function attachClientEvents(nextClient: InstanceType<typeof Client>) {
  nextClient.on("qr", async (qr: string) => {
    state.state = "qr";
    state.qr = qr;
    state.error = "";
    try {
      state.qrDataUrl = await qrcode.toDataURL(qr);
    } catch (error) {
      state.error = error instanceof Error ? error.message : "QR generation failed.";
    }
  });

  nextClient.on("authenticated", () => {
    state.state = "authenticated";
    state.error = "";
  });

  nextClient.on("ready", () => {
    const info = nextClient.info;
    state.state = "ready";
    state.starting = false;
    state.qr = "";
    state.qrDataUrl = "";
    state.accountPhone = info?.wid?.user || "";
    state.displayName = info?.pushname || "";
    state.error = "";
    state.lastReadyAt = nowIso();
    clearReconnect();
  });

  nextClient.on("auth_failure", (message: string) => {
    state.state = "auth_failure";
    state.starting = false;
    state.error = message || "WhatsApp authentication failed.";
    client = null;
  });

  nextClient.on("disconnected", (reason: string) => {
    state.state = "disconnected";
    state.starting = false;
    state.error = reason || "WhatsApp disconnected.";
    client = null;
    scheduleReconnect(reason || "");
  });

  nextClient.on("message", (message: InboundMessage) => {
    if (message.fromMe || message.isStatus) return;
    const from = String(message.from || "").replace(/@c\.us$/i, "");
    if (!from || /@g\.us$/i.test(from)) return;
    const text = message.body || message.selectedButtonId || message.buttonText || "";
    state.lastMessageAt = nowIso();
    void forwardInbound(from, text);
  });
}

async function startClient() {
  if (securityError) return publicStatus();
  if (client || state.starting) return publicStatus();
  clearReconnect();
  state.starting = true;
  state.state = "starting";
  state.error = "";
  state.startedAt = nowIso();

  const nextClient = new Client({
    authStrategy: new LocalAuth({
      clientId: "hamza-shouq",
      dataPath: sessionPath,
    }),
    puppeteer: puppeteerOptions(),
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/nicenathapong/whatsapp-web-versions/main/cache/chrome/latest.html",
    },
  });
  client = nextClient;
  attachClientEvents(nextClient);
  nextClient.initialize().catch((error: unknown) => {
    state.state = "error";
    state.starting = false;
    state.error = error instanceof Error ? error.message : "WhatsApp session failed to start.";
    client = null;
    scheduleReconnect(state.error);
  });
  return publicStatus();
}

async function stopClient() {
  clearReconnect();
  const current = client;
  client = null;
  state.starting = false;
  if (!current) return;
  await current.destroy().catch(() => undefined);
}

const sendSchema = z.object({
  phone: z.string().min(7),
  message: z.string().min(1),
  mediaUrl: z.string().url().optional().or(z.literal("")),
  mediaData: z.string().optional(),
  mediaMimeType: z.string().optional(),
  mediaName: z.string().optional(),
});

async function resolveMedia(input: z.infer<typeof sendSchema>): Promise<InstanceType<typeof MessageMedia> | null> {
  // Prefer inline base64 data (no network fetch needed)
  if (input.mediaData && input.mediaMimeType) {
    return new MessageMedia(input.mediaMimeType, input.mediaData, input.mediaName || "media");
  }
  // Fall back to URL fetch
  if (input.mediaUrl) {
    return MessageMedia.fromUrl(input.mediaUrl);
  }
  return null;
}

async function sendMessage(req: Request, res: Response) {
  if (state.state !== "ready" || !client) {
    res.status(409).json({ error: `Personal WhatsApp is not ready. Current state: ${state.state}` });
    return;
  }

  const input = sendSchema.parse(req.body);
  const chatId = `${input.phone.replace(/[^\d]/g, "")}@c.us`;
  const media = await resolveMedia(input);
  const result = media
    ? await client.sendMessage(chatId, media, { caption: input.message }) as SendResult
    : await client.sendMessage(chatId, input.message) as SendResult;
  const id = typeof result.id === "string" ? result.id : result.id?._serialized || "";
  res.json({ ok: true, id });
}

app.get("/healthz", (_req, res) => {
  res.status(securityError ? 503 : 200).json({ ok: !securityError, status: state.state, error: securityError });
});

app.get("/api/whatsapp/status", authorize, (_req, res) => {
  res.json(publicStatus());
});

app.post("/api/whatsapp/start", authorize, async (_req, res) => {
  res.json(await startClient());
});

app.post("/api/whatsapp/send", authorize, sendMessage);

app.post("/api/whatsapp/test", authorize, sendMessage);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Bridge request failed.";
  res.status(400).json({ error: message });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`WhatsApp bridge listening on ${port}`);
  if (autoStart) void startClient();
});

async function shutdown() {
  await stopClient();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});
