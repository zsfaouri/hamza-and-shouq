import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { budgetRouter } from "./budget.js";
import { getPrisma } from "./db.js";
import { detectGoogleSheetTabs, importGoogleSheetTabs, readGoogleSheetPreview } from "./google-sheet.js";
import { saveMedia } from "./media.js";
import { getMetaStatus, sendMetaWhatsAppMessage, verifyMetaSignature } from "./meta-whatsapp.js";
import { remindersRouter } from "./reminders.js";
import { startReminderScheduler } from "./reminder-scheduler.js";
import {
  appendRsvpActionLinks,
  createRsvpLinks,
  parseRsvpResponseInput,
  recordInboundRsvpFromPhone,
  rsvpConfirmationHtml,
  saveRsvpTokenResponse,
} from "./rsvp.js";
import { getSettings, publicSettings, saveSettings } from "./settings.js";
import { parseSpreadsheet } from "./spreadsheet.js";
import { normalizePhone, renderTemplate, resolveVariables, templateMessageBody } from "./template.js";
import { assertWhatsAppReady, getWhatsAppStatus, initWhatsApp, sendWhatsAppMessage, setIncomingWhatsAppHandler, waitForWhatsAppQr } from "./whatsapp.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const prisma = getPrisma();
let rawWebhookBody: Buffer | null = null;
const activeSends = new Set<string>();

app.use(cors({ origin: process.env.WEB_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buffer) => {
    if (req.url?.startsWith("/webhook")) rawWebhookBody = Buffer.from(buffer);
  },
}));
app.use("/uploads", express.static("uploads"));
app.use("/api/budget", budgetRouter);
app.use("/api/reminders", remindersRouter);

function apiUrl() {
  return process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4100}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function parseCustomFields(value: unknown) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function jsonInput(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function selectedTemplateBody(template: { languageMode?: string | null; bodyEn: string; bodyAr?: string | null }) {
  const bodyEn = template.bodyEn.trim();
  const bodyAr = template.bodyAr?.trim() ?? "";
  if (template.languageMode === "arabic_only") return bodyAr || bodyEn;
  if (template.languageMode === "bilingual") return [bodyEn, bodyAr].filter(Boolean).join("\n\n");
  return bodyEn || bodyAr;
}

function selectedTemplateMedia(template?: { includeMedia?: boolean | null; mediaUrl?: string | null } | null) {
  if (!template?.includeMedia) return null;
  const mediaUrl = template.mediaUrl?.trim();
  if (!mediaUrl || mediaUrl.startsWith("attached://")) return null;
  return mediaUrl;
}

async function assertExpectedPersonalSender(settings: ReturnType<typeof getSettings>) {
  const status = await assertWhatsAppReady();
  const expected = settings.personalSenderPhone.trim();
  if (!expected) return status;
  const expectedPhone = normalizePhone(expected, settings.defaultCountryCode);
  const linkedPhone = status.accountPhone ? normalizePhone(status.accountPhone, settings.defaultCountryCode) : "";
  if (!linkedPhone) throw new Error(`WhatsApp is ready, but the linked sender number is unknown. Required sender: ${expectedPhone}`);
  if (linkedPhone !== expectedPhone) {
    throw new Error(`Wrong WhatsApp sender linked. Required +${expectedPhone}, current +${linkedPhone}.`);
  }
  return status;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function syncCampaignCounts(campaignId: string, status?: "READY" | "SENT" | "FAILED") {
  const [totalCount, sentCount, failedCount] = await Promise.all([
    prisma.contact.count({ where: { campaignId } }),
    prisma.message.count({ where: { campaignId, status: "SENT" } }),
    prisma.message.count({ where: { campaignId, status: "FAILED" } }),
  ]);

  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      totalCount,
      sentCount,
      failedCount,
      ...(status ? { status } : {}),
    },
  });
}

function metaInboundMessageText(message: Record<string, unknown>) {
  const text = message.text as { body?: unknown } | undefined;
  const button = message.button as { text?: unknown; payload?: unknown } | undefined;
  const interactive = message.interactive as {
    button_reply?: { title?: unknown; id?: unknown };
    list_reply?: { title?: unknown; id?: unknown };
  } | undefined;
  return String(
    text?.body
      ?? button?.text
      ?? button?.payload
      ?? interactive?.button_reply?.title
      ?? interactive?.button_reply?.id
      ?? interactive?.list_reply?.title
      ?? interactive?.list_reply?.id
      ?? "",
  ).trim();
}

setIncomingWhatsAppHandler(async ({ from, body }) => {
  const settings = getSettings();
  const result = await recordInboundRsvpFromPhone(prisma, from, body, settings.defaultCountryCode);
  if (result.matched) {
    console.log(`RSVP ${result.response} recorded from WhatsApp reply by +${result.phone}`);
  }
});

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
    provider: z.enum(["personal", "meta"]).optional(),
    defaultCountryCode: z.string().min(1).optional(),
    personalSenderPhone: z.string().optional(),
    meta: z.object({
      graphVersion: z.string().min(1).optional(),
      phoneNumberId: z.string().optional(),
      accessToken: z.string().optional(),
      appSecret: z.string().optional(),
      verifyToken: z.string().optional(),
      sendMode: z.enum(["text", "template"]).optional(),
      templateName: z.string().optional(),
      templateLanguage: z.string().optional(),
    }).optional(),
  });
  const current = getSettings();
  const data = schema.parse(req.body);
  const next = {
    ...current,
    provider: data.provider ?? current.provider,
    defaultCountryCode: data.defaultCountryCode ?? current.defaultCountryCode,
    personalSenderPhone: data.personalSenderPhone === undefined
      ? current.personalSenderPhone
      : data.personalSenderPhone.trim()
        ? normalizePhone(data.personalSenderPhone, data.defaultCountryCode ?? current.defaultCountryCode)
        : "",
    meta: {
      ...current.meta,
      ...(data.meta ?? {}),
      accessToken: data.meta?.accessToken === "configured" ? current.meta.accessToken : data.meta?.accessToken ?? current.meta.accessToken,
      appSecret: data.meta?.appSecret === "configured" ? current.meta.appSecret : data.meta?.appSecret ?? current.meta.appSecret,
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

app.post("/api/whatsapp/test", async (req, res) => {
  const schema = z.object({
    phone: z.string().min(1),
    message: z.string().min(1).default("Hamza & Shouq WhatsApp API test."),
  });
  const input = schema.parse(req.body);
  const settings = getSettings();
  try {
    if (settings.provider === "personal") await assertExpectedPersonalSender(settings);
    const waMessage = settings.provider === "meta"
      ? await sendMetaWhatsAppMessage(input.phone, input.message, null, settings)
      : await sendWhatsAppMessage(input.phone, input.message);
    res.json({
      ok: true,
      provider: settings.provider,
      id: typeof waMessage.id === "string" ? waMessage.id : waMessage.id.id,
    });
  } catch (error) {
    res.status(settings.provider === "personal" ? 409 : 502).json({
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp test send failed",
    });
  }
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
      for (const inbound of change.value?.messages ?? []) {
        const from = String(inbound.from ?? "");
        const text = metaInboundMessageText(inbound);
        if (!from || !text) continue;
        await recordInboundRsvpFromPhone(prisma, from, text, settings.defaultCountryCode);
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

const templateSchema = z.object({
  name: z.string().min(1),
  type: z.string().default("wedding_invitation"),
  languageMode: z.string().default("english_only"),
  bodyEn: z.string().min(1),
  bodyAr: z.string().optional().nullable(),
  mediaUrl: z.string().optional().nullable(),
  mediaType: z.string().optional().nullable(),
  guestNameMode: z.string().default("auto"),
  manualGuestName: z.string().optional().nullable(),
  attendeesCountMode: z.string().default("none"),
  manualAttendeesCount: z.string().optional().nullable(),
  includeRsvpLink: z.boolean().default(true),
  includeLocationLink: z.boolean().default(false),
  includeMedia: z.boolean().default(false),
  locationLink: z.string().optional().nullable(),
  hostNames: z.string().optional().nullable(),
  weddingDate: z.string().optional().nullable(),
  venue: z.string().optional().nullable(),
  variablesUsed: z.array(z.string()).default([]),
});

function serializeTemplate(data: ReturnType<typeof templateSchema.parse>) {
  return { ...data, variablesUsed: JSON.stringify(data.variablesUsed ?? []) };
}

function deserializeTemplate<T extends { variablesUsed: string }>(t: T) {
  let variablesUsed: string[] = [];
  try { variablesUsed = JSON.parse(t.variablesUsed) as string[]; } catch { variablesUsed = []; }
  return { ...t, variablesUsed };
}

app.get("/api/templates", async (_req, res) => {
  const templates = await prisma.template.findMany({ orderBy: { createdAt: "desc" } });
  res.json(templates.map(deserializeTemplate));
});

app.post("/api/templates", async (req, res) => {
  const data = templateSchema.parse(req.body);
  const created = await prisma.template.create({ data: serializeTemplate(data) });
  res.json(deserializeTemplate(created));
});

app.put("/api/templates/:id", async (req, res) => {
  const data = templateSchema.parse(req.body);
  const updated = await prisma.template.update({ where: { id: routeParam(req.params.id) }, data: serializeTemplate(data) });
  res.json(deserializeTemplate(updated));
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
      customFields: jsonInput(contact.customFields),
    })),
  });

  const totalCount = await prisma.contact.count({ where: { campaignId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { totalCount, status: "READY" } });
  res.json({ imported: contacts.length, totalCount });
});

// ── Detect tabs (no import) ─────────────────────────────────────────────────
app.post("/api/campaigns/:id/contacts/google-sheet/detect", async (req, res) => {
  const { url } = z.object({ url: z.string() }).parse(req.body);
  const result = await detectGoogleSheetTabs(url);
  res.json(result);
});

// ── Import selected tabs with per-tab metadata ──────────────────────────────
app.post("/api/campaigns/:id/contacts/google-sheet", async (req, res) => {
  const schema = z.object({
    url: z.string().optional(),
    sheetId: z.string().optional(),
    gid: z.string().optional(),
    selectedTabs: z.array(z.string()).optional(),
  });
  const campaignId = routeParam(req.params.id);
  const settings = getSettings();
  const input = schema.parse(req.body);
  const importBatchId = randomUUID();
  const importedAt = new Date();

  // Google Sheet imports are explicit tab imports only. This prevents a changed sheet
  // from appending to an old campaign list or importing every tab by default.
  if (input.url) {
    const selectedTabs = (input.selectedTabs ?? []).map((tab) => tab.trim()).filter(Boolean);
    if (!selectedTabs.length) return res.status(400).json({ error: "Select at least one detected sheet tab before importing." });
    const tabs = await importGoogleSheetTabs(input.url, selectedTabs);
    if (tabs.length !== selectedTabs.length) {
      const found = new Set(tabs.map((tab) => tab.name));
      const missing = selectedTabs.filter((tab) => !found.has(tab));
      return res.status(400).json({ error: `Selected sheet tab not found: ${missing.join(", ")}` });
    }
    const tabResults: Array<{ name: string; imported: number; error?: string }> = [];
    let totalImported = 0;
    const rows: Array<{
      campaignId: string;
      name: string;
      phone: string;
      customFields: string;
      sourceTab: string;
      listOwner: string;
      importBatchId: string;
      importedAt: Date;
    }> = [];

    for (const tab of tabs) {
      rows.push(...tab.contacts.map((c) => ({
        campaignId,
        name: c.name,
        phone: normalizePhone(c.phone, settings.defaultCountryCode),
        customFields: jsonInput(c.customFields),
        sourceTab: tab.name,
        listOwner: tab.name,
        importBatchId,
        importedAt,
      })));
      tabResults.push({ name: tab.name, imported: tab.contacts.length });
      totalImported += tab.contacts.length;
    }
    if (!rows.length) return res.status(400).json({ error: "Selected sheet tabs were readable, but no contacts with both name and phone were found. Existing campaign contacts were not changed." });

    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({ where: { campaignId } });
      await tx.contact.deleteMany({ where: { campaignId } });
      if (rows.length) await tx.contact.createMany({ data: rows });
      await tx.campaign.update({ where: { id: campaignId }, data: { totalCount: rows.length, status: rows.length ? "READY" : "DRAFT" } });
    });
    const totalCount = rows.length;
    return res.json({ imported: totalImported, totalCount, importBatchId, tabs: tabResults });
  }

  // Legacy single-sheet flow
  const preview = await readGoogleSheetPreview(input);
  const contacts = preview.contacts.map((c) => ({ ...c, phone: normalizePhone(c.phone, settings.defaultCountryCode) }));
  await prisma.contact.createMany({
    data: contacts.map((c) => ({
      campaignId, name: c.name, phone: c.phone,
      customFields: jsonInput(c.customFields),
      importBatchId, importedAt,
    })),
  });
  const totalCount = await prisma.contact.count({ where: { campaignId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { totalCount, status: totalCount ? "READY" : "DRAFT" } });
  res.json({
    imported: contacts.length, totalCount,
    headers: preview.headers, worksheets: preview.worksheets,
    contacts: contacts.map((c, i) => ({ id: `${campaignId}-${i}`, name: c.name, phone: c.phone })),
    message: contacts.length
      ? `Read ${contacts.length} contacts from ${preview.worksheets.length} worksheets.`
      : `No contacts with name+phone found.`,
  });
});

// ── List distinct source tabs for a campaign ────────────────────────────────
app.get("/api/campaigns/:id/contacts/tabs", async (req, res) => {
  const campaignId = routeParam(req.params.id);
  const rows = await prisma.contact.groupBy({
    by: ["sourceTab"],
    where: { campaignId, sourceTab: { not: null } },
    _count: { id: true },
    orderBy: { sourceTab: "asc" },
  });
  res.json(rows.map((r) => ({ name: r.sourceTab!, count: r._count.id })));
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

  for (const contact of campaign.contacts) {
    const existing = await prisma.message.findFirst({
      where: { campaignId: campaign.id, contactId: contact.id },
      include: { rsvpToken: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing?.status === "SENT") continue;

    const token = existing?.rsvpToken?.token ?? randomUUID();
    const rsvpLinks = createRsvpLinks(apiUrl(), token);
    const variables = resolveVariables({
      contact: { name: contact.name, phone: contact.phone, customFields: parseCustomFields(contact.customFields) },
      template: campaign.template,
      rsvpLink: rsvpLinks.view,
      rsvpYesLink: rsvpLinks.yes,
      rsvpNoLink: rsvpLinks.no,
    });
    const bodySource = selectedTemplateBody(campaign.template);
    const renderedBody = renderTemplate(bodySource, variables);
    const body = appendRsvpActionLinks(bodySource, renderedBody, rsvpLinks, campaign.template.includeRsvpLink);
    const message = existing
      ? await prisma.message.update({
          where: { id: existing.id },
          data: { body, status: "PENDING", error: null, waMessageId: null, sentAt: null },
        })
      : await prisma.message.create({
          data: {
            campaignId: campaign.id,
            contactId: contact.id,
            body,
          },
        });

    if (!existing?.rsvpToken) {
      await prisma.rsvpToken.create({ data: { messageId: message.id, contactId: contact.id, token } });
    }
  }

  await syncCampaignCounts(campaign.id, "READY");
  res.json({ prepared: campaign.contacts.length });
});

app.post("/api/campaigns/:id/send", async (req, res) => {
  const delayMs = Number(process.env.SEND_DELAY_MS ?? 4000);
  const dailyLimit = Number(process.env.DAILY_SEND_LIMIT ?? 100);
  const campaignId = routeParam(req.params.id);
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { template: true } });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (activeSends.has(campaign.id)) return res.status(409).json({ error: "Campaign is already sending" });
  const settings = getSettings();
  if (settings.provider === "personal") {
    try {
      await assertExpectedPersonalSender(settings);
    } catch (error) {
      const queued = await prisma.message.count({ where: { campaignId: campaign.id, status: "PENDING" } });
      return res.status(409).json({
        queued,
        delayMs,
        error: error instanceof Error ? error.message : "WhatsApp is not ready",
      });
    }
  }

  const pending = await prisma.message.findMany({
    where: { campaignId: campaign.id, status: "PENDING" },
    include: { contact: true },
    take: dailyLimit,
    orderBy: { createdAt: "asc" },
  });
  if (!pending.length) {
    await syncCampaignCounts(campaign.id, "READY");
    return res.json({ queued: 0, delayMs });
  }

  activeSends.add(campaign.id);
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "SENDING" } });
  res.json({ queued: pending.length, delayMs });

  setImmediate(async () => {
    try {
      for (const message of pending) {
        try {
          const waMessage =
            settings.provider === "meta"
              ? await sendMetaWhatsAppMessage(message.contact.phone, message.body, selectedTemplateMedia(campaign.template), settings)
              : await sendWhatsAppMessage(message.contact.phone, message.body, selectedTemplateMedia(campaign.template));
          await prisma.message.update({
            where: { id: message.id },
            data: { status: "SENT", waMessageId: typeof waMessage.id === "string" ? waMessage.id : waMessage.id.id, sentAt: new Date(), error: null },
          });
        } catch (error) {
          await prisma.message.update({
            where: { id: message.id },
            data: { status: "FAILED", error: error instanceof Error ? error.message : "Send failed" },
          });
        }
        await delay(delayMs);
      }

      const [remaining, failedCount] = await Promise.all([
        prisma.message.count({ where: { campaignId: campaign.id, status: "PENDING" } }),
        prisma.message.count({ where: { campaignId: campaign.id, status: "FAILED" } }),
      ]);
      const finalStatus = remaining > 0 ? "READY" : failedCount > 0 ? "FAILED" : "SENT";
      await syncCampaignCounts(campaign.id, finalStatus);
      if (finalStatus === "SENT") {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { sentAt: new Date() } });
      }
    } finally {
      activeSends.delete(campaign.id);
    }
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
  const tokenValue = routeParam(req.params.token);
  const requestedResponse = parseRsvpResponseInput(req.query.response);
  if (req.query.response !== undefined && !requestedResponse) return res.status(400).send("Invalid RSVP response");

  if (requestedResponse) {
    try {
      const saved = await saveRsvpTokenResponse(prisma, tokenValue, requestedResponse);
      return res.send(rsvpConfirmationHtml(saved.contact.name, requestedResponse));
    } catch {
      return res.status(404).send("RSVP link not found");
    }
  }

  const token = await prisma.rsvpToken.findUnique({ where: { token: tokenValue }, include: { contact: true } });
  if (!token) return res.status(404).send("RSVP link not found");

  res.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RSVP</title><style>body{font-family:Arial,sans-serif;background:#f6f8f5;color:#111;margin:0;display:grid;place-items:center;min-height:100vh}.card{max-width:520px;background:white;border:1px solid #dfe7dc;padding:32px;border-radius:18px;box-shadow:0 20px 70px #0001}.actions{display:flex;gap:12px;margin-top:24px}button{border:0;border-radius:999px;padding:14px 18px;font-weight:700;cursor:pointer}.yes{background:#25d366}.no{background:#eee}</style></head>
<body><main class="card"><p>Hamza and Shouq Wedding</p><h1>Hi ${escapeHtml(token.contact.name)}, will you attend?</h1><form class="actions" method="post"><button class="yes" name="response" value="YES">Attending</button><button class="no" name="response" value="NO">Not attending</button></form></main></body></html>`);
});

app.post("/rsvp/:token", express.urlencoded({ extended: false }), async (req, res) => {
  const response = parseRsvpResponseInput(req.body.response);
  if (!response) return res.status(400).send("Invalid RSVP response");
  try {
    const token = await saveRsvpTokenResponse(prisma, routeParam(req.params.token), response);
    res.send(rsvpConfirmationHtml(token.contact.name, response));
  } catch {
    res.status(404).send("RSVP link not found");
  }
});

const port = Number(process.env.API_PORT ?? 4100);
const server = app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
  startReminderScheduler();
});

server.on("error", (error) => {
  console.error(error);
});
