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

  await withTempEnv("local-backup-db", {
    VERCEL: "",
    SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    LOCAL_BACKUP_DB_PATH: path.join(".data", "local-backup.sqlite"),
  }, async (moduleUrl, tempDir) => {
    const { loadState, localBackupDiagnostics, saveState } = await import(moduleUrl);
    const state = await loadState();
    state.campaign.name = "Local backup campaign";
    state.campaign.contacts.push({ id: "backup-contact", name: "Backup Guest", phone: "962790000222", sourceTab: "Backup", fields: {} });

    assert.equal(await saveState(state), true);
    const backup = await localBackupDiagnostics();
    assert.equal(backup.available, true);
    assert.equal(backup.readOk, true);
    assert.equal(backup.writeOk, true);
    assert.equal(backup.hasState, true);

    await rm(path.join(tempDir, ".data", "app-state.json"), { force: true });
    const restored = await loadState({ fresh: true });
    assert.equal(restored.campaign.name, "Local backup campaign");
    assert.equal(restored.campaign.contacts.some((contact: { id: string }) => contact.id === "backup-contact"), true);
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

  await withTempEnv("bridge-env-fallback", {
    VERCEL: "1",
    SUPABASE_URL: "https://supabase.example.test",
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    PERSONAL_WHATSAPP_API_URL: "https://bridge.example.test",
    PERSONAL_WHATSAPP_TOKEN: "bridge-secret",
  }, async (moduleUrl) => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify([{
      data: {
        version: 1,
        whatsapp: {
          provider: "personal",
          graphVersion: "v23.0",
          phoneNumberId: "",
          accessToken: "",
          verifyToken: "verify",
          senderPhone: "962795941263",
          personalBridgeUrl: "",
          personalBridgeToken: "",
        },
      },
    }]), { status: 200 });

    try {
      const { loadState } = await import(moduleUrl);
      const state = await loadState();

      assert.equal(state.whatsapp.personalBridgeUrl, "https://bridge.example.test");
      assert.equal(state.whatsapp.personalBridgeToken, "bridge-secret");
    } finally {
      global.fetch = originalFetch;
    }
  });
}

async function withTempEnv(
  label: string,
  env: Record<string, string>,
  run: (moduleUrl: string, tempDir: string) => Promise<void>,
) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "hs-store-"));
  try {
    process.chdir(tempDir);
    process.env = { ...originalEnv, ...env };
    const moduleUrl = `${pathToFileURL(path.join(originalCwd, "src/lib/store.ts")).href}?case=${label}-${Date.now()}`;
    await run(moduleUrl, tempDir);
  } finally {
    process.chdir(originalCwd);
    process.env = originalEnv;
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().then(() => {
  console.log("store tests passed");
});
