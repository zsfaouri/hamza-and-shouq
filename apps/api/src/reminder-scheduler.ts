import { ReminderAction, type ReminderCampaign, type ReminderRecipient } from "@prisma/client";

import { getPrisma } from "./db.js";
import { sendMetaWhatsAppMessage } from "./meta-whatsapp.js";
import { getSettings } from "./settings.js";
import { renderTemplate, templateMessageBody } from "./template.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

const prisma = getPrisma();
const activeReminderSends = new Set<string>();
let started = false;

function parseCustomFields(value: unknown) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function jsonString(value: unknown) {
  return JSON.stringify(value);
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

async function latestRsvpStatus(contactId: string) {
  const token = await prisma.rsvpToken.findFirst({
    where: { contactId },
    orderBy: { createdAt: "desc" },
  });
  return token?.response ?? null;
}

function remainsEligible(campaign: ReminderCampaign, response: "YES" | "NO" | null) {
  if (response === "NO") return false;
  if (campaign.reminderType === "CONFIRMED") return response === "YES";
  if (campaign.reminderType === "PENDING") return response === null;
  return response === "YES" || response === null;
}

async function sendRecipient(campaign: ReminderCampaign & { template: { bodyEn: string; bodyAr?: string | null; mediaUrl?: string | null } }, recipient: ReminderRecipient) {
  const currentRsvp = await latestRsvpStatus(recipient.contactId);
  if (!remainsEligible(campaign, currentRsvp)) {
    await prisma.reminderRecipient.update({
      where: { id: recipient.id },
      data: { sendStatus: "SKIPPED", failedReason: "RSVP status excluded at send time" },
    });
    await audit(campaign.id, ReminderAction.RECIPIENT_SKIPPED, "scheduler", { contactId: recipient.contactId, phone: recipient.phone, reason: "declined" });
    return;
  }

  const contact = await prisma.contact.findUnique({ where: { id: recipient.contactId } });
  if (!contact) {
    await prisma.reminderRecipient.update({
      where: { id: recipient.id },
      data: { sendStatus: "FAILED", failedReason: "Contact not found" },
    });
    await audit(campaign.id, ReminderAction.RECIPIENT_FAILED, "scheduler", { contactId: recipient.contactId, phone: recipient.phone, reason: "missing_contact" });
    return;
  }

  const body = renderTemplate(templateMessageBody(campaign.template), {
    ...parseCustomFields(contact.customFields),
    name: recipient.name,
    phone: recipient.phone,
  });

  try {
    const settings = getSettings();
    if (settings.provider === "meta") {
      await sendMetaWhatsAppMessage(recipient.phone, body, campaign.template.mediaUrl, settings);
    } else {
      await sendWhatsAppMessage(recipient.phone, body, campaign.template.mediaUrl);
    }
    await prisma.reminderRecipient.update({
      where: { id: recipient.id },
      data: { sendStatus: "SENT", sentAt: new Date(), failedReason: null },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Reminder send failed";
    await prisma.reminderRecipient.update({
      where: { id: recipient.id },
      data: { sendStatus: "FAILED", failedReason: reason },
    });
    await audit(campaign.id, ReminderAction.RECIPIENT_FAILED, "scheduler", { contactId: recipient.contactId, phone: recipient.phone, reason });
  }
}

async function processCampaign(campaignId: string) {
  if (activeReminderSends.has(campaignId)) return;
  activeReminderSends.add(campaignId);
  try {
    const campaign = await prisma.reminderCampaign.update({
      where: { id: campaignId },
      data: { status: "SENDING" },
      include: { template: true, recipients: { where: { sendStatus: "PENDING" }, orderBy: { createdAt: "asc" } } },
    });
    await audit(campaign.id, ReminderAction.SENDING_STARTED, "scheduler", { pending: campaign.recipients.length });
    for (const recipient of campaign.recipients) {
      await sendRecipient(campaign, recipient);
    }

    const [failed, pending] = await Promise.all([
      prisma.reminderRecipient.count({ where: { reminderCampaignId: campaign.id, sendStatus: "FAILED" } }),
      prisma.reminderRecipient.count({ where: { reminderCampaignId: campaign.id, sendStatus: "PENDING" } }),
    ]);
    const status = pending > 0 || failed > 0 ? "FAILED" : "SENT";
    await prisma.reminderCampaign.update({ where: { id: campaign.id }, data: { status } });
    await audit(campaign.id, ReminderAction.SENDING_COMPLETED, "scheduler", { failed, pending, status });
  } finally {
    activeReminderSends.delete(campaignId);
  }
}

export async function processReminders() {
  const due = await prisma.reminderCampaign.findMany({
    where: {
      status: { in: ["SCHEDULED", "RESCHEDULED"] },
      scheduledAt: { lte: new Date() },
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
  });
  for (const campaign of due) {
    void processCampaign(campaign.id);
  }
}

export function startReminderScheduler() {
  if (started) return;
  started = true;
  const run = () => {
    void processReminders().catch((error) => {
      console.error("Reminder scheduler failed:", error instanceof Error ? error.message : error);
    });
  };
  run();
  setInterval(run, 60_000);
}
