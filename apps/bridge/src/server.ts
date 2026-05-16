import "dotenv/config";
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
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
};

type SendResult = {
  id?: { _serialized?: string } | string;
};

const app = express();
const port = Number(process.env.BRIDGE_PORT || process.env.PORT || 4200);
const bridgeToken = process.env.BRIDGE_TOKEN || process.env.PERSONAL_WHATSAPP_TOKEN || "";
const webOrigin = process.env.WEB_ORIGIN || "https://web-zsfaouris-projects.vercel.app";
const appBaseUrl = (process.env.APP_BASE_URL || webOrigin).replace(/\/$/, "");
const sessionPath = process.env.WHATSAPP_SESSION_PATH || path.join(process.cwd(), ".wwebjs_auth");

let client: InstanceType<typeof Client> | null = null;
const state: BridgeState = {
  state: "idle",
  qr: "",
  qrDataUrl: "",
  error: "",
  accountPhone: "",
  displayName: "",
  starting: false,
};

app.use(express.json({ limit: "2mb" }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === webOrigin || origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000") {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed"));
  },
}));

function authorize(req: Request, res: Response, next: NextFunction) {
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
    configured: true,
    state: state.state,
    qr: state.qr,
    qrDataUrl: state.qrDataUrl,
    accountPhone: state.accountPhone,
    displayName: state.displayName,
    error: state.error,
    mode: "bridge",
  };
}

function puppeteerOptions() {
  return {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };
}

async function forwardInbound(from: string, text: string) {
  if (!appBaseUrl || !text.trim()) return;
  try {
    await fetch(`${appBaseUrl}/api/rsvp/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bridgeToken ? { Authorization: `Bearer ${bridgeToken}` } : {}),
      },
      body: JSON.stringify({ phone: from, text }),
    });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Inbound RSVP forward failed.";
  }
}

function attachClientEvents(nextClient: InstanceType<typeof Client>) {
  nextClient.on("qr", async (qr: string) => {
    state.state = "qr";
    state.qr = qr;
    state.qrDataUrl = await qrcode.toDataURL(qr);
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
  });

  nextClient.on("auth_failure", (message: string) => {
    state.state = "auth_failure";
    state.starting = false;
    state.error = message || "WhatsApp authentication failed.";
  });

  nextClient.on("disconnected", (reason: string) => {
    state.state = "disconnected";
    state.starting = false;
    state.error = reason || "WhatsApp disconnected.";
    client = null;
  });

  nextClient.on("message", (message) => {
    const from = message.from.replace(/@c\.us$/i, "");
    void forwardInbound(from, message.body || "");
  });
}

function startClient() {
  if (client || state.starting) return publicStatus();
  state.starting = true;
  state.state = "starting";
  state.error = "";

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "hamza-shouq",
      dataPath: sessionPath,
    }),
    puppeteer: puppeteerOptions(),
  });
  attachClientEvents(client);
  client.initialize().catch((error: unknown) => {
    state.state = "error";
    state.starting = false;
    state.error = error instanceof Error ? error.message : "WhatsApp session failed to start.";
    client = null;
  });
  return publicStatus();
}

const sendSchema = z.object({
  phone: z.string().min(7),
  message: z.string().min(1),
  mediaUrl: z.string().url().optional().or(z.literal("")),
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, status: state.state });
});

app.get("/api/whatsapp/status", authorize, (_req, res) => {
  res.json(publicStatus());
});

app.post("/api/whatsapp/start", authorize, (_req, res) => {
  res.json(startClient());
});

app.post("/api/whatsapp/test", authorize, async (req, res) => {
  if (state.state !== "ready" || !client) {
    res.status(409).json({ error: `Personal WhatsApp is not ready. Current state: ${state.state}` });
    return;
  }

  const input = sendSchema.parse(req.body);
  const chatId = `${input.phone.replace(/[^\d]/g, "")}@c.us`;
  const result = input.mediaUrl
    ? await client.sendMessage(chatId, await MessageMedia.fromUrl(input.mediaUrl), { caption: input.message }) as SendResult
    : await client.sendMessage(chatId, input.message) as SendResult;
  const id = typeof result.id === "string" ? result.id : result.id?._serialized || "";
  res.json({ ok: true, id });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Bridge request failed.";
  res.status(400).json({ error: message });
});

app.listen(port, () => {
  console.log(`WhatsApp bridge listening on ${port}`);
});
