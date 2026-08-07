"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TASK_OPTIONS } from "@/lib/task-ids";
import { INSTRUCTIONS_ACK_KEY } from "@/lib/constants";

const GREEN_ID = TASK_OPTIONS[0].id;
const GOODSIN_ID = TASK_OPTIONS[1].id;

type RefAsset = {
  id: string;
  label: string;
  kind: string;
  url: string | null;
};

export default function InstructionsPage() {
  const router = useRouter();
  const [greenPdf, setGreenPdf] = useState<RefAsset | null>(null);

  useEffect(() => {
    fetch(`/api/tasks/${GREEN_ID}/references`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) return;
        const pdf = (data.highlights as RefAsset[] | undefined)?.find(
          (h) => h.kind === "pdf" && h.url
        );
        if (pdf) setGreenPdf(pdf);
      })
      .catch(() => {});
  }, []);

  function continueToQueue() {
    try {
      localStorage.setItem(INSTRUCTIONS_ACK_KEY, "1");
    } catch {
      /* ignore */
    }
    router.push("/grade");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-sm font-semibold text-[var(--muted)]">
          Please read before you start
        </p>
        <h1 className="mt-1 text-3xl font-bold text-violet-950">
          Instructions
        </h1>
        <p className="mt-3 text-base leading-relaxed text-violet-800">
          Thanks for responding. We are doing a survey where you benchmark
          videos. Please read these instructions carefully — you can return to
          this page anytime from the top bar.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <h2 className="text-xl font-bold text-violet-950">What you will do</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-violet-800">
          <li>
            Each item shows two video clips (A and B) plus the task description
            the videos were meant to fulfill.
          </li>
          <li>
            Choose which clip is better (A or B), or mark a tie if they are
            equal.
          </li>
          <li>
            Write a short justification explaining why you chose that option.
          </li>
          <li>
            There are <strong>42 comparisons</strong> in total across two tasks.
          </li>
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <h2 className="text-xl font-bold text-violet-950">Compensation</h2>
        <p className="text-sm leading-relaxed text-violet-800">
          In lieu of your effort, we are offering Amazon vouchers worth{" "}
          <strong>Rs 500</strong>. The voucher is given after you complete all{" "}
          <strong>42 comparisons</strong>.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-violet-950">
          The two tasks
        </h2>
        <p className="text-sm text-violet-700">
          Comparisons are drawn from two editing briefs. Open the reference
          materials below when you need them while grading.
        </p>

        <article className="rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            Task 1
          </p>
          <h3 className="mt-1 text-lg font-bold text-violet-950">
            California Green Energy (:30)
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-violet-800">
            Models were asked to edit a 30-second broadcast commercial that
            builds support for green energy in California — optimistic tone,
            California visuals, renewable energy imagery, graphic cards from the
            script, scratch voiceover, and classical-style music. When you
            compare clips for this task, judge how well each deliverable
            fulfills that brief.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-violet-800">
            The attached script is the source of truth for voiceover wording and
            the two required graphic-card lines. Review it before grading this
            task.
          </p>
          <div className="mt-4">
            {greenPdf?.url ? (
              <a
                href={greenPdf.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white hover:opacity-95"
              >
                Open GreenEnergy-30_Script.pdf
              </a>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Script PDF loads from the task brief on each comparison if the
                direct link is unavailable here.
              </p>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            Task 2
          </p>
          <h3 className="mt-1 text-lg font-bold text-violet-950">
            Goodsin Studios CG reel
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-violet-800">
            Models were asked to cut a high-energy CGI / motion-graphics show
            reel (max 1:20) for Goodsin Studios — opening and closing logos,
            physics sims (water, fire, smoke, explosions), compositing /
            rotoscoping, paced music, and specific sound effects on designated
            shots. Compare how well each reel meets that brief.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-violet-800">
            The source clips and sound effects used to build these reels are
            available for your reference while you grade.
          </p>
          <div className="mt-4">
            <Link
              href={`/grade/references/${GOODSIN_ID}`}
              className="inline-flex rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white hover:opacity-95"
            >
              Open reel footage &amp; sound effects
            </Link>
          </div>
        </article>
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <h2 className="text-xl font-bold text-violet-950">Tips</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-violet-800">
          <li>
            Read the task brief on each comparison — it is the full prompt the
            model was given.
          </li>
          <li>
            Watch both clips fully (with sound) before choosing a winner.
          </li>
          <li>
            Optional failure tags help classify issues; your written
            justification is required. See the Tag guide if needed.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <button
          type="button"
          onClick={continueToQueue}
          className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white hover:opacity-95"
        >
          Continue to grading
        </button>
        <Link
          href="/grade/tags"
          className="rounded-xl px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-[var(--surface)]"
        >
          View tag guide
        </Link>
      </div>
    </div>
  );
}
