#!/usr/bin/env bash
# Gate B: encode + edit filtergraph smoke (runs inside sandbox).
set -euo pipefail
cd /workspace
SCRATCH=/workspace/scratch
mkdir -p "$SCRATCH" /workspace/deliverable_files

# 1s color bars + sine @ 1080p H.264/AAC
ffmpeg -y -f lavfi -i "color=c=green:s=1920x1080:d=1" \
  -f lavfi -i "sine=f=440:d=1" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
  "$SCRATCH/clip_a.mp4"

ffmpeg -y -f lavfi -i "color=c=blue:s=1920x1080:d=1" \
  -f lavfi -i "sine=f=880:d=1" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
  "$SCRATCH/clip_b.mp4"

# Trim / drawtext / concat / audio mix path
ffmpeg -y -i "$SCRATCH/clip_a.mp4" -vf "drawtext=text='GDPVAL':fontsize=48:fontcolor=white:x=50:y=50" \
  -c:a copy "$SCRATCH/clip_a_text.mp4"

printf "file '%s'\nfile '%s'\n" "$SCRATCH/clip_a_text.mp4" "$SCRATCH/clip_b.mp4" > "$SCRATCH/concat.txt"
ffmpeg -y -f concat -safe 0 -i "$SCRATCH/concat.txt" -c copy "$SCRATCH/concat.mp4"

# Mix: keep video from concat, mix audio with a sine bed
ffmpeg -y -i "$SCRATCH/concat.mp4" -f lavfi -i "sine=f=220:d=2" \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=first[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac \
  /workspace/deliverable_files/smoke_edit.mp4

# Assert probe
python - <<'PY'
import json, subprocess, sys
out = subprocess.check_output([
    "ffprobe", "-v", "error", "-print_format", "json",
    "-show_format", "-show_streams",
    "/workspace/deliverable_files/smoke_edit.mp4",
], text=True)
info = json.loads(out)
vs = [s for s in info["streams"] if s["codec_type"] == "video"]
aus = [s for s in info["streams"] if s["codec_type"] == "audio"]
assert vs, "no video stream"
assert aus, "no audio stream"
assert vs[0]["codec_name"] == "h264", vs[0]["codec_name"]
assert int(vs[0]["width"]) == 1920 and int(vs[0]["height"]) == 1080
print("OK encode/edit 1920x1080 h264+aac")
PY

# scenedetect + one frame extract
scenedetect -i /workspace/deliverable_files/smoke_edit.mp4 detect-content list-scenes -q || true
ffmpeg -y -ss 0.5 -i /workspace/deliverable_files/smoke_edit.mp4 -frames:v 1 -q:v 2 \
  /workspace/scratch/frames/smoke.jpg
test -s /workspace/scratch/frames/smoke.jpg
echo "test_ffmpeg_pipeline: PASS"
