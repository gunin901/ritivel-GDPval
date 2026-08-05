# S3 data manifest for GDPval Human Eval

This is the **required object layout** for the Render-hosted platform.
Uploads from Admin → Videos follow this layout automatically when `MEDIA_BACKEND=s3`.
Bulk uploads must match it (or use `scripts/sync-manifest.mjs` after placing files).

---

## Bucket

| Field | Value |
|---|---|
| Suggested name | `ritivel-gdpval-eval-videos` (created by `setup-bucket.sh`) |
| Public access | **Blocked** (private; platform uses pre-signed GET URLs) |
| Region | Same as `S3_REGION` on Render (default `us-east-1`) |
| Prefix | `media/` (`S3_PREFIX`) |

---

## Directory layout

```
s3://{bucket}/
├── manifest.json                          # inventory (required for bulk sync)
└── media/
    └── tasks/
        └── {task_id}/
            ├── gold/
            │   ├── {video_id}.mp4         # H.264 + AAC, faststart
            │   └── {video_id}.meta.json   # optional sidecar
            └── models/
                └── {model_id}/
                    └── iter-{n}/
                        ├── {video_id}.mp4
                        └── {video_id}.meta.json
```

### Path rules

| Role | Key pattern |
|---|---|
| Gold | `media/tasks/{task_id}/gold/{video_id}.mp4` |
| Model sample | `media/tasks/{task_id}/models/{model_id}/iter-{n}/{video_id}.mp4` |

- `{task_id}` — must be a platform task UUID (see below)
- `{model_id}` — must be a platform model UUID (see below)
- `{video_id}` — UUID v4 (stable id stored in SQLite `videos.video_id`)
- `{n}` — non-negative integer iteration / sample index (`0`, `1`, `2`, …)
- Extension: prefer `.mp4` (also `.mov`, `.webm` allowed)

DB stores the full URI: `s3://{bucket}/{key}` in `videos.media_path`.

---

## Allowed task IDs

| task_id | Name |
|---|---|
| `e222075d-5d62-4757-ae3c-e34b0846583b` | Green Energy :30 |
| `75401f7c-396d-406d-b08e-938874ad1045` | Goodsin Studios CG reel |

---

## Allowed model IDs

| model_id | Display name |
|---|---|
| `00000000-0000-4000-8000-0000000000a1` | GPT-5 — high reasoning |
| `00000000-0000-4000-8000-0000000000a2` | Claude Opus 4.1 |
| `00000000-0000-4000-8000-0000000000a3` | Gemini 2.5 Pro |
| `00000000-0000-4000-8000-0000000000a4` | Grok 4 |
| `00000000-0000-4000-8000-0000000000a5` | GPT-5.6-Sol |
| `00000000-0000-4000-8000-0000000000a6` | Opus-5 |
| `00000000-0000-4000-8000-0000000000a7` | Gemini-3.1-pro |
| `00000000-0000-4000-8000-0000000000a8` | Grok-4.5 |

---

## `manifest.json` schema

Place at bucket root. Used by sync tooling and as the source of truth for bulk loads.

```json
{
  "version": 1,
  "bucket": "ritivel-gdpval-eval-videos",
  "prefix": "media",
  "videos": [
    {
      "video_id": "11111111-1111-4111-8111-111111111101",
      "task_id": "e222075d-5d62-4757-ae3c-e34b0846583b",
      "is_gold": true,
      "model_id": null,
      "iteration": 0,
      "cost_usd": 0,
      "original_name": "gold-green-energy.mp4",
      "key": "media/tasks/e222075d-5d62-4757-ae3c-e34b0846583b/gold/11111111-1111-4111-8111-111111111101.mp4"
    },
    {
      "video_id": "22222222-2222-4222-8222-222222222201",
      "task_id": "e222075d-5d62-4757-ae3c-e34b0846583b",
      "is_gold": false,
      "model_id": "00000000-0000-4000-8000-0000000000a1",
      "iteration": 0,
      "cost_usd": 12.5,
      "original_name": "gpt5-high-iter0.mp4",
      "key": "media/tasks/e222075d-5d62-4757-ae3c-e34b0846583b/models/00000000-0000-4000-8000-0000000000a1/iter-0/22222222-2222-4222-8222-222222222201.mp4"
    }
  ]
}
```

### Optional sidecar `{video_id}.meta.json`

Same fields as a single `videos[]` entry (without requiring root `manifest.json` for that file). Sync prefers root `manifest.json` when present.

---

## Encoding (required for smooth buffering)

```bash
ffmpeg -i input.mov -c:v libx264 -pix_fmt yuv420p -movflags +faststart -c:a aac out.mp4
```

- Container: **MP4**
- Video: H.264 (`yuv420p`)
- Audio: AAC
- `+faststart` so playback can start before full download

---

## How Render connects

Set on the Render web service:

```bash
MEDIA_BACKEND=s3
S3_BUCKET=ritivel-gdpval-eval-videos
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PREFIX=media
S3_SIGNED_URL_TTL=7200
```

Flow:

1. Admin upload (or sync) writes object under the key layout above and inserts a SQLite row with `media_path = s3://bucket/key`.
2. Grader opens a comparison → API returns **pre-signed S3 URLs** for A/B.
3. Browser streams from S3 with Range requests (does not proxy video bytes through Render).

---

## Checklist before going live

- [ ] Bucket created (`./setup-bucket.sh`)
- [ ] CORS allows your Render origin
- [ ] IAM user keys set on Render
- [ ] At least one **gold** per task you will grade
- [ ] Model samples under the correct `model_id` + `iter-N`
- [ ] `manifest.json` uploaded if you bulk-load
- [ ] Encode with `faststart` MP4
