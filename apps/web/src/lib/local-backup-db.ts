import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { AppState } from "./types";

type Statement = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
};

type Database = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => Statement;
  close: () => void;
};

type SqliteModule = {
  DatabaseSync: new (file: string) => Database;
};

export type LocalBackupDiagnostics = {
  configured: boolean;
  available: boolean;
  path: string;
  readOk: boolean;
  writeOk: boolean;
  hasState: boolean;
  snapshots: number;
  latestAt: string;
  error: string;
};

const requireFromHere = createRequire(import.meta.url);
const defaultSnapshotLimit = 100;

function backupPath() {
  const configured = process.env.LOCAL_BACKUP_DB_PATH;
  if (configured) return path.resolve(process.cwd(), configured);
  return path.join(process.cwd(), ".data", "local-backup.sqlite");
}

function snapshotLimit() {
  const configured = Number.parseInt(process.env.LOCAL_BACKUP_SNAPSHOTS || "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultSnapshotLimit;
}

function checksum(data: string) {
  return createHash("sha256").update(data).digest("hex");
}

function sqliteModule() {
  try {
    return requireFromHere("node:sqlite") as SqliteModule;
  } catch {
    return null;
  }
}

function openBackup() {
  const file = backupPath();
  const sqlite = sqliteModule();
  if (!sqlite) return { file, db: null, error: "node:sqlite is unavailable in this Node runtime." };

  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const db = new sqlite.DatabaseSync(file);
    db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS local_app_state (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        checksum TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_state_backups (
        backup_id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        checksum TEXT NOT NULL,
        source TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_app_state_backups_updated_at
        ON app_state_backups(updated_at);
      CREATE TABLE IF NOT EXISTS local_backup_health (
        id TEXT PRIMARY KEY,
        checked_at TEXT NOT NULL
      );
    `);
    return { file, db, error: "" };
  } catch (error) {
    return { file, db: null, error: error instanceof Error ? error.message : "Local backup database could not be opened." };
  }
}

export async function writeLocalBackup(state: AppState, source = "app") {
  const opened = openBackup();
  if (!opened.db) return { ok: false, path: opened.file, error: opened.error };

  const updatedAt = new Date().toISOString();
  const data = JSON.stringify(state);
  const hash = checksum(data);

  try {
    opened.db.exec("BEGIN IMMEDIATE");
    opened.db.prepare(`
      INSERT INTO local_app_state (id, data, updated_at, checksum)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at,
        checksum = excluded.checksum
    `).run("main", data, updatedAt, hash);
    opened.db.prepare(`
      INSERT INTO app_state_backups (data, updated_at, checksum, source)
      VALUES (?, ?, ?, ?)
    `).run(data, updatedAt, hash, source);
    opened.db.prepare(`
      DELETE FROM app_state_backups
      WHERE backup_id NOT IN (
        SELECT backup_id
        FROM app_state_backups
        ORDER BY backup_id DESC
        LIMIT ?
      )
    `).run(snapshotLimit());
    opened.db.exec("COMMIT");
    return { ok: true, path: opened.file, error: "" };
  } catch (error) {
    try {
      opened.db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures; the original write error is the useful signal.
    }
    return { ok: false, path: opened.file, error: error instanceof Error ? error.message : "Local backup write failed." };
  } finally {
    opened.db.close();
  }
}

export async function readLocalBackup() {
  const opened = openBackup();
  if (!opened.db) return null;

  try {
    const current = opened.db.prepare("SELECT data FROM local_app_state WHERE id = ?").get("main");
    const fallback = current || opened.db.prepare("SELECT data FROM app_state_backups ORDER BY backup_id DESC LIMIT 1").get();
    if (!fallback?.data) return null;
    return JSON.parse(String(fallback.data)) as AppState;
  } catch {
    return null;
  } finally {
    opened.db.close();
  }
}

export async function localBackupDiagnostics(): Promise<LocalBackupDiagnostics> {
  const opened = openBackup();
  if (!opened.db) {
    return {
      configured: false,
      available: false,
      path: opened.file,
      readOk: false,
      writeOk: false,
      hasState: false,
      snapshots: 0,
      latestAt: "",
      error: opened.error,
    };
  }

  try {
    const checkedAt = new Date().toISOString();
    opened.db.prepare(`
      INSERT INTO local_backup_health (id, checked_at)
      VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET checked_at = excluded.checked_at
    `).run("__probe", checkedAt);
    const current = opened.db.prepare("SELECT updated_at FROM local_app_state WHERE id = ?").get("main");
    const count = opened.db.prepare("SELECT COUNT(*) AS count FROM app_state_backups").get();

    return {
      configured: true,
      available: true,
      path: opened.file,
      readOk: true,
      writeOk: true,
      hasState: Boolean(current),
      snapshots: Number(count?.count || 0),
      latestAt: String(current?.updated_at || ""),
      error: "",
    };
  } catch (error) {
    return {
      configured: true,
      available: true,
      path: opened.file,
      readOk: false,
      writeOk: false,
      hasState: false,
      snapshots: 0,
      latestAt: "",
      error: error instanceof Error ? error.message : "Local backup diagnostics failed.",
    };
  } finally {
    opened.db.close();
  }
}
