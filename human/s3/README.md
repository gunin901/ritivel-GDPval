# S3 for GDPval Human Eval

| File | Purpose |
|---|---|
| [MANIFEST.md](./MANIFEST.md) | **Required** object layout + IDs for Render |
| [manifest.example.json](./manifest.example.json) | Example inventory |
| [setup-bucket.sh](./setup-bucket.sh) | Create bucket, CORS, encryption, IAM user + keys |
| [upload-video.sh](./upload-video.sh) | Upload one video into the canonical layout |
| [sync-manifest-to-db.mjs](./sync-manifest-to-db.mjs) | Register manifest rows into SQLite |

## One-shot bucket setup

```bash
# Credentials must be available to AWS CLI:
#   export AWS_ACCESS_KEY_ID=...
#   export AWS_SECRET_ACCESS_KEY=...
#   export AWS_DEFAULT_REGION=us-east-1

cd human/s3
./setup-bucket.sh ritivel-gdpval-eval-videos us-east-1 https://YOUR-SERVICE.onrender.com
```

This prints / writes `render-env.generated.txt` — paste those vars into Render.
