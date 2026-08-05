#!/usr/bin/env python3
"""Gate B: PDF read + optional gTTS (skip live TTS when OFFLINE_SMOKE=1)."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def make_fixture_pdf(path: Path) -> None:
    from reportlab.pdfgen import canvas

    path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(path))
    c.drawString(72, 720, "Green Energy scratch VO script fixture.")
    c.drawString(72, 700, "California solar wind storage.")
    c.save()


def main() -> int:
    pdf = Path("/workspace/scratch/fixture_script.pdf")
    make_fixture_pdf(pdf)

    import fitz
    import pdfplumber
    from pdf2image import convert_from_path

    doc = fitz.open(pdf)
    text_fitz = "".join(page.get_text() for page in doc)
    assert "Green Energy" in text_fitz, text_fitz
    print("OK PyMuPDF")

    with pdfplumber.open(pdf) as pdoc:
        text_plumb = "\n".join(page.extract_text() or "" for page in pdoc.pages)
    assert "California" in text_plumb, text_plumb
    print("OK pdfplumber")

    images = convert_from_path(str(pdf), dpi=72)
    assert images, "pdf2image produced no pages"
    out_png = Path("/workspace/scratch/fixture_script.png")
    images[0].save(out_png)
    assert out_png.stat().st_size > 0
    print("OK pdf2image")

    offline = os.environ.get("OFFLINE_SMOKE", "").lower() in {"1", "true", "yes"}
    if offline:
        # Bake a silent wav via ffmpeg as stand-in VO
        import subprocess

        wav = Path("/workspace/scratch/vo_fixture.wav")
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "sine=f=200:d=1",
                str(wav),
            ]
        )
        print("OK TTS skipped (OFFLINE_SMOKE); wrote", wav)
    else:
        from gtts import gTTS

        mp3 = Path("/workspace/scratch/vo_gtts.mp3")
        gTTS("Green energy for California.", lang="en").save(str(mp3))
        assert mp3.stat().st_size > 0
        print("OK gTTS", mp3)

    print("test_pdf_tts: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
