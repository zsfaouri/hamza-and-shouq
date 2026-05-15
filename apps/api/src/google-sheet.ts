import { parse } from "csv-parse/sync";
import { parseContactsFromRows, type ParsedContact } from "./spreadsheet.js";
import https from "node:https";

const SHEET_ID_PATTERN = /\/spreadsheets\/d\/([^/]+)/i;
const GID_PATTERN = /[#?&]gid=([0-9]+)/i;

type GoogleSheetWorksheet = {
  title: string;
  gid: string;
};

type GoogleSheetWorksheetSummary = GoogleSheetWorksheet & {
  rowCount: number;
  contactCount: number;
};

export function sheetIdFromUrl(url: string) {
  return url.match(SHEET_ID_PATTERN)?.[1] ?? "";
}

export function gidFromUrl(url: string) {
  return url.match(GID_PATTERN)?.[1] ?? "";
}

export function googleSheetCsvUrl(input: { url?: string; sheetId?: string; gid?: string }) {
  const sourceUrl = input.url?.trim() ?? "";
  const sheetId = input.sheetId?.trim() || sheetIdFromUrl(sourceUrl);
  const gid = input.gid?.trim() || gidFromUrl(sourceUrl) || "0";

  if (!sheetId) throw new Error("Missing Google Sheet ID or URL");
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

function readUrlWithNodeHttps(url: string, redirects = 0): Promise<Buffer> {
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
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });

    request.on("timeout", () => request.destroy(new Error("Google Sheet read timed out")));
    request.on("error", reject);
  });
}

function googleSheetPreviewFromCsv(buffer: Buffer, sheetTitle?: string) {
  const [headers = []] = parse(buffer, {
    to_line: 1,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];
  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[];

  return {
    headers,
    contacts: parseContactsFromRows(rows).map((contact) => ({
      ...contact,
      customFields: sheetTitle ? { ...contact.customFields, sheet: sheetTitle } : contact.customFields,
    })),
    rowCount: rows.length,
  };
}

async function readUrlBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  timeout.unref?.();

  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new Error(`Google Sheet read failed: ${response.status}`);

    return Buffer.from(await response.arrayBuffer());
  } catch {
    return readUrlWithNodeHttps(url);
  } finally {
    clearTimeout(timeout);
  }
}

async function readGoogleSheetCsv(sheetId: string, gid: string): Promise<Buffer> {
  return readUrlBuffer(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`);
}

function normalizeKey(value: string) {
  return value.toLowerCase().trim();
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
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit?usp=sharing`;
  return parseGoogleWorksheets((await readUrlBuffer(url)).toString("utf8"));
}

export async function readGoogleSheetPreview(input: { url?: string; sheetId?: string; gid?: string }) {
  const sourceUrl = input.url?.trim() ?? "";
  const sheetId = input.sheetId?.trim() || sheetIdFromUrl(sourceUrl);
  const explicitGid = input.gid?.trim();
  if (!sheetId) throw new Error("Missing Google Sheet ID or URL");

  const worksheets = explicitGid
    ? [{ title: `gid ${explicitGid}`, gid: explicitGid }]
    : await readGoogleSheetWorksheets(sheetId);
  const targets = worksheets.length ? worksheets : [{ title: "Sheet 1", gid: "0" }];
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
    })),
  };
}

export async function readGoogleSheetContacts(input: { url?: string; sheetId?: string; gid?: string }): Promise<ParsedContact[]> {
  return (await readGoogleSheetPreview(input)).contacts;
}
