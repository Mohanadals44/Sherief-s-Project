import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "app.db");
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS outlets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rss_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_researched_at INTEGER
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
  cron_expr TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  cursor_agent_id TEXT,
  cursor_run_id TEXT,
  model_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  ended_at INTEGER,
  duration_ms INTEGER,
  error TEXT,
  output TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_report_id ON runs(report_id);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
`;

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.exec(DDL);
sqlite.close();

console.log(`Schema applied to ${dbPath}`);
