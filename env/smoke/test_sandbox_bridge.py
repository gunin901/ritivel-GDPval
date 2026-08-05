#!/usr/bin/env python3
"""Gate D: exercise harness.sandbox.Sandbox against a live gdpval-video stack."""

from __future__ import annotations

import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from harness.sandbox import Sandbox  # noqa: E402


def main() -> int:
    ref = Path(tempfile.mkdtemp(prefix="gdpval-ref-"))
    (ref / "hello.txt").write_text("reference-ok\n", encoding="utf-8")
    out = Path(tempfile.mkdtemp(prefix="gdpval-out-"))

    sb = Sandbox()
    try:
        sb.start(reference_dir=ref)
        r = sb.bash("echo ok")
        assert r.ok and "ok" in r.stdout, r

        r = sb.python("print(2+2)")
        assert r.ok and "4" in r.stdout, r

        # Timeout: sleep longer than timeout
        t0 = time.time()
        r = sb.bash("sleep 30", timeout=3)
        assert r.timed_out or r.exit_code == 124, r
        assert time.time() - t0 < 20

        # Reference mount readable
        text = sb.read_file("/workspace/reference_files/hello.txt")
        assert "reference-ok" in text

        sb.write_file("/workspace/deliverable_files/roundtrip.txt", "hi-agent")
        assert sb.read_file("/workspace/deliverable_files/roundtrip.txt") == "hi-agent"

        # Tiny mp4 for inspect_media + collect
        enc = sb.bash(
            "ffmpeg -y -f lavfi -i color=c=red:s=320x240:d=1 -f lavfi -i sine=f=440:d=1 "
            "-c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "
            "/workspace/deliverable_files/bridge.mp4",
            timeout=120,
        )
        assert enc.ok, enc.stderr

        media = sb.inspect_media("/workspace/deliverable_files/bridge.mp4", times=[0.0])
        assert media.ffprobe.get("streams"), media.ffprobe
        assert media.frames and len(media.frames[0][1]) > 100

        # Allow + deny web_get (use mixkit: pexels/pixabay are Cloudflare-gated for bots)
        allow = sb.web_get("https://mixkit.co/")
        assert allow.ok and allow.status_code is not None, allow
        assert allow.status_code < 400, allow
        deny = sb.web_get("https://example.com/")
        assert not deny.ok, deny

        files = sb.collect_deliverables(out)
        assert any(p.name == "bridge.mp4" for p in files), files
        print("test_sandbox_bridge: PASS")
        return 0
    finally:
        sb.stop()


if __name__ == "__main__":
    raise SystemExit(main())
