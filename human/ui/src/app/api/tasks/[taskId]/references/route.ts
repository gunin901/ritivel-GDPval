import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/auth";
import { createSignedUrlForKey } from "@/lib/media-store";
import { getTaskReferenceBundle } from "@/lib/task-references";

/** Signed URLs for task reference materials (PDF / reel footage). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await requireParticipant();
  if (!session?.participantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { taskId } = await params;
  const bundle = getTaskReferenceBundle(taskId);
  if (!bundle) {
    return NextResponse.json({ taskId, highlights: [], gallery: [] });
  }

  const sign = async (
    asset: (typeof bundle.highlights)[number],
    asAttachment = false
  ) => {
    const url = await createSignedUrlForKey(asset.key, {
      disposition: asAttachment || asset.kind === "zip" ? "attachment" : "inline",
      filename: asset.label,
    });
    return {
      id: asset.id,
      label: asset.label,
      kind: asset.kind,
      url,
    };
  };

  const [highlights, gallery] = await Promise.all([
    Promise.all(
      bundle.highlights.map((a) => sign(a, a.kind === "zip" || a.kind === "pdf"))
    ),
    Promise.all(bundle.gallery.map((a) => sign(a, false))),
  ]);

  return NextResponse.json({
    taskId,
    highlights: highlights.filter((h) => h.url),
    gallery: gallery.filter((g) => g.url),
    galleryPath: gallery.length
      ? `/grade/references/${taskId}`
      : null,
  });
}
