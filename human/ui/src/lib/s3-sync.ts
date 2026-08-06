import { getDb, nowIso } from "./db";
import { assignNewVideosToGraders } from "./assignments";
import { HARDCODED_MODEL_IDS } from "./constants";
import { mergeVideoCatalog } from "./s3-catalog";
import {
  loadAllVideoMetasFromS3,
  mediaBackend,
  s3Bucket,
  type VideoMeta,
} from "./media-store";

export type SyncResult = {
  backend: "s3" | "fs";
  bucket?: string;
  scanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  assigned: number;
  deactivated_local: number;
  videos: VideoMeta[];
};

/**
 * Pull video + metadata from S3 (+ bundled video_ids catalog) into SQLite,
 * then ensure every active non-admin grader has comparisons for new model
 * samples vs task gold.
 */
export async function syncVideosFromS3(): Promise<SyncResult> {
  if (mediaBackend() !== "s3") {
    return {
      backend: "fs",
      scanned: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      assigned: 0,
      deactivated_local: 0,
      videos: [],
    };
  }

  const bucket = s3Bucket();
  const metas = mergeVideoCatalog(await loadAllVideoMetasFromS3());
  const db = getDb();

  const select = db.prepare("SELECT video_id FROM videos WHERE video_id = ?");
  const insert = db.prepare(`
    INSERT INTO videos
      (video_id, task_id, is_gold, model_id, cost_usd, seed, original_name, media_path, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const update = db.prepare(`
    UPDATE videos SET
      task_id = ?,
      is_gold = ?,
      model_id = ?,
      cost_usd = ?,
      seed = ?,
      original_name = ?,
      media_path = ?,
      active = 1
    WHERE video_id = ?
  `);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const v of metas) {
      if (!v.video_id || !v.task_id || !v.key) {
        skipped++;
        continue;
      }
      // Gold has null model_id; model samples need a known roster id (FK).
      if (!v.is_gold && (!v.model_id || !HARDCODED_MODEL_IDS.has(v.model_id))) {
        skipped++;
        continue;
      }
      const mediaPath = `s3://${bucket}/${v.key.replace(/^\//, "")}`;
      const existing = select.get(v.video_id);
      if (existing) {
        update.run(
          v.task_id,
          v.is_gold ? 1 : 0,
          v.is_gold ? null : v.model_id,
          Number(v.cost_usd || 0),
          Number(v.seed || 0),
          v.original_name || v.key.split("/").pop() || v.video_id,
          mediaPath,
          v.video_id
        );
        updated++;
      } else {
        insert.run(
          v.video_id,
          v.task_id,
          v.is_gold ? 1 : 0,
          v.is_gold ? null : v.model_id,
          Number(v.cost_usd || 0),
          Number(v.seed || 0),
          v.original_name || v.key.split("/").pop() || v.video_id,
          mediaPath,
          nowIso()
        );
        inserted++;
      }
    }
  });
  tx();

  // Hide local FS seed placeholders once S3 inventory is live.
  const deactivated_local = db
    .prepare(
      `UPDATE videos SET active = 0
       WHERE active = 1 AND media_path NOT LIKE 's3://%'`
    )
    .run().changes;

  const assigned = assignNewVideosToGraders();

  return {
    backend: "s3",
    bucket,
    scanned: metas.length,
    inserted,
    updated,
    skipped,
    assigned,
    deactivated_local,
    videos: metas,
  };
}
