import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/auth";
import { getDb, type ComparisonRow, type VideoRow } from "@/lib/db";
import { getTask } from "@/lib/tasks";
import { ensureAssignments } from "@/lib/assignments";
import { createPlaybackUrl, parseS3Path } from "@/lib/media-store";

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
  const gold = db
    .prepare("SELECT * FROM videos WHERE video_id = ?")
    .get(comp.video_id_gold) as VideoRow;
  const task = getTask(sample.task_id);
  const progress = ensureAssignments(session.participantId);

  // Default: same-origin media proxy (works for local FS).
  // When objects live on S3, return pre-signed URLs so the browser streams
  // directly from S3/CloudFront (Range requests, no Render bandwidth hop).
  let mediaA = `/api/media/${comp.id}/A`;
  let mediaB = `/api/media/${comp.id}/B`;

  const order = JSON.parse(comp.order_shown) as ["model" | "gold", "model" | "gold"];
  const sideVideo = (side: "A" | "B") => {
    const role = side === "A" ? order[0] : order[1];
    return role === "gold" ? gold : sample;
  };

  if (parseS3Path(sample.media_path) || parseS3Path(gold.media_path)) {
    const [urlA, urlB] = await Promise.all([
      createPlaybackUrl(sideVideo("A").media_path),
      createPlaybackUrl(sideVideo("B").media_path),
    ]);
    if (urlA) mediaA = urlA;
    if (urlB) mediaB = urlB;
  }

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
      A: mediaA,
      B: mediaB,
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
