import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/auth";
import { getDb, type ComparisonRow, type VideoRow } from "@/lib/db";
import { getTask } from "@/lib/tasks";
import { ensureAssignments } from "@/lib/assignments";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireParticipant();
  if (!session?.participantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const db = getDb();
  const comp = db
    .prepare("SELECT * FROM comparisons WHERE id = ?")
    .get(id) as ComparisonRow | undefined;

  if (!comp || comp.participant_id !== session.participantId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const sample = db
    .prepare("SELECT * FROM videos WHERE video_id = ?")
    .get(comp.video_id_model) as VideoRow;
  const task = getTask(sample.task_id);
  const progress = ensureAssignments(session.participantId);

  return NextResponse.json({
    id: comp.id,
    status: comp.status,
    task: {
      id: sample.task_id,
      name: task?.name ?? sample.task_id.slice(0, 8),
      prompt: task?.prompt ?? "",
      rubric_pretty: task?.rubric_pretty,
      reference_file_urls: task?.reference_file_urls ?? [],
    },
    media: {
      A: `/api/media/${comp.id}/A`,
      B: `/api/media/${comp.id}/B`,
    },
    progress: progress
      ? {
          index: progress.index,
          total: progress.total,
          remaining: progress.remaining,
        }
      : { index: 1, total: 1, remaining: 0 },
  });
}
