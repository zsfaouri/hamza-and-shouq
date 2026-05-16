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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function normalizeState(input: Partial<AppState> | null | undefined): AppState {
  const base = defaultState();
  const merged = {
    ...base,
    ...(input || {}),
    campaign: { ...base.campaign, ...(input?.campaign || {}) },
    template: { ...base.template, ...(input?.template || {}) },
    whatsapp: { ...base.whatsapp, ...(input?.whatsapp || {}) },
  };
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
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
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
    } catch {
      return normalizeState(null);
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
  memoryRef().__hsState = state;
  const config = supabaseConfig();
  if (config) {
    const response = await fetch(`${config.url}/rest/v1/hs_app_state`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ id: "main", data: state }),
    });
    if (response.ok) return;
  }

  try {
    await mkdir(path.dirname(localFile), { recursive: true });
    await writeFile(localFile, JSON.stringify(state, null, 2));
  } catch {
    // Vercel file storage is not durable; memory still keeps the current runtime usable.
  }
}

export function publicState(state: AppState) {
  return {
    ...state,
    whatsapp: {
      ...state.whatsapp,
      accessToken: state.whatsapp.accessToken ? "SET" : "",
    },
  };
}
