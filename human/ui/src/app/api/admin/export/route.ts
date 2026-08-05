import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * One JSONL row per rating with full granularity:
 * participant × task × comparison × model-video details (id, model, cost, iteration)
 * and paired gold video details.
 */
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         c.id as comparison_id,
         c.status as comparison_status,
         c.order_shown,
         c.queue_index,
         p.id as participant_id,
         p.display_name as participant_name,
         p.email as participant_email,
         v.task_id,
         v.video_id as video_id_model,
         v.model_id,
         m.display_name as model_name,
         v.iteration as model_iteration,
         v.cost_usd as model_cost_usd,
         v.original_name as model_original_name,
         v.media_path as model_media_path,
         g.video_id as video_id_gold,
         g.iteration as gold_iteration,
         g.original_name as gold_original_name,
         g.media_path as gold_media_path,
         g.cost_usd as gold_cost_usd,
         r.id as rating_id,
         r.label,
         r.score,
         r.failure_tags,
         r.justification,
         r.seconds_spent,
         r.qc_flag,
         r.submitted_at
       FROM comparisons c
       JOIN participants p ON p.id = c.participant_id
       JOIN videos v ON v.video_id = c.video_id_model
       LEFT JOIN models m ON m.id = v.model_id
       LEFT JOIN videos g ON g.video_id = c.video_id_gold
       LEFT JOIN ratings r ON r.comparison_id = c.id
       WHERE p.is_admin = 0
       ORDER BY p.email ASC, v.task_id ASC, c.queue_index ASC, c.created_at ASC`
    )
    .all() as Record<string, unknown>[];

  const lines = rows.map((r) =>
    JSON.stringify({
      // Keys for analysis: participant × task × comparison × videos
      participant_id: r.participant_id,
      participant_name: r.participant_name,
      participant_email: r.participant_email,
      task_id: r.task_id,
      comparison_id: r.comparison_id,
      comparison_status: r.comparison_status,
      queue_index: r.queue_index,
      order_shown: (() => {
        try {
          return JSON.parse(String(r.order_shown));
        } catch {
          return r.order_shown;
        }
      })(),
      // Model / sample video
      video_id_model: r.video_id_model,
      model_id: r.model_id,
      model_name: r.model_name,
      model_iteration: r.model_iteration,
      model_cost_usd: r.model_cost_usd,
      model_original_name: r.model_original_name,
      model_media_path: r.model_media_path,
      // Gold video
      video_id_gold: r.video_id_gold,
      gold_iteration: r.gold_iteration,
      gold_original_name: r.gold_original_name,
      gold_media_path: r.gold_media_path,
      gold_cost_usd: r.gold_cost_usd,
      // Rating (null if not yet submitted)
      rating_id: r.rating_id ?? null,
      label: r.label ?? null,
      score: r.score ?? null,
      failure_tags: (() => {
        if (r.failure_tags == null) return null;
        try {
          return JSON.parse(String(r.failure_tags));
        } catch {
          return [];
        }
      })(),
      justification: r.justification ?? null,
      seconds_spent: r.seconds_spent ?? null,
      qc_flag: r.qc_flag == null ? null : !!r.qc_flag,
      submitted_at: r.submitted_at ?? null,
    })
  );

  const body = lines.join("\n") + (lines.length ? "\n" : "");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="gdpval-participant-task-comparison.jsonl"',
    },
  });
}
