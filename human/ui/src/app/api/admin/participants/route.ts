import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth";
import { getDb, nowIso, type ParticipantRow } from "@/lib/db";
import { ensureAssignment } from "@/lib/assignments";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM participants ORDER BY is_admin DESC, created_at DESC"
    )
    .all() as ParticipantRow[];
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const display_name = String(body.display_name ?? email.split("@")[0]).trim();
  const is_admin = body.is_admin ? 1 : 0;
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const passkey = randomBytes(6).toString("hex");
  const id = randomUUID();
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO participants (id, display_name, email, passkey, is_admin, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).run(id, display_name, email, passkey, is_admin, nowIso());
  } catch {
    return NextResponse.json(
      { error: "email already exists" },
      { status: 409 }
    );
  }

  if (!is_admin) ensureAssignment(id);

  return NextResponse.json({ id, email, display_name, passkey, is_admin });
}

export async function PATCH(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const db = getDb();

  if (body.action === "regenerate_passkey") {
    const passkey = randomBytes(6).toString("hex");
    db.prepare("UPDATE participants SET passkey = ? WHERE id = ?").run(
      passkey,
      id
    );
    return NextResponse.json({ ok: true, passkey });
  }

  if (typeof body.is_admin === "boolean") {
    db.prepare("UPDATE participants SET is_admin = ? WHERE id = ?").run(
      body.is_admin ? 1 : 0,
      id
    );
  }
  if (typeof body.active === "boolean") {
    db.prepare("UPDATE participants SET active = ? WHERE id = ?").run(
      body.active ? 1 : 0,
      id
    );
  }
  return NextResponse.json({ ok: true });
}
