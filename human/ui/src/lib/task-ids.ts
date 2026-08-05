/** Client-safe task roster (no fs). Keep in sync with lib/tasks.ts. */
export const TASK_OPTIONS = [
  {
    id: "e222075d-5d62-4757-ae3c-e34b0846583b",
    name: "Green Energy :30",
  },
  {
    id: "75401f7c-396d-406d-b08e-938874ad1045",
    name: "Goodsin Studios CG reel",
  },
] as const;

export const TASK_IDS = TASK_OPTIONS.map((t) => t.id);
