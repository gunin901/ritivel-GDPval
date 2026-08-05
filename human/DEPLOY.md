# Deploying GDPval Human Eval

## Architecture (recommended)

```
Graders' browsers
       │
       ├─ App (login, queue, ratings, metrics) ──► Render Web Service + SQLite disk
       │
       └─ Video bytes (Range / scrub) ───────────► Amazon S3 (pre-signed URLs)
```

| Piece | Where | Why |
|---|---|---|
| Next.js app + SQLite | **Render** | Persistent disk, long-lived Node (`better-sqlite3`) |
| 40–45 videos | **Amazon S3** | Direct browser streaming, no Render bandwidth bottleneck |
| Vercel | Avoid | Ephemeral FS / serverless — bad for SQLite + video |

Videos never pass through Render on playback. The grade API returns **pre-signed S3 URLs**; `<video>` streams from S3 with HTTP Range (fast start + scrubbing).

---

## 1. Create an S3 bucket (AWS)

1. AWS Console → **S3** → Create bucket, e.g. `gdpval-eval-videos`.
2. Region: pick one close to graders (e.g. `us-east-1`).
3. **Block Public Access: keep ON** (objects stay private; app uses signed URLs).
4. Create an IAM user (or role) with a policy like:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:AbortMultipartUpload", "s3:ListBucketMultipartUploads", "s3:ListMultipartUploadParts"],
      "Resource": [
        "arn:aws:s3:::gdpval-eval-videos",
        "arn:aws:s3:::gdpval-eval-videos/*"
      ]
    }
  ]
}
```

5. Create access keys for that user.
6. **Bucket CORS** (required so the browser can play from S3 while the page is on Render):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://YOUR-RENDER-SERVICE.onrender.com",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["Accept-Ranges", "Content-Range", "Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

7. Optional speed boost: enable **Transfer Acceleration** on the bucket, then set `S3_USE_ACCELERATE=true` on Render.

---

## 2. Deploy the app on Render

1. Merge the PR / push this branch.
2. Render → **New** → **Blueprint** (`render.yaml`) or Web Service:
   - Dockerfile: `human/ui/Dockerfile`
   - Context: **repo root** `.`
3. Persistent disk (SQLite only — videos are on S3):
   - Mount: `/var/data`
   - Size: **1–5 GB** is enough when `MEDIA_BACKEND=s3`
4. Environment variables:

| Variable | Value |
|---|---|
| `SESSION_SECRET` | ≥32 random chars |
| `DATA_DIR` | `/var/data` |
| `MEDIA_BACKEND` | `s3` |
| `S3_BUCKET` | `gdpval-eval-videos` |
| `S3_REGION` | `us-east-1` (your bucket region) |
| `S3_ACCESS_KEY_ID` | IAM key |
| `S3_SECRET_ACCESS_KEY` | IAM secret |
| `S3_PREFIX` | `media` |
| `S3_SIGNED_URL_TTL` | `7200` (2h) |
| `S3_USE_ACCELERATE` | `true` if Transfer Acceleration enabled |
| `BOOTSTRAP_ADMIN_EMAIL` | optional |

Leave `S3_ENDPOINT` **unset** for Amazon S3.

5. Deploy → open `/login` → Overview shows bootstrap passkey once → save it.
6. Update S3 CORS `AllowedOrigins` to your real Render URL.

---

## 3. Fast buffering (what we do + what you should do)

### Built into the app

- Grade API returns **S3 pre-signed URLs for A and B** (browser talks to S3, not Render).
- Players use `preload="auto"` and start both streams in parallel.
- Uploads use **multipart** Put to S3.
- Objects get `Content-Type` + long `Cache-Control`.

### Encode before upload (biggest win)

Use H.264 + AAC MP4 with the moov atom at the front (`faststart`) so playback can begin before the full file downloads:

```bash
ffmpeg -i input.mov -c:v libx264 -pix_fmt yuv420p -movflags +faststart -c:a aac out.mp4
```

Aim for ~720p–1080p and reasonable bitrates (e.g. 4–8 Mbps) unless graders need full source quality.

### Upload order

1. Gold for a task first  
2. Then model samples for that task  
3. Active graders get new queue items automatically  

### Optional: CloudFront

Direct S3 signed URLs are enough for ~40–45 private clips. If graders are global and still slow, put **CloudFront** in front of the bucket with Origin Access Control and CloudFront signed URLs (separate signing keys). Do **not** rewrite S3 signed URL hostnames to CloudFront — signatures will break.

---

## 4. Cloudflare R2 alternative

Same env vars, plus:

```bash
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
```

R2 has no egress fees; AWS S3 charges egress. Either works with this app.

---

## 5. Post-deploy check

1. Admin → upload 1 gold + 1 model (same task).  
2. Grader opens the comparison — Network tab should show video GETs to `*.amazonaws.com` (or R2), not only your Render host.  
3. Scrub the timeline — should seek without re-downloading the whole file (HTTP 206 Range).  
4. Submit a rating → Metrics updates.

Full local setup: see `human/README.md`.
