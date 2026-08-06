#!/usr/bin/env bash
# Upload a local video into the canonical S3 layout and append manifest.json.
#
# Usage:
#   ./upload-video.sh --task TASK_ID --gold --file ./gold.mp4
#   ./upload-video.sh --task TASK_ID --model MODEL_ID --seed 0 --file ./sample.mp4 [--cost 12.5]
#
# Requires: aws CLI, jq or python3, bucket env S3_BUCKET (or default ritivel-gdpval-eval-videos)

set -euo pipefail

BUCKET="${S3_BUCKET:-ritivel-gdpval-eval-videos}"
PREFIX="${S3_PREFIX:-media}"
TASK=""
MODEL=""
SEED=0
COST=0
IS_GOLD=0
FILE=""
ORIGINAL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task) TASK="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --seed|--iter) SEED="$2"; shift 2 ;;
    --cost) COST="$2"; shift 2 ;;
    --gold) IS_GOLD=1; shift ;;
    --file) FILE="$2"; shift 2 ;;
    --bucket) BUCKET="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "${TASK}" || -z "${FILE}" ]]; then
  echo "Required: --task TASK_ID --file PATH [--gold | --model MODEL_ID]"
  exit 1
fi
if [[ "${IS_GOLD}" -eq 0 && -z "${MODEL}" ]]; then
  echo "Provide --gold or --model MODEL_ID"
  exit 1
fi
if [[ ! -f "${FILE}" ]]; then
  echo "File not found: ${FILE}"
  exit 1
fi

VIDEO_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
EXT="${FILE##*.}"
EXT="$(echo "${EXT}" | tr 'A-Z' 'a-z')"
ORIGINAL="$(basename "${FILE}")"

if [[ "${IS_GOLD}" -eq 1 ]]; then
  KEY="${PREFIX}/tasks/${TASK}/gold/${VIDEO_ID}.${EXT}"
else
  KEY="${PREFIX}/tasks/${TASK}/models/${MODEL}/seed-${SEED}/${VIDEO_ID}.${EXT}"
fi

CT="video/mp4"
[[ "${EXT}" == "mov" ]] && CT="video/quicktime"
[[ "${EXT}" == "webm" ]] && CT="video/webm"

echo "Uploading s3://${BUCKET}/${KEY}"
aws s3 cp "${FILE}" "s3://${BUCKET}/${KEY}" \
  --content-type "${CT}" \
  --cache-control "public, max-age=31536000, immutable" \
  --metadata "video_id=${VIDEO_ID},task_id=${TASK},is_gold=${IS_GOLD},model_id=${MODEL},seed=${SEED}"

# Merge into manifest.json
python3 - <<PY
import json, subprocess, tempfile, os

bucket = "${BUCKET}"
entry = {
  "video_id": "${VIDEO_ID}",
  "task_id": "${TASK}",
  "is_gold": ${IS_GOLD} == 1,
  "model_id": None if ${IS_GOLD} == 1 else "${MODEL}",
  "seed": int("${SEED}"),
  "cost_usd": float("${COST}"),
  "original_name": "${ORIGINAL}",
  "key": "${KEY}",
}

# Download existing manifest or create
import urllib.request
proc = subprocess.run(
    ["aws", "s3", "cp", f"s3://{bucket}/manifest.json", "-"],
    capture_output=True, text=True
)
if proc.returncode == 0 and proc.stdout.strip():
    manifest = json.loads(proc.stdout)
else:
    manifest = {"version": 1, "bucket": bucket, "prefix": "media", "videos": []}

manifest.setdefault("videos", [])
# replace if same video_id
manifest["videos"] = [v for v in manifest["videos"] if v.get("video_id") != entry["video_id"]]
manifest["videos"].append(entry)
manifest["bucket"] = bucket

path = "/tmp/gdpval-manifest.json"
with open(path, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
subprocess.check_call(["aws", "s3", "cp", path, f"s3://{bucket}/manifest.json", "--content-type", "application/json"])

# Required sidecar next to the video
meta_key = entry["key"].rsplit(".", 1)[0] + ".meta.json"
meta_path = "/tmp/gdpval-meta.json"
with open(meta_path, "w") as f:
    json.dump(entry, f, indent=2)
    f.write("\n")
subprocess.check_call(["aws", "s3", "cp", meta_path, f"s3://{bucket}/{meta_key}", "--content-type", "application/json"])
print(json.dumps({
  "ok": True,
  "video_id": entry["video_id"],
  "key": entry["key"],
  "meta_key": meta_key,
  "media_path": f"s3://{bucket}/{entry['key']}"
}, indent=2))
PY
