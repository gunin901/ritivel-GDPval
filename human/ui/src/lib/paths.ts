import path from "path";
import fs from "fs";

let _loggedPersistence = false;

/**
 * Persistent data root for SQLite (+ optional local media).
 * On Render this MUST be a disk mount (DATA_DIR=/var/data).
 */
export function dataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  const dir = fromEnv
    ? path.resolve(fromEnv)
    : path.resolve(process.cwd(), "..", "data");

  if (process.env.NODE_ENV === "production" && !fromEnv) {
    console.error(
      "[data] FATAL: DATA_DIR is unset in production. " +
        "SQLite would be written to the ephemeral filesystem and wiped on every deploy. " +
        "Set DATA_DIR=/var/data and attach a Render persistent disk at that path."
    );
    throw new Error("DATA_DIR is required in production");
  }

  fs.mkdirSync(path.join(dir, "media"), { recursive: true });

  if (!_loggedPersistence) {
    _loggedPersistence = true;
    const db = path.join(dir, "eval.db");
    const marker = path.join(dir, ".persistence-marker");
    let existed = false;
    try {
      existed = fs.existsSync(marker);
      if (!existed) {
        fs.writeFileSync(
          marker,
          `created=${new Date().toISOString()}\npath=${dir}\n`
        );
      }
    } catch (err) {
      console.error("[data] failed to write persistence marker", err);
    }
    console.log(
      `[data] DATA_DIR=${dir} eval.db=${db} ` +
        `db_exists=${fs.existsSync(db)} persistence_marker=${existed ? "reused" : "created"}`
    );
  }

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
  const e = ext.toLowerCase().startsWith(".")
    ? ext.toLowerCase()
    : `.${ext.toLowerCase()}`;
  if (e === ".mov") return "video/quicktime";
  if (e === ".webm") return "video/webm";
  return "video/mp4";
}
