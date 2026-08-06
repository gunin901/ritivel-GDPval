/** Fixed model roster — not editable in admin. */
export const HARDCODED_MODELS = [
  {
    id: "00000000-0000-4000-8000-0000000000a1",
    display_name: "GPT-5 — high reasoning",
  },
  {
    id: "00000000-0000-4000-8000-0000000000a3",
    display_name: "Gemini 2.5 Pro",
  },
  {
    id: "00000000-0000-4000-8000-0000000000a4",
    display_name: "Grok 4",
  },
  {
    id: "00000000-0000-4000-8000-0000000000a5",
    display_name: "GPT-5.6-Sol",
  },
  {
    id: "00000000-0000-4000-8000-0000000000a6",
    display_name: "Opus-5",
  },
  {
    id: "00000000-0000-4000-8000-0000000000a7",
    display_name: "Gemini-3.1-pro",
  },
  {
    id: "00000000-0000-4000-8000-0000000000a8",
    display_name: "Grok-4.5",
  },
] as const;

export const HARDCODED_MODEL_IDS: ReadonlySet<string> = new Set(
  HARDCODED_MODELS.map((m) => m.id)
);

export const FAILURE_TAGS = [
  "instruction_following",
  "formatting",
  "accuracy",
  "aesthetics",
  "incomplete",
  "no_deliverable",
] as const;

export type FailureTag = (typeof FAILURE_TAGS)[number];

export const FAILURE_TAG_INFO: Record<
  FailureTag,
  { label: string; summary: string; examples: string }
> = {
  instruction_following: {
    label: "Instruction following",
    summary:
      "The deliverable misses, ignores, or contradicts explicit requirements in the task brief or reference materials.",
    examples:
      "Wrong duration, missing required SFX/logos, ignored reference footage, wrong aspect ratio or codec when specified.",
  },
  formatting: {
    label: "Formatting",
    summary:
      "Technical or structural delivery issues: file type, container, layout, encoding, or other format constraints.",
    examples:
      "Wrong container/codec, corrupt playback, text/graphics cut off, nonstandard characters, broken timeline structure.",
  },
  accuracy: {
    label: "Accuracy",
    summary:
      "Factual, numerical, or content errors — the work looks complete but gets domain details wrong.",
    examples:
      "Wrong copy on graphic cards, incorrect VO vs script, hallucinated facts, mis-synced cues, wrong brand assets.",
  },
  aesthetics: {
    label: "Aesthetics",
    summary:
      "Subjective craft quality: look, pacing, polish, and professional finish relative to the gold deliverable.",
    examples:
      "Weak color grade, awkward cuts, poor typography, low production value, cluttered or unfinished look.",
  },
  incomplete: {
    label: "Incomplete",
    summary:
      "A partial deliverable that starts the task but stops short — missing sections, unfinished edits, or truncated runtime.",
    examples:
      "Ends early, missing closing logo, unfinished VO, placeholder frames, only part of the required sequence.",
  },
  no_deliverable: {
    label: "No deliverable",
    summary:
      "No usable video was produced (empty, unplayable, or clearly not a submission for this task).",
    examples:
      "Missing file, black/blank clip, totally wrong media type, or a promise of work with no actual output.",
  },
};

export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
