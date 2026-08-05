# Deploying GDPval Human Eval

## Recommendation

| Platform | Fit | Why |
|---|---|---|
| **Render** (Docker + disk) | **Use this** | Persistent SQLite + optional local media; long-running Node for `better-sqlite3` and video range requests |
| **Vercel** | Not suitable as-is | Serverless / ephemeral FS — SQLite and multi‑GB videos will not persist; native `better-sqlite3` is awkward |

Use **Render for the app**, and **Cloudflare R2 (or S3)** for the ~40–45 videos.

---

## 1. Render (app)

### One-time setup

1. Push this repo to GitHub (already done when you merge the PR).
2. In [Render](https://dashboard.render.com) → **New** → **Blueprint** → select the repo, or create a **Web Service**:
   - **Runtime:** Docker
   - **Dockerfile path:** `human/ui/Dockerfile`
   - **Docker context:** `human/ui`
3. Attach a **persistent disk**:
   - Mount path: `/var/data`
   - Size: **25 GB+** (or smaller if all videos live on R2)
4. Environment variables:

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | Yes | ≥32 random chars (Render can generate) |
| `DATA_DIR` | Yes | `/var/data` |
| `BOOTSTRAP_ADMIN_EMAIL` | Optional | Defaults to `admin@gdpval.local` |
| `MEDIA_BACKEND` | Optional | `fs` (default) or `s3` |
| `TASKS_DIR` | Set in image | `/tasks` in the Dockerfile |

5. Deploy. Open the service URL → `/login`.
6. First admin visit to **Overview** shows the bootstrap passkey **once** — save it.
7. Add graders under **Users**, upload videos under **Videos**.

`render.yaml` at `human/render.yaml` (or copy to repo root as `render.yaml`) can drive Blueprint deploys.

### Health

- Health check path: `/login`
- App listens on `PORT` (Render sets this; Next `start` respects it via `-p` if needed)

If the process ignores `PORT`, change the start command to:

```bash
npx next start -p $PORT
```

---

## 2. Vercel — why not

- No durable local disk for `human/data/eval.db` or uploaded MP4s.
- `better-sqlite3` needs a long-lived Node server, not serverless functions.
- Video uploads (hundreds of MB) exceed typical serverless body limits.

If you insist on Vercel later: move DB to Turso/Postgres and media to R2, and drop `better-sqlite3`. That is a separate migration.

---

## 3. Where to put 40–45 videos

### Recommended: Cloudflare R2 (S3-compatible)

Why R2: cheap storage, **no egress fees** to the internet, signed URLs stream with HTTP range (smooth scrubbing in `<video>`).

**Setup**

1. Create an R2 bucket, e.g. `gdpval-videos`.
2. Create an API token with Object Read & Write.
3. On Render, set:

```bash
MEDIA_BACKEND=s3
S3_BUCKET=gdpval-videos
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto
S3_PREFIX=media
```

4. Upload via **Admin → Videos** in the UI (files go to R2; DB stores `s3://bucket/key`).
5. Playback: `/api/media/...` redirects to a **1-hour signed URL**; the browser streams from R2 directly.

### Alternative: Render disk only

- Keep `MEDIA_BACKEND=fs` (default).
- Uploads land in `/var/data/media`.
- Fine for a small private study; back up the disk. 40–45 × ~50–100 MB ≈ several GB — size the disk accordingly.

### Do not

- Commit videos to Git.
- Rely on the container filesystem without a disk (lost on every deploy).

---

## 4. Smooth rendering checklist

1. **Encode H.264 + AAC in MP4** (browser-friendly). Avoid relying on `.mov` alone.
   ```bash
   ffmpeg -i input.mov -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart out.mp4
   ```
2. Prefer **R2 signed URLs** (above) so range requests hit the CDN/object store, not your app CPU.
3. Keep gold + model pairs under the same **task**; graders only see samples when that task has an active gold.
4. Upload order: **gold first**, then model samples for that task.
5. After upload, active graders automatically get new queue items (`assignNewVideosToGraders`).

### Bulk upload tip

For dozens of files, use the Admin UI in batches, or a small script that `POST`s multipart to `/api/admin/videos` with an admin session cookie. Naming convention suggestion:

```
gold/<taskId>/reference.mp4
model/<taskId>/<modelSlug>/iter-0.mp4
```

Map `taskId` + model + iteration in the form fields when uploading.

---

## 5. Post-deploy smoke

1. Log in as bootstrap admin.
2. Create one grader user; copy passkey.
3. Upload 1 gold + 1 model (same task).
4. Log in as grader → confirm A/B videos play.
5. Submit a 50+ word rating → confirm Metrics updates.
6. Download **Export ratings**.
