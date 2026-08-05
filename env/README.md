# gdpval-video environment
#
# Build the Inspect-based sandbox image, smoke-test tools/network, then use
# harness.sandbox.Sandbox from the host to exec into the container.

## Prerequisites

- Docker Engine + Compose v2
- ≥50 GB free disk for the first build
- Platform target: **linux/amd64** (native on Linux x86_64; QEMU emulation on Apple Silicon — slow)

## Layout

| Path | Role |
|------|------|
| `Dockerfile` | Inspect GDPval base + video apt/pip overlay |
| `docker-requirements.txt` | Paper §A.6.4 pins (from inspect_evals) |
| `video-requirements.txt` | scenedetect, OTIO, gTTS 2.5.1, imagehash |
| `compose.yaml` | `sandbox` (16g / 8 cpu) + allowlist `proxy` |
| `proxy/` | GET/HEAD forward proxy + allowlist; see `proxy/README.md` (Cloudflare notes) |
| `smoke/` | Gates A–E tests |
| `SOURCE.md` | Upstream Inspect commit pin |
| `.image_digest` | Written by `build.sh` (gitignored) |

## Build (Gate A)

```bash
./env/build.sh
# → tags gdpval-video:local and writes env/.image_digest
```

From-scratch builds apply Inspect pins plus local compatibility fixes (`librosa==0.10.2`, `numpy==1.24.0`, drop `coverage`). See `SOURCE.md`.

For a one-layer patch on an existing image (numpy/librosa only):

```bash
docker build --platform linux/amd64 -t gdpval-video:local -f env/Dockerfile.fix env/
```

Rebuild proxy only:

```bash
docker compose -f env/compose.yaml build proxy
```

### Apple Silicon note

The image is forced to `linux/amd64`. On M-series Macs Docker runs it under emulation; builds and ffmpeg encodes can be several× slower. Prefer a Linux amd64 host (e.g. EC2) for sampling.

## Tool access from the host (agent integration)

**Canonical contract for wiring an LLM agent:** [`../harness/README.md`](../harness/README.md).

`harness.sandbox.Sandbox` is the **only** Docker I/O surface. Future `harness/tools.py` / provider loops should call this API — not raw `docker exec`.

```python
from pathlib import Path
from harness.sandbox import Sandbox

sb = Sandbox()
sb.start(reference_dir=Path("media/<task_id>/reference"))
sb.bash("ffmpeg -version")                 # → ExecResult
sb.python("print(2+2)")                    # → ExecResult
sb.write_file("/workspace/deliverable_files/note.txt", "hi")
media = sb.inspect_media("/workspace/deliverable_files/out.mp4", times=[0.0, 1.0])
# media.ffprobe (dict) + media.frames: list[(t, jpeg_bytes)]  → send images to the model
sb.web_get("https://mixkit.co/")           # → WebResult (proxied; allowlisted hosts only)
sb.collect_deliverables(Path("runs/demo"))
sb.stop()
```

| Agent tool | Method | Default timeout |
|------------|--------|-----------------|
| `bash` | `sb.bash(cmd, timeout=180)` | 180s (raise for long encodes) |
| `python` | `sb.python(code, timeout=180)` | 180s |
| `read_file` / `write_file` | `sb.read_file` / `sb.write_file` | 120s |
| `inspect_media` | `sb.inspect_media(path, times=…)` | — |
| `web_get` | `sb.web_get(url, dest=…)` | ~150s |

Compose wires fail-closed networking: the sandbox joins an **internal** network only; HTTP(S) goes through `proxy:3128` with `env/proxy/allowlist.txt`.

### Network allowlist (what works from curl / `web_get`)

HTML pages on `pexels.com` / `pixabay.com` often return **Cloudflare** (`HTTP 403`, “Just a moment…”) to non-browser clients. **Use the official APIs instead** (keys in repo-root `.env`, injected into the sandbox):

```bash
# Pexels (header auth — no "Bearer" prefix)
curl -sS -H "Authorization: $PEXELS_API_KEY" \
  "https://api.pexels.com/v1/videos/search?query=solar&per_page=3"

# Pixabay (key query param)
curl -sS "https://pixabay.com/api/videos/?key=$PIXABAY_API_KEY&q=wind+turbine&per_page=3"
```

Then download the MP4 URL from the JSON (`video_files[].link` / `videos.medium.url`).

| Host (allowlisted) | Typical result via sandbox proxy |
|--------------------|----------------------------------|
| `api.pexels.com` | **200** JSON with `PEXELS_API_KEY` |
| `pixabay.com/api/...` | **200** JSON with `PIXABAY_API_KEY` |
| `mixkit.co` / `coverr.co` / `archive.org` / Wikimedia | **200** — keyless fallbacks |
| `pexels.com` / `pixabay.com` **HTML** | Often **403 Cloudflare** |
| `example.com` (not allowlisted) | Blocked by proxy |

Put `PEXELS_API_KEY` and `PIXABAY_API_KEY` in repo-root `.env` (gitignored). Compose + `Sandbox` load them into the container. Full list: [`proxy/allowlist.txt`](proxy/allowlist.txt), [`proxy/README.md`](proxy/README.md).

Workspace paths inside the container:

- `/workspace/reference_files/` — bind-mounted read-only refs
- `/workspace/deliverable_files/` — outputs
- `/workspace/scratch/` — intermediates / downloads / frames

## Smoke tests (Gates A–D)

```bash
# Full suite (builds image if missing). Offline TTS/PDF path:
OFFLINE_SMOKE=1 ./env/smoke/run_smoke.sh

# Skip rebuild when image already exists:
SKIP_BUILD=1 OFFLINE_SMOKE=1 ./env/smoke/run_smoke.sh
```

| Gate | What |
|------|------|
| A | Image builds / digest recorded / amd64 |
| B | CLIs, Python imports, ffmpeg edit, PDF (+ optional gTTS) |
| C | Allowlist allow/deny + no direct egress (allow probe: mixkit, not HTML pexels) |
| C+ | Pexels/Pixabay **official APIs** search + short MP4 download (needs `.env` keys) |
| D | `Sandbox` bridge API (including `web_get` to mixkit + deny example.com) |

## Task dry runs (Gate E, no LLM)

```bash
# Optional: fetch real refs (~1.6 GB for all film tasks)
python scripts/fetch_tasks.py --download

python env/smoke/dryrun_green_energy.py   # → runs/dryrun-green-energy/
python env/smoke/dryrun_goodsin.py        # → runs/dryrun-goodsin/
```

Stand-in PDF/zip/mp3 are generated if media is missing so the encode path can still be validated.

## Manual compose

```bash
export REFERENCE_DIR=$PWD/env/smoke/fixtures/reference_placeholder
export DELIVERABLE_DIR=$PWD/env/smoke/fixtures/deliverable_placeholder
export SCRATCH_DIR=$PWD/env/smoke/fixtures/scratch_placeholder
docker compose -f env/compose.yaml up -d
docker compose -f env/compose.yaml exec -u appuser sandbox bash
docker compose -f env/compose.yaml down -v
```
