import fs from "fs";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { mediaDir, mediaPath, mimeForExt, mimeForPath } from "./paths";

export type StoredMedia = {
  /** Absolute local path, or s3://bucket/key */
  media_path: string;
  original_name: string;
};

export function mediaBackend(): "fs" | "s3" {
  return process.env.MEDIA_BACKEND === "s3" ? "s3" : "fs";
}

function s3Client(): S3Client {
  // AWS S3: set S3_REGION (e.g. us-east-1). Leave S3_ENDPOINT unset.
  // Optional: S3_USE_ACCELERATE=true for Transfer Acceleration (faster global GETs).
  // R2: S3_REGION=auto + S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
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

function s3Bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is required when MEDIA_BACKEND=s3");
  return b;
}

function s3Key(videoId: string, ext: string): string {
  const prefix = (process.env.S3_PREFIX || "media").replace(/\/$/, "");
  const e = ext.startsWith(".") ? ext : `.${ext}`;
  return `${prefix}/${videoId}${e}`;
}

/** Signed URL lifetime (seconds). Default 2h — long enough for a grading session. */
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

/** Persist uploaded bytes; returns DB media_path value. */
export async function storeVideoBytes(
  videoId: string,
  bytes: Buffer,
  originalName: string
): Promise<StoredMedia> {
  const ext = path.extname(originalName) || ".mp4";
  const contentType = mimeForExt(ext);

  if (mediaBackend() === "s3") {
    const key = s3Key(videoId, ext);
    const bucket = s3Bucket();
    const client = s3Client();

    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: `inline; filename="${path.basename(originalName).replace(/"/g, "")}"`,
      },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
    });
    await upload.done();

    return {
      media_path: `s3://${bucket}/${key}`,
      original_name: originalName,
    };
  }

  const dest = path.join(mediaDir(), `${videoId}${ext}`);
  fs.writeFileSync(dest, bytes);
  return { media_path: dest, original_name: originalName };
}

/** Create a time-limited GET URL the browser can stream with Range requests. */
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
