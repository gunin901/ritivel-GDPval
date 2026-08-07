import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/auth";
import { getDb, nowIso, type ComparisonRow } from "@/lib/db";
import { mapChoiceToModelScore, type OrderShown } from "@/lib/blinding";
import { FAILURE_TAGS, wordCount } from "@/lib/constants";
import { randomUUID } from "crypto";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireParticipant();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const choice = body.choice as "a" | "tie" | "b";
  const justification = String(body.justification ?? "");
  const seconds_spent = Number(body.seconds_spent ?? 0);
  const tags = Array.isArray(body.failure_tags) ? body.failure_tags : [];

  if (!["a", "tie", "b"].includes(choice)) {
    return NextResponse.json({ error: "invalid choice" }, { status: 400 });
  }
  if (wordCount(justification) < 30) {
    return NextResponse.json(
      { error: "justification must be at least 30 words" },
      { status: 400 }
    );
  }
  const failure_tags = tags.filter((t: string) =>
    (FAILURE_TAGS as readonly string[]).includes(t)
  );

  const db = getDb();
  const comp = db
    .prepare("SELECT * FROM comparisons WHERE id = ?")
    .get(id) as ComparisonRow | undefined;
  if (!comp || comp.participant_id !== session.participantId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (comp.status === "done") {
    return NextResponse.json({ error: "already rated" }, { status: 409 });
  }

  const order = JSON.parse(comp.order_shown) as OrderShown;
  const { label, score } = mapChoiceToModelScore(choice, order);
  const qc_flag = seconds_spent < 120 ? 1 : 0;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO ratings
        (id, comparison_id, participant_id, video_id_model, video_id_gold,
         label, score, failure_tags, justification, seconds_spent, qc_flag, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      comp.id,
      session.participantId,
      comp.video_id_model,
      comp.video_id_gold,
      label,
      score,
      JSON.stringify(failure_tags),
      justification,
      Math.max(0, Math.floor(seconds_spent)),
      qc_flag,
      nowIso()
    );
    db.prepare("UPDATE comparisons SET status = 'done' WHERE id = ?").run(
      comp.id
    );
  });
  tx();

  return NextResponse.json({ ok: true, label, score, qc_flag: !!qc_flag });
}
