import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { getDb, type ParticipantRow } from "./db";
import { sessionOptions, type SessionData } from "./session";

export type { SessionData };
export { sessionOptions };

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

/** Load participant from DB; clears stale sessions. */
export async function resolveParticipant(): Promise<{
  session: Awaited<ReturnType<typeof getSession>>;
  user: ParticipantRow;
} | null> {
  const session = await getSession();
  if (!session.participantId) return null;

  const db = getDb();
  const user = db
    .prepare("SELECT * FROM participants WHERE id = ? AND active = 1")
    .get(session.participantId) as ParticipantRow | undefined;

  if (!user) {
    session.destroy();
    return null;
  }

  const isAdmin = !!user.is_admin;
  if (
    session.isAdmin !== isAdmin ||
    session.email !== user.email ||
    session.name !== user.display_name
  ) {
    session.isAdmin = isAdmin;
    session.email = user.email;
    session.name = user.display_name;
    await session.save();
  }

  return { session, user };
}

export async function requireAuth() {
  const resolved = await resolveParticipant();
  if (!resolved) return null;
  return resolved.session;
}

export async function requireAdmin() {
  const resolved = await resolveParticipant();
  if (!resolved?.session.isAdmin) return null;
  return resolved.session;
}

/** Logged-in non-admin graders only. Admins use /admin, not /grade. */
export async function requireParticipant() {
  const resolved = await resolveParticipant();
  if (!resolved?.session.participantId || resolved.session.isAdmin) return null;
  return resolved.session;
}
