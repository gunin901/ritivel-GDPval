import { redirect } from "next/navigation";
import { getSession, resolveParticipant } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const raw = await getSession();
  if (!raw.participantId) redirect("/login");
  const resolved = await resolveParticipant();
  if (!resolved) redirect("/api/auth/logout");
  if (resolved.session.isAdmin) redirect("/admin");
  redirect("/grade/instructions");
}
