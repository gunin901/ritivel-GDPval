import fs from "fs";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mediaDir, mediaPath, mimeForExt, mimeForPath } from "./paths";

export type StoredMedia = {
  /** Absolute local path, or s3://bucket/key */
  media_path: string;
  original_name: string;
};

function mediaBackend(): "fs" | "s3" {
  return process.env.MEDIA_BACKEND === "s3" ? "s3" : "fs";
}

function s3Client(): S3Client {
  const region = process.env.S3_REGION || "auto";
  const endpoint = process.env.S3_ENDPOINT; // R2: https://<accountid>.r2.cloudflarestorage.com
  return new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: !!endpoint,
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

function parseS3Path(mediaPathValue: string): { bucket: string; key: string } | null {
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
  if (mediaBackend() === "s3") {
    const key = s3Key(videoId, ext);
    const bucket = s3Bucket();
    await s3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeForExt(ext),
      })
    );
    return {
      media_path: `s3://${bucket}/${key}`,
      original_name: originalName,
    };
  }

  const dest = path.join(mediaDir(), `${videoId}${ext}`);
  fs.writeFileSync(dest, bytes);
  return { media_path: dest, original_name: originalName };
}

export type ResolvedMedia = {
  kind: "file" | "redirect";
  /** Local filesystem path when kind=file */
  filePath?: string;
  /** Signed URL when kind=redirect */
  url?: string;
  contentType: string;
  size?: number;
};

/**
 * Resolve a video row's media_path for playback.
 * Prefer DB media_path; fall back to conventional local mediaPath(videoId).
 */
export async function resolveMediaForPlayback(
  videoId: string,
  storedPath: string
): Promise<ResolvedMedia | null> {
  const s3 = parseS3Path(storedPath);
  if (s3 || (mediaBackend() === "s3" && !fs.existsSync(storedPath))) {
    const bucket = s3?.bucket || s3Bucket();
    const key =
      s3?.key ||
      (() => {
        // Infer key from conventional naming
        for (const ext of [".mp4", ".mov", ".webm"]) {
          return s3Key(videoId, ext);
        }
        return s3Key(videoId, ".mp4");
      })();

    try {
      const client = s3Client();
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key })
      );
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 60 * 60 }
      );
      const contentType =
        head.ContentType ||
        mimeForExt(path.extname(key) || ".mp4");
      return {
        kind: "redirect",
        url,
        contentType,
        size: head.ContentLength,
      };
    } catch {
      // fall through to local
    }
  }

  // Local file: prefer stored absolute path if it exists
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
