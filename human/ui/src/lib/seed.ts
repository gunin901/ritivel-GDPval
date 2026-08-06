import fs from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { HARDCODED_MODELS, HARDCODED_MODEL_IDS } from "./constants";
import { dataDir } from "./paths";

const TASK_ID = "e222075d-5d62-4757-ae3c-e34b0846583b";
const GOLD_VIDEO_ID = "00000000-0000-4000-8000-000000000001";
const MODEL_VIDEO_ID = "00000000-0000-4000-8000-000000000002";
const MODEL_VIDEO_ID_2 = "00000000-0000-4000-8000-000000000003";
const MODEL_VIDEO_ID_3 = "00000000-0000-4000-8000-000000000004";
const SAMPLE_MODEL_IDS = [
  MODEL_VIDEO_ID,
  MODEL_VIDEO_ID_2,
  MODEL_VIDEO_ID_3,
] as const;
const SAMPLE_MODEL_ID = HARDCODED_MODELS[0].id;
const LEGACY_SAMPLE_MODEL_ID = "00000000-0000-4000-8000-0000000000aa";

function nowIso() {
  return new Date().toISOString();
}

function sampleVideoSources(): { gold: string; model: string } {
  const root = path.resolve(process.cwd(), "..", "..", "Sample videos");
  return {
    gold: path.join(root, "Gold", "IMG_1372.mov"),
    model: path.join(root, "Model", "IMG_1368.mov"),
  };
}

function copyMedia(src: string, videoId: string, ext: string): string {
  const dest = path.join(dataDir(), "media", `${videoId}${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
    fs.copyFileSync(src, dest);
  }
  return dest;
}

function resolveSeededMedia(videoId: string, fallbackExt: string): string {
  const dir = path.join(dataDir(), "media");
  for (const ext of [".mp4", ".mov", ".webm", fallbackExt]) {
    const p = path.join(dir, `${videoId}${ext}`);
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return p;
  }
  return path.join(dir, `${videoId}${fallbackExt}`);
}

/** Ensure bootstrap admin + sample gold/model videos exist. */
export function seedIfNeeded(db: Database.Database) {
  try {
    db.prepare("SELECT email FROM participants LIMIT 1").get();
  } catch {
    db.exec(`
      DROP TABLE IF EXISTS ratings;
      DROP TABLE IF EXISTS comparisons;
      DROP TABLE IF EXISTS videos;
      DROP TABLE IF EXISTS participants;
      DROP TABLE IF EXISTS models;
      DROP TABLE IF EXISTS participants_v2;
    `);
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
        seed INTEGER NOT NULL DEFAULT 0,
        original_name TEXT NOT NULL,
        media_path TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
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
        submitted_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  const adminCount = (
    db.prepare("SELECT COUNT(*) as c FROM participants WHERE is_admin = 1").get() as {
      c: number;
    }
  ).c;

  if (adminCount === 0) {
    const passkey = randomBytes(6).toString("hex");
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@gdpval.local";
    db.prepare(
      `INSERT INTO participants (id, display_name, email, passkey, is_admin, active, created_at)
       VALUES (?, ?, ?, ?, 1, 1, ?)`
    ).run(randomUUID(), "Admin", email, passkey, nowIso());
    console.log(
      `[seed] Bootstrap admin → email: ${email}  passkey: ${passkey}`
    );
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('bootstrap_admin_passkey', ?)"
    ).run(passkey);
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('bootstrap_admin_email', ?)"
    ).run(email);
  }

  const insertModel = db.prepare(
    "INSERT INTO models (id, display_name, active, created_at) VALUES (?, ?, 1, ?)"
  );
  const updateModel = db.prepare(
    "UPDATE models SET display_name = ?, active = 1 WHERE id = ?"
  );
  for (const model of HARDCODED_MODELS) {
    const existing = db
      .prepare("SELECT id FROM models WHERE id = ?")
      .get(model.id);
    if (!existing) {
      insertModel.run(model.id, model.display_name, nowIso());
    } else {
      updateModel.run(model.display_name, model.id);
    }
  }
  const allModels = db
    .prepare("SELECT id FROM models")
    .all() as { id: string }[];
  const deactivate = db.prepare("UPDATE models SET active = 0 WHERE id = ?");
  for (const row of allModels) {
    if (!HARDCODED_MODEL_IDS.has(row.id)) deactivate.run(row.id);
  }

  // Remap legacy sample-model videos onto the first hardcoded model
  db.prepare("UPDATE videos SET model_id = ? WHERE model_id = ?").run(
    SAMPLE_MODEL_ID,
    LEGACY_SAMPLE_MODEL_ID
  );

  const { gold: goldSrc, model: modelSrc } = sampleVideoSources();
  if (fs.existsSync(goldSrc) && fs.existsSync(modelSrc)) {
    const goldExists = db
      .prepare("SELECT video_id FROM videos WHERE video_id = ?")
      .get(GOLD_VIDEO_ID);
    if (!goldExists) {
      const dest = fs.existsSync(
        path.join(dataDir(), "media", `${GOLD_VIDEO_ID}.mp4`)
      )
        ? resolveSeededMedia(GOLD_VIDEO_ID, ".mp4")
        : copyMedia(goldSrc, GOLD_VIDEO_ID, ".mov");
      db.prepare(
        `INSERT INTO videos
          (video_id, task_id, is_gold, model_id, cost_usd, seed, original_name, media_path, active, created_at)
         VALUES (?, ?, 1, NULL, 0, 0, ?, ?, 1, ?)`
      ).run(GOLD_VIDEO_ID, TASK_ID, path.basename(dest), dest, nowIso());
    } else {
      const preferred = resolveSeededMedia(GOLD_VIDEO_ID, ".mov");
      if (fs.existsSync(preferred)) {
        db.prepare(
          "UPDATE videos SET media_path = ?, original_name = ? WHERE video_id = ?"
        ).run(preferred, path.basename(preferred), GOLD_VIDEO_ID);
      }
    }
    const modelSamples: { id: string; seed: number }[] = [
      { id: MODEL_VIDEO_ID, seed: 0 },
      { id: MODEL_VIDEO_ID_2, seed: 1 },
      { id: MODEL_VIDEO_ID_3, seed: 2 },
    ];
    for (const sample of modelSamples) {
      const modelVid = db
        .prepare("SELECT video_id FROM videos WHERE video_id = ?")
        .get(sample.id);
      if (!modelVid) {
        const dest = fs.existsSync(
          path.join(dataDir(), "media", `${sample.id}.mp4`)
        )
          ? resolveSeededMedia(sample.id, ".mp4")
          : copyMedia(modelSrc, sample.id, ".mov");
        db.prepare(
          `INSERT INTO videos
            (video_id, task_id, is_gold, model_id, cost_usd, seed, original_name, media_path, active, created_at)
           VALUES (?, ?, 0, ?, 0, ?, ?, ?, 1, ?)`
        ).run(
          sample.id,
          TASK_ID,
          SAMPLE_MODEL_ID,
          sample.seed,
          path.basename(dest),
          dest,
          nowIso()
        );
      } else {
        const preferred = resolveSeededMedia(sample.id, ".mov");
        if (fs.existsSync(preferred)) {
          db.prepare(
            "UPDATE videos SET media_path = ?, original_name = ? WHERE video_id = ?"
          ).run(preferred, path.basename(preferred), sample.id);
        }
      }
    }
  }
}

export {
  GOLD_VIDEO_ID,
  MODEL_VIDEO_ID,
  MODEL_VIDEO_ID_2,
  MODEL_VIDEO_ID_3,
  SAMPLE_MODEL_IDS,
  SAMPLE_MODEL_ID,
  TASK_ID,
};
