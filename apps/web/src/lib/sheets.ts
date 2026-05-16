import xlsx from "xlsx";
import crypto from "node:crypto";
import https from "node:https";
import type { Contact, SheetPreview, SheetTab } from "./types";

const sheetIdPattern = /\/spreadsheets\/d\/([^/]+)/i;
const gidPattern = /[#?&]gid=([0-9]+)/i;

const nameAliases = [
  "name",
  "full name",
  "guest",
  "guest name",
  "contact",
  "invitee",
  "الاسم",
  "الإسم",
  "اسم",
  "اسم الضيف",
  "الضيف",
  "المدعو",
  "الاسم الكامل",
];

const phoneAliases = [
  "phone",
  "mobile",
  "number",
  "phone number",
  "mobile number",
  "whatsapp",
  "whatsapp number",
  "tel",
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

export function sheetIdFromUrl(url: string) {
  return url.match(sheetIdPattern)?.[1] || "";
}

export function gidFromUrl(url: string) {
  return url.match(gidPattern)?.[1] || "";
}

export function normalizePhone(phone: string, defaultCountryCode = "962") {
  const clean = phone.replace(/[^\d+]/g, "");
  if (clean.startsWith("+")) return clean.replace(/[^\d]/g, "");
  const digits = clean.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith(defaultCountryCode)) return digits;
  if (digits.startsWith("0")) return `${defaultCountryCode}${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) return `${defaultCountryCode}${digits}`;
  return digits;
}

function key(value: string) {
  return value.toLowerCase().trim();
}

function firstValue(row: Record<string, unknown>, aliases: string[]) {
  const keys = new Map(Object.keys(row).map((name) => [key(name), name]));
  for (const alias of aliases) {
    const found = keys.get(key(alias));
    const value = found ? row[found] : undefined;
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function looksLikePhone(value: unknown) {
  return normalizePhone(String(value ?? "")).length >= 7;
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

function contactFromRow(row: Record<string, unknown>, sourceTab: string): Contact | null {
  const values = Object.values(row);
  const name = firstValue(row, nameAliases) || fallbackName(values);
  const phone = normalizePhone(firstValue(row, phoneAliases) || fallbackPhone(values));
  if (!name || !phone) return null;
  return {
    id: crypto.randomUUID(),
    name,
    phone,
    sourceTab,
    fields: Object.fromEntries(Object.entries(row).map(([field, value]) => [field, String(value ?? "")])),
  };
}

function headersFromSheet(sheet: xlsx.WorkSheet) {
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  return (rows[0] || []).map((value) => String(value).trim()).filter(Boolean);
}

function mergeHeaders(groups: string[][]) {
  const out = new Map<string, string>();
  for (const headers of groups) {
    for (const header of headers) {
      if (!out.has(key(header))) out.set(key(header), header);
    }
  }
  return [...out.values()];
}

export function googleSheetPreviewFromWorkbook(buffer: Buffer, sheetId: string, selectedTabs?: string[]): SheetPreview {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const selected = new Set((selectedTabs || []).map((tab) => tab.trim()).filter(Boolean));
  const sheetNames = selected.size
    ? workbook.SheetNames.filter((title, index) => selected.has(title) || selected.has(`sheet:${index}`))
    : workbook.SheetNames;

  const tabData = sheetNames.map((title) => {
    const sheet = workbook.Sheets[title];
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const contacts = rows.map((row) => contactFromRow(row, title)).filter((item): item is Contact => Boolean(item));
    const tab: SheetTab = {
      name: title,
      gid: `sheet:${workbook.SheetNames.indexOf(title)}`,
      rowCount: rows.length,
      contactCount: contacts.length,
      preview: contacts.slice(0, 5).map((contact) => ({ name: contact.name, phone: contact.phone })),
    };
    return { tab, headers: headersFromSheet(sheet), contacts };
  });

  return {
    sheetId,
    headers: mergeHeaders(tabData.map((tab) => tab.headers)),
    tabs: tabData.map((tab) => tab.tab),
    contacts: tabData.flatMap((tab) => tab.contacts),
  };
}

async function readBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheet read failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return readBufferWithNodeHttps(url);
  } finally {
    clearTimeout(timeout);
  }
}

function readBufferWithNodeHttps(url: string, redirects = 0): Promise<Buffer> {
  if (redirects > 5) return Promise.reject(new Error("Too many Google Sheet redirects."));
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: false, timeout: 20_000 }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        resolve(readBufferWithNodeHttps(new URL(location, url).toString(), redirects + 1));
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Google Sheet read failed: ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.on("timeout", () => request.destroy(new Error("Google Sheet read timed out.")));
    request.on("error", reject);
  });
}

function isHtml(buffer: Buffer) {
  const start = buffer.toString("utf8", 0, Math.min(buffer.length, 128));
  return /^\s*<!doctype html/i.test(start) || /^\s*<html/i.test(start);
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current.trim());
  return out;
}

function csvPreview(csv: string, sheetId: string, tabName: string, gid: string): SheetPreview {
  const [headerLine, ...lines] = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = headerLine ? parseCsvLine(headerLine) : [];
  const contacts = lines.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return contactFromRow(row, tabName);
  }).filter((item): item is Contact => Boolean(item));
  return {
    sheetId,
    headers,
    contacts,
    tabs: [{
      name: tabName,
      gid,
      rowCount: lines.length,
      contactCount: contacts.length,
      preview: contacts.slice(0, 5).map((contact) => ({ name: contact.name, phone: contact.phone })),
    }],
  };
}

export async function readGoogleSheetPreview(input: { url: string; selectedTabs?: string[] }): Promise<SheetPreview> {
  const url = input.url.trim();
  const sheetId = sheetIdFromUrl(url);
  if (!sheetId) throw new Error("Invalid Google Sheets URL.");

  if (!gidFromUrl(url)) {
    try {
      const buffer = await readBuffer(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=xlsx`);
      if (!isHtml(buffer)) return googleSheetPreviewFromWorkbook(buffer, sheetId, input.selectedTabs);
    } catch {
      // CSV fallback below returns a clear public-access error if it also fails.
    }
  }

  const gid = gidFromUrl(url) || "0";
  const csvBuffer = await readBuffer(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`);
  if (isHtml(csvBuffer)) throw new Error("Google returned HTML instead of sheet data. Share the sheet as Anyone with the link can view.");
  return csvPreview(csvBuffer.toString("utf8"), sheetId, gidFromUrl(url) ? `gid ${gid}` : "Sheet 1", gid);
}
