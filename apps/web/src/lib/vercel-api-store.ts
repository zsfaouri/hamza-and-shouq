import https from "node:https";
import { initPersonalWhatsApp, personalWhatsAppStatus } from "@/lib/personal-whatsapp";

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
};

export type WhatsAppSettings = {
  provider: "personal" | "meta";
  personalBackendUrl: string;
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
    };
  }
  return globalWithStore.__hsStore;
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
  for (const campaign of data.campaigns) {
    campaign.template = data.templates.find((template) => template.id === campaign.templateId) ?? null;
    campaign.totalCount = campaign.contacts.length;
    campaign.sentCount = campaign.messages.filter((message) => message.status === "SENT").length;
    campaign.failedCount = campaign.messages.filter((message) => message.status === "FAILED").length;
  }
  return data;
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
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

export function contactsFromCsv(csv: string) {
  const [headerLine, ...lines] = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!headerLine) return [];
  const headers = parseCsvLine(headerLine);
  return lines
    .map((line) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const name = firstValue(row, ["name", "name_en", "full_name", "contact", "guest"]);
      const phone = firstValue(row, ["phone", "mobile", "whatsapp", "number", "tel"]);
      return { id: id("contact"), name, phone: normalizePhone(phone), customFields: row };
    })
    .filter((contact) => contact.name && contact.phone);
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
  return url.match(/[#?&]gid=([0-9]+)/i)?.[1] ?? "0";
}

export async function readGoogleSheetContacts(input: { url?: string; sheetId?: string; gid?: string }) {
  const sourceUrl = input.url?.trim() ?? "";
  const sheetId = input.sheetId?.trim() || sheetIdFromUrl(sourceUrl);
  const gid = input.gid?.trim() || gidFromUrl(sourceUrl);
  if (!sheetId) throw new Error("Missing Google Sheet URL");

  const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  try {
    const response = await fetch(csvUrl, { redirect: "follow", cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheet read failed: ${response.status}`);
    return contactsFromCsv(await response.text());
  } catch {
    return contactsFromCsv(await readUrlWithNodeHttps(csvUrl));
  }
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
    return personalWhatsAppStatus();
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
    return personalWhatsAppStatus();
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
