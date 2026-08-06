import fs from "fs";
import path from "path";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { mediaDir, mediaPath, mimeForExt, mimeForPath } from "./paths";

export type StoredMedia = {
  /** Absolute local path, or s3://bucket/key */
  media_path: string;
  /** Sidecar meta key when on S3 */
  meta_path?: string;
  original_name: string;
};

/** Matches Admin → Videos form + S3 sidecar / manifest entry. */
export type VideoMeta = {
  video_id: string;
  task_id: string;
  /** true = gold/expert deliverable */
  is_gold: boolean;
  /** null when gold */
  model_id: string | null;
  seed: number;
  cost_usd: number;
  original_name: string;
  /** Object key relative to bucket (no s3://) */
  key: string;
};

export type VideoObjectMeta = {
  taskId: string;
  isGold: boolean;
  modelId?: string | null;
  seed?: number;
  costUsd?: number;
};

/** Prefer `seed`; accept legacy `iteration` from older sidecars/manifests. */
export function readSeed(meta: {
  seed?: number | string | null;
  iteration?: number | string | null;
}): number {
  if (meta.seed != null && meta.seed !== "") {
    const n = Number(meta.seed);
    return Number.isFinite(n) ? n : 0;
  }
  if (meta.iteration != null && meta.iteration !== "") {
    const n = Number(meta.iteration);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function mediaBackend(): "fs" | "s3" {
  return process.env.MEDIA_BACKEND === "s3" ? "s3" : "fs";
}

export function s3Client(): S3Client {
  const region = process.env.S3_REGION || "us-east-1";
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accelerate =
    !endpoint && process.env.S3_USE_ACCELERATE === "true";
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: !!endpoint,
    useAccelerateEndpoint: accelerate,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  });
}

export function s3Bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is required when MEDIA_BACKEND=s3");
  return b;
}

export function s3Prefix(): string {
  return (process.env.S3_PREFIX || "media").replace(/\/$/, "");
}

/**
 * Canonical object key layout (see human/s3/MANIFEST.md):
 *   media/tasks/{taskId}/gold/{videoId}{ext}
 *   media/tasks/{taskId}/models/{modelId}/seed-{n}/{videoId}{ext}
 * Sidecar meta:
 *   …/{videoId}.meta.json
 */
export function buildMediaKey(
  videoId: string,
  ext: string,
  meta: VideoObjectMeta
): string {
  const prefix = s3Prefix();
  const e = ext.startsWith(".") ? ext : `.${ext}`;
  if (meta.isGold) {
    return `${prefix}/tasks/${meta.taskId}/gold/${videoId}${e}`;
  }
  const modelId = meta.modelId || "unknown-model";
  const seed = Number.isFinite(meta.seed) ? meta.seed : 0;
  return `${prefix}/tasks/${meta.taskId}/models/${modelId}/seed-${seed}/${videoId}${e}`;
}

export function metaKeyForMediaKey(mediaKey: string): string {
  const ext = path.extname(mediaKey);
  const base = ext ? mediaKey.slice(0, -ext.length) : mediaKey;
  return `${base}.meta.json`;
}

function signedUrlTtl(): number {
  const n = Number(process.env.S3_SIGNED_URL_TTL || 7200);
  return Number.isFinite(n) && n > 60 ? n : 7200;
}

export function parseS3Path(
  mediaPathValue: string
): { bucket: string; key: string } | null {
  if (mediaPathValue.startsWith("s3://")) {
    const rest = mediaPathValue.slice("s3://".length);
    const i = rest.indexOf("/");
    if (i < 0) return null;
    return { bucket: rest.slice(0, i), key: rest.slice(i + 1) };
  }
  return null;
}

export function toVideoMeta(
  videoId: string,
  originalName: string,
  key: string,
  meta: VideoObjectMeta
): VideoMeta {
  return {
    video_id: videoId,
    task_id: meta.taskId,
    is_gold: !!meta.isGold,
    model_id: meta.isGold ? null : meta.modelId || null,
    seed: Number(meta.seed ?? 0),
    cost_usd: Number(meta.costUsd ?? 0),
    original_name: originalName,
    key,
  };
}

async function putJsonObject(bucket: string, key: string, body: unknown) {
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(body, null, 2) + "\n",
      ContentType: "application/json",
      CacheControl: "no-cache",
    })
  );
}

/** Persist uploaded bytes + sidecar meta; returns DB media_path value. */
export async function storeVideoBytes(
  videoId: string,
  bytes: Buffer,
  originalName: string,
  meta?: VideoObjectMeta
): Promise<StoredMedia> {
  const ext = path.extname(originalName) || ".mp4";
  const contentType = mimeForExt(ext);

  if (mediaBackend() === "s3") {
    if (!meta?.taskId) {
      throw new Error("taskId required for S3 uploads");
    }
    const key = buildMediaKey(videoId, ext, meta);
    const mKey = metaKeyForMediaKey(key);
    const bucket = s3Bucket();
    const client = s3Client();
    const videoMeta = toVideoMeta(videoId, originalName, key, meta);

    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: `inline; filename="${path.basename(originalName).replace(/"/g, "")}"`,
        Metadata: {
          video_id: videoId,
          task_id: meta.taskId,
          is_gold: meta.isGold ? "1" : "0",
          model_id: meta.modelId || "",
          seed: String(meta.seed ?? 0),
          cost_usd: String(meta.costUsd ?? 0),
        },
      },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
    });
    await upload.done();
    await putJsonObject(bucket, mKey, videoMeta);
    await upsertManifestEntry(bucket, videoMeta);

    return {
      media_path: `s3://${bucket}/${key}`,
      meta_path: `s3://${bucket}/${mKey}`,
      original_name: originalName,
    };
  }

  const dest = path.join(mediaDir(), `${videoId}${ext}`);
  fs.writeFileSync(dest, bytes);
  if (meta?.taskId) {
    const sidecar = path.join(
      mediaDir(),
      `${videoId}.meta.json`
    );
    fs.writeFileSync(
      sidecar,
      JSON.stringify(
        toVideoMeta(videoId, originalName, path.basename(dest), meta),
        null,
        2
      ) + "\n"
    );
  }
  return { media_path: dest, original_name: originalName };
}

async function readObjectText(bucket: string, key: string): Promise<string | null> {
  try {
    const out = await s3Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    return (await out.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
}

/** Merge one video into bucket-root manifest.json */
export async function upsertManifestEntry(bucket: string, entry: VideoMeta) {
  const raw = await readObjectText(bucket, "manifest.json");
  let manifest: {
    version: number;
    bucket: string;
    prefix: string;
    videos: VideoMeta[];
  };
  if (raw) {
    try {
      manifest = JSON.parse(raw);
    } catch {
      manifest = {
        version: 1,
        bucket,
        prefix: s3Prefix(),
        videos: [],
      };
    }
  } else {
    manifest = {
      version: 1,
      bucket,
      prefix: s3Prefix(),
      videos: [],
    };
  }
  manifest.bucket = bucket;
  manifest.prefix = s3Prefix();
  manifest.videos = (manifest.videos || []).filter(
    (v) => v.video_id !== entry.video_id
  );
  manifest.videos.push(entry);
  await putJsonObject(bucket, "manifest.json", manifest);
}

export async function createPlaybackUrl(
  storedPath: string
): Promise<string | null> {
  const parsed = parseS3Path(storedPath);
  if (!parsed) return null;

  const client = s3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: signedUrlTtl() }
  );
}

export type ResolvedMedia = {
  kind: "file" | "redirect";
  filePath?: string;
  url?: string;
  contentType: string;
  size?: number;
};

export async function resolveMediaForPlayback(
  videoId: string,
  storedPath: string
): Promise<ResolvedMedia | null> {
  if (parseS3Path(storedPath)) {
    const url = await createPlaybackUrl(storedPath);
    if (!url) return null;
    return {
      kind: "redirect",
      url,
      contentType: mimeForExt(path.extname(storedPath) || ".mp4"),
    };
  }

  let filePath = storedPath;
  if (!filePath || !fs.existsSync(filePath)) {
    filePath = mediaPath(videoId);
  }
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    kind: "file",
    filePath,
    contentType: mimeForPath(filePath),
    size: stat.size,
  };
}

/** List video object keys under prefix (mp4/mov/webm only). */
export async function listMediaObjectKeys(bucket: string): Promise<string[]> {
  const client = s3Client();
  const prefix = `${s3Prefix()}/`;
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const obj of page.Contents || []) {
      if (!obj.Key) continue;
      const lower = obj.Key.toLowerCase();
      if (lower.endsWith(".meta.json")) continue;
      if (
        lower.endsWith(".mp4") ||
        lower.endsWith(".mov") ||
        lower.endsWith(".webm")
      ) {
        keys.push(obj.Key);
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/**
 * Infer meta from key path when sidecar/manifest missing.
 * media/tasks/{task}/gold/{id}.ext
 * media/tasks/{task}/models/{model}/seed-{n}/{id}.ext
 * (also accepts legacy iter-{n} folders)
 */
export function inferMetaFromKey(key: string): VideoMeta | null {
  const parts = key.split("/");
  // media tasks taskId gold|models ...
  const mediaIdx = parts.indexOf(s3Prefix().split("/").pop() || "media");
  const base = mediaIdx >= 0 ? parts.slice(mediaIdx) : parts;
  // Expect: media, tasks, taskId, ...
  if (base.length < 5 || base[1] !== "tasks") return null;
  const taskId = base[2];
  const file = base[base.length - 1];
  const videoId = path.basename(file, path.extname(file));
  if (base[3] === "gold") {
    return {
      video_id: videoId,
      task_id: taskId,
      is_gold: true,
      model_id: null,
      seed: 0,
      cost_usd: 0,
      original_name: file,
      key,
    };
  }
  if (base[3] === "models" && base.length >= 7) {
    const modelId = base[4];
    const seedPart = base[5]; // seed-N or legacy iter-N
    const seed =
      Number(String(seedPart).replace(/^(seed|iter)-/, "")) || 0;
    return {
      video_id: videoId,
      task_id: taskId,
      is_gold: false,
      model_id: modelId,
      seed,
      cost_usd: 0,
      original_name: file,
      key,
    };
  }
  return null;
}

function normalizeVideoMeta(raw: Partial<VideoMeta> & { iteration?: number }): VideoMeta | null {
  if (!raw?.video_id || !raw?.key) return null;
  return {
    video_id: raw.video_id,
    task_id: String(raw.task_id || ""),
    is_gold: !!raw.is_gold,
    model_id: raw.is_gold ? null : raw.model_id ?? null,
    seed: readSeed(raw),
    cost_usd: Number(raw.cost_usd || 0),
    original_name: raw.original_name || raw.key.split("/").pop() || raw.video_id,
    key: raw.key,
  };
}

/** Load all VideoMeta from manifest + sidecars + path inference. */
export async function loadAllVideoMetasFromS3(): Promise<VideoMeta[]> {
  const bucket = s3Bucket();
  const byId = new Map<string, VideoMeta>();

  const manifestRaw = await readObjectText(bucket, "manifest.json");
  if (manifestRaw) {
    try {
      const manifest = JSON.parse(manifestRaw) as {
        videos?: Array<Partial<VideoMeta> & { iteration?: number }>;
      };
      for (const v of manifest.videos || []) {
        const normalized = normalizeVideoMeta(v);
        if (normalized) byId.set(normalized.video_id, normalized);
      }
    } catch {
      /* ignore bad manifest */
    }
  }

  const keys = await listMediaObjectKeys(bucket);
  for (const key of keys) {
    const mKey = metaKeyForMediaKey(key);
    const raw = await readObjectText(bucket, mKey);
    if (raw) {
      try {
        const meta = JSON.parse(raw) as Partial<VideoMeta> & {
          iteration?: number;
        };
        meta.key = meta.key || key;
        const normalized = normalizeVideoMeta(meta);
        if (normalized) {
          byId.set(normalized.video_id, normalized);
          continue;
        }
      } catch {
        /* fall through */
      }
    }
    const inferred = inferMetaFromKey(key);
    if (inferred && !byId.has(inferred.video_id)) {
      byId.set(inferred.video_id, inferred);
    }
  }

  return [...byId.values()];
}
