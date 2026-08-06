import catalog from "@/data/video_ids.json";
import { HARDCODED_MODEL_IDS } from "./constants";
import { readSeed, type VideoMeta } from "./media-store";

type CatalogEntry = {
  video_id: string;
  task_id: string;
  is_gold: boolean;
  model_id: string | null;
  model_slug?: string | null;
  iteration?: number;
  seed?: number;
  cost_usd?: number;
  original_name?: string;
  key: string;
  qc_pass?: boolean;
};

type VideoIdsCatalog = {
  run_id?: string;
  gold?: Record<string, CatalogEntry>;
  samples?: Record<string, CatalogEntry>;
};

/**
 * Authoritative video inventory from the S3 upload run (video_ids.json).
 * Used to enrich S3 sync with cost/original_name and register known keys
 * even when sidecars/manifest are missing.
 */
export function bundledVideoCatalog(): VideoMeta[] {
  const data = catalog as VideoIdsCatalog;
  const out: VideoMeta[] = [];

  const push = (entry: CatalogEntry | undefined) => {
    if (!entry?.video_id || !entry?.task_id || !entry?.key) return;
    if (!entry.is_gold) {
      const modelId = entry.model_id;
      if (!modelId || !HARDCODED_MODEL_IDS.has(modelId)) return;
    }
    out.push({
      video_id: entry.video_id,
      task_id: entry.task_id,
      is_gold: !!entry.is_gold,
      model_id: entry.is_gold ? null : entry.model_id,
      seed: readSeed(entry),
      cost_usd: Number(entry.cost_usd || 0),
      original_name:
        entry.original_name || entry.key.split("/").pop() || entry.video_id,
      key: entry.key.replace(/^\//, ""),
    });
  };

  for (const entry of Object.values(data.gold || {})) push(entry);
  for (const entry of Object.values(data.samples || {})) push(entry);
  return out;
}

/** Merge catalog metadata into S3-discovered metas (catalog wins on fields). */
export function mergeVideoCatalog(
  discovered: VideoMeta[],
  catalogEntries: VideoMeta[] = bundledVideoCatalog()
): VideoMeta[] {
  const byId = new Map<string, VideoMeta>();
  for (const v of discovered) byId.set(v.video_id, v);
  for (const v of catalogEntries) {
    const existing = byId.get(v.video_id);
    if (!existing) {
      byId.set(v.video_id, v);
      continue;
    }
    byId.set(v.video_id, {
      ...existing,
      task_id: v.task_id || existing.task_id,
      is_gold: v.is_gold,
      model_id: v.is_gold ? null : v.model_id ?? existing.model_id,
      seed: v.seed ?? existing.seed,
      cost_usd: v.cost_usd || existing.cost_usd,
      original_name: v.original_name || existing.original_name,
      key: v.key || existing.key,
    });
  }
  return [...byId.values()];
}
