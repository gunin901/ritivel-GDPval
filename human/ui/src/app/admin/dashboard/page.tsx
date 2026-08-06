"use client";

import { useEffect, useState } from "react";

type Dash = {
  winRates: {
    modelId: string;
    modelName: string;
    taskId: string;
    n: number;
    wins: number;
    ties: number;
    losses: number;
    win_rate_paper: number;
    win_rate_wins_only: number;
    win_rate_half: number;
  }[];
  elo: { modelId: string; modelName: string; elo: number; n: number }[];
  progress: {
    id: string;
    display_name: string;
    email: string;
    total: number;
    done: number;
  }[];
  counts: {
    golds: number;
    samples: number;
    ratings: number;
    graders: number;
  };
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed");
        setData(json as Dash);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-violet-700">Loading metrics…</p>;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-violet-950">Metrics</h1>
          <p className="mt-1 text-violet-700">
            {data.counts.ratings} ratings · {data.counts.samples} samples ·{" "}
            {data.counts.graders} graders
          </p>
        </div>
        <a
          href="/api/admin/export"
          className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-[var(--surface)]"
        >
          Export participant × task × comparison
        </a>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Export is NDJSON with one row per comparison: participant, task, model
        video (id, model, cost, seed), gold video, and rating fields when
        submitted.
      </p>

      <section>
        <h2 className="text-xl font-bold text-violet-950">Win rates</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-4">Model</th>
                <th className="py-2 pr-4">Task</th>
                <th className="py-2 pr-4">N</th>
                <th className="py-2 pr-4">Paper</th>
                <th className="py-2 pr-4">Wins-only</th>
                <th className="py-2 pr-4">Half-credit</th>
              </tr>
            </thead>
            <tbody>
              {data.winRates.map((w) => (
                <tr
                  key={`${w.modelId}-${w.taskId}`}
                  className="border-t border-[var(--border)]"
                >
                  <td className="py-2 pr-4 font-semibold">{w.modelName}</td>
                  <td className="py-2 pr-4">{w.taskId === "all" ? "All" : w.taskId.slice(0, 8)}</td>
                  <td className="py-2 pr-4">{w.n}</td>
                  <td className="py-2 pr-4">{(w.win_rate_paper * 100).toFixed(1)}%</td>
                  <td className="py-2 pr-4">{(w.win_rate_wins_only * 100).toFixed(1)}%</td>
                  <td className="py-2 pr-4">{(w.win_rate_half * 100).toFixed(1)}%</td>
                </tr>
              ))}
              {!data.winRates.length ? (
                <tr>
                  <td colSpan={6} className="py-4 text-[var(--muted)]">
                    No ratings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-violet-950">Elo (gold = 1000)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-4">Model</th>
                <th className="py-2 pr-4">Elo</th>
                <th className="py-2 pr-4">N</th>
              </tr>
            </thead>
            <tbody>
              {data.elo.map((e) => (
                <tr key={e.modelId} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-4 font-semibold">{e.modelName}</td>
                  <td className="py-2 pr-4">{e.elo}</td>
                  <td className="py-2 pr-4">{e.n}</td>
                </tr>
              ))}
              {!data.elo.length ? (
                <tr>
                  <td colSpan={3} className="py-4 text-[var(--muted)]">
                    No ratings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-violet-950">Grader progress</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Done</th>
                <th className="py-2 pr-4">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.progress.map((p) => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-4 font-semibold">{p.display_name}</td>
                  <td className="py-2 pr-4">{p.email}</td>
                  <td className="py-2 pr-4">{p.done}</td>
                  <td className="py-2 pr-4">{p.total}</td>
                </tr>
              ))}
              {!data.progress.length ? (
                <tr>
                  <td colSpan={4} className="py-4 text-[var(--muted)]">
                    No graders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
