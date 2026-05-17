import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultState } from "./domain";
import type { AppState } from "./types";

const localFile = path.join(process.cwd(), ".data", "app-state.json");

function memoryRef() {
  return globalThis as typeof globalThis & { __hsState?: AppState };
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function supabaseHeaders(key: string, contentType = false) {
  const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}` };
  if (contentType) headers["Content-Type"] = "application/json";
  return headers;
}

function storageError(label: string, status: number, text: string) {
  const detail = text.slice(0, 160);
  if (text.includes("PGRST205") || text.includes("hs_app_state")) {
    return `${label} ${status}: missing public.hs_app_state table. Run docs/SUPABASE_SCHEMA.sql in Supabase. ${detail}`;
  }
  return `${label} ${status}: ${detail}`;
}

function normalizeState(input: Partial<AppState> | null | undefined): AppState {
  const base = defaultState();
  const legacyTemplate = { ...base.template, ...(input?.template || {}) };
  const templates = (input?.templates?.length ? input.templates : [legacyTemplate]).map((template) => ({
    ...base.template,
    ...template,
    id: String(template.id || crypto.randomUUID()),
    name: String(template.name || base.template.name),
    body: String(template.body || base.template.body),
    mediaUrl: String(template.mediaUrl || ""),
    mediaName: String(template.mediaName || ""),
    mediaMimeType: String(template.mediaMimeType || ""),
    mediaData: String(template.mediaData || ""),
    updatedAt: String(template.updatedAt || base.template.updatedAt),
  }));
  const activeTemplateId = templates.some((template) => template.id === input?.activeTemplateId)
    ? String(input?.activeTemplateId)
    : templates.some((template) => template.id === legacyTemplate.id)
      ? legacyTemplate.id
      : templates[0].id;
  const active = templates.find((template) => template.id === activeTemplateId) || templates[0];
  const merged = {
    ...base,
    ...(input || {}),
    campaign: { ...base.campaign, ...(input?.campaign || {}) },
    template: active,
    templates,
    activeTemplateId: active.id,
    whatsapp: { ...base.whatsapp, ...(input?.whatsapp || {}) },
  };
  merged.campaign.sheetUrl = String(merged.campaign.sheetUrl || "");
  merged.whatsapp.graphVersion = String(merged.whatsapp.graphVersion || "v23.0");
  merged.whatsapp.phoneNumberId = String(merged.whatsapp.phoneNumberId || "");
  merged.whatsapp.accessToken = String(merged.whatsapp.accessToken || "");
  merged.whatsapp.verifyToken = String(merged.whatsapp.verifyToken || "hamza-shouq-webhook");
  merged.whatsapp.senderPhone = String(merged.whatsapp.senderPhone || "");
  merged.whatsapp.personalBridgeUrl = String(merged.whatsapp.personalBridgeUrl || "");
  merged.whatsapp.personalBridgeToken = String(merged.whatsapp.personalBridgeToken || "");
  const metaConfigured = Boolean(merged.whatsapp.phoneNumberId && merged.whatsapp.accessToken && merged.whatsapp.accessToken !== "SET");
  merged.whatsapp.provider = merged.whatsapp.provider === "personal" || !metaConfigured ? "personal" : "meta";
  merged.whatsapp.personalBridgeUrl ||= process.env.PERSONAL_WHATSAPP_API_URL || "";
  merged.whatsapp.personalBridgeToken ||= process.env.PERSONAL_WHATSAPP_TOKEN || "";
  merged.campaign.contacts ||= [];
  merged.campaign.messages ||= [];
  merged.campaign.selectedTabs ||= [];
  return merged;
}

export async function loadState(): Promise<AppState> {
  const memory = memoryRef().__hsState;
  if (memory) return normalizeState(memory);

  const config = supabaseConfig();
  if (config) {
    try {
      const response = await fetch(`${config.url}/rest/v1/hs_app_state?id=eq.main&select=data`, {
        headers: supabaseHeaders(config.key),
        cache: "no-store",
      });
      if (response.ok) {
        const rows = await response.json() as Array<{ data?: AppState }>;
        if (rows[0]?.data) {
          const state = normalizeState(rows[0].data);
          memoryRef().__hsState = state;
          return state;
        }
      }
    } catch (error) {
      void error;
    }
  }

  try {
    const state = normalizeState(JSON.parse(await readFile(localFile, "utf8")) as AppState);
    memoryRef().__hsState = state;
    return state;
  } catch {
    const state = normalizeState(null);
    memoryRef().__hsState = state;
    return state;
  }
}

export async function saveState(state: AppState) {
  const config = supabaseConfig();
  if (config) {
    const response = await fetch(`${config.url}/rest/v1/hs_app_state?on_conflict=id`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(config.key, true),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ id: "main", data: state, updated_at: new Date().toISOString() }),
    });
    if (response.ok) {
      memoryRef().__hsState = state;
      return true;
    }
    if (process.env.VERCEL) {
      memoryRef().__hsState = state;
      return false;
    }
  }

  try {
    await mkdir(path.dirname(localFile), { recursive: true });
    await writeFile(localFile, JSON.stringify(state, null, 2));
    memoryRef().__hsState = state;
    return true;
  } catch {
    if (process.env.VERCEL) throw new Error("Persistent storage is not configured.");
    memoryRef().__hsState = state;
    return false;
  }
}

export async function saveStateStrict(state: AppState) {
  const persisted = await saveState(state);
  if (!persisted && process.env.VERCEL) {
    throw new Error("Persistent storage write failed. Check Supabase env vars and public.hs_app_state.");
  }
  return persisted;
}

export function publicState(state: AppState) {
  const publicRecord = {
    ...state,
    template: {
      ...state.template,
      mediaData: "",
    },
    templates: state.templates.map((template) => ({
      ...template,
      mediaData: "",
    })),
    whatsapp: {
      ...state.whatsapp,
      accessToken: state.whatsapp.accessToken ? "SET" : "",
      personalBridgeToken: state.whatsapp.personalBridgeToken ? "SET" : "",
    },
  } as AppState & Record<string, unknown>;
  delete publicRecord.accessUsers;
  delete publicRecord.settings;
  delete publicRecord.personalWhatsApp;
  return publicRecord;
}

export async function storageDiagnostics() {
  const config = supabaseConfig();
  if (!config) {
    if (process.env.VERCEL) {
      return { configured: false, selectOk: false, writeOk: false, error: "Supabase env is not configured. Vercel needs persistent storage." };
    }
    try {
      await mkdir(path.dirname(localFile), { recursive: true });
      const state = await loadState();
      await writeFile(localFile, JSON.stringify(state, null, 2));
      return { configured: true, keyKind: "local-file", selectOk: true, writeOk: true, error: "" };
    } catch (error) {
      return { configured: false, keyKind: "local-file", selectOk: false, writeOk: false, error: error instanceof Error ? error.message : "Local storage failed." };
    }
  }
  const headers = supabaseHeaders(config.key);
  const out = { configured: true, keyKind: config.key.startsWith("eyJ") ? "jwt" : "publishable-or-secret", selectOk: false, writeOk: false, error: "" };
  try {
    const select = await fetch(`${config.url}/rest/v1/hs_app_state?id=eq.main&select=id`, { headers, cache: "no-store" });
    out.selectOk = select.ok;
    if (!select.ok) out.error = storageError("select", select.status, await select.text());
  } catch (error) {
    out.error = error instanceof Error ? error.message : "select failed";
  }
  try {
    const probe = await fetch(`${config.url}/rest/v1/hs_app_state`, {
      method: "POST",
      headers: { ...supabaseHeaders(config.key, true), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: "__probe", data: { checkedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }),
    });
    out.writeOk = probe.ok;
    if (!probe.ok) out.error = storageError("write", probe.status, await probe.text());
  } catch (error) {
    out.error = error instanceof Error ? error.message : "write failed";
  }
  return out;
}
