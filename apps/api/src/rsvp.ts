import type { PrismaClient } from "@prisma/client";

import { normalizePhone } from "./template.js";

export type RsvpResponseValue = "YES" | "NO";

export type RsvpLinks = {
  view: string;
  yes: string;
  no: string;
};

const RSVP_ACTION_PLACEHOLDER_PATTERN = /\{\{\s*(rsvp_yes_link|rsvp_no_link|attending_link|not_attending_link)\s*\}\}/i;

const yesPhrases = [
  "yes",
  "attending",
  "i will attend",
  "will attend",
  "coming",
  "confirm",
  "confirmed",
  "حاضر",
  "ساحضر",
  "سأحضر",
  "بحضر",
  "جاي",
  "جاية",
  "اكيد",
  "أكيد",
  "تمام",
  "ان شاء الله",
  "إن شاء الله",
];

const noPhrases = [
  "no",
  "not attending",
  "will not attend",
  "can't attend",
  "cant attend",
  "cannot attend",
  "sorry",
  "decline",
  "declined",
  "لا",
  "لن احضر",
  "لن أحضر",
  "ما بقدر",
  "مش قادر",
  "غير قادر",
  "اعتذر",
  "أعتذر",
  "معتذر",
  "اعتذار",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeReplyText(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseMatches(text: string, phrase: string) {
  const normalizedPhrase = normalizeReplyText(phrase);
  if (!normalizedPhrase) return false;
  if (/^[a-z0-9'\s]+$/i.test(normalizedPhrase)) {
    return new RegExp(`(^|[^a-z0-9'])${escapeRegExp(normalizedPhrase)}(?=$|[^a-z0-9'])`, "i").test(text);
  }
  return text.includes(normalizedPhrase);
}

export function createRsvpLinks(apiBaseUrl: string, token: string): RsvpLinks {
  const base = `${apiBaseUrl.replace(/\/$/, "")}/rsvp/${encodeURIComponent(token)}`;
  return {
    view: base,
    yes: `${base}?response=YES`,
    no: `${base}?response=NO`,
  };
}

export function appendRsvpActionLinks(bodySource: string, renderedBody: string, links: RsvpLinks, includeRsvpLink: boolean | null | undefined) {
  if (includeRsvpLink === false) return renderedBody;
  if (RSVP_ACTION_PLACEHOLDER_PATTERN.test(bodySource)) return renderedBody;
  return `${renderedBody.trimEnd()}\n\nAttending: ${links.yes}\nNot attending: ${links.no}`;
}

export function parseRsvpResponseInput(value: unknown): RsvpResponseValue | null {
  const response = Array.isArray(value) ? value[0] : value;
  if (response === "YES" || response === "NO") return response;
  const normalized = String(response ?? "").trim().toUpperCase();
  if (normalized === "YES" || normalized === "ATTENDING") return "YES";
  if (normalized === "NO" || normalized === "NOT_ATTENDING" || normalized === "NOT ATTENDING") return "NO";
  return null;
}

export function parseIncomingRsvpReply(text: string): RsvpResponseValue | null {
  const normalized = normalizeReplyText(text);
  if (!normalized) return null;
  const isNo = noPhrases.some((phrase) => phraseMatches(normalized, phrase));
  const isYes = yesPhrases.some((phrase) => phraseMatches(normalized, phrase));
  if (isNo) return "NO";
  if (isYes) return "YES";
  return null;
}

export function rsvpConfirmationHtml(contactName: string, response: RsvpResponseValue) {
  const safeName = escapeHtml(contactName);
  const label = response === "YES" ? "attending" : "not attending";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSVP Saved</title><style>body{font-family:Arial,sans-serif;background:#f6f8f5;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:white;padding:32px;border-radius:18px;border:1px solid #dfe7dc;max-width:520px}.status{font-weight:700}</style></head><body><main class="card"><h1>Thank you, ${safeName}.</h1><p>Your response has been recorded as <span class="status">${label}</span>.</p></main></body></html>`;
}

export async function saveRsvpTokenResponse(prisma: PrismaClient, token: string, response: RsvpResponseValue) {
  return prisma.rsvpToken.update({
    where: { token },
    data: { response, clickedAt: new Date() },
    include: { contact: true, message: { select: { campaignId: true } } },
  });
}

export async function recordInboundRsvpFromPhone(
  prisma: PrismaClient,
  phone: string,
  text: string,
  defaultCountryCode = "962",
) {
  const response = parseIncomingRsvpReply(text);
  if (!response) return { matched: false, response: null, reason: "unrecognized" as const };

  const normalizedPhone = normalizePhone(phone, defaultCountryCode);
  const token = await prisma.rsvpToken.findFirst({
    where: { contact: { phone: normalizedPhone } },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
  });

  if (!token) return { matched: false, response, reason: "no_token" as const, phone: normalizedPhone };

  const updated = await saveRsvpTokenResponse(prisma, token.token, response);
  return { matched: true, response, token: updated, phone: normalizedPhone };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
