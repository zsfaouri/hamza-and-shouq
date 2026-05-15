import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getPrisma } from "./db.js";
import { readGoogleSheetPreview } from "./google-sheet.js";
import { saveMedia } from "./media.js";
import { getMetaStatus, sendMetaWhatsAppMessage, verifyMetaSignature } from "./meta-whatsapp.js";
import { getSettings, publicSettings, saveSettings } from "./settings.js";
import { parseSpreadsheet } from "./spreadsheet.js";
import { normalizePhone, renderTemplate } from "./template.js";
import { getWhatsAppStatus, initWhatsApp, sendWhatsAppMessage, waitForWhatsAppQr } from "./whatsapp.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const prisma = getPrisma();
let rawWebhookBody: Buffer | null = null;

app.use(cors({ origin: process.env.WEB_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buffer) => {
    if (req.url?.startsWith("/webhook")) rawWebhookBody = Buffer.from(buffer);
  },
}));
app.use("/uploads", express.static("uploads"));

function apiUrl() {
  return process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4100}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function parseCustomFields(value: string | null | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

app.get("/", (_req, res) => {
  const settings = getSettings();
  res.json({
    ok: true,
    service: "hamza-and-shouq-api",
    provider: settings.provider,
    endpoints: ["/health", "/api/settings", "/api/whatsapp/status", "/webhook"],
  });
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "hamza-and-shouq-api" }));

app.get("/api/settings", (_req, res) => {
  res.json(publicSettings());
});

app.put("/api/settings", (req, res) => {
  const schema = z.object({
    provider: z.enum(["personal", "meta"]),
    defaultCountryCode: z.string().min(1),
    meta: z.object({
      graphVersion: z.string().min(1),
      phoneNumberId: z.string().optional().default(""),
      accessToken: z.string().optional().default(""),
      appSecret: z.string().optional().default(""),
      verifyToken: z.string().optional().default("hamza-shouq-webhook"),
      sendMode: z.enum(["text", "template"]),
      templateName: z.string().optional().default(""),
      templateLanguage: z.string().optional().default("en_US"),
    }),
  });
  const current = getSettings();
  const data = schema.parse(req.body);
  const next = {
    ...data,
    meta: {
      ...data.meta,
      accessToken: data.meta.accessToken === "configured" ? current.meta.accessToken : data.meta.accessToken,
      appSecret: data.meta.appSecret === "configured" ? current.meta.appSecret : data.meta.appSecret,
    },
  };
  res.json(publicSettings(saveSettings(next)));
});

app.get("/api/whatsapp/status", async (_req, res) => {
  const settings = getSettings();
  res.json({
    provider: settings.provider,
    personal: await getWhatsAppStatus(),
    meta: getMetaStatus(settings),
  });
});

app.post("/api/whatsapp/start", async (_req, res) => {
  const settings = getSettings();
  if (settings.provider !== "personal") return res.status(400).json({ error: "QR start is only available in personal mode" });
  await initWhatsApp();
  res.json({
    provider: settings.provider,
    personal: await waitForWhatsAppQr(),
    meta: getMetaStatus(settings),
  });
});

app.get("/webhook", (req, res) => {
  const settings = getSettings();
  if (req.query["hub.mode"] !== "subscribe" || req.query["hub.verify_token"] !== settings.meta.verifyToken) {
    return res.sendStatus(403);
  }
  res.send(String(req.query["hub.challenge"] ?? ""));
});

app.post("/webhook", async (req, res) => {
  const settings = getSettings();
  const signature = req.header("x-hub-signature-256");
  if (settings.meta.appSecret && rawWebhookBody && !verifyMetaSignature(settings.meta.appSecret, rawWebhookBody, signature)) {
    return res.sendStatus(403);
  }

  const entries = req.body?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const message = await prisma.message.findFirst({ where: { waMessageId: status.id } });
        if (!message) continue;
        if (status.status === "failed") {
          await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED", error: status.errors?.[0]?.title ?? "Meta delivery failed" } });
        }
      }
    }
  }

  res.status(200).send("EVENT_RECEIVED");
});

app.post("/api/media", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });
  const media = await saveMedia(req.file);
  res.json(media);
});

app.get("/api/templates", async (_req, res) => {
  res.json(await prisma.template.findMany({ orderBy: { createdAt: "desc" } }));
});

app.post("/api/templates", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    bodyEn: z.string().min(1),
    bodyAr: z.string().optional(),
    mediaUrl: z.string().optional().nullable(),
    mediaType: z.string().optional().nullable(),
  });
  const data = schema.parse(req.body);
  res.json(await prisma.template.create({ data }));
});

app.put("/api/templates/:id", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    bodyEn: z.string().min(1),
    bodyAr: z.string().optional().nullable(),
    mediaUrl: z.string().optional().nullable(),
    mediaType: z.string().optional().nullable(),
  });
  const data = schema.parse(req.body);
  res.json(await prisma.template.update({ where: { id: routeParam(req.params.id) }, data }));
});

app.get("/api/campaigns", async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    include: { template: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(campaigns);
});

app.post("/api/campaigns", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    templateId: z.string().min(1),
  });
  const data = schema.parse(req.body);
  res.json(await prisma.campaign.create({ data: { ...data, status: "DRAFT" } }));
});

app.post("/api/campaigns/:id/contacts", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing spreadsheet" });
  const campaignId = routeParam(req.params.id);
  const settings = getSettings();
  const contacts = parseSpreadsheet(req.file);
  await prisma.contact.createMany({
    data: contacts.map((contact) => ({
      campaignId,
      name: contact.name,
      phone: normalizePhone(contact.phone, settings.defaultCountryCode),
      customFields: JSON.stringify(contact.customFields),
    })),
  });

  const totalCount = await prisma.contact.count({ where: { campaignId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { totalCount, status: "READY" } });
  res.json({ imported: contacts.length, totalCount });
});

app.post("/api/campaigns/:id/contacts/google-sheet", async (req, res) => {
  const schema = z.object({
    url: z.string().url().optional(),
    sheetId: z.string().optional(),
    gid: z.string().optional(),
  });
  const campaignId = routeParam(req.params.id);
  const settings = getSettings();
  const input = schema.parse(req.body);
  const preview = await readGoogleSheetPreview(input);
  const contacts = preview.contacts.map((contact) => ({
    ...contact,
    phone: normalizePhone(contact.phone, settings.defaultCountryCode),
  }));

  await prisma.contact.createMany({
    data: contacts.map((contact) => ({
      campaignId,
      name: contact.name,
      phone: contact.phone,
      customFields: JSON.stringify(contact.customFields),
    })),
  });

  const totalCount = await prisma.contact.count({ where: { campaignId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { totalCount, status: totalCount ? "READY" : "DRAFT" } });
  res.json({
    imported: contacts.length,
    totalCount,
    headers: preview.headers,
    contacts: contacts.map((contact, index) => ({ id: `${campaignId}-${index}`, name: contact.name, phone: contact.phone })),
    message: contacts.length
      ? `Read ${contacts.length} contact${contacts.length === 1 ? "" : "s"} from Google Sheets.`
      : `Google Sheet is reachable. Headers read: ${preview.headers.join(", ") || "none"}. No contact rows found.`,
  });
});

app.get("/api/campaigns/:id", async (req, res) => {
  const campaignId = routeParam(req.params.id);
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      contacts: { orderBy: { createdAt: "asc" } },
      messages: { include: { contact: true, rsvpToken: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json(campaign);
});

app.post("/api/campaigns/:id/prepare", async (req, res) => {
  const campaignId = routeParam(req.params.id);
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true, contacts: true },
  });
  if (!campaign?.template) return res.status(404).json({ error: "Campaign or template not found" });

  await prisma.message.deleteMany({ where: { campaignId: campaign.id } });

  for (const contact of campaign.contacts) {
    const token = randomUUID();
    const rsvpLink = `${apiUrl()}/rsvp/${token}`;
    const row = { ...parseCustomFields(contact.customFields), name: contact.name, phone: contact.phone, rsvp_link: rsvpLink };
    const body = renderTemplate(campaign.template.bodyEn, row);
    const message = await prisma.message.create({
      data: {
        campaignId: campaign.id,
        contactId: contact.id,
        body,
      },
    });
    await prisma.rsvpToken.create({ data: { messageId: message.id, contactId: contact.id, token } });
  }

  res.json({ prepared: campaign.contacts.length });
});

app.post("/api/campaigns/:id/send", async (req, res) => {
  const delayMs = Number(process.env.SEND_DELAY_MS ?? 4000);
  const dailyLimit = Number(process.env.DAILY_SEND_LIMIT ?? 100);
  const campaignId = routeParam(req.params.id);
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { template: true } });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const pending = await prisma.message.findMany({
    where: { campaignId: campaign.id, status: "PENDING" },
    include: { contact: true },
    take: dailyLimit,
    orderBy: { createdAt: "asc" },
  });

  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "SENDING" } });
  res.json({ queued: pending.length, delayMs });

  setImmediate(async () => {
    let sent = 0;
    let failed = 0;
    for (const message of pending) {
      try {
        const settings = getSettings();
        const waMessage =
          settings.provider === "meta"
            ? await sendMetaWhatsAppMessage(message.contact.phone, message.body, campaign.template?.mediaUrl, settings)
            : await sendWhatsAppMessage(message.contact.phone, message.body, campaign.template?.mediaUrl);
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "SENT", waMessageId: typeof waMessage.id === "string" ? waMessage.id : waMessage.id.id, sentAt: new Date() },
        });
        sent++;
      } catch (error) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "FAILED", error: error instanceof Error ? error.message : "Send failed" },
        });
        failed++;
      }
      await delay(delayMs);
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "SENT", sentAt: new Date(), sentCount: { increment: sent }, failedCount: { increment: failed } },
    });
  });
});

app.get("/api/campaigns/:id/stats", async (req, res) => {
  const campaignId = routeParam(req.params.id);
  const [sent, failed, pending, yes, no] = await Promise.all([
    prisma.message.count({ where: { campaignId, status: "SENT" } }),
    prisma.message.count({ where: { campaignId, status: "FAILED" } }),
    prisma.message.count({ where: { campaignId, status: "PENDING" } }),
    prisma.rsvpToken.count({ where: { message: { campaignId }, response: "YES" } }),
    prisma.rsvpToken.count({ where: { message: { campaignId }, response: "NO" } }),
  ]);
  res.json({ sent, failed, pending, yes, no });
});

app.get("/rsvp/:token", async (req, res) => {
  const token = await prisma.rsvpToken.findUnique({ where: { token: routeParam(req.params.token) }, include: { contact: true } });
  if (!token) return res.status(404).send("RSVP link not found");

  res.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RSVP</title><style>body{font-family:Arial,sans-serif;background:#f6f8f5;color:#111;margin:0;display:grid;place-items:center;min-height:100vh}.card{max-width:520px;background:white;border:1px solid #dfe7dc;padding:32px;border-radius:18px;box-shadow:0 20px 70px #0001}.actions{display:flex;gap:12px;margin-top:24px}button{border:0;border-radius:999px;padding:14px 18px;font-weight:700;cursor:pointer}.yes{background:#25d366}.no{background:#eee}</style></head>
<body><main class="card"><p>Hamza and Shouq Wedding</p><h1>Hi ${token.contact.name}, will you attend?</h1><form class="actions" method="post"><button class="yes" name="response" value="YES">Attending</button><button class="no" name="response" value="NO">Not attending</button></form></main></body></html>`);
});

app.post("/rsvp/:token", express.urlencoded({ extended: false }), async (req, res) => {
  const response = req.body.response === "NO" ? "NO" : "YES";
  const token = await prisma.rsvpToken.update({
    where: { token: routeParam(req.params.token) },
    data: { response, clickedAt: new Date() },
    include: { contact: true },
  });
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSVP Saved</title><style>body{font-family:Arial,sans-serif;background:#f6f8f5;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:white;padding:32px;border-radius:18px;border:1px solid #dfe7dc}</style></head><body><main class="card"><h1>Thank you, ${token.contact.name}.</h1><p>Your response has been recorded.</p></main></body></html>`);
});

const port = Number(process.env.API_PORT ?? 4100);
const server = app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});

server.on("error", (error) => {
  console.error(error);
});
