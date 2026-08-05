#!/usr/bin/env python3
"""Gate E: no-LLM dry run for Goodsin Studios CG reel (task 75401f7c-...)."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from harness.sandbox import Sandbox  # noqa: E402

TASK_ID = "75401f7c-396d-406d-b08e-938874ad1045"
MEDIA_REF = REPO / "media" / TASK_ID / "reference"
ZIP_NAME = "reel footage.zip"
MP3_NAME = "action-energetic-rock-music-334316.mp3"

WORK_SCRIPT = r"""
set -e
mkdir -p /workspace/scratch/goodsin
unzip -o "/workspace/reference_files/reel footage.zip" -d /workspace/scratch/goodsin
mapfile -t clips < <(find /workspace/scratch/goodsin -type f \( -iname '*.mp4' -o -iname '*.mov' \) | head -n 2)
if [[ ${#clips[@]} -lt 1 ]]; then
  echo "no clips in zip" >&2
  exit 1
fi
DUR=10
ffmpeg -y -stream_loop -1 -i "${clips[0]}" \
  -i "/workspace/reference_files/action-energetic-rock-music-334316.mp3" \
  -t "$DUR" \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
  /workspace/deliverable_files/goodsin_dryrun.mp4
ffprobe -v error -print_format json -show_format -show_streams \
  /workspace/deliverable_files/goodsin_dryrun.mp4 > /workspace/scratch/probe.json
python - <<'P'
import json
info=json.load(open("/workspace/scratch/probe.json"))
vs=[s for s in info["streams"] if s["codec_type"]=="video"][0]
aus=[s for s in info["streams"] if s["codec_type"]=="audio"]
dur=float(info["format"]["duration"])
assert vs["codec_name"]=="h264"
assert int(vs["width"])==1920 and int(vs["height"])==1080
assert aus, "audio required"
assert dur <= 80.0, dur
print("Goodsin dry-run QC PASS", dur)
P
"""


def ensure_reference(tmpdir: Path) -> str:
    zip_src = MEDIA_REF / ZIP_NAME
    mp3_src = MEDIA_REF / MP3_NAME
    if zip_src.is_file() and mp3_src.is_file():
        shutil.copy2(zip_src, tmpdir / ZIP_NAME)
        shutil.copy2(mp3_src, tmpdir / MP3_NAME)
        print(f"Using real Goodsin refs from {MEDIA_REF}")
        return "real"

    print("WARN: Goodsin media not fetched; synthesizing zip+mp3 stand-ins")
    print("  run: python scripts/fetch_tasks.py --download")
    syn = Path(tempfile.mkdtemp(prefix="gdpval-syn-"))
    try:
        for i, color in enumerate(("gray", "black"), start=1):
            subprocess.check_call(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    f"color=c={color}:s=1920x1080:d=2",
                    "-f",
                    "lavfi",
                    "-i",
                    f"sine=f={400*i}:d=2",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-shortest",
                    str(syn / f"clip{i}.mp4"),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        subprocess.check_call(
            ["zip", "-q", str(tmpdir / ZIP_NAME), "clip1.mp4", "clip2.mp4"],
            cwd=syn,
        )
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "sine=f=220:d=5",
                "-c:a",
                "libmp3lame",
                str(tmpdir / MP3_NAME),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    finally:
        shutil.rmtree(syn, ignore_errors=True)
    return "synthetic"


def main() -> int:
    out = REPO / "runs" / "dryrun-goodsin"
    out.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="gdpval-gs-ref-"))
    try:
        mode = ensure_reference(tmp)
        sb = Sandbox()
        try:
            sb.start(reference_dir=tmp)
            listing = sb.bash("ls -la /workspace/reference_files")
            assert listing.ok and ZIP_NAME in listing.stdout, listing
            work = sb.bash(WORK_SCRIPT, timeout=300)
            assert work.ok, work.stderr + work.stdout
            files = sb.collect_deliverables(out)
            (out / "metrics.json").write_text(
                json.dumps(
                    {
                        "task": "goodsin",
                        "mode": mode,
                        "status": "ok",
                        "files": [str(f) for f in files],
                    },
                    indent=2,
                )
            )
            print("Gate E Goodsin: PASS ->", out)
            return 0
        finally:
            sb.stop()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
