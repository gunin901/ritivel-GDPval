/**
 * Fixed model roster — IDs must match S3 layout / model_uuids.json.
 * Do not rename IDs after videos are uploaded.
 */
export const HARDCODED_MODELS = [
  {
    id: "a1000000-5b56-4000-8000-000000000001",
    display_name: "GPT-5.6-Sol",
    slug: "gpt-5.6-sol",
  },
  {
    id: "a1000000-0005-4000-8000-000000000002",
    display_name: "GPT-5",
    slug: "gpt-5",
  },
  {
    id: "a1000000-0c05-4000-8000-000000000003",
    display_name: "Claude Opus 5",
    slug: "claude-opus-5",
  },
  {
    id: "a1000000-0310-4000-8000-000000000004",
    display_name: "Gemini 3.1 Pro",
    slug: "gemini-3.1-pro",
  },
  {
    id: "a1000000-0250-4000-8000-000000000005",
    display_name: "Gemini 2.5 Pro",
    slug: "gemini-2.5-pro",
  },
  {
    id: "a1000000-0045-4000-8000-000000000006",
    display_name: "Grok 4.5",
    slug: "grok-4.5",
  },
  {
    id: "a1000000-0004-4000-8000-000000000007",
    display_name: "Grok 4",
    slug: "grok-4",
  },
] as const;

export const HARDCODED_MODEL_IDS: ReadonlySet<string> = new Set(
  HARDCODED_MODELS.map((m) => m.id)
);

/** Pre-upload placeholder model IDs → canonical S3 model UUIDs. */
export const LEGACY_MODEL_ID_REMAP: Readonly<Record<string, string>> = {
  "00000000-0000-4000-8000-0000000000a1":
    "a1000000-0005-4000-8000-000000000002",
  "00000000-0000-4000-8000-0000000000a3":
    "a1000000-0250-4000-8000-000000000005",
  "00000000-0000-4000-8000-0000000000a4":
    "a1000000-0004-4000-8000-000000000007",
  "00000000-0000-4000-8000-0000000000a5":
    "a1000000-5b56-4000-8000-000000000001",
  "00000000-0000-4000-8000-0000000000a6":
    "a1000000-0c05-4000-8000-000000000003",
  "00000000-0000-4000-8000-0000000000a7":
    "a1000000-0310-4000-8000-000000000004",
  "00000000-0000-4000-8000-0000000000a8":
    "a1000000-0045-4000-8000-000000000006",
  "00000000-0000-4000-8000-0000000000aa":
    "a1000000-5b56-4000-8000-000000000001",
};

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
