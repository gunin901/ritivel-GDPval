import { FAILURE_TAGS, FAILURE_TAG_INFO } from "@/lib/constants";

export default function TagsGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold text-violet-950">Failure tag guide</h1>
      <p className="text-violet-700">
        Use tags to classify why a model deliverable falls short of gold. Tags
        are optional; justification is required.
      </p>
      <div className="space-y-4">
        {FAILURE_TAGS.map((t) => {
          const info = FAILURE_TAG_INFO[t];
          return (
            <section
              key={t}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <h2 className="text-lg font-bold text-violet-950">{info.label}</h2>
              <p className="mt-2 text-sm text-violet-800">{info.summary}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Examples: {info.examples}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
