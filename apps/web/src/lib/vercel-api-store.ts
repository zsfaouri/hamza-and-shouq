import https from "node:https";
import { initPersonalWhatsApp, personalWhatsAppStatus, waitForPersonalWhatsAppQr } from "@/lib/personal-whatsapp";

type Template = {
  id: string;
  name: string;
  bodyEn: string;
  bodyAr?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

type Contact = {
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

type Message = {
  id: string;
  body: string;
  status: "PENDING" | "SENT" | "FAILED";
  error?: string | null;
  contact: Contact;
  rsvpToken?: { response?: "YES" | "NO" | null; clickedAt?: string | null } | null;
};

type Campaign = {
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

type Store = {
  templates: Template[];
  campaigns: Campaign[];
  settings: WhatsAppSettings;
  personalWhatsApp: PersonalWhatsAppSnapshot;
};

export type WhatsAppSettings = {
  provider: "personal" | "meta";
  personalBackendUrl: string;
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
};

const starterTemplate: Template = {
  id: "starter-template",
  name: "Wedding Invite EN",
  bodyEn: "Hi {{name}}, you're invited to Hamza and Shouq's wedding on {{date}} at {{venue}}. Please RSVP here: {{rsvp_link}}",
  bodyAr: "",
  mediaUrl: null,
  mediaType: null,
};

function globalStore() {
  const globalWithStore = globalThis as typeof globalThis & { __hsStore?: Store };
  if (!globalWithStore.__hsStore) {
    globalWithStore.__hsStore = {
      templates: [starterTemplate],
      campaigns: [{
        id: "starter-campaign",
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
      },
      personalWhatsApp: emptyPersonalWhatsAppSnapshot(),
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
  return store().settings;
}

export function saveSettings(input: Partial<WhatsAppSettings>) {
  const current = settings();
  current.provider = input.provider === "meta" ? "meta" : "personal";
  current.personalBackendUrl = input.personalBackendUrl ?? current.personalBackendUrl;
  return current;
}

export function store() {
  const data = globalStore();
  data.personalWhatsApp ??= emptyPersonalWhatsAppSnapshot();
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

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export async function hydrateStore() {
  const config = supabaseConfig();
  if (!config) return store();

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
  if (!config) return;

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
  return digits;
}

export function renderTemplate(body: string, row: Record<string, unknown>) {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = row[key];
    return value === null || value === undefined ? "" : String(value);
  });
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

export function googleSheetPreviewFromCsv(csv: string, sheetTitle?: string) {
  const [headerLine, ...lines] = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!headerLine) return { headers: [] as string[], contacts: [] as Contact[], rowCount: 0 };
  const headers = parseCsvLine(headerLine);
  const contacts = lines
    .map((line) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const name = firstValue(row, ["name", "name_en", "full_name", "contact", "guest"]);
      const phone = firstValue(row, ["phone", "mobile", "whatsapp", "number", "tel"]);
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

async function readGoogleSheetCsv(sheetId: string, gid: string) {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  try {
    const response = await fetch(csvUrl, { redirect: "follow", cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheet read failed: ${response.status}`);
    return response.text();
  } catch {
    return readUrlWithNodeHttps(csvUrl);
  }
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
  const explicitGid = input.gid?.trim();
  if (!sheetId) throw new Error("Missing Google Sheet URL");

  const worksheets = explicitGid
    ? [{ title: `gid ${explicitGid}`, gid: explicitGid }]
    : await readGoogleSheetWorksheets(sheetId);
  const selectedTabs = new Set((input.selectedTabs ?? []).map((tab) => tab.trim()).filter(Boolean));
  const allTargets = worksheets.length ? worksheets : [{ title: "Sheet 1", gid: "0" }];
  const targets = selectedTabs.size
    ? allTargets.filter((worksheet) => selectedTabs.has(worksheet.title) || selectedTabs.has(worksheet.gid))
    : allTargets;
  const previews = await Promise.all(targets.map(async (worksheet) => {
    const preview = googleSheetPreviewFromCsv(await readGoogleSheetCsv(sheetId, worksheet.gid), worksheet.title);
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
    if (data.personal) return data.personal;
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
  if (data.personal) return data.personal;
  return { state: data.state ?? "booting", qr: data.qr ?? null, error: data.error ?? null };
}

export async function sendMetaMessage(toPhone: string, body: string, mediaUrl?: string | null) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const graphVersion = process.env.META_GRAPH_VERSION ?? "v23.0";
  if (!accessToken || !phoneNumberId) throw new Error("Meta WhatsApp API is not configured on Vercel");

  const payload = mediaUrl
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhone.replace(/[^\d]/g, ""),
        type: "image",
        image: { link: mediaUrl, caption: body },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhone.replace(/[^\d]/g, ""),
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
