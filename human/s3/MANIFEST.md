# S3 data manifest for GDPval Human Eval

This is the **required object layout** for the Render-hosted platform.
Every video object **must** have matching metadata (same fields as Admin → Videos).

Admin form fields stored in S3:

| UI field | Manifest / `.meta.json` field |
|---|---|
| Task | `task_id` |
| Gold (expert deliverable) | `is_gold` |
| Model | `model_id` (null when gold) |
| Cost (USD) | `cost_usd` |
| Seed | `seed` |
| (auto) | `video_id`, `original_name`, `key` |

---

## Bucket

| Field | Value |
|---|---|
| Suggested name | `ritivel-gdpval-eval-videos` |
| Public access | **Blocked** |
| Region | `S3_REGION` on Render (default `us-east-1`) |
| Prefix | `media/` |

---

## Directory layout

```
s3://{bucket}/
├── manifest.json                          # full inventory (all videos + metadata)
└── media/
    └── tasks/
        └── {task_id}/
            ├── gold/
            │   ├── {video_id}.mp4
            │   └── {video_id}.meta.json   # REQUIRED metadata sidecar
            └── models/
                └── {model_id}/
                    └── seed-{n}/
                        ├── {video_id}.mp4
                        └── {video_id}.meta.json   # REQUIRED
```

### Path rules

| Role | Video key | Meta key |
|---|---|---|
| Gold | `media/tasks/{task_id}/gold/{video_id}.mp4` | `…/{video_id}.meta.json` |
| Model | `media/tasks/{task_id}/models/{model_id}/seed-{n}/{video_id}.mp4` | `…/{video_id}.meta.json` |

Platform DB stores `media_path = s3://{bucket}/{key}`.

Legacy `iter-{n}` folders and `iteration` meta fields are still accepted on sync.

---

## Required `.meta.json` (per video)

```json
{
  "video_id": "f48babc3-889c-5390-ae9f-3f4d8677634e",
  "task_id": "e222075d-5d62-4757-ae3c-e34b0846583b",
  "is_gold": false,
  "model_id": "a1000000-5b56-4000-8000-000000000001",
  "seed": 0,
  "cost_usd": 8.982702,
  "original_name": "Support_Green_Energy_30.mp4",
  "key": "media/tasks/e222075d-5d62-4757-ae3c-e34b0846583b/models/a1000000-5b56-4000-8000-000000000001/iter-0/f48babc3-889c-5390-ae9f-3f4d8677634e.mp4"
}
```

Gold example:

```json
{
  "video_id": "b1000000-e222-4000-8000-000000000001",
  "task_id": "e222075d-5d62-4757-ae3c-e34b0846583b",
  "is_gold": true,
  "model_id": null,
  "seed": 0,
  "cost_usd": 0,
  "original_name": "GreenEnergy_v1.mp4",
  "key": "media/tasks/e222075d-5d62-4757-ae3c-e34b0846583b/gold/b1000000-e222-4000-8000-000000000001.mp4"
}
```

Admin uploads write **both** the video object and this sidecar, and update root `manifest.json`.

---

## `manifest.json` (bucket root)

```json
{
  "version": 1,
  "bucket": "ritivel-gdpval-eval-videos",
  "prefix": "media",
  "videos": [ /* array of the same objects as .meta.json */ ]
}
```

---

## Allowed task IDs

| task_id | Name |
|---|---|
| `e222075d-5d62-4757-ae3c-e34b0846583b` | Green Energy :30 |
| `75401f7c-396d-406d-b08e-938874ad1045` | Goodsin Studios CG reel |

## Allowed model IDs

Canonical blinded UUIDs from `model_uuids.json` (do not rename after upload):

| model_id | Slug | Display name |
|---|---|---|
| `a1000000-5b56-4000-8000-000000000001` | gpt-5.6-sol | GPT-5.6-Sol |
| `a1000000-0005-4000-8000-000000000002` | gpt-5 | GPT-5 |
| `a1000000-0c05-4000-8000-000000000003` | claude-opus-5 | Claude Opus 5 |
| `a1000000-0310-4000-8000-000000000004` | gemini-3.1-pro | Gemini 3.1 Pro |
| `a1000000-0250-4000-8000-000000000005` | gemini-2.5-pro | Gemini 2.5 Pro |
| `a1000000-0045-4000-8000-000000000006` | grok-4.5 | Grok 4.5 |
| `a1000000-0004-4000-8000-000000000007` | grok-4 | Grok 4 |

Gold video IDs (from the same upload run):

| task_id | gold video_id |
|---|---|
| `e222075d-5d62-4757-ae3c-e34b0846583b` | `b1000000-e222-4000-8000-000000000001` |
| `75401f7c-396d-406d-b08e-938874ad1045` | `b1000000-7540-4000-8000-000000000002` |

---

## Refresh flow (Admin → Videos → Refresh from S3)

1. New objects appear under the layout above (via Admin upload or `upload-video.sh`).
2. Admin clicks **Refresh from S3**.
3. Platform:
   - Reads `manifest.json` + every `*.meta.json` (+ path inference fallback)
   - Upserts SQLite `videos` rows (task, gold/model, cost, seed, video_id, media_path)
   - Creates **new comparisons** for every active grader: each new model sample × that task’s gold
4. Graders see new items in their queue on next `/grade` load.

---

## Collected data granularity

Export (`/api/admin/export`) is **one row per comparison** (participant × task × model video), including:

- Participant: id, name, email  
- Task id  
- Comparison id, status, queue order, A/B order  
- Model video: video_id, model_id, model name, seed, cost_usd, original_name, media_path  
- Gold video: video_id, seed, cost_usd, original_name, media_path  
- Rating (when submitted): label, score, tags, justification, seconds, qc_flag  

---

## Encoding

```bash
ffmpeg -i input.mov -c:v libx264 -pix_fmt yuv420p -movflags +faststart -c:a aac out.mp4
```
