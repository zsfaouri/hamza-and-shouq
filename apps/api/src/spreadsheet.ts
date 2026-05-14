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

export function parseContactsFromRows(rows: Record<string, unknown>[]): ParsedContact[] {
  return rows
    .map((row) => {
      const name = firstValue(row, ["name", "name_en", "full_name", "contact", "guest"]);
      const phone = firstValue(row, ["phone", "mobile", "whatsapp", "number", "tel"]);
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
