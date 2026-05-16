import { ReminderAction, ReminderStatus, ReminderType, type RsvpResponse } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { getPrisma } from "./db.js";
import { actorKey, canAccessReminderTabs, requireReminders, scopedTabsForActor } from "./reminder-access.js";

const prisma = getPrisma();
export const remindersRouter = Router();

function jsonString(value: unknown) {
  return JSON.stringify(value);
}

function parseStringArray(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function serializeCampaign<T extends { targetSourceTabs: string | string[] | null | undefined }>(campaign: T) {
  return {
    ...campaign,
    targetSourceTabs: parseStringArray(campaign.targetSourceTabs),
  };
}

function responseToStatus(response: RsvpResponse | null | undefined) {
  if (response === "YES") return "YES";
  if (response === "NO") return "NO";
  return "PENDING";
}

function isEligible(type: ReminderType, response: RsvpResponse | null | undefined) {
  if (response === "NO") return false;
  if (type === "CONFIRMED") return response === "YES";
  if (type === "PENDING") return response === null || response === undefined;
  return response === "YES" || response === null || response === undefined;
}

function futureDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date <= new Date()) throw new Error("scheduledAt must be in the future");
  return date;
}

async function audit(reminderCampaignId: string, action: ReminderAction, performedBy: string, metadata?: unknown) {
  await prisma.reminderAuditLog.create({
    data: {
      reminderCampaignId,
      action,
      performedBy,
      metadata: metadata ? jsonString(metadata) : undefined,
    },
  });
}

async function latestRsvpRows() {
  const rows = await prisma.rsvpToken.findMany({
    include: {
      contact: true,
      message: { include: { campaign: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.contactId && !latest.has(row.contactId)) latest.set(row.contactId, row);
  }
  return [...latest.values()];
}

async function recipientCandidates(type: ReminderType, targetSourceTabs: string[]) {
  const tabs = new Set(targetSourceTabs);
  return (await latestRsvpRows())
    .filter((row) => row.contact.phone.trim())
    .filter((row) => !tabs.size || (row.contact.sourceTab && tabs.has(row.contact.sourceTab)))
    .filter((row) => isEligible(type, row.response));
}

function countsBySource(rows: Awaited<ReturnType<typeof latestRsvpRows>>, targetSourceTabs: string[]) {
  const tabs = new Set(targetSourceTabs);
  const scoped = rows.filter((row) => !tabs.size || (row.contact.sourceTab && tabs.has(row.contact.sourceTab)));
  const bySource = new Map<string, { name: string; confirmed: number; pending: number; excluded: number }>();
  for (const row of scoped) {
    const name = row.contact.sourceTab ?? "Unassigned";
    const item = bySource.get(name) ?? { name, confirmed: 0, pending: 0, excluded: 0 };
    if (row.response === "YES") item.confirmed++;
    else if (row.response === "NO") item.excluded++;
    else item.pending++;
    bySource.set(name, item);
  }
  return [...bySource.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const typeSchema = z.enum(["CONFIRMED", "PENDING", "CONFIRMED_AND_PENDING"]);

remindersRouter.get("/", async (req, res) => {
  if (!(await requireReminders(req, res, "VIEW"))) return;
  const actor = actorKey(req);
  const campaigns = await prisma.reminderCampaign.findMany({
    include: { template: true, recipients: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(campaigns.filter((campaign) => canAccessReminderTabs(actor, parseStringArray(campaign.targetSourceTabs))).map((campaign) => ({
    ...serializeCampaign(campaign),
    counts: {
      total: campaign.recipients.length,
      sent: campaign.recipients.filter((recipient) => recipient.sendStatus === "SENT").length,
      failed: campaign.recipients.filter((recipient) => recipient.sendStatus === "FAILED").length,
      skipped: campaign.recipients.filter((recipient) => recipient.sendStatus === "SKIPPED").length,
      pending: campaign.recipients.filter((recipient) => recipient.sendStatus === "PENDING").length,
    },
  })));
});

remindersRouter.post("/preview", async (req, res) => {
  if (!(await requireReminders(req, res, "MANAGE"))) return;
  const body = z.object({
    reminderType: typeSchema,
    targetSourceTabs: z.array(z.string()).optional().default([]),
    campaignId: z.string().optional(),
  }).parse(req.body);
  const targetSourceTabs = scopedTabsForActor(actorKey(req), body.targetSourceTabs);
  const rows = await latestRsvpRows();
  const bySourceTab = countsBySource(rows, targetSourceTabs);
  const confirmed = bySourceTab.reduce((sum, row) => sum + row.confirmed, 0);
  const pending = bySourceTab.reduce((sum, row) => sum + row.pending, 0);
  const excluded = bySourceTab.reduce((sum, row) => sum + row.excluded, 0);
  const total = body.reminderType === "CONFIRMED" ? confirmed : body.reminderType === "PENDING" ? pending : confirmed + pending;
  res.json({ total, confirmed, pending, excluded, bySourceTab });
});

remindersRouter.post("/", async (req, res) => {
  if (!(await requireReminders(req, res, "MANAGE"))) return;
  const body = z.object({
    name: z.string().min(1),
    reminderType: typeSchema,
    templateId: z.string().min(1),
    targetSourceTabs: z.array(z.string()).optional().default([]),
    scheduledAt: z.string().min(1),
    timezone: z.string().optional().default("Asia/Amman"),
  }).parse(req.body);
  const scheduledAt = futureDate(body.scheduledAt);
  const targetSourceTabs = scopedTabsForActor(actorKey(req), body.targetSourceTabs);
  const campaign = await prisma.reminderCampaign.create({
    data: {
      name: body.name,
      reminderType: body.reminderType,
      templateId: body.templateId,
      targetSourceTabs: jsonString(targetSourceTabs),
      scheduledAt,
      timezone: body.timezone,
      createdBy: actorKey(req),
      status: "DRAFT",
    },
  });
  await audit(campaign.id, ReminderAction.CREATED, actorKey(req), { targetSourceTabs });
  res.json(serializeCampaign(campaign));
});

remindersRouter.get("/:id", async (req, res) => {
  if (!(await requireReminders(req, res, "VIEW"))) return;
  const campaign = await prisma.reminderCampaign.findUnique({
    where: { id: String(req.params.id) },
    include: {
      template: true,
      recipients: { orderBy: { createdAt: "asc" } },
      rescheduleLogs: { orderBy: { changedAt: "desc" } },
      auditLogs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!campaign || !canAccessReminderTabs(actorKey(req), parseStringArray(campaign.targetSourceTabs))) return res.status(403).json({});
  res.json(serializeCampaign(campaign));
});

remindersRouter.post("/:id/schedule", async (req, res) => {
  if (!(await requireReminders(req, res, "MANAGE"))) return;
  const id = String(req.params.id);
  const campaign = await prisma.reminderCampaign.findUnique({ where: { id }, include: { recipients: true } });
  if (!campaign || !canAccessReminderTabs(actorKey(req), parseStringArray(campaign.targetSourceTabs))) return res.status(403).json({});
  const targetSourceTabs = scopedTabsForActor(actorKey(req), parseStringArray(campaign.targetSourceTabs));
  const rows = await recipientCandidates(campaign.reminderType, targetSourceTabs);
  await prisma.$transaction([
    prisma.reminderRecipient.deleteMany({ where: { reminderCampaignId: id } }),
    prisma.reminderRecipient.createMany({
      data: rows.map((row) => ({
        reminderCampaignId: id,
        contactId: row.contactId,
        phone: row.contact.phone,
        name: row.contact.name,
        sourceTab: row.contact.sourceTab,
        rsvpStatusAtScheduleTime: responseToStatus(row.response),
      })),
    }),
    prisma.reminderCampaign.update({ where: { id }, data: { status: "SCHEDULED" } }),
  ]);
  await audit(id, ReminderAction.SCHEDULED, actorKey(req), { recipientCount: rows.length });
  res.json({ scheduled: true, recipients: rows.length });
});

remindersRouter.put("/:id/reschedule", async (req, res) => {
  if (!(await requireReminders(req, res, "MANAGE"))) return;
  const body = z.object({ scheduledAt: z.string().min(1), reason: z.string().optional().nullable() }).parse(req.body);
  const scheduledAt = futureDate(body.scheduledAt);
  const id = String(req.params.id);
  const campaign = await prisma.reminderCampaign.findUnique({ where: { id } });
  if (!campaign || !canAccessReminderTabs(actorKey(req), parseStringArray(campaign.targetSourceTabs))) return res.status(403).json({});
  if (!["SCHEDULED", "RESCHEDULED"].includes(campaign.status)) return res.status(400).json({ error: "Reminder cannot be rescheduled" });
  await prisma.$transaction([
    prisma.reminderRescheduleLog.create({
      data: { reminderCampaignId: id, oldScheduledAt: campaign.scheduledAt, newScheduledAt: scheduledAt, changedBy: actorKey(req), reason: body.reason },
    }),
    prisma.reminderCampaign.update({ where: { id }, data: { scheduledAt, status: "RESCHEDULED" } }),
  ]);
  await audit(id, ReminderAction.RESCHEDULED, actorKey(req), { oldScheduledAt: campaign.scheduledAt, newScheduledAt: scheduledAt, reason: body.reason });
  res.json({ rescheduled: true });
});

remindersRouter.post("/:id/cancel", async (req, res) => {
  if (!(await requireReminders(req, res, "MANAGE"))) return;
  const id = String(req.params.id);
  const campaign = await prisma.reminderCampaign.findUnique({ where: { id } });
  if (!campaign || !canAccessReminderTabs(actorKey(req), parseStringArray(campaign.targetSourceTabs))) return res.status(403).json({});
  if (["SENDING", "SENT"].includes(campaign.status)) return res.status(400).json({ error: "Reminder cannot be cancelled" });
  await prisma.reminderCampaign.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: actorKey(req) } });
  await audit(id, ReminderAction.CANCELLED, actorKey(req));
  res.json({ cancelled: true });
});

remindersRouter.get("/:id/recipients", async (req, res) => {
  if (!(await requireReminders(req, res, "VIEW"))) return;
  const campaign = await prisma.reminderCampaign.findUnique({ where: { id: String(req.params.id) }, select: { targetSourceTabs: true } });
  if (!campaign || !canAccessReminderTabs(actorKey(req), parseStringArray(campaign.targetSourceTabs))) return res.status(403).json({});
  const status = typeof req.query.sendStatus === "string" ? req.query.sendStatus.toUpperCase() : undefined;
  res.json(await prisma.reminderRecipient.findMany({
    where: {
      reminderCampaignId: String(req.params.id),
      ...(status && ["PENDING", "SENT", "FAILED", "SKIPPED"].includes(status) ? { sendStatus: status as never } : {}),
    },
    orderBy: { createdAt: "asc" },
  }));
});

remindersRouter.get("/:id/reschedule-log", async (req, res) => {
  if (!(await requireReminders(req, res, "VIEW"))) return;
  const campaign = await prisma.reminderCampaign.findUnique({ where: { id: String(req.params.id) }, select: { targetSourceTabs: true } });
  if (!campaign || !canAccessReminderTabs(actorKey(req), parseStringArray(campaign.targetSourceTabs))) return res.status(403).json({});
  res.json(await prisma.reminderRescheduleLog.findMany({
    where: { reminderCampaignId: String(req.params.id) },
    orderBy: { changedAt: "desc" },
  }));
});
