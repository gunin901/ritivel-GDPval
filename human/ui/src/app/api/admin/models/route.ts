import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb, type ModelRow } from "@/lib/db";
import { HARDCODED_MODELS } from "@/lib/constants";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM models WHERE active = 1 ORDER BY display_name")
    .all() as ModelRow[];
  // Prefer hardcoded order
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = HARDCODED_MODELS.map((m) => byId.get(m.id)).filter(
    Boolean
  ) as ModelRow[];
  return NextResponse.json(ordered.length ? ordered : rows);
}
