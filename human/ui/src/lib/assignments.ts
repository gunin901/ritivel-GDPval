import { randomUUID } from "crypto";
import { getDb, nowIso, type ComparisonRow, type VideoRow } from "./db";
import { randomOrder } from "./blinding";

export type QueueProgress = {
  comparison: ComparisonRow;
  index: number;
  total: number;
  remaining: number;
};

type SampleGoldPair = {
  sample: VideoRow;
  gold: VideoRow;
};

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Every active model sample paired with the active gold for its task.
 * Samples without a gold for their task are skipped.
 */
export function resolveSampleGoldPairs(): SampleGoldPair[] {
  const db = getDb();
  const samples = db
    .prepare(
      `SELECT * FROM videos
       WHERE is_gold = 0 AND active = 1
       ORDER BY created_at ASC`
    )
    .all() as VideoRow[];

  const pairs: SampleGoldPair[] = [];
  const goldByTask = new Map<string, VideoRow>();

  for (const sample of samples) {
    let gold = goldByTask.get(sample.task_id);
    if (!gold) {
      gold = db
        .prepare(
          `SELECT * FROM videos
           WHERE task_id = ? AND is_gold = 1 AND active = 1
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(sample.task_id) as VideoRow | undefined;
      if (gold) goldByTask.set(sample.task_id, gold);
    }
    if (!gold) continue;
    pairs.push({ sample, gold });
  }
  return pairs;
}

export function reshuffleParticipantQueue(participantId: string): void {
  const db = getDb();
  const rows = db
    .prepare("SELECT id FROM comparisons WHERE participant_id = ?")
    .all(participantId) as { id: string }[];
  if (rows.length === 0) return;

  shuffleInPlace(rows);
  const update = db.prepare(
    "UPDATE comparisons SET queue_index = ? WHERE id = ?"
  );
  const tx = db.transaction(() => {
    rows.forEach((row, i) => update.run(i, row.id));
  });
  tx();
}

export function ensureAssignment(participantId: string): ComparisonRow | null {
  return ensureAssignments(participantId)?.comparison ?? null;
}

/** Ensure grader has comparisons for every sample↔gold pair; return next pending. */
export function ensureAssignments(
  participantId: string
): QueueProgress | null {
  const pairs = resolveSampleGoldPairs();
  if (pairs.length === 0) return null;

  const db = getDb();
  let created = 0;

  const insert = db.prepare(
    `INSERT INTO comparisons
      (id, participant_id, video_id_model, video_id_gold, order_shown, status, queue_index, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`
  );

  const tx = db.transaction(() => {
    for (const { sample, gold } of pairs) {
      const existing = db
        .prepare(
          "SELECT id FROM comparisons WHERE participant_id = ? AND video_id_model = ?"
        )
        .get(participantId, sample.video_id) as { id: string } | undefined;
      if (existing) continue;

      insert.run(
        randomUUID(),
        participantId,
        sample.video_id,
        gold.video_id,
        JSON.stringify(randomOrder()),
        nowIso()
      );
      created++;
    }
  });
  tx();

  const allBefore = db
    .prepare(
      "SELECT id, queue_index FROM comparisons WHERE participant_id = ?"
    )
    .all(participantId) as { id: string; queue_index: number }[];

  const distinctIndexes = new Set(allBefore.map((r) => r.queue_index)).size;
  if (created > 0 || (allBefore.length > 1 && distinctIndexes <= 1)) {
    reshuffleParticipantQueue(participantId);
  }

  const all = db
    .prepare(
      `SELECT * FROM comparisons
       WHERE participant_id = ?
       ORDER BY queue_index ASC, created_at ASC`
    )
    .all(participantId) as ComparisonRow[];

  if (all.length === 0) return null;

  const next = all.find((c) => c.status === "pending") ?? null;
  if (!next) return null;

  const index = all.findIndex((c) => c.id === next.id) + 1;
  const remaining = all.filter((c) => c.status === "pending").length;

  return {
    comparison: next,
    index,
    total: all.length,
    remaining,
  };
}

/** Assign new sample pairs to all active non-admin graders. */
export function assignNewVideosToGraders(): number {
  const db = getDb();
  const graders = db
    .prepare(
      "SELECT id FROM participants WHERE active = 1 AND is_admin = 0"
    )
    .all() as { id: string }[];
  let n = 0;
  for (const g of graders) {
    const before = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM comparisons WHERE participant_id = ?"
        )
        .get(g.id) as { c: number }
    ).c;
    ensureAssignments(g.id);
    const after = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM comparisons WHERE participant_id = ?"
        )
        .get(g.id) as { c: number }
    ).c;
    n += Math.max(0, after - before);
  }
  return n;
}
