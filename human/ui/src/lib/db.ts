import Database from "better-sqlite3";
import { dbPath } from "./paths";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const db = new Database(dbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  // Lazy seed to avoid circular imports at module load
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { seedIfNeeded } = require("./seed") as typeof import("./seed");
  seedIfNeeded(db);
  _db = db;
  return db;
}

/** Test helper: reset singleton between smoke runs. */
export function resetDbForTests() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passkey TEXT NOT NULL UNIQUE,
      is_admin INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS videos (
      video_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      is_gold INTEGER NOT NULL DEFAULT 0,
      model_id TEXT,
      cost_usd REAL NOT NULL DEFAULT 0,
      iteration INTEGER NOT NULL DEFAULT 0,
      original_name TEXT NOT NULL,
      media_path TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (model_id) REFERENCES models(id)
    );

    CREATE TABLE IF NOT EXISTS comparisons (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      video_id_model TEXT NOT NULL,
      video_id_gold TEXT NOT NULL,
      order_shown TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      queue_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (participant_id) REFERENCES participants(id),
      FOREIGN KEY (video_id_model) REFERENCES videos(video_id),
      FOREIGN KEY (video_id_gold) REFERENCES videos(video_id),
      UNIQUE (participant_id, video_id_model)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY,
      comparison_id TEXT NOT NULL UNIQUE,
      participant_id TEXT NOT NULL,
      video_id_model TEXT NOT NULL,
      video_id_gold TEXT NOT NULL,
      label TEXT NOT NULL,
      score REAL NOT NULL,
      failure_tags TEXT NOT NULL,
      justification TEXT NOT NULL,
      seconds_spent INTEGER NOT NULL,
      qc_flag INTEGER NOT NULL DEFAULT 0,
      submitted_at TEXT NOT NULL,
      FOREIGN KEY (comparison_id) REFERENCES comparisons(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Legacy DBs with invite_token and no passkey: wipe and recreate (dev only)
  const cols = db.prepare("PRAGMA table_info(participants)").all() as {
    name: string;
  }[];
  const names = new Set(cols.map((c) => c.name));
  if (names.has("invite_token") && !names.has("passkey")) {
    db.exec(`
      DROP TABLE IF EXISTS ratings;
      DROP TABLE IF EXISTS comparisons;
      DROP TABLE IF EXISTS videos;
      DROP TABLE IF EXISTS participants;
      DROP TABLE IF EXISTS models;
      DROP TABLE IF EXISTS participants_v2;
    `);
    // recreate via recursive migrate after wipe
    migrate(db);
    return;
  }

  const comparisonCols = db
    .prepare("PRAGMA table_info(comparisons)")
    .all() as { name: string }[];
  if (!comparisonCols.some((c) => c.name === "queue_index")) {
    db.exec(
      "ALTER TABLE comparisons ADD COLUMN queue_index INTEGER NOT NULL DEFAULT 0"
    );
  }
}

export type ModelRow = {
  id: string;
  display_name: string;
  active: number;
  created_at: string;
};

export type ParticipantRow = {
  id: string;
  display_name: string;
  email: string;
  passkey: string;
  is_admin: number;
  active: number;
  created_at: string;
};

export type VideoRow = {
  video_id: string;
  task_id: string;
  is_gold: number;
  model_id: string | null;
  cost_usd: number;
  iteration: number;
  original_name: string;
  media_path: string;
  active: number;
  created_at: string;
};

export type ComparisonRow = {
  id: string;
  participant_id: string;
  video_id_model: string;
  video_id_gold: string;
  order_shown: string;
  status: string;
  queue_index: number;
  created_at: string;
};

export type RatingRow = {
  id: string;
  comparison_id: string;
  participant_id: string;
  video_id_model: string;
  video_id_gold: string;
  label: string;
  score: number;
  failure_tags: string;
  justification: string;
  seconds_spent: number;
  qc_flag: number;
  submitted_at: string;
};

export function nowIso(): string {
  return new Date().toISOString();
}
