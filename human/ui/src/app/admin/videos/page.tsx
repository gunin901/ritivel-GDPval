"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { TASK_OPTIONS } from "@/lib/task-ids";

type Model = { id: string; display_name: string };
type Video = {
  video_id: string;
  task_id: string;
  is_gold: number;
  model_id: string | null;
  iteration: number;
  original_name: string;
  cost_usd: number;
  media_path: string;
};

const TASKS = TASK_OPTIONS;

export default function VideosPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [taskId, setTaskId] = useState<string>(TASKS[0]?.id ?? "");
  const [isGold, setIsGold] = useState(false);
  const [modelId, setModelId] = useState("");
  const [iteration, setIteration] = useState(0);
  const [cost, setCost] = useState(0);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/admin/models").then((r) => r.json()),
      fetch("/api/admin/videos").then((r) => r.json()),
    ])
      .then(([m, v]) => {
        if (m.error) throw new Error(m.error);
        if (v.error) throw new Error(v.error);
        setModels(m as Model[]);
        setVideos(v as Video[]);
        setModelId((prev) => prev || (m[0]?.id ?? ""));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    setMsg("");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("task_id", taskId);
    fd.set("is_gold", isGold ? "1" : "0");
    if (!isGold) fd.set("model_id", modelId);
    fd.set("iteration", String(iteration));
    fd.set("cost_usd", String(cost));
    const res = await fetch("/api/admin/videos", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setError(data.error || "Upload failed");
      return;
    }
    setMsg(
      `Uploaded ${data.video_id}${
        data.assigned ? ` · assigned ${data.assigned} comparison(s)` : ""
      }`
    );
    setFile(null);
    load();
  }

  async function onRefreshFromS3() {
    setSyncing(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMsg(
        `S3 refresh: scanned ${data.scanned}, inserted ${data.inserted}, updated ${data.updated}, new comparisons ${data.assigned}`
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function deactivate(videoId: string) {
    await fetch("/api/admin/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId }),
    });
    load();
  }

  function taskLabel(id: string) {
    return TASKS.find((t) => t.id === id)?.name ?? id.slice(0, 8);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-violet-950">Videos</h1>
          <p className="mt-1 max-w-2xl text-violet-700">
            Each upload stores the file plus metadata (task, gold/model, cost,
            iteration) in S3. Click <strong>Refresh from S3</strong> after
            external uploads so admin + grader queues pick up new comparisons.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshFromS3}
          disabled={syncing}
          className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-bold text-violet-900 hover:bg-[var(--surface)] disabled:opacity-60"
        >
          {syncing ? "Refreshing…" : "Refresh from S3"}
        </button>
      </div>

      <form
        onSubmit={onUpload}
        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 md:grid-cols-2"
      >
        <label className="text-sm font-semibold md:col-span-2">
          File
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            accept="video/*,.mp4,.mov,.webm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>
        <label className="text-sm font-semibold">
          Task
          <select
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            {TASKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end text-sm font-semibold">
          <input
            type="checkbox"
            checked={isGold}
            onChange={(e) => setIsGold(e.target.checked)}
          />
          Gold (expert deliverable)
        </label>
        {!isGold ? (
          <label className="text-sm font-semibold">
            Model
            <select
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div />
        )}
        <label className="text-sm font-semibold">
          Cost (USD)
          <input
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
            type="number"
            min={0}
            step={0.01}
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
          />
        </label>
        <label className="text-sm font-semibold">
          Iteration
          <input
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2"
            type="number"
            min={0}
            value={iteration}
            onChange={(e) => setIteration(Number(e.target.value))}
          />
        </label>
        <button
          type="submit"
          disabled={uploading}
          className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 md:col-span-2"
        >
          {uploading ? "Uploading…" : "Upload video"}
        </button>
      </form>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Video ID</th>
              <th className="py-2 pr-3">Task</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Model</th>
              <th className="py-2 pr-3">Iter</th>
              <th className="py-2 pr-3">Cost</th>
              <th className="py-2 pr-3">S3 / path</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.video_id} className="border-t border-[var(--border)]">
                <td className="py-2 pr-3 font-semibold">{v.original_name}</td>
                <td className="py-2 pr-3 font-mono text-xs">{v.video_id}</td>
                <td className="py-2 pr-3">{taskLabel(v.task_id)}</td>
                <td className="py-2 pr-3">{v.is_gold ? "Gold" : "Model"}</td>
                <td className="py-2 pr-3">
                  {models.find((m) => m.id === v.model_id)?.display_name ?? "—"}
                </td>
                <td className="py-2 pr-3">{v.iteration}</td>
                <td className="py-2 pr-3">${Number(v.cost_usd || 0).toFixed(2)}</td>
                <td
                  className="max-w-[220px] truncate py-2 pr-3 font-mono text-xs"
                  title={v.media_path}
                >
                  {v.media_path}
                </td>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    className="text-red-600 underline"
                    onClick={() => deactivate(v.video_id)}
                  >
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
            {!videos.length ? (
              <tr>
                <td colSpan={9} className="py-4 text-[var(--muted)]">
                  No videos yet. Upload above or Refresh from S3.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
