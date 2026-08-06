import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/** Public site origin behind Render/Cloudflare proxies. */
function publicOrigin(req: NextRequest): string {
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host.split(",")[0].trim()}`;
  return req.nextUrl.origin;
}

async function clearSessionAndRedirect(req: NextRequest) {
  const session = await getSession();
  session.destroy();
  const next = req.nextUrl.searchParams.get("next") || "/login";
  const path = next.startsWith("/") ? next : "/login";
  return NextResponse.redirect(new URL(path, publicOrigin(req)));
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
