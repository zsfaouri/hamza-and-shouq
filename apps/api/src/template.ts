export type TemplateRow = Record<string, unknown>;

export type TemplateRenderContext = {
  contact: {
    name: string;
    phone: string;
    customFields: Record<string, unknown>;
  };
  template: {
    guestNameMode?: string | null;
    manualGuestName?: string | null;
    attendeesCountMode?: string | null;
    manualAttendeesCount?: string | null;
    weddingDate?: string | null;
    venue?: string | null;
    locationLink?: string | null;
    hostNames?: string | null;
    includeRsvpLink?: boolean | null;
  };
  rsvpLink: string;
  rsvpYesLink?: string;
  rsvpNoLink?: string;
};

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

export function resolveVariables(ctx: TemplateRenderContext): Record<string, string> {
  let guestName = "";
  const guestNameMode = ctx.template.guestNameMode ?? "auto";
  if (guestNameMode === "auto") guestName = ctx.contact.name;
  if (guestNameMode === "manual") guestName = ctx.template.manualGuestName ?? "";
  if (guestNameMode === "none") guestName = "";

  let attendeesCount = "";
  const attendeesCountMode = ctx.template.attendeesCountMode ?? "none";
  if (attendeesCountMode === "auto" || attendeesCountMode === "guest_rsvp") {
    attendeesCount = String(ctx.contact.customFields["attendees_count"] ?? ctx.contact.customFields["attendees"] ?? "");
  }
  if (attendeesCountMode === "manual") attendeesCount = ctx.template.manualAttendeesCount ?? "";

  const includeRsvpLink = ctx.template.includeRsvpLink !== false;
  const rsvpYesLink = ctx.rsvpYesLink ?? ctx.rsvpLink;
  const rsvpNoLink = ctx.rsvpNoLink ?? ctx.rsvpLink;

  return {
    guest_name: guestName,
    attendees_count: attendeesCount,
    wedding_date: ctx.template.weddingDate ?? "",
    venue: ctx.template.venue ?? "",
    rsvp_link: includeRsvpLink ? ctx.rsvpLink : "",
    rsvp_yes_link: includeRsvpLink ? rsvpYesLink : "",
    rsvp_no_link: includeRsvpLink ? rsvpNoLink : "",
    attending_link: includeRsvpLink ? rsvpYesLink : "",
    not_attending_link: includeRsvpLink ? rsvpNoLink : "",
    location_link: ctx.template.locationLink ?? "",
    host_names: ctx.template.hostNames ?? "",
    name: guestName,
    date: ctx.template.weddingDate ?? "",
    phone: ctx.contact.phone,
  };
}

export function renderTemplate(body: string, variables: Record<string, unknown>) {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function templateMessageBody(template: { bodyEn: string; bodyAr?: string | null }) {
  const arabic = template.bodyAr?.trim();
  return arabic || template.bodyEn;
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
