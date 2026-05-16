import https from "node:https";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_ACCESS_USERS, type AccessUserRecord } from "@/lib/access-control";
import { initPersonalWhatsApp, personalWhatsAppStatus, sendPersonalWhatsAppMessage, waitForPersonalWhatsAppQr } from "@/lib/personal-whatsapp";

export type Template = {
  id: string;
  name: string;
  type: string;
  languageMode: string;
  bodyEn: string;
  bodyAr?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  guestNameMode: string;
  manualGuestName?: string | null;
  attendeesCountMode: string;
  manualAttendeesCount?: string | null;
  includeRsvpLink: boolean;
  includeLocationLink: boolean;
  includeMedia: boolean;
  locationLink?: string | null;
  hostNames?: string | null;
  weddingDate?: string | null;
  venue?: string | null;
  variablesUsed: string[];
  createdBy?: string | null;
};

export type Contact = {
  id: string;
  name: string;
  phone: string;
  customFields: Record<string, unknown>;
  sourceTab?: string | null;
  listOwner?: string | null;
  importBatchId?: string | null;
  importedAt?: string | null;
};

type GoogleSheetWorksheet = {
  title: string;
  gid: string;
};

type GoogleSheetWorksheetSummary = GoogleSheetWorksheet & {
  rowCount: number;
  contactCount: number;
  preview: Array<{ name: string; phone: string }>;
};

export type Message = {
  id: string;
  body: string;
  status: "PENDING" | "SENT" | "FAILED";
  error?: string | null;
  contact: Contact;
  rsvpToken?: { token?: string; response?: "YES" | "NO" | null; clickedAt?: string | null } | null;
};

export type Campaign = {
  id: string;
  name: string;
  status: "DRAFT" | "READY" | "SENDING" | "SENT" | "FAILED";
  totalCount: number;
  sentCount: number;
  failedCount: number;
  templateId: string;
  template?: Template | null;
  contacts: Contact[];
  messages: Message[];
};

export type Store = {
  templates: Template[];
  campaigns: Campaign[];
  settings: WhatsAppSettings;
  personalWhatsApp: PersonalWhatsAppSnapshot;
  accessUsers: AccessUserRecord[];
};

export type WhatsAppSettings = {
  provider: "personal" | "meta";
  personalBackendUrl: string;
  defaultCountryCode: string;
  personalSenderPhone: string;
  meta: {
    graphVersion: string;
    phoneNumberId: string;
    accessToken?: string;
    appSecret?: string;
    verifyToken: string;
    sendMode: "text" | "template";
    templateName: string;
    templateLanguage: string;
  };
};

type PersonalWhatsAppSnapshot = {
  state: string;
  qr: string | null;
  error: string | null;
  updatedAt: string;
  expiresAt: string;
};

type PersonalWhatsAppStatus = {
  state: string;
  qr: string | null;
  error?: string | null;
  accountPhone?: string | null;
  displayName?: string | null;
};

const starterTemplate: Template = {
  id: "starter-template",
  name: "Wedding Invite EN",
  type: "wedding_invitation",
  languageMode: "english_only",
  bodyEn: "Hi {{name}}, you're invited to Hamza and Shouq's wedding on {{date}} at {{venue}}.\n\nAttending: {{rsvp_yes_link}}\nNot attending: {{rsvp_no_link}}",
  bodyAr: "",
  mediaUrl: null,
  mediaType: null,
  guestNameMode: "auto",
  manualGuestName: null,
  attendeesCountMode: "none",
  manualAttendeesCount: null,
  includeRsvpLink: true,
  includeLocationLink: false,
  includeMedia: false,
  locationLink: null,
  hostNames: null,
  weddingDate: "",
  venue: "Amman",
  variablesUsed: ["name", "date", "venue", "rsvp_yes_link", "rsvp_no_link"],
  createdBy: "admin",
};

function withTemplateDefaults(template: Partial<Template>): Template {
  return {
    ...starterTemplate,
    ...template,
    id: template.id ?? id("template"),
    name: template.name ?? "Untitled template",
    bodyEn: template.bodyEn ?? "",
    bodyAr: template.bodyAr ?? null,
    mediaUrl: template.mediaUrl ?? null,
    mediaType: template.mediaType ?? null,
    variablesUsed: template.variablesUsed ?? [],
  };
}

const starterCampaignId = "starter-campaign";
const defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE ?? "962";
const defaultPersonalSenderPhone = process.env.PERSONAL_SENDER_PHONE ?? "962795941263";
const defaultGoogleSheetUrl = process.env.GOOGLE_SHEET_URL
  ?? process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL
  ?? "https://docs.google.com/spreadsheets/d/1021Z6KyT-dF97FVJAG3c4Nr6thASDpuhPu-hFC_fTA0/edit?usp=sharing";

function globalStore() {
  const globalWithStore = globalThis as typeof globalThis & { __hsStore?: Store };
  if (!globalWithStore.__hsStore) {
    globalWithStore.__hsStore = {
      templates: [starterTemplate],
      campaigns: [{
        id: starterCampaignId,
        name: "Wedding Invitations",
        status: "DRAFT",
        totalCount: 0,
        sentCount: 0,
        failedCount: 0,
        templateId: starterTemplate.id,
        template: starterTemplate,
        contacts: [],
        messages: [],
      }],
      settings: {
        provider: (process.env.WHATSAPP_PROVIDER === "meta" ? "meta" : "personal"),
        personalBackendUrl: process.env.PERSONAL_WHATSAPP_API_URL ?? "",
        defaultCountryCode,
        personalSenderPhone: defaultPersonalSenderPhone,
        meta: {
          graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
          phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? "",
          accessToken: process.env.META_ACCESS_TOKEN ?? "",
          appSecret: process.env.META_APP_SECRET ?? "",
          verifyToken: process.env.META_VERIFY_TOKEN ?? "hamza-shouq-webhook",
          sendMode: (process.env.META_SEND_MODE as "text" | "template") ?? "text",
          templateName: process.env.META_TEMPLATE_NAME ?? "",
          templateLanguage: process.env.META_TEMPLATE_LANGUAGE ?? "en_US",
        },
      },
      personalWhatsApp: emptyPersonalWhatsAppSnapshot(),
      accessUsers: DEFAULT_ACCESS_USERS.map((user) => ({ ...user, allowedTabs: [...user.allowedTabs] })),
    };
  }
  return globalWithStore.__hsStore;
}

function emptyPersonalWhatsAppSnapshot(): PersonalWhatsAppSnapshot {
  return {
    state: "disabled",
    qr: null,
    error: null,
    updatedAt: new Date(0).toISOString(),
    expiresAt: new Date(0).toISOString(),
  };
}

export function settings() {
  const current = store().settings;
  current.provider = current.provider === "meta" ? "meta" : "personal";
  current.personalBackendUrl ??= process.env.PERSONAL_WHATSAPP_API_URL ?? "";
  current.defaultCountryCode ||= defaultCountryCode;
  current.personalSenderPhone ||= defaultPersonalSenderPhone;
  const metaDefaults = {
    graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
    phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.META_ACCESS_TOKEN ?? "",
    appSecret: process.env.META_APP_SECRET ?? "",
    verifyToken: process.env.META_VERIFY_TOKEN ?? "hamza-shouq-webhook",
    sendMode: (process.env.META_SEND_MODE as "text" | "template") ?? "text",
    templateName: process.env.META_TEMPLATE_NAME ?? "",
    templateLanguage: process.env.META_TEMPLATE_LANGUAGE ?? "en_US",
  };
  current.meta = {
    ...metaDefaults,
    ...(current.meta ?? {}),
  };
  return current;
}

export function saveSettings(input: Partial<WhatsAppSettings>) {
  const current = settings();
  if (input.provider) current.provider = input.provider === "meta" ? "meta" : "personal";
  current.personalBackendUrl = input.personalBackendUrl ?? current.personalBackendUrl;
  current.defaultCountryCode = input.defaultCountryCode ?? current.defaultCountryCode ?? "962";
  if (input.personalSenderPhone !== undefined) {
    current.personalSenderPhone = input.personalSenderPhone.trim()
      ? normalizePhone(input.personalSenderPhone, current.defaultCountryCode)
      : "";
  }
  current.meta = {
    ...(current.meta ?? {
      graphVersion: "v23.0",
      phoneNumberId: "",
      accessToken: "",
      appSecret: "",
      verifyToken: "hamza-shouq-webhook",
      sendMode: "text",
      templateName: "",
      templateLanguage: "en_US",
    }),
    ...(input.meta ?? {}),
  };
  return current;
}

export function store() {
  const data = globalStore();
  data.templates = data.templates.map((template) => withTemplateDefaults(template));
  data.personalWhatsApp ??= emptyPersonalWhatsAppSnapshot();
  data.accessUsers ??= DEFAULT_ACCESS_USERS.map((user) => ({ ...user, allowedTabs: [...user.allowedTabs] }));
  for (const campaign of data.campaigns) {
    campaign.template = data.templates.find((template) => template.id === campaign.templateId) ?? null;
    campaign.totalCount = campaign.contacts.length;
    campaign.sentCount = campaign.messages.filter((message) => message.status === "SENT").length;
    campaign.failedCount = campaign.messages.filter((message) => message.status === "FAILED").length;
  }
  return data;
}

type SupabaseRow = {
  data?: Store;
};

function globalStoreRef() {
  return globalThis as typeof globalThis & { __hsStore?: Store; __hsStoreHydratedFromDisk?: boolean };
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function localStorePath() {
  return path.join(process.cwd(), ".data", "app-state.json");
}

async function hydrateLocalStore() {
  const globalWithStore = globalStoreRef();
  if (globalWithStore.__hsStoreHydratedFromDisk) return store();
  globalWithStore.__hsStoreHydratedFromDisk = true;

  try {
    globalWithStore.__hsStore = JSON.parse(await readFile(localStorePath(), "utf8")) as Store;
  } catch {
    return store();
  }

  return store();
}

async function persistLocalStore() {
  const filePath = localStorePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store(), null, 2));
}

export async function hydrateStore() {
  const config = supabaseConfig();
  if (!config) return hydrateLocalStore();

  try {
    const response = await fetch(`${config.url}/rest/v1/hs_app_state?id=eq.main&select=data`, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return store();
    const rows = await response.json() as SupabaseRow[];
    if (rows[0]?.data) {
      const globalWithStore = globalThis as typeof globalThis & { __hsStore?: Store };
      globalWithStore.__hsStore = rows[0].data;
    }
  } catch {
    return store();
  }

  return store();
}

export async function persistStore() {
  const config = supabaseConfig();
  if (!config) {
    await persistLocalStore();
    return;
  }

  try {
    await fetch(`${config.url}/rest/v1/hs_app_state`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ id: "main", data: store() }),
    });
  } catch {
    // The app remains usable with Vercel memory if Supabase is not ready.
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function cachePersonalWhatsAppStatus(status: PersonalWhatsAppStatus) {
  const now = Date.now();
  store().personalWhatsApp = {
    state: status.state,
    qr: status.qr,
    error: status.error ?? null,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 120_000).toISOString(),
  };
}

function reusablePersonalQr(status: PersonalWhatsAppStatus) {
  const cached = store().personalWhatsApp;
  if (status.qr || status.state === "ready" || !cached.qr) return status;
  if (Date.parse(cached.expiresAt) <= Date.now()) return status;
  return {
    state: "qr",
    qr: cached.qr,
    error: status.error ?? cached.error,
  };
}

export function normalizePhone(phone: string, defaultCountryCode = "962") {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned.replace(/[^\d]/g, "");
  const digits = cleaned.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith(defaultCountryCode)) return digits;
  if (digits.startsWith("0")) return `${defaultCountryCode}${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) return `${defaultCountryCode}${digits}`;
  return digits;
}

export function renderTemplate(body: string, row: Record<string, unknown>) {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = row[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

type RsvpLinks = { view: string; yes: string; no: string };

function createRsvpLinks(baseUrl: string, token: string): RsvpLinks {
  const base = `${baseUrl.replace(/\/$/, "")}/rsvp/${encodeURIComponent(token)}`;
  return {
    view: base,
    yes: `${base}?response=YES`,
    no: `${base}?response=NO`,
  };
}

function appendRsvpActionLinks(bodySource: string, renderedBody: string, links: RsvpLinks, includeRsvpLink: boolean) {
  if (!includeRsvpLink) return renderedBody;
  if (/\{\{\s*(rsvp_yes_link|rsvp_no_link|attending_link|not_attending_link)\s*\}\}/i.test(bodySource)) return renderedBody;
  return `${renderedBody.trimEnd()}\n\nAttending: ${links.yes}\nNot attending: ${links.no}`;
}

export function resolveTemplateVariables(input: { contact: Contact; template: Template; rsvpLink: string; rsvpYesLink?: string; rsvpNoLink?: string }) {
  const { contact, template, rsvpLink } = input;
  const includeRsvpLink = template.includeRsvpLink;
  const rsvpYesLink = input.rsvpYesLink ?? rsvpLink;
  const rsvpNoLink = input.rsvpNoLink ?? rsvpLink;
  let guestName = "";
  if (template.guestNameMode === "auto") guestName = contact.name;
  if (template.guestNameMode === "manual") guestName = template.manualGuestName ?? "";

  let attendeesCount = "";
  if (template.attendeesCountMode === "auto" || template.attendeesCountMode === "guest_rsvp") {
    attendeesCount = String(contact.customFields["attendees_count"] ?? contact.customFields["attendees"] ?? "");
  }
  if (template.attendeesCountMode === "manual") attendeesCount = template.manualAttendeesCount ?? "";

  return {
    guest_name: guestName,
    attendees_count: attendeesCount,
    wedding_date: template.weddingDate ?? "",
    venue: template.venue ?? "",
    rsvp_link: includeRsvpLink ? rsvpLink : "",
    rsvp_yes_link: includeRsvpLink ? rsvpYesLink : "",
    rsvp_no_link: includeRsvpLink ? rsvpNoLink : "",
    attending_link: includeRsvpLink ? rsvpYesLink : "",
    not_attending_link: includeRsvpLink ? rsvpNoLink : "",
    location_link: template.locationLink ?? "",
    host_names: template.hostNames ?? "",
    name: guestName,
    date: template.weddingDate ?? "",
    phone: contact.phone,
  };
}

export function templateMessageBody(template?: Template | null) {
  const bodyEn = template?.bodyEn?.trim() ?? "";
  const bodyAr = template?.bodyAr?.trim() ?? "";
  if (template?.languageMode === "arabic_only") return bodyAr || bodyEn;
  if (template?.languageMode === "bilingual") return [bodyEn, bodyAr].filter(Boolean).join("\n\n");
  return bodyEn || bodyAr;
}

export function templateMediaUrl(template?: Template | null) {
  if (!template?.includeMedia) return null;
  const mediaUrl = template.mediaUrl?.trim();
  if (!mediaUrl || mediaUrl.startsWith("attached://")) return null;
  return mediaUrl;
}

function normalizeKey(value: string) {
  return value.toLowerCase().trim();
}

function firstValue(row: Record<string, unknown>, candidates: string[]) {
  const keys = new Map(Object.keys(row).map((key) => [normalizeKey(key), key]));
  for (const candidate of candidates) {
    const key = keys.get(normalizeKey(candidate));
    const value = key ? row[key] : undefined;
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

const nameColumns = ["name", "name_en", "full_name", "contact", "guest", "guest name", "الاسم", "الإسم", "اسم", "الضيف", "المدعو"];
const phoneColumns = ["phone", "mobile", "whatsapp", "number", "phone number", "tel", "رقم", "الهاتف", "رقم الهاتف", "الموبايل", "الجوال", "واتساب", "رقم الواتساب"];

const nameColumnAliases = [
  ...nameColumns,
  "full name",
  "contact name",
  "invitee",
  "الاسم",
  "الإسم",
  "اسم",
  "اسم الضيف",
  "الضيف",
  "المدعو",
  "الاسم الكامل",
];
const phoneColumnAliases = [
  ...phoneColumns,
  "mobile number",
  "whatsapp number",
  "telephone",
  "رقم",
  "الهاتف",
  "رقم الهاتف",
  "الموبايل",
  "رقم الموبايل",
  "الجوال",
  "رقم الجوال",
  "واتساب",
  "رقم الواتساب",
];

function phoneDigits(value: unknown) {
  return normalizePhone(String(value ?? ""));
}

function looksLikePhone(value: unknown) {
  return phoneDigits(value).length >= 7;
}

function fallbackName(values: unknown[]) {
  return String(values.find((value) => {
    const text = String(value ?? "").trim();
    return text.length > 1 && !looksLikePhone(text);
  }) ?? "").trim();
}

function fallbackPhone(values: unknown[]) {
  return String(values.find((value) => looksLikePhone(value)) ?? "").trim();
}

export function googleSheetPreviewFromCsv(csv: string, sheetTitle?: string) {
  const [headerLine, ...lines] = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!headerLine) return { headers: [] as string[], contacts: [] as Contact[], rowCount: 0 };
  const headers = parseCsvLine(headerLine);
  const contacts = lines
    .map((line) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const name = firstValue(row, nameColumnAliases) || fallbackName(values);
      const phone = firstValue(row, phoneColumnAliases) || fallbackPhone(values);
      const sourceTab = sheetTitle ?? null;
      return {
        id: id("contact"),
        name,
        phone: normalizePhone(phone),
        sourceTab,
        listOwner: sourceTab,
        customFields: sheetTitle ? { ...row, sheet: sheetTitle, sourceTab: sheetTitle } : row,
      };
    })
    .filter((contact) => contact.name && contact.phone);
  return { headers, contacts, rowCount: lines.length };
}

export function contactsFromCsv(csv: string) {
  return googleSheetPreviewFromCsv(csv).contacts;
}

function parseCsvLine(line: string) {
  const output: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index++;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      output.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  output.push(current.trim());
  return output;
}

function sheetIdFromUrl(url: string) {
  return url.match(/\/spreadsheets\/d\/([^/]+)/i)?.[1] ?? "";
}

function gidFromUrl(url: string) {
  return url.match(/[#?&]gid=([0-9]+)/i)?.[1] ?? "";
}

async function readTextUrl(url: string) {
  try {
    const response = await fetch(url, { redirect: "follow", cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheet read failed: ${response.status}`);
    return response.text();
  } catch {
    return readUrlWithNodeHttps(url);
  }
}

function isGoogleHtmlError(text: string) {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
}

async function readGoogleSheetCsv(sheetId: string, gid: string, sheetTitle?: string) {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`,
    ...(sheetTitle ? [`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetTitle)}`] : []),
  ];
  let lastError: unknown;
  for (const url of urls) {
    try {
      const text = await readTextUrl(url);
      if (!isGoogleHtmlError(text)) return text;
      lastError = new Error("Google returned an HTML page instead of CSV");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Google Sheet CSV read failed");
}

function parseGoogleWorksheets(html: string): GoogleSheetWorksheet[] {
  const sheets = new Map<string, GoogleSheetWorksheet>();
  const entryPattern = /\[21350203,"((?:\\.|[^"\\])*)"\]/g;

  for (const match of html.matchAll(entryPattern)) {
    try {
      const decoded = JSON.parse(`"${match[1]}"`) as string;
      const entry = JSON.parse(decoded) as unknown[];
      const gid = String(entry[2] ?? "");
      const title = (((entry[3] as Array<Record<string, unknown>> | undefined)?.[0]?.["1"] as unknown[][] | undefined)?.[0]?.[2]);
      if (gid && typeof title === "string") sheets.set(gid, { gid, title });
    } catch {
      // Ignore unrelated bootstrap entries.
    }
  }

  return [...sheets.values()];
}

async function readGoogleSheetWorksheets(sheetId: string) {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit?usp=sharing`;
  try {
    const response = await fetch(sheetUrl, { redirect: "follow", cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheet metadata read failed: ${response.status}`);
    return parseGoogleWorksheets(await response.text());
  } catch {
    return parseGoogleWorksheets(await readUrlWithNodeHttps(sheetUrl));
  }
}

function mergeHeaders(previews: Array<{ headers: string[] }>) {
  const headers = new Map<string, string>();
  for (const preview of previews) {
    for (const header of preview.headers) {
      if (!headers.has(normalizeKey(header))) headers.set(normalizeKey(header), header);
    }
  }
  return [...headers.values()];
}

export async function readGoogleSheetPreview(input: { url?: string; sheetId?: string; gid?: string; selectedTabs?: string[] }) {
  const sourceUrl = input.url?.trim() ?? "";
  const sheetId = input.sheetId?.trim() || sheetIdFromUrl(sourceUrl);
  const explicitGid = input.gid?.trim() || gidFromUrl(sourceUrl);
  if (!sheetId) throw new Error("Missing Google Sheet URL");

  const worksheets = explicitGid
    ? [{ title: `gid ${explicitGid}`, gid: explicitGid }]
    : await readGoogleSheetWorksheets(sheetId);
  const selectedTabs = new Set((input.selectedTabs ?? []).map((tab) => tab.trim()).filter(Boolean));
  const allTargets = worksheets.length ? worksheets : [{ title: "Sheet 1", gid: explicitGid || "0" }];
  const targets = selectedTabs.size
    ? allTargets.filter((worksheet) => selectedTabs.has(worksheet.title) || selectedTabs.has(worksheet.gid))
    : allTargets;
  const previews = await Promise.all(targets.map(async (worksheet) => {
    const preview = googleSheetPreviewFromCsv(await readGoogleSheetCsv(sheetId, worksheet.gid, worksheet.title), worksheet.title);
    return { worksheet, ...preview };
  }));

  return {
    headers: mergeHeaders(previews),
    contacts: previews.flatMap((preview) => preview.contacts),
    worksheets: previews.map((preview): GoogleSheetWorksheetSummary => ({
      title: preview.worksheet.title,
      gid: preview.worksheet.gid,
      rowCount: preview.rowCount,
      contactCount: preview.contacts.length,
      preview: preview.contacts.slice(0, 5).map((contact) => ({ name: contact.name, phone: contact.phone })),
    })),
  };
}

export async function detectGoogleSheetTabs(input: { url?: string; sheetId?: string }) {
  const sourceUrl = input.url?.trim() ?? "";
  const sheetId = input.sheetId?.trim() || sheetIdFromUrl(sourceUrl);
  if (!sheetId) throw new Error("Missing Google Sheet URL");
  const preview = await readGoogleSheetPreview({ url: input.url, sheetId });
  return {
    sheetId,
    tabs: preview.worksheets.map((worksheet) => ({
      name: worksheet.title,
      gid: worksheet.gid,
      rowCount: worksheet.rowCount,
      contactCount: worksheet.contactCount,
      preview: worksheet.preview,
    })),
  };
}

export async function readGoogleSheetContacts(input: { url?: string; sheetId?: string; gid?: string; selectedTabs?: string[] }) {
  return (await readGoogleSheetPreview(input)).contacts;
}

export async function ensureStarterCampaignContactsFromGoogleSheet(campaign: Campaign) {
  if (campaign.id !== starterCampaignId || campaign.contacts.length) return false;
  const preview = await readGoogleSheetPreview({ url: defaultGoogleSheetUrl });
  const importBatchId = id("batch");
  const importedAt = new Date().toISOString();
  campaign.contacts = preview.contacts.map((contact) => ({
    ...contact,
    importBatchId,
    importedAt,
  }));
  campaign.messages = [];
  campaign.status = campaign.contacts.length ? "READY" : "DRAFT";
  campaign.totalCount = campaign.contacts.length;
  return true;
}

export function prepareCampaignMessages(campaign: Campaign, canUseContact: (contact: Contact) => boolean = () => true) {
  if (!campaign.template) return 0;
  const template = campaign.template;
  const preservedMessages = campaign.messages.filter((message) => !canUseContact(message.contact));
  const preparedMessages = campaign.contacts.filter(canUseContact).map((contact) => {
    const token = id("rsvp");
    const rsvpLinks = createRsvpLinks(process.env.NEXT_PUBLIC_SITE_URL ?? "https://web-zsfaouris-projects.vercel.app", token);
    const bodySource = templateMessageBody(template);
    const renderedBody = renderTemplate(bodySource, resolveTemplateVariables({
      contact,
      template,
      rsvpLink: rsvpLinks.view,
      rsvpYesLink: rsvpLinks.yes,
      rsvpNoLink: rsvpLinks.no,
    }));
    const body = appendRsvpActionLinks(bodySource, renderedBody, rsvpLinks, template.includeRsvpLink);
    return {
      id: id("message"),
      body,
      status: "PENDING" as const,
      error: null,
      contact,
      rsvpToken: { token, response: null, clickedAt: null },
    };
  });
  campaign.messages = [...preservedMessages, ...preparedMessages];
  campaign.status = campaign.messages.length ? "READY" : "DRAFT";
  return preparedMessages.length;
}

function readUrlWithNodeHttps(url: string, redirects = 0): Promise<string> {
  if (redirects > 5) return Promise.reject(new Error("Too many Google Sheet redirects"));
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: false, timeout: 15_000 }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        resolve(readUrlWithNodeHttps(new URL(location, url).toString(), redirects + 1));
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Google Sheet read failed: ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.on("timeout", () => request.destroy(new Error("Google Sheet read timed out")));
    request.on("error", reject);
  });
}

export function metaStatus() {
  return {
    configured: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID),
    phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? "",
    graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
    sendMode: process.env.META_SEND_MODE ?? "text",
    templateName: process.env.META_TEMPLATE_NAME ?? "",
  };
}

export async function personalStatus() {
  const backendUrl = settings().personalBackendUrl.trim().replace(/\/$/, "");
  if (!backendUrl) {
    return reusablePersonalQr(await personalWhatsAppStatus());
  }

  try {
    const response = await fetch(`${backendUrl}/api/whatsapp/status`, { cache: "no-store" });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json() as { personal?: unknown; state?: string; qr?: string | null; error?: string | null };
    if (data.personal) return data.personal as PersonalWhatsAppStatus;
    return { state: data.state ?? "unknown", qr: data.qr ?? null, error: data.error ?? null };
  } catch (error) {
    return {
      state: "disconnected",
      qr: null,
      error: error instanceof Error ? error.message : "Personal WhatsApp backend is unreachable",
    };
  }
}

export async function startPersonalSession() {
  const backendUrl = settings().personalBackendUrl.trim().replace(/\/$/, "");
  if (!backendUrl) {
    await initPersonalWhatsApp();
    const status = await waitForPersonalWhatsAppQr();
    cachePersonalWhatsAppStatus(status);
    await persistStore();
    return status;
  }

  const response = await fetch(`${backendUrl}/api/whatsapp/start`, { method: "POST", cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json() as { personal?: unknown; state?: string; qr?: string | null; error?: string | null };
  if (data.personal) return data.personal as PersonalWhatsAppStatus;
  return { state: data.state ?? "booting", qr: data.qr ?? null, error: data.error ?? null };
}

export async function assertPersonalReady() {
  const status = await personalStatus();
  if (status.state !== "ready") {
    throw new Error(status.qr
      ? "WhatsApp is waiting for QR scan. Open WhatsApp Settings and scan the QR before sending."
      : status.error ?? `WhatsApp is not ready. Current state: ${status.state}`);
  }
  const current = settings();
  const expected = current.personalSenderPhone?.trim();
  if (expected) {
    const expectedPhone = normalizePhone(expected, current.defaultCountryCode);
    const linkedPhone = status.accountPhone ? normalizePhone(status.accountPhone, current.defaultCountryCode) : "";
    if (!linkedPhone) throw new Error(`WhatsApp is ready, but the linked sender number is unknown. Required sender: ${expectedPhone}`);
    if (linkedPhone !== expectedPhone) {
      throw new Error(`Wrong WhatsApp sender linked. Required +${expectedPhone}, current +${linkedPhone}.`);
    }
  }
  return status;
}

export async function sendPersonalMessage(toPhone: string, body: string) {
  await assertPersonalReady();
  const backendUrl = settings().personalBackendUrl.trim().replace(/\/$/, "");
  if (!backendUrl) {
    const result = await sendPersonalWhatsAppMessage(toPhone, body) as { id?: { _serialized?: string } | string };
    return typeof result?.id === "string" ? result.id : result?.id?._serialized ?? "";
  }

  const response = await fetch(`${backendUrl}/api/whatsapp/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: toPhone, message: body }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; id?: string; error?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? `Personal WhatsApp backend send failed: ${response.status}`);
  }
  return data.id ?? "";
}

export async function sendMetaMessage(toPhone: string, body: string, mediaUrl?: string | null) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const graphVersion = process.env.META_GRAPH_VERSION ?? "v23.0";
  const to = normalizePhone(toPhone, process.env.DEFAULT_COUNTRY_CODE ?? "962");
  if (!accessToken || !phoneNumberId) throw new Error("Meta WhatsApp API is not configured on Vercel");

  const payload = mediaUrl
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "image",
        image: { link: mediaUrl, caption: body },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: true, body },
      };

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { messages?: { id: string }[]; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "Meta WhatsApp API send failed");
  return result.messages?.[0]?.id ?? "";
}
