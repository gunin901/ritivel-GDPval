#!/usr/bin/env node
/**
 * Register S3 manifest videos into the platform SQLite DB (on a machine that can
 * reach DATA_DIR / eval.db). Does not re-upload objects — only DB rows.
 *
 * Usage (from human/ui with deps installed, or via tsx from repo):
 *   S3_BUCKET=... DATA_DIR=/var/data node ../s3/sync-manifest-to-db.mjs
 *
 * Or download manifest first:
 *   aws s3 cp s3://$S3_BUCKET/manifest.json /tmp/manifest.json
 *   MANIFEST=/tmp/manifest.json DATA_DIR=../data node ../s3/sync-manifest-to-db.mjs
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

# Resolve better-sqlite3 from human/ui when available; otherwise expect DATABASE sync via Admin Refresh.
const uiRoot = path.resolve(__dirname, "../ui");
let Database;
try {
  Database = require(path.join(uiRoot, "node_modules/better-sqlite3"));
} catch {
  console.error("Run from an environment with human/ui deps, or use Admin → Refresh from S3.");
  process.exit(1);
}

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "eval.db");

const manifestPath =
  process.env.MANIFEST || path.join(__dirname, "manifest.generated.json");

if (!fs.existsSync(manifestPath)) {
  console.error("Manifest not found:", manifestPath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const bucket = manifest.bucket || process.env.S3_BUCKET;
if (!bucket) {
  console.error("bucket missing in manifest / S3_BUCKET");
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const insert = db.prepare(`
  INSERT INTO videos
    (video_id, task_id, is_gold, model_id, cost_usd, iteration, original_name, media_path, active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
`);
const exists = db.prepare(`SELECT video_id FROM videos WHERE video_id = ?`);

const now = new Date().toISOString();
let added = 0;
let skipped = 0;

const tx = db.transaction(() => {
  for (const v of manifest.videos || []) {
    if (!v.video_id || !v.task_id || !v.key) {
      console.warn("skip incomplete entry", v);
      continue;
    }
    if (exists.get(v.video_id)) {
      skipped++;
      continue;
    }
    const mediaPath = `s3://${bucket}/${v.key.replace(/^\//, "")}`;
    insert.run(
      v.video_id,
      v.task_id,
      v.is_gold ? 1 : 0,
      v.is_gold ? null : v.model_id,
      Number(v.cost_usd || 0),
      Number(v.iteration || 0),
      v.original_name || path.basename(v.key),
      mediaPath,
      now
    );
    added++;
  }
});
tx();

console.log(JSON.stringify({ dbPath, added, skipped, total: (manifest.videos || []).length }, null, 2));
