import { redirect } from "next/navigation";
import { requireAuth, getSession } from "@/lib/auth";
import { GradeNav } from "./GradeNav";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

export default async function GradeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  if (!session) redirect("/login");
  if (session.isAdmin) redirect("/admin");

  return (
    <div className="min-h-screen p-3 md:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1400px] flex-col overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-white shadow-[0_20px_60px_-28px_rgba(76,29,149,0.35)] md:min-h-[calc(100vh-2.5rem)]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-extrabold text-white">
              GV
            </div>
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                GDPval
              </p>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-lg font-bold text-[var(--foreground)]">
                  Grading
                </span>
                <span className="text-sm text-[var(--muted)]">
                  {session.name}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GradeNav />
            <form action={logout}>
              <button
                type="submit"
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--muted)] hover:bg-white hover:text-[var(--accent)]"
              >
                Log out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-5 py-7 sm:px-8 sm:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
