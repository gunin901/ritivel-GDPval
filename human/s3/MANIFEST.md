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
  "video_id": "22222222-2222-4222-8222-222222222201",
  "task_id": "e222075d-5d62-4757-ae3c-e34b0846583b",
  "is_gold": false,
  "model_id": "00000000-0000-4000-8000-0000000000a1",
  "seed": 0,
  "cost_usd": 0,
  "original_name": "gpt-5-sample.mp4",
  "key": "media/tasks/e222075d-5d62-4757-ae3c-e34b0846583b/models/00000000-0000-4000-8000-0000000000a1/seed-0/22222222-2222-4222-8222-222222222201.mp4"
}
```

Gold example:

```json
{
  "video_id": "11111111-1111-4111-8111-111111111101",
  "task_id": "e222075d-5d62-4757-ae3c-e34b0846583b",
  "is_gold": true,
  "model_id": null,
  "seed": 0,
  "cost_usd": 0,
  "original_name": "gold-green-energy.mp4",
  "key": "media/tasks/e222075d-5d62-4757-ae3c-e34b0846583b/gold/11111111-1111-4111-8111-111111111101.mp4"
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

| model_id | Display name |
|---|---|
| `00000000-0000-4000-8000-0000000000a1` | GPT-5 — high reasoning |
| `00000000-0000-4000-8000-0000000000a3` | Gemini 2.5 Pro |
| `00000000-0000-4000-8000-0000000000a4` | Grok 4 |
| `00000000-0000-4000-8000-0000000000a5` | GPT-5.6-Sol |
| `00000000-0000-4000-8000-0000000000a6` | Opus-5 |
| `00000000-0000-4000-8000-0000000000a7` | Gemini-3.1-pro |
| `00000000-0000-4000-8000-0000000000a8` | Grok-4.5 |

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
