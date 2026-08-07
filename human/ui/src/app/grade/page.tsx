"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { INSTRUCTIONS_ACK_KEY } from "@/lib/constants";

export default function GradeQueuePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState<{ completed: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem(INSTRUCTIONS_ACK_KEY) !== "1") {
        router.replace("/grade/instructions");
        return;
      }
    } catch {
      /* proceed if storage unavailable */
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    fetch("/api/grade/queue")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          if (data.done) {
            setDone({ completed: data.completed ?? 0 });
            return null;
          }
          throw new Error(data.error ?? "no assignment");
        }
        return data as { id: string };
      })
      .then((item) => {
        if (item) router.replace(`/grade/${item.id}`);
      })
      .catch((e: Error) => {
        setError(e.message || "Could not load assignment");
      });
  }, [ready, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-lg text-violet-700">Loading…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-3xl font-bold text-violet-950">Queue complete</h1>
        <p className="max-w-md text-lg text-violet-700">
          You finished all {done.completed} comparison
          {done.completed === 1 ? "" : "s"} in this queue.
        </p>
        <p className="max-w-md text-base text-violet-700">
          Your Amazon voucher (Rs 500) will be arranged now that all comparisons
          are complete.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/grade/instructions"
            className="text-base font-semibold text-violet-600 underline"
          >
            Review instructions
          </Link>
          <Link
            href="/grade/tags"
            className="text-base font-semibold text-violet-600 underline"
          >
            Review failure tag guide
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-lg text-violet-700">
        {error || "Loading your assignment…"}
      </p>
    </div>
  );
}
