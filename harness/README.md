# Agent ↔ sandbox integration

**Integration surface:** `harness.sandbox.Sandbox`  
**Implementation:** [`sandbox.py`](sandbox.py)  
**Container image / network:** [`../env/README.md`](../env/README.md)

There is **no agent loop yet**. OpenAI / Claude / other providers should call this API from the **host**. Do not `docker exec` ad hoc from tool handlers — keep one `Sandbox` per sample.

```
┌─────────────────────────────────────────────────────────┐
│  Host (sampling machine)                                │
│                                                         │
│  agent loop (future harness/run.py + tools.py)          │
│       │  tool call                                      │
│       ▼                                                 │
│  harness.sandbox.Sandbox  ──docker exec / cp──►  container│
│       ▲                                         gdpval- │
│       │  ExecResult / frames / files            video   │
└───────┴─────────────────────────────────────────────────┘
```

---

## Lifecycle (one sample)

```python
from pathlib import Path
from harness.sandbox import Sandbox

sb = Sandbox()  # optional: mem="16g", cpus=8
try:
    sb.start(reference_dir=Path("media/<task_id>/reference"))
    # … agent tool loop using sb.bash / sb.python / … …
    out = sb.collect_deliverables(Path("runs/<run_id>/<task>/<model>/s0"))
finally:
    sb.stop()
```

| Step | Call | Notes |
|------|------|--------|
| Create | `Sandbox()` | Defaults: image `gdpval-video:local`, 16g RAM, 8 CPUs |
| Start | `start(reference_dir=…)` | Starts compose (proxy + sandbox); mounts refs **read-only** at `/workspace/reference_files` |
| Tools | see below | All paths must stay under `/workspace` |
| Collect | `collect_deliverables(dest)` | Copies `/workspace/deliverable_files/**` to host |
| Stop | `stop()` | Tears down compose project + temp dirs |

Context manager only calls `stop()` on exit — you still must call `start()`:

```python
with Sandbox() as sb:
    sb.start(reference_dir=ref)
    …
```

Repo-root `.env` (`PEXELS_API_KEY`, `PIXABAY_API_KEY`) is loaded automatically into the container.

---

## Tool surface (map these to the model)

These match plan §4.3. Expose the **same** set to every provider.

| Agent tool name | Python call | Default timeout | Returns |
|-----------------|-------------|-----------------|---------|
| `bash` | `sb.bash(cmd, timeout=180)` | 180s | [`ExecResult`](#result-types) |
| `python` | `sb.python(code, timeout=180)` | 180s | `ExecResult` |
| `read_file` | `sb.read_file(path, binary=False)` | 120s | `str` or `bytes` |
| `write_file` | `sb.write_file(path, data)` | 120s | `None` |
| `inspect_media` | `sb.inspect_media(path, times=[…])` | per-frame | [`MediaInspection`](#result-types) |
| `web_get` | `sb.web_get(url, dest=None)` | ~150s | [`WebResult`](#result-types) |

### Suggested JSON-schema shapes for the LLM

```json
{ "name": "bash", "parameters": { "cmd": "string", "timeout": "integer?" } }
{ "name": "python", "parameters": { "code": "string", "timeout": "integer?" } }
{ "name": "read_file", "parameters": { "path": "string", "binary": "boolean?" } }
{ "name": "write_file", "parameters": { "path": "string", "data": "string" } }
{ "name": "inspect_media", "parameters": { "path": "string", "times": "number[]?" } }
{ "name": "web_get", "parameters": { "url": "string", "dest": "string?" } }
```

### What to return to the model

| Tool | Tip |
|------|-----|
| `bash` / `python` | Send `exit_code`, `stdout`, `stderr`, `timed_out`. Truncate huge stdout if needed. |
| `read_file` | Text as-is; for binary prefer `inspect_media` or say “binary N bytes”. |
| `inspect_media` | Send compact ffprobe summary **and** attach JPEG frames as images in the chat (multimodal). |
| `web_get` | Send `ok`, `status_code`, `path`, `bytes_written`, `error`. |

### Timeouts

Default **180s** matches the plan minimum. Long Goodsin encodes may need `timeout=600`–`900` on `bash` — pass it through from the tool args; do not hard-cap below the plan.

---

## Workspace layout (inside the container)

| Path | Role |
|------|------|
| `/workspace/reference_files/` | Task refs (RO mount). Do **not** auto-unzip `reel footage.zip`. |
| `/workspace/deliverable_files/` | Agent outputs (graded). Final `.mp4` (+ optional `sources.json`) go here. |
| `/workspace/scratch/` | Intermediates, downloads, frames |

Paths outside `/workspace` are rejected by `read_file` / `write_file` / `inspect_media` / `web_get`.

---

## Result types

```python
ExecResult(exit_code: int, stdout: str, stderr: str, timed_out: bool)
# .ok  ==  exit_code == 0 and not timed_out

MediaInspection(
    path: str,
    ffprobe: dict,           # ffprobe -print_format json
    frames: list[tuple[float, bytes]],  # (time_sec, jpeg_bytes)
)

WebResult(
    url: str,
    ok: bool,
    status_code: int | None,
    path: str | None,        # container path if reached host
    error: str | None,
    bytes_written: int,
)
```

---

## Stock footage (Green Energy)

Do **not** scrape Pexels/Pixabay HTML (Cloudflare). Prefer:

1. **`bash`** with official APIs (keys already in the container):

```bash
curl -sS -H "Authorization: $PEXELS_API_KEY" \
  "https://api.pexels.com/v1/videos/search?query=solar&per_page=5&orientation=landscape"
curl -sS "https://pixabay.com/api/videos/?key=$PIXABAY_API_KEY&q=wind+turbine&per_page=5"
# then curl -L the MP4 URL from JSON → /workspace/scratch/downloads/
```

2. Or **`web_get`** on Mixkit / Coverr / Archive / Wikimedia CDN URLs.
3. Log downloaded URLs into `deliverable_files/sources.json` (also appended to `scratch/downloads/sources.log` by `web_get`).

Details: [`../env/README.md`](../env/README.md), [`../env/proxy/README.md`](../env/proxy/README.md).

---

## Thin `tools.py` wrapper (what to build next)

Keep provider SDKs out of `sandbox.py`. A future `harness/tools.py` should look like:

```python
def make_tool_handlers(sb: Sandbox) -> dict:
    return {
        "bash": lambda cmd, timeout=180: sb.bash(cmd, timeout=timeout),
        "python": lambda code, timeout=180: sb.python(code, timeout=timeout),
        "read_file": lambda path, binary=False: sb.read_file(path, binary=binary),
        "write_file": lambda path, data: sb.write_file(path, data),
        "inspect_media": lambda path, times=None: sb.inspect_media(path, times=times),
        "web_get": lambda url, dest=None: sb.web_get(url, dest=dest),
    }
```

Then `openai_path.py` / `claude_path.py` register those names with each SDK and serialize results for the model.

---

## Reference examples in-repo

| File | What it shows |
|------|----------------|
| [`../env/smoke/test_sandbox_bridge.py`](../env/smoke/test_sandbox_bridge.py) | Full API exercise (Gate D) |
| [`../env/smoke/dryrun_green_energy.py`](../env/smoke/dryrun_green_energy.py) | PDF + TTS + encode + collect |
| [`../env/smoke/dryrun_goodsin.py`](../env/smoke/dryrun_goodsin.py) | Unzip refs + encode + collect |

---

## Do / don’t

| Do | Don’t |
|----|--------|
| One `Sandbox` per `(model, task, sample)` | Share one container across samples |
| Call only `Sandbox` methods for I/O | Bypass with raw `docker exec` in tool code |
| Same tool set for all providers | Give Claude richer tools than OpenAI |
| Raise `timeout` for long ffmpeg | Assume default 180s is always enough |
| Use stock **APIs** for Pexels/Pixabay | Rely on HTML `curl` to those sites |
| Write finals under `deliverable_files/` | Leave the only output in `scratch/` |
