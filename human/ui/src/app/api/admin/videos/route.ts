import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth";
import { getDb, nowIso, type VideoRow } from "@/lib/db";
import { TASK_IDS } from "@/lib/task-ids";
import { HARDCODED_MODEL_IDS } from "@/lib/constants";
import { storeVideoBytes } from "@/lib/media-store";
import { assignNewVideosToGraders } from "@/lib/assignments";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM videos WHERE active = 1 ORDER BY created_at DESC"
    )
    .all() as VideoRow[];
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fd = await req.formData();
  const file = fd.get("file");
  const task_id = String(fd.get("task_id") ?? "");
  const is_gold = String(fd.get("is_gold") ?? "0") === "1";
  const model_id = String(fd.get("model_id") ?? "") || null;
  const cost_usd = Number(fd.get("cost_usd") ?? 0);
  const iteration = Number(fd.get("iteration") ?? 0);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (!(TASK_IDS as readonly string[]).includes(task_id)) {
    return NextResponse.json({ error: "invalid task_id" }, { status: 400 });
  }
  if (!is_gold) {
    if (!model_id || !HARDCODED_MODEL_IDS.has(model_id)) {
      return NextResponse.json({ error: "invalid model_id" }, { status: 400 });
    }
  }

  const videoId = randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }

  const stored = await storeVideoBytes(
    videoId,
    bytes,
    file.name || `${videoId}.mp4`,
    {
      taskId: task_id,
      isGold: is_gold,
      modelId: model_id,
      iteration,
      costUsd: cost_usd,
    }
  );
  const db = getDb();
  db.prepare(
    `INSERT INTO videos
      (video_id, task_id, is_gold, model_id, cost_usd, iteration, original_name, media_path, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    videoId,
    task_id,
    is_gold ? 1 : 0,
    is_gold ? null : model_id,
    cost_usd,
    iteration,
    stored.original_name,
    stored.media_path,
    nowIso()
  );

  const assigned = is_gold ? 0 : assignNewVideosToGraders();

  return NextResponse.json({
    ok: true,
    video_id: videoId,
    media_path: stored.media_path,
    assigned,
  });
}

export async function DELETE(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const videoId = String(body.video_id ?? "");
  if (!videoId) {
    return NextResponse.json({ error: "video_id required" }, { status: 400 });
  }
  const db = getDb();
  db.prepare("UPDATE videos SET active = 0 WHERE video_id = ?").run(videoId);
  return NextResponse.json({ ok: true });
}
