import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         v.task_id,
         m.display_name as model,
         v.model_id,
         v.iteration as sample,
         v.iteration,
         v.cost_usd,
         r.video_id_model,
         r.video_id_gold,
         r.participant_id as evaluator_id,
         r.participant_id,
         c.order_shown,
         r.label,
         r.score,
         r.failure_tags,
         r.justification,
         r.seconds_spent,
         r.qc_flag,
         r.submitted_at,
         g.iteration as gold_iteration
       FROM ratings r
       JOIN comparisons c ON c.id = r.comparison_id
       JOIN videos v ON v.video_id = r.video_id_model
       LEFT JOIN models m ON m.id = v.model_id
       LEFT JOIN videos g ON g.video_id = r.video_id_gold
       ORDER BY r.submitted_at ASC`
    )
    .all() as Record<string, unknown>[];

  const header = [
    "task_id",
    "model",
    "model_id",
    "sample",
    "iteration",
    "cost_usd",
    "video_id_model",
    "video_id_gold",
    "evaluator_id",
    "participant_id",
    "order_shown",
    "label",
    "score",
    "failure_tags",
    "justification",
    "seconds_spent",
    "qc_flag",
    "submitted_at",
    "gold_iteration",
  ];

  const lines = rows.map((r) =>
    JSON.stringify({
      task_id: r.task_id,
      model: r.model,
      model_id: r.model_id,
      sample: r.sample,
      iteration: r.iteration,
      cost_usd: r.cost_usd,
      video_id_model: r.video_id_model,
      video_id_gold: r.video_id_gold,
      evaluator_id: r.evaluator_id,
      participant_id: r.participant_id,
      order_shown: (() => {
        try {
          return JSON.parse(String(r.order_shown));
        } catch {
          return r.order_shown;
        }
      })(),
      label: r.label,
      score: r.score,
      failure_tags: (() => {
        try {
          return JSON.parse(String(r.failure_tags));
        } catch {
          return [];
        }
      })(),
      justification: r.justification,
      seconds_spent: r.seconds_spent,
      qc_flag: !!r.qc_flag,
      submitted_at: r.submitted_at,
      gold_iteration: r.gold_iteration,
    })
  );

  // NDJSON for easy piping; also valid line-delimited JSON
  const body = lines.join("\n") + (lines.length ? "\n" : "");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gdpval-ratings.jsonl"',
      "X-Columns": header.join(","),
    },
  });
}
