import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, type ComparisonRow, type VideoRow } from "@/lib/db";
import { videoIdForSide, type OrderShown } from "@/lib/blinding";
import fs from "fs";
import path from "path";
import { resolveMediaForPlayback } from "@/lib/media-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ comparisonId: string; side: string }> }
) {
  const session = await getSession();
  if (!session.participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { comparisonId, side: sideRaw } = await params;
  const side = sideRaw.toUpperCase();
  if (side !== "A" && side !== "B") {
    return NextResponse.json({ error: "side must be A or B" }, { status: 400 });
  }

  const db = getDb();
  const comp = db
    .prepare("SELECT * FROM comparisons WHERE id = ?")
    .get(comparisonId) as ComparisonRow | undefined;
  if (!comp) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!session.isAdmin && session.participantId !== comp.participant_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const order = JSON.parse(comp.order_shown) as OrderShown;
  const videoId = videoIdForSide(
    side as "A" | "B",
    order,
    comp.video_id_gold,
    comp.video_id_model
  );
  const video = db
    .prepare("SELECT * FROM videos WHERE video_id = ?")
    .get(videoId) as VideoRow | undefined;
  if (!video) {
    return NextResponse.json({ error: "media missing" }, { status: 404 });
  }

  const resolved = await resolveMediaForPlayback(videoId, video.media_path);
  if (!resolved) {
    return NextResponse.json({ error: "media missing" }, { status: 404 });
  }

  // S3/R2: redirect to short-lived signed URL (browser streams with range support)
  if (resolved.kind === "redirect" && resolved.url) {
    return NextResponse.redirect(resolved.url, 302);
  }

  const filePath = resolved.filePath!;
  const fileSize = resolved.size ?? fs.statSync(filePath).size;
  const range = req.headers.get("range");
  const ext = path.extname(filePath) || ".mp4";
  const filename =
    side === "A" ? `deliverable_A${ext}` : `deliverable_B${ext}`;
  const contentType = resolved.contentType;

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (!m) {
      return new NextResponse(null, { status: 416 });
    }
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : fileSize - 1;
    if (start >= fileSize || end >= fileSize) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    // @ts-expect-error Node ReadableStream
    return new NextResponse(stream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  // @ts-expect-error Node ReadableStream
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
