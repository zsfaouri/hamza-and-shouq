export type TemplateRow = Record<string, unknown>;

export function normalizePhone(phone: string, defaultCountryCode = "962") {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned.replace(/[^\d]/g, "");
  const digits = cleaned.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith(defaultCountryCode)) return digits;
  if (digits.startsWith("0")) return `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
}

export function renderTemplate(body: string, row: TemplateRow) {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = row[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

export function rowValue(row: TemplateRow, keys: string[], fallback = "") {
  for (const key of keys) {
    const exact = row[key];
    if (exact !== undefined && exact !== null && String(exact).trim()) return String(exact).trim();
    const foundKey = Object.keys(row).find((item) => item.toLowerCase().trim() === key.toLowerCase());
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim()) {
      return String(row[foundKey]).trim();
    }
  }
  return fallback;
}
