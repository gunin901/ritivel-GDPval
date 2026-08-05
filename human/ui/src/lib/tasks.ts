import fs from "fs";
import path from "path";
import { tasksDir } from "./paths";
import { TASK_IDS, TASK_OPTIONS } from "./task-ids";

export { TASK_IDS, TASK_OPTIONS };
export type TaskId = (typeof TASK_IDS)[number];

export type TaskMeta = {
  task_id: string;
  name: string;
  prompt: string;
  reference_files: string[];
  reference_file_urls: string[];
  rubric_pretty?: string;
};

const NAMES: Record<string, string> = Object.fromEntries(
  TASK_OPTIONS.map((t) => [t.id, t.name])
);

export function listTasks(): TaskMeta[] {
  return TASK_IDS.map((id) => getTask(id)).filter(Boolean) as TaskMeta[];
}

export function getTask(taskId: string): TaskMeta | null {
  const file = path.join(tasksDir(), `${taskId}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    task_id: raw.task_id,
    name: NAMES[raw.task_id] ?? raw.task_id.slice(0, 8),
    prompt: raw.prompt,
    reference_files: raw.reference_files ?? [],
    reference_file_urls: raw.reference_file_urls ?? [],
    rubric_pretty: raw.rubric_pretty,
  };
}

export function taskOptions(): { id: string; name: string }[] {
  return TASK_OPTIONS.map((t) => ({ id: t.id, name: t.name }));
}
