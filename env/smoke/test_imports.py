#!/usr/bin/env python3
"""Gate B: CLI tools + Python imports inside the running sandbox container."""

from __future__ import annotations

import sys

CLIS = [
    ("ffmpeg", ["ffmpeg", "-version"]),
    ("ffprobe", ["ffprobe", "-version"]),
    ("mediainfo", ["mediainfo", "--Version"]),
    ("sox", ["sox", "--version"]),
    ("libreoffice", ["libreoffice", "--version"]),
    ("pdftoppm", ["pdftoppm", "-v"]),
    ("tesseract", ["tesseract", "--version"]),
    ("unzip", ["unzip", "-v"]),
    ("curl", ["curl", "--version"]),
]

IMPORTS = [
    "av",
    "moviepy",
    "cv2",
    "ffmpeg",
    "pydub",
    "librosa",
    "soundfile",
    "pedalboard",
    "pyloudnorm",
    "mutagen",
    "scenedetect",
    "opentimelineio",
    "gtts",
    "imagehash",
    "fitz",
    "pdfplumber",
    "pdf2image",
]


def main() -> int:
    import subprocess

    failed = []
    for name, argv in CLIS:
        # pdftoppm -v writes to stderr and may exit non-zero on some builds; accept output.
        r = subprocess.run(argv, capture_output=True, text=True)
        out = (r.stdout or "") + (r.stderr or "")
        if name == "pdftoppm":
            ok = "pdftoppm" in out.lower() or r.returncode in (0, 1, 99)
        elif name == "unzip":
            ok = r.returncode == 0 or "UnZip" in out
        else:
            ok = r.returncode == 0
        if not ok:
            failed.append(f"cli:{name}: rc={r.returncode} {out[:200]}")
        else:
            print(f"OK cli {name}")

    for mod in IMPORTS:
        r = subprocess.run(
            [sys.executable, "-c", f"import {mod}; print('{mod} OK')"],
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            failed.append(f"import:{mod}: {r.stderr.strip()[:300]}")
        else:
            print(r.stdout.strip())

    # Workspace write permission
    r = subprocess.run(
        ["bash", "-lc", "echo ok > /workspace/deliverable_files/_perm_test && rm /workspace/deliverable_files/_perm_test"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        failed.append(f"perm:deliverable_files: {r.stderr}")
    else:
        print("OK write deliverable_files")

    r = subprocess.run(
        ["bash", "-lc", "echo no > /etc/_perm_test 2>/dev/null"],
        capture_output=True,
        text=True,
    )
    if r.returncode == 0:
        failed.append("perm: should not write outside /workspace (/etc)")
    else:
        print("OK cannot write /etc")

    if failed:
        print("FAILURES:", file=sys.stderr)
        for f in failed:
            print(" -", f, file=sys.stderr)
        return 1
    print("test_imports: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
