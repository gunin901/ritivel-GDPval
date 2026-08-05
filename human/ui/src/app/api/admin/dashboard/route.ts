import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { computeWinRates } from "@/lib/metrics-winrate";
import { computeElo } from "@/lib/metrics-elo";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();

  const ratingRows = db
    .prepare(
      `SELECT r.score, r.video_id_model, v.model_id, v.task_id
       FROM ratings r
       JOIN videos v ON v.video_id = r.video_id_model
       WHERE v.model_id IS NOT NULL`
    )
    .all() as {
    score: number;
    video_id_model: string;
    model_id: string;
    task_id: string;
  }[];

  const winInputs = ratingRows.map((r) => ({
    score: r.score,
    modelId: r.model_id,
    taskId: r.task_id,
    videoIdModel: r.video_id_model,
  }));
  const winRates = computeWinRates(winInputs).map((w) => {
    const model = db
      .prepare("SELECT display_name FROM models WHERE id = ?")
      .get(w.modelId) as { display_name: string } | undefined;
    return { ...w, modelName: model?.display_name ?? w.modelId.slice(0, 8) };
  });

  const elo = computeElo(
    ratingRows.map((r) => ({
      modelId: r.model_id,
      score: r.score,
      taskId: r.task_id,
    }))
  ).map((e) => {
    const model = db
      .prepare("SELECT display_name FROM models WHERE id = ?")
      .get(e.modelId) as { display_name: string } | undefined;
    return { ...e, modelName: model?.display_name ?? e.modelId.slice(0, 8) };
  });

  const progress = db
    .prepare(
      `SELECT p.id, p.display_name, p.email,
              COUNT(c.id) as total,
              SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END) as done
       FROM participants p
       LEFT JOIN comparisons c ON c.participant_id = p.id
       WHERE p.active = 1 AND p.is_admin = 0
       GROUP BY p.id
       ORDER BY p.display_name`
    )
    .all() as {
    id: string;
    display_name: string;
    email: string;
    total: number;
    done: number;
  }[];

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM videos WHERE active = 1 AND is_gold = 1) as golds,
         (SELECT COUNT(*) FROM videos WHERE active = 1 AND is_gold = 0) as samples,
         (SELECT COUNT(*) FROM ratings) as ratings,
         (SELECT COUNT(*) FROM participants WHERE active = 1 AND is_admin = 0) as graders`
    )
    .get() as {
    golds: number;
    samples: number;
    ratings: number;
    graders: number;
  };

  return NextResponse.json({
    winRates,
    elo,
    progress,
    counts,
  });
}
