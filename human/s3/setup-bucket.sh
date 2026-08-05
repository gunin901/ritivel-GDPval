#!/usr/bin/env bash
# Create + configure the GDPval eval videos S3 bucket for Render.
# Usage:
#   export AWS_PROFILE=default   # or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
#   ./setup-bucket.sh [bucket-name] [region] [render-origin]
#
# Examples:
#   ./setup-bucket.sh
#   ./setup-bucket.sh ritivel-gdpval-eval-videos us-east-1 https://gdpval-human-eval.onrender.com

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUCKET="${1:-ritivel-gdpval-eval-videos}"
REGION="${2:-${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}}"
RENDER_ORIGIN="${3:-https://*.onrender.com}"
PREFIX="media"

echo "==> Using account:"
aws sts get-caller-identity

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "==> Account: ${ACCOUNT_ID}"
echo "==> Bucket:  ${BUCKET}"
echo "==> Region:  ${REGION}"

if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "==> Bucket already exists"
else
  echo "==> Creating bucket…"
  if [[ "${REGION}" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
  else
    aws s3api create-bucket \
      --bucket "${BUCKET}" \
      --region "${REGION}" \
      --create-bucket-configuration "LocationConstraint=${REGION}"
  fi
fi

echo "==> Block public access…"
aws s3api put-public-access-block \
  --bucket "${BUCKET}" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "==> Default encryption (AES256)…"
aws s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration '{
    "Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]
  }'

echo "==> Versioning (optional safety)…"
aws s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled

echo "==> CORS for browser playback from Render…"
# S3 AllowedOrigins must be exact URLs (no subdomain wildcards).
python3 - <<PY
import json
origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
ro = "${RENDER_ORIGIN}"
if ro.startswith("https://") and "*" not in ro:
    origins.append(ro)
cfg = {
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": origins,
    "ExposeHeaders": [
      "Accept-Ranges", "Content-Range", "Content-Length",
      "Content-Type", "ETag", "x-amz-request-id"
    ],
    "MaxAgeSeconds": 3600
  }]
}
open("/tmp/gdpval-cors.json", "w").write(json.dumps(cfg, indent=2))
print("CORS origins:", origins)
PY
aws s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration file:///tmp/gdpval-cors.json

echo "==> Lifecycle: abort incomplete multipart after 7 days…"
aws s3api put-bucket-lifecycle-configuration \
  --bucket "${BUCKET}" \
  --lifecycle-configuration '{
    "Rules":[{
      "ID":"abort-incomplete-multipart",
      "Status":"Enabled",
      "Filter":{"Prefix":""},
      "AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}
    }]
  }'

echo "==> Enable Transfer Acceleration (faster global GETs)…"
aws s3api put-bucket-accelerate-configuration \
  --bucket "${BUCKET}" \
  --accelerate-configuration Status=Enabled || echo "WARN: accelerate not available in this region/account — continuing"

echo "==> Seed prefix folders + example manifest…"
aws s3api put-object --bucket "${BUCKET}" --key "${PREFIX}/" --body /dev/null 2>/dev/null || true
aws s3api put-object --bucket "${BUCKET}" --key "${PREFIX}/tasks/" --body /dev/null 2>/dev/null || true

# Upload empty skeleton dirs for known tasks
for TASK in \
  e222075d-5d62-4757-ae3c-e34b0846583b \
  75401f7c-396d-406d-b08e-938874ad1045
do
  aws s3api put-object --bucket "${BUCKET}" --key "${PREFIX}/tasks/${TASK}/gold/" --body /dev/null >/dev/null || true
  aws s3api put-object --bucket "${BUCKET}" --key "${PREFIX}/tasks/${TASK}/models/" --body /dev/null >/dev/null || true
done

# Write starter manifest
python3 - <<PY
import json
manifest = {
  "version": 1,
  "bucket": "${BUCKET}",
  "prefix": "${PREFIX}",
  "region": "${REGION}",
  "videos": []
}
path = "${SCRIPT_DIR}/manifest.generated.json"
with open(path, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
print("Wrote", path)
PY

aws s3 cp "${SCRIPT_DIR}/manifest.generated.json" "s3://${BUCKET}/manifest.json"

# IAM policy for Render app user
POLICY_NAME="RitivelGdpvalEvalVideosAccess"
POLICY_DOC="${SCRIPT_DIR}/iam-policy.json"
cat > "${POLICY_DOC}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketMultipartUploads"],
      "Resource": ["arn:aws:s3:::${BUCKET}"]
    },
    {
      "Sid": "ObjectRW",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": ["arn:aws:s3:::${BUCKET}/*"]
    }
  ]
}
EOF

USER_NAME="ritivel-gdpval-render"
echo "==> Ensure IAM user ${USER_NAME}…"
if aws iam get-user --user-name "${USER_NAME}" >/dev/null 2>&1; then
  echo "    user exists"
else
  aws iam create-user --user-name "${USER_NAME}" --tags Key=project,Value=gdpval-eval
fi

# Attach inline policy
aws iam put-user-policy \
  --user-name "${USER_NAME}" \
  --policy-name "${POLICY_NAME}" \
  --policy-document "file://${POLICY_DOC}"

echo "==> Create access key (SAVE THESE — shown once)…"
KEY_JSON="$(aws iam create-access-key --user-name "${USER_NAME}" 2>/dev/null || true)"
ENV_OUT="${SCRIPT_DIR}/render-env.generated.txt"

if [[ -n "${KEY_JSON}" ]]; then
  AK="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["AccessKey"]["AccessKeyId"])' <<<"${KEY_JSON}")"
  SK="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["AccessKey"]["SecretAccessKey"])' <<<"${KEY_JSON}")"
  cat > "${ENV_OUT}" <<EOF
# Paste into Render → Environment
MEDIA_BACKEND=s3
S3_BUCKET=${BUCKET}
S3_REGION=${REGION}
S3_PREFIX=${PREFIX}
S3_SIGNED_URL_TTL=7200
S3_USE_ACCELERATE=true
S3_ACCESS_KEY_ID=${AK}
S3_SECRET_ACCESS_KEY=${SK}
# Leave S3_ENDPOINT unset for Amazon S3
DATA_DIR=/var/data
EOF
  echo "Wrote ${ENV_OUT}"
  echo ""
  echo "========== RENDER ENV (also in ${ENV_OUT}) =========="
  cat "${ENV_OUT}"
  echo "====================================================="
else
  cat > "${ENV_OUT}" <<EOF
# Access key creation failed (user may already have 2 keys).
# Create a new key in IAM → Users → ${USER_NAME} → Security credentials.
MEDIA_BACKEND=s3
S3_BUCKET=${BUCKET}
S3_REGION=${REGION}
S3_PREFIX=${PREFIX}
S3_SIGNED_URL_TTL=7200
S3_USE_ACCELERATE=true
S3_ACCESS_KEY_ID=REPLACE_ME
S3_SECRET_ACCESS_KEY=REPLACE_ME
DATA_DIR=/var/data
EOF
  echo "WARN: could not create access key automatically. See ${ENV_OUT}"
fi

echo ""
echo "==> Done."
echo "    Manifest:  s3://${BUCKET}/manifest.json"
echo "    Layout:    see ${SCRIPT_DIR}/MANIFEST.md"
echo "    After Render deploy, re-run CORS with your exact origin:"
echo "      ./setup-bucket.sh ${BUCKET} ${REGION} https://YOUR-SERVICE.onrender.com"
