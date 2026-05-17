import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Template } from "../src/lib/types";

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

async function main() {
  await withTempEnv("no-storage", {
    VERCEL: "1",
    SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  }, async (moduleUrl) => {
    const { loadState } = await import(moduleUrl);
    const state = await loadState();

    assert.equal(state.campaign.name, "Wedding invitations");
    assert.equal(state.templates.length, 1);
  });

  await withTempEnv("broken-supabase-write", {
    VERCEL: "1",
    SUPABASE_URL: "https://supabase.example.test",
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  }, async (moduleUrl) => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({
      code: "PGRST205",
      message: "Could not find the table 'public.hs_app_state' in the schema cache",
    }), { status: 404 });

    try {
      const { loadState, saveState } = await import(moduleUrl);
      const state = await loadState();
      state.templates.push({ ...state.template, id: "template-2", name: "Second" });

      await saveState(state);

      const saved = await loadState();
      assert.equal(saved.templates.some((template: Template) => template.id === "template-2"), true);
    } finally {
      global.fetch = originalFetch;
    }
  });
}

async function withTempEnv(
  label: string,
  env: Record<string, string>,
  run: (moduleUrl: string) => Promise<void>,
) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "hs-store-"));
  try {
    process.chdir(tempDir);
    process.env = { ...originalEnv, ...env };
    const moduleUrl = `${pathToFileURL(path.join(originalCwd, "src/lib/store.ts")).href}?case=${label}-${Date.now()}`;
    await run(moduleUrl);
  } finally {
    process.chdir(originalCwd);
    process.env = originalEnv;
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().then(() => {
  console.log("store tests passed");
});
