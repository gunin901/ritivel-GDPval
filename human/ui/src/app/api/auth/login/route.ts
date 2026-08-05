import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureAssignment } from "@/lib/assignments";

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const passkey = String(body.passkey ?? "").trim();
  if (!email || !passkey) {
    return NextResponse.json(
      { error: "Email and passkey required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const user = db
    .prepare(
      "SELECT * FROM participants WHERE lower(email) = ? AND passkey = ? AND active = 1"
    )
    .get(email, passkey) as
    | {
        id: string;
        display_name: string;
        email: string;
        is_admin: number;
      }
    | undefined;

  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or passkey" },
      { status: 401 }
    );
  }

  if (!user.is_admin) {
    ensureAssignment(user.id);
  }

  const session = await getSession();
  session.participantId = user.id;
  session.email = user.email;
  session.name = user.display_name;
  session.isAdmin = !!user.is_admin;
  await session.save();

  return NextResponse.json({
    ok: true,
    isAdmin: !!user.is_admin,
    name: user.display_name,
  });
}
