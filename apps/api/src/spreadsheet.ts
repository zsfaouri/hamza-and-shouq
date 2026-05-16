import { parse } from "csv-parse/sync";
import xlsx from "xlsx";

export type ParsedContact = {
  name: string;
  phone: string;
  customFields: Record<string, unknown>;
};

function normalizeKey(value: string) {
  return value.toLowerCase().trim();
}

function firstValue(row: Record<string, unknown>, candidates: string[]) {
  const normalized = new Map(Object.keys(row).map((key) => [normalizeKey(key), key]));
  for (const candidate of candidates) {
    const key = normalized.get(normalizeKey(candidate));
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
  const cleaned = String(value ?? "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned.replace(/[^\d]/g, "");
  const digits = cleaned.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
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

export function parseContactsFromRows(rows: Record<string, unknown>[]): ParsedContact[] {
  return rows
    .map((row) => {
      const values = Object.values(row);
      const name = firstValue(row, nameColumnAliases) || fallbackName(values);
      const phone = firstValue(row, phoneColumnAliases) || fallbackPhone(values);
      return { name, phone, customFields: row };
    })
    .filter((contact) => contact.name && contact.phone);
}

export function parseCsvContacts(buffer: Buffer): ParsedContact[] {
  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];

  return parseContactsFromRows(rows);
}

export function parseSpreadsheet(file: Express.Multer.File): ParsedContact[] {
  const extension = file.originalname.split(".").pop()?.toLowerCase();

  if (extension === "csv") return parseCsvContacts(file.buffer);

  const workbook = xlsx.read(file.buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  return parseContactsFromRows(rows);
}
