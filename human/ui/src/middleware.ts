import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

/**
 * Page-level gate: require a sealed session cookie with participantId.
 * API routes enforce their own auth (requireAdmin / requireParticipant).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const res = NextResponse.next();

  try {
    const session = await getIronSession<SessionData>(
      request,
      res,
      sessionOptions()
    );
    if (!session.participantId) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (pathname.startsWith("/admin") && !session.isAdmin) {
      return NextResponse.redirect(new URL("/grade", request.url));
    }
    if (pathname.startsWith("/grade") && session.isAdmin) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/grade/:path*"],
};
