"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Asset = {
  id: string;
  label: string;
  kind: string;
  url: string | null;
};

export default function TaskReferencesPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const [highlights, setHighlights] = useState<Asset[]>([]);
  const [gallery, setGallery] = useState<Asset[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/references`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load references");
        setHighlights(data.highlights || []);
        setGallery(data.gallery || []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <p className="text-violet-700">Loading references…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">
            Reference materials
          </p>
          <h1 className="text-2xl font-bold text-violet-950">
            Reel footage
          </h1>
        </div>
        <Link
          href="/grade"
          className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-[var(--surface)]"
        >
          ← Back to queue
        </Link>
      </div>

      {highlights.length ? (
        <div className="flex flex-wrap gap-2">
          {highlights.map((h) =>
            h.url ? (
              <a
                key={h.id}
                href={h.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white"
              >
                Download {h.label}
              </a>
            ) : null
          )}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {gallery.map((item) => (
          <div
            key={item.id}
            className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white"
          >
            <div className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-violet-900">
              {item.label}
            </div>
            {item.url && item.kind === "video" ? (
              <video
                className="aspect-video w-full bg-black"
                controls
                playsInline
                preload="metadata"
                src={item.url}
              />
            ) : item.url && item.kind === "audio" ? (
              <div className="p-4">
                <audio className="w-full" controls src={item.url} />
              </div>
            ) : item.url ? (
              <div className="p-4">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-[var(--accent)] underline"
                >
                  Open {item.label}
                </a>
              </div>
            ) : (
              <p className="p-4 text-sm text-red-600">Unavailable</p>
            )}
          </div>
        ))}
      </div>

      {!gallery.length ? (
        <p className="text-[var(--muted)]">No gallery assets for this task.</p>
      ) : null}
    </div>
  );
}
