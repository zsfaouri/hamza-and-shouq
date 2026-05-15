import { parse } from "csv-parse/sync";
import { parseCsvContacts, type ParsedContact } from "./spreadsheet.js";
import https from "node:https";

const SHEET_ID_PATTERN = /\/spreadsheets\/d\/([^/]+)/i;
const GID_PATTERN = /[#?&]gid=([0-9]+)/i;

export function sheetIdFromUrl(url: string) {
  return url.match(SHEET_ID_PATTERN)?.[1] ?? "";
}

export function gidFromUrl(url: string) {
  return url.match(GID_PATTERN)?.[1] ?? "0";
}

export function googleSheetCsvUrl(input: { url?: string; sheetId?: string; gid?: string }) {
  const sourceUrl = input.url?.trim() ?? "";
  const sheetId = input.sheetId?.trim() || sheetIdFromUrl(sourceUrl);
  const gid = input.gid?.trim() || gidFromUrl(sourceUrl);

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

function googleSheetPreviewFromCsv(buffer: Buffer) {
  const [headers = []] = parse(buffer, {
    to_line: 1,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  return {
    headers,
    contacts: parseCsvContacts(buffer),
  };
}

async function readGoogleSheetCsv(input: { url?: string; sheetId?: string; gid?: string }): Promise<Buffer> {
  const url = googleSheetCsvUrl(input);
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

export async function readGoogleSheetPreview(input: { url?: string; sheetId?: string; gid?: string }) {
  return googleSheetPreviewFromCsv(await readGoogleSheetCsv(input));
}

export async function readGoogleSheetContacts(input: { url?: string; sheetId?: string; gid?: string }): Promise<ParsedContact[]> {
  return (await readGoogleSheetPreview(input)).contacts;
}
