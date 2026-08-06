import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

async function clearSessionAndRedirect(req: NextRequest) {
  const session = await getSession();
  session.destroy();
  const next = req.nextUrl.searchParams.get("next") || "/login";
  const url = new URL(next.startsWith("/") ? next : "/login", req.url);
  return NextResponse.redirect(url);
}

/** Used by RSC layouts when the cookie is stale after a DB reset. */
export async function GET(req: NextRequest) {
  return clearSessionAndRedirect(req);
}

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
