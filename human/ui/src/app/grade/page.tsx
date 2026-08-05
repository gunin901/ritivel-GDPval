"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function GradeQueuePage() {
  const router = useRouter();
  const [done, setDone] = useState<{ completed: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
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
  }, [router]);

  if (done) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-3xl font-bold text-violet-950">Queue complete</h1>
        <p className="max-w-md text-lg text-violet-700">
          You finished all {done.completed} comparison
          {done.completed === 1 ? "" : "s"} in this queue.
        </p>
        <Link
          href="/grade/tags"
          className="text-base font-semibold text-violet-600 underline"
        >
          Review failure tag guide
        </Link>
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
