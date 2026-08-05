import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/auth";
import { ensureAssignments } from "@/lib/assignments";
import { getTask } from "@/lib/tasks";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await requireParticipant();
  if (!session?.participantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const next = ensureAssignments(session.participantId);
  if (!next) {
    const db = getDb();
    const done = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM comparisons WHERE participant_id = ? AND status = 'done'"
        )
        .get(session.participantId) as { c: number }
    ).c;
    if (done > 0) {
      return NextResponse.json(
        { error: "queue_empty", done: true, completed: done },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "No gold/model videos available yet" },
      { status: 404 }
    );
  }

  const { comparison: comp, index, total, remaining } = next;
  const db = getDb();
  const sample = db
    .prepare("SELECT task_id FROM videos WHERE video_id = ?")
    .get(comp.video_id_model) as { task_id: string };
  const task = getTask(sample.task_id);

  return NextResponse.json({
    id: comp.id,
    status: comp.status,
    task_name: task?.name ?? sample.task_id.slice(0, 8),
    index,
    total,
    remaining,
  });
}
