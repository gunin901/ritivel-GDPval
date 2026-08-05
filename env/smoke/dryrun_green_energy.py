#!/usr/bin/env python3
"""Gate E: no-LLM dry run for Green Energy (task e222075d-...)."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from harness.sandbox import Sandbox  # noqa: E402

TASK_ID = "e222075d-5d62-4757-ae3c-e34b0846583b"
MEDIA_PDF = REPO / "media" / TASK_ID / "reference" / "GreenEnergy-30_Script.pdf"


def ensure_reference(tmpdir: Path) -> None:
    dest = tmpdir / "GreenEnergy-30_Script.pdf"
    if MEDIA_PDF.is_file():
        shutil.copy2(MEDIA_PDF, dest)
        print(f"Using real PDF: {MEDIA_PDF}")
        return
    print("WARN: media not fetched; writing minimal stand-in PDF")
    print("  run: python scripts/fetch_tasks.py --download")
    # Minimal valid PDF (no host reportlab dependency).
    dest.write_bytes(
        b"""%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
/Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 12 Tf 72 720 Td (Green Energy :30 stand-in script) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000385 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
454
%%EOF
"""
    )


ENCODE_SCRIPT = r"""
set -e
if [[ ! -f /workspace/scratch/vo.mp3 ]]; then
  ffmpeg -y -f lavfi -i sine=f=180:d=2 /workspace/scratch/vo.mp3
fi
# Pad short VO to 30s; do not use -shortest (would truncate to VO length).
ffmpeg -y -f lavfi -i color=c=0x228B22:s=1920x1080:d=30 \
  -i /workspace/scratch/vo.mp3 \
  -af "apad" -t 30 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac \
  /workspace/deliverable_files/green_energy_dryrun.mp4
ffprobe -v error -print_format json -show_format -show_streams \
  /workspace/deliverable_files/green_energy_dryrun.mp4 > /workspace/scratch/probe.json
python - <<'P'
import json
info=json.load(open("/workspace/scratch/probe.json"))
vs=[s for s in info["streams"] if s["codec_type"]=="video"][0]
aus=[s for s in info["streams"] if s["codec_type"]=="audio"]
dur=float(info["format"]["duration"])
assert vs["codec_name"]=="h264"
assert int(vs["width"])==1920 and int(vs["height"])==1080
assert aus, "audio required"
assert 29.9 <= dur <= 30.1, dur
print("Green Energy dry-run QC PASS", dur)
P
"""


def main() -> int:
    out = Path(__file__).resolve().parents[2] / "runs" / "dryrun-green-energy"
    out.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="gdpval-ge-ref-"))
    try:
        ensure_reference(tmp)
        sb = Sandbox()
        try:
            sb.start(reference_dir=tmp)
            r = sb.python(
                "import fitz\n"
                "doc=fitz.open('/workspace/reference_files/GreenEnergy-30_Script.pdf')\n"
                "print(''.join(p.get_text() for p in doc)[:500])\n"
            )
            assert r.ok, r.stderr

            tts = sb.python(
                "from gtts import gTTS\n"
                "gTTS('California green energy.', lang='en').save('/workspace/scratch/vo.mp3')\n"
                "print('gTTS ok')\n"
            )
            if not tts.ok:
                print("gTTS unavailable; using sine VO fallback")

            sb.web_get("https://mixkit.co/")
            enc = sb.bash(ENCODE_SCRIPT, timeout=180)
            assert enc.ok, enc.stderr + enc.stdout

            files = sb.collect_deliverables(out)
            (out / "metrics.json").write_text(
                json.dumps(
                    {"task": "green_energy", "status": "ok", "files": [str(f) for f in files]},
                    indent=2,
                )
            )
            print("Gate E Green Energy: PASS ->", out)
            return 0
        finally:
            sb.stop()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
