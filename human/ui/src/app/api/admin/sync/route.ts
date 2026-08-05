import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { syncVideosFromS3 } from "@/lib/s3-sync";
import { mediaBackend } from "@/lib/media-store";

/** Refresh platform DB from S3 manifest + meta sidecars; assign new comparisons. */
export async function POST() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (mediaBackend() !== "s3") {
    return NextResponse.json(
      {
        error:
          "MEDIA_BACKEND is not s3 — set MEDIA_BACKEND=s3 and S3_* env vars on Render",
      },
      { status: 400 }
    );
  }
  try {
    const result = await syncVideosFromS3();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
