"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FAILURE_TAGS, FAILURE_TAG_INFO, wordCount } from "@/lib/constants";

type Detail = {
  id: string;
  status: string;
  task: {
    id: string;
    name: string;
    prompt: string;
    rubric_pretty?: string;
    reference_file_urls: string[];
  };
  media: { A: string; B: string };
  progress: { index: number; total: number; remaining: number };
};

type RefAsset = {
  id: string;
  label: string;
  kind: string;
  url: string | null;
};

type TaskRefs = {
  highlights: RefAsset[];
  gallery: RefAsset[];
  galleryPath: string | null;
};

function StreamPlayer({
  label,
  src,
}: {
  label: string;
  src: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(true);

  useEffect(() => {
    setReady(false);
    setBuffering(true);
    const el = videoRef.current;
    if (!el) return;
    // Kick off network fetch immediately for both sides in parallel
    el.load();
  }, [src]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold uppercase tracking-wide text-violet-900">
          {label}
        </p>
        <p className="text-xs font-semibold text-[var(--muted)]">
          {ready ? "Ready" : buffering ? "Buffering…" : "Loading…"}
        </p>
      </div>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          className="aspect-video w-full"
          controls
          playsInline
          preload="auto"
          src={src}
          onWaiting={() => setBuffering(true)}
          onLoadStart={() => setBuffering(true)}
          onCanPlay={() => {
            setBuffering(false);
            setReady(true);
          }}
          onPlaying={() => setBuffering(false)}
        />
        {buffering && !ready ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold text-white">
            Buffering…
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function GradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [refs, setRefs] = useState<TaskRefs | null>(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<"a" | "tie" | "b" | "">("");
  const [justification, setJustification] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [started] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/grade/${id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load");
        setDetail(data as Detail);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!detail?.task.id) return;
    fetch(`/api/tasks/${detail.task.id}/references`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) return;
        setRefs({
          highlights: data.highlights || [],
          gallery: data.gallery || [],
          galleryPath: data.galleryPath || null,
        });
      })
      .catch(() => {});
  }, [detail?.task.id]);

  const words = useMemo(() => wordCount(justification), [justification]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!choice) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/grade/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choice,
          justification,
          failure_tags: tags,
          seconds_spent: Math.round((Date.now() - started) / 1000),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      router.replace("/grade");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
      setSubmitting(false);
    }
  }

  if (error && !detail) {
    return <p className="text-red-600">{error}</p>;
  }
  if (!detail) {
    return <p className="text-violet-700">Loading comparison…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">
            {detail.progress.index} / {detail.progress.total} ·{" "}
            {detail.progress.remaining} remaining
          </p>
          <h1 className="text-2xl font-bold text-violet-950">
            {detail.task.name}
          </h1>
        </div>
      </div>

      <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <summary className="cursor-pointer font-semibold text-violet-900">
          Task brief
        </summary>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-sm text-violet-800">
          {detail.task.prompt}
        </pre>
        {refs && (refs.highlights.length > 0 || refs.galleryPath) ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            {refs.highlights.map((h) =>
              h.url ? (
                <a
                  key={h.id}
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white"
                >
                  {h.kind === "pdf"
                    ? `Open ${h.label}`
                    : h.kind === "zip"
                      ? `Download ${h.label}`
                      : h.label}
                </a>
              ) : null
            )}
            {refs.galleryPath ? (
              <a
                href={refs.galleryPath}
                className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-bold text-violet-900 hover:bg-[var(--surface)]"
              >
                Browse all reel clips
              </a>
            ) : null}
          </div>
        ) : null}
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <StreamPlayer label="Deliverable A" src={detail.media.A} />
        <StreamPlayer label="Deliverable B" src={detail.media.B} />
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["a", "A is better"],
              ["tie", "Tie"],
              ["b", "B is better"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setChoice(value)}
              className={`rounded-xl px-4 py-3 text-sm font-bold ${
                choice === value
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-white text-violet-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-violet-900">
            Failure tags (optional)
          </p>
          <div className="flex flex-wrap gap-2">
            {FAILURE_TAGS.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setTags((prev) =>
                      on ? prev.filter((x) => x !== t) : [...prev, t]
                    )
                  }
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                    on
                      ? "bg-violet-900 text-white"
                      : "border border-[var(--border)] text-violet-800"
                  }`}
                >
                  {FAILURE_TAG_INFO[t].label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block text-sm font-semibold text-violet-900">
          Justification ({words}/50 words min)
          <textarea
            className="mt-1.5 min-h-36 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none focus:border-[var(--accent)]"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            required
          />
        </label>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={!choice || words < 50 || submitting || detail.status === "done"}
          className="rounded-xl bg-[var(--accent)] px-6 py-3.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit rating"}
        </button>
      </form>
    </div>
  );
}
