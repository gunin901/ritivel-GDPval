import { getDb } from "@/lib/db";

export default function AdminOverviewPage() {
  const db = getDb();
  const email = (
    db
      .prepare("SELECT value FROM settings WHERE key = 'bootstrap_admin_email'")
      .get() as { value: string } | undefined
  )?.value;
  const passkeyRow = db
    .prepare(
      "SELECT value FROM settings WHERE key = 'bootstrap_admin_passkey'"
    )
    .get() as { value: string } | undefined;
  const shown = (
    db
      .prepare(
        "SELECT value FROM settings WHERE key = 'bootstrap_admin_passkey_shown'"
      )
      .get() as { value: string } | undefined
  )?.value;

  // Show bootstrap passkey only until first admin visit acknowledges it
  let bootstrapPasskey: string | null = null;
  if (passkeyRow && shown !== "1") {
    bootstrapPasskey = passkeyRow.value;
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('bootstrap_admin_passkey_shown', '1')"
    ).run();
    db.prepare("DELETE FROM settings WHERE key = 'bootstrap_admin_passkey'").run();
  }

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM participants WHERE active = 1) as users,
         (SELECT COUNT(*) FROM videos WHERE active = 1 AND is_gold = 0) as samples,
         (SELECT COUNT(*) FROM videos WHERE active = 1 AND is_gold = 1) as golds,
         (SELECT COUNT(*) FROM ratings) as ratings`
    )
    .get() as {
    users: number;
    samples: number;
    golds: number;
    ratings: number;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-violet-950">Overview</h1>
        <p className="mt-2 text-violet-700">
          Add users, upload gold + model videos, then share passkeys with graders.
        </p>
      </div>

      {bootstrapPasskey ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-bold text-amber-900">Bootstrap admin credentials</p>
          <p className="mt-2 text-sm text-amber-800">
            Save these now — they are shown once.
          </p>
          <p className="mt-3 font-mono text-sm">
            {email || "admin@gdpval.local"} / {bootstrapPasskey}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Users", counts.users],
          ["Gold videos", counts.golds],
          ["Model samples", counts.samples],
          ["Ratings", counts.ratings],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <p className="text-sm font-semibold text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-3xl font-bold text-violet-950">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
