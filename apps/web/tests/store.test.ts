import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "hs-store-"));
  try {
    process.chdir(tempDir);
    process.env = {
      ...originalEnv,
      VERCEL: "1",
      SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_ANON_KEY: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    };

    const moduleUrl = `${pathToFileURL(path.join(originalCwd, "src/lib/store.ts")).href}?case=no-storage`;
    const { loadState } = await import(moduleUrl);
    const state = await loadState();

    assert.equal(state.campaign.name, "Wedding invitations");
    assert.equal(state.templates.length, 1);
  } finally {
    process.chdir(originalCwd);
    process.env = originalEnv;
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().then(() => {
  console.log("store tests passed");
});
