#!/usr/bin/env python3
"""Gate C+: Pexels / Pixabay official APIs (search + one short download).

Requires PEXELS_API_KEY and PIXABAY_API_KEY in the sandbox env (from repo .env).
Set REQUIRE_STOCK_API=0 to skip when keys are absent (default: require keys).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path


SCRATCH = Path("/workspace/scratch/downloads")


def _curl_json(url: str, *, headers: list[str] | None = None, timeout: int = 60) -> tuple[int, bytes, str]:
    dest = SCRATCH / "_api_probe.json"
    SCRATCH.mkdir(parents=True, exist_ok=True)
    cmd = [
        "curl",
        "-sS",
        "-L",
        "--max-time",
        str(timeout),
        "-o",
        str(dest),
        "-w",
        "%{http_code}",
    ]
    for h in headers or []:
        cmd.extend(["-H", h])
    cmd.append(url)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    code_s = (proc.stdout or "").strip().splitlines()[-1] if proc.stdout.strip() else "000"
    try:
        code = int(code_s)
    except ValueError:
        code = 0
    body = dest.read_bytes() if dest.exists() else b""
    err = (proc.stderr or "").strip()
    return code, body, err


def _curl_file(url: str, dest: Path, *, timeout: int = 120) -> tuple[int, int]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [
            "curl",
            "-sS",
            "-L",
            "--max-time",
            str(timeout),
            "-o",
            str(dest),
            "-w",
            "%{http_code}",
            url,
        ],
        capture_output=True,
        text=True,
    )
    code_s = (proc.stdout or "").strip().splitlines()[-1] if proc.stdout.strip() else "000"
    try:
        code = int(code_s)
    except ValueError:
        code = 0
    size = dest.stat().st_size if dest.exists() else 0
    return code, size


def _require_keys() -> tuple[str, str]:
    pexels = (os.environ.get("PEXELS_API_KEY") or "").strip()
    pixabay = (os.environ.get("PIXABAY_API_KEY") or "").strip()
    require = os.environ.get("REQUIRE_STOCK_API", "1").lower() not in {"0", "false", "no"}
    if not pexels or not pixabay:
        msg = (
            "PEXELS_API_KEY and/or PIXABAY_API_KEY missing in sandbox env. "
            "Put them in repo-root .env and restart compose."
        )
        if require:
            print(f"FAIL: {msg}", file=sys.stderr)
            raise SystemExit(1)
        print(f"SKIP stock APIs: {msg}")
        raise SystemExit(0)
    return pexels, pixabay


def test_pexels(api_key: str) -> None:
    code, body, err = _curl_json(
        "https://api.pexels.com/v1/videos/search?query=solar&per_page=3&orientation=landscape",
        headers=[f"Authorization: {api_key}"],
    )
    if code != 200:
        raise RuntimeError(f"Pexels search HTTP {code}: {err or body[:200]!r}")
    if b"Just a moment" in body or body.lstrip().startswith(b"<!DOCTYPE"):
        raise RuntimeError("Pexels API returned Cloudflare/HTML instead of JSON")
    data = json.loads(body)
    videos = data.get("videos") or []
    if not videos:
        raise RuntimeError("Pexels search returned no videos")
    link = None
    for v in videos:
        files = [f for f in (v.get("video_files") or []) if f.get("link")]
        if not files:
            continue
        # Prefer a small SD file for smoke speed (avoid multi‑100MB HD downloads).
        files_sorted = sorted(
            files,
            key=lambda f: (
                0 if (f.get("quality") or "").lower() == "sd" else 1,
                int(f.get("width") or 10_000),
                int(f.get("height") or 10_000),
            ),
        )
        link = files_sorted[0]["link"]
        break
    if not link:
        raise RuntimeError("Pexels response missing video_files.link")
    out = SCRATCH / "pexels_api_smoke.mp4"
    dcode, size = _curl_file(link, out)
    if dcode not in {200, 206} or size < 10_000:
        raise RuntimeError(f"Pexels download failed http={dcode} size={size} url_host={urllib.parse.urlparse(link).hostname}")
    print(f"OK Pexels API search+download ({size} bytes)")


def test_pixabay(api_key: str) -> None:
    q = urllib.parse.urlencode({"key": api_key, "q": "wind turbine", "per_page": 3})
    code, body, err = _curl_json(f"https://pixabay.com/api/videos/?{q}")
    if code != 200:
        raise RuntimeError(f"Pixabay search HTTP {code}: {err or body[:200]!r}")
    if b"Just a moment" in body or body.lstrip().startswith(b"<!DOCTYPE"):
        raise RuntimeError("Pixabay API returned Cloudflare/HTML instead of JSON")
    data = json.loads(body)
    hits = data.get("hits") or []
    if not hits:
        raise RuntimeError("Pixabay search returned no hits")
    videos = hits[0].get("videos") or {}
    link = None
    # Prefer tiny/small for smoke speed
    for tier in ("tiny", "small", "medium", "large"):
        node = videos.get(tier) or {}
        if node.get("url"):
            link = node["url"]
            break
    if not link:
        raise RuntimeError("Pixabay hit missing videos.*.url")
    out = SCRATCH / "pixabay_api_smoke.mp4"
    dcode, size = _curl_file(link, out)
    if dcode not in {200, 206} or size < 10_000:
        raise RuntimeError(f"Pixabay download failed http={dcode} size={size} url_host={urllib.parse.urlparse(link).hostname}")
    print(f"OK Pixabay API search+download ({size} bytes)")


def main() -> int:
    pexels, pixabay = _require_keys()
    test_pexels(pexels)
    test_pixabay(pixabay)
    print("test_stock_apis: PASS")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
