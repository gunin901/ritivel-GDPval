import path from "path";
import fs from "fs";

/** Persistent data root. Override with DATA_DIR (Render disk) or defaults to human/data. */
export function dataDir(): string {
  const dir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), "..", "data");
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  return dir;
}

export function dbPath(): string {
  return path.join(dataDir(), "eval.db");
}

export function mediaDir(): string {
  const dir = path.join(dataDir(), "media");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Local filesystem path for a video id (prefers existing extension). */
export function mediaPath(videoId: string): string {
  const dir = mediaDir();
  for (const ext of [".mp4", ".mov", ".webm"]) {
    const p = path.join(dir, `${videoId}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return path.join(dir, `${videoId}.mp4`);
}

/** Absolute path to repo `tasks/` folder. */
export function tasksDir(): string {
  if (process.env.TASKS_DIR) return path.resolve(process.env.TASKS_DIR);
  return path.resolve(process.cwd(), "..", "..", "tasks");
}

export function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "video/mp4";
}

export function mimeForExt(ext: string): string {
  const e = ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  if (e === ".mov") return "video/quicktime";
  if (e === ".webm") return "video/webm";
  return "video/mp4";
}
