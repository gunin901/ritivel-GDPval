# GDPval Video Eval Plan — Sampling + Human Evaluation

**Version:** 2.0 · **Date:** 2026-08-05  
**Scope:** Produce model samples for **2 Film & Video Editor tasks** (both have gold deliverables), then collect blinded pairwise ratings from **3 human evaluators** across **8 models**.

**Sources:** [GDPval paper](https://arxiv.org/pdf/2510.04374) · `[openai/gdpval](https://huggingface.co/datasets/openai/gdpval)` · `[inspect_evals/gdpval](https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/gdpval)`

---

## 1. Tasks in scope

Only tasks that (a) produce video and (b) have a gold expert deliverable.


| #   | task_id                                | Name                    | Deliverable                       | Reference files                                                        | Gold                                        |
| --- | -------------------------------------- | ----------------------- | --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `e222075d-5d62-4757-ae3c-e34b0846583b` | Green Energy :30        | MP4 H.264 1920×1080, exactly 30 s | `GreenEnergy-30_Script.pdf`                                            | `GreenEnergy_v1.mp4` (20.6 MB)              |
| 2   | `75401f7c-396d-406d-b08e-938874ad1045` | Goodsin Studios CG reel | MP4 H.264 1920×1080, ≤80 s        | `action-energetic-rock-music-334316.mp3` + `reel footage.zip` (334 MB) | `Goodsin Studios CG Reel 2025.mp4` (292 MB) |


Both tasks are `sector = Information`, `occupation = Film and Video Editors`. Full prompts, rubrics, and file URLs live in `tasks/<task_id>.json` (pull with `scripts/fetch_tasks.py`).

---



## 2. What you are building

Two pipelines sharing one Docker environment:

1. **Sampling** — run each of 8 models as an agent inside the container; collect `deliverable_files/*.mp4` (+ optional `sources.json` / final chat message).
2. **Human evaluation** — 3 blinded evaluators pairwise-compare each model sample against the gold deliverable (GDPval paper protocol).

```
                    ┌─────────────────────────────┐
  task prompt +     │  Docker sandbox             │
  reference files ─►│  bash + python + ffmpeg …   │─► deliverable_files/*.mp4
                    │  OpenAI or Claude agent loop │
                    └─────────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
  gold .mp4 ───────►│  Blinded pairwise UI         │─► win / tie / loss
                    │  3 evaluators × 8 models     │   + written justification
                    └─────────────────────────────┘
```

---



## 3. How GDPval sampled OpenAI and Claude (match this)

From the paper (§3.1 footnote 2, §A.3, §A.6.4):


| Provider          | How they sampled                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI**        | API with **web search** + **code interpreter**, background sampling, ~150 packages preinstalled, agent told to write into a deliverable folder    |
| **Claude**        | Through the **Claude UI** with Anthropic’s file-creation feature enabled (best file-producing scaffold, not a lowest-common-denominator API call) |
| **Counts**        | **3 samples per model per task**, then **3 human graders per sample** → 9 comparisons per task per model                                          |
| **Prompt suffix** | Packages listed; write files to `deliverable_files/`; final message is also graded                                                                |


OpenAI’s container image itself is **not open-sourced**. Closest public reconstruction: `[inspect_evals/gdpval](https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/gdpval)` (Dockerfile + package pin list from paper §A.6.4).

For **these two tasks**, the agent also needs **network egress** (Green Energy requires royalty-free stock; Goodsin ships most media in the zip but may still need a substitute music track). Default Inspect GDPval disables networking — turn it on via a custom `compose.yaml` / proxy allowlist.

---



## 4. Docker image — tools and libraries



### 4.1 Base

Start from `[inspect_evals/gdpval/Dockerfile](https://github.com/UKGovernmentBEIS/inspect_evals/blob/main/src/inspect_evals/gdpval/Dockerfile)`:

- `python:3.11-slim-bookworm`, **linux/amd64**
- System: `ffmpeg`, LibreOffice, tesseract, poppler, ImageMagick-class deps, OpenCV runtime libs, fonts
- Paper §A.6.4 pip set (`moviepy`, `opencv-python`, `av`, `pydub`, `librosa`, `soundfile`, `pedalboard`, `pyloudnorm`, `srt`, `Pillow`, `torch` CPU, etc.)

Build once before sampling (Inspect sandbox init times out at 120 s):

```bash
docker build -t gdpval-video -f env/Dockerfile env/
```



### 4.2 Additions required for these two video tasks

Inspired by public agent video harnesses (see §4.4):


| Layer                         | Packages / binaries                                                           | Why                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| Encode / stitch               | `ffmpeg`, `ffprobe`, `x264`, `mediainfo`                                      | Cut, concat, overlay, drawtext, audio mix, exact duration |
| Python video                  | `av`, `moviepy`, `opencv-python`, `ffmpeg-python`                             | Programmatic timelines; frame extraction for self-check   |
| Audio                         | `pydub`, `librosa`, `soundfile`, `pedalboard`, `pyloudnorm`, `mutagen`, `sox` | Music trim, beat sync (Goodsin), loudness, scratch VO mix |
| TTS (Green Energy scratch VO) | `gTTS` and/or `piper-tts` / `TTS`                                             | Task requires a scratch voiceover track                   |
| Self-inspection               | `scenedetect`, frame JPEG export via ffmpeg                                   | Paper §A.3: extract frames and look before submitting     |
| Docs / scripts                | `PyMuPDF`, `pdfplumber`, `pdf2image`                                          | Read `GreenEnergy-30_Script.pdf`                          |
| Optional timeline DSL         | `opentimelineio`                                                              | Structured edit plans (Cutible / mcp-video pattern)       |


Minimal pip add-on on top of the GDPval base:

```text
scenedetect[opencv]==0.6.4
opentimelineio==0.17.0
gTTS==2.5.1
imagehash==4.3.1
```



### 4.3 Tools exposed to the agent

Same surface for OpenAI and Claude. **Implemented host bridge:** [`harness.sandbox.Sandbox`](harness/README.md) (see that doc for signatures, return types, lifecycle, and a `tools.py` sketch).


| Tool                             | Role                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `bash` (timeout ≥ 180 s)         | Shell out to ffmpeg, unzip, download                                                                                           |
| `python` (timeout ≥ 180 s)       | Scripts, moviepy/av pipelines                                                                                                  |
| `read_file` / `write_file`       | Convenience I/O                                                                                                                |
| `inspect_media(path, times=[…])` | ffprobe JSON + extracted frames returned as images into the model context (video analogue of paper’s “render to PNG and look”) |
| `web_get(url)`                   | Proxied GET/HEAD only, allowlisted stock domains, response cached                                                              |


**Allowlist (Green Energy):** stock hosts in `env/proxy/allowlist.txt`. Prefer **Pexels/Pixabay official APIs** (`api.pexels.com`, `pixabay.com/api/…` with keys in `.env`) — HTML pages are often Cloudflare-blocked. Also: `mixkit.co`, `coverr.co`, `videvo.net`, `freesound.org`, `incompetech.com`, `freepd.com`, `archive.org`, `commons.wikimedia.org`, plus watermarked-preview hosts as the prompt permits.

### 4.4 Repos to take inspiration from


| Repo                                                                                                                            | Useful pattern                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [UKGovernmentBEIS/inspect_evals](https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/gdpval) `gdpval` | Docker + `bash`/`python` tools + extract `deliverable_files/` into the eval store |
| [e2b-dev/code-interpreter](https://github.com/e2b-dev/code-interpreter)                                                         | Hosted sandbox alternative if you do not want to manage Docker yourself           |
| [pastorsimon1798-agentcut / mcp-video](https://github.com/iflow-mcp/pastorsimon1798-agentcut)                                   | Structured FFmpeg tool layer (trim/merge/text/audio/scene detect) for agents      |
| [plokdalberb-byte/cutible](https://github.com/plokdalberb-byte/cutible)                                                         | Timeline-as-data → deterministic FFmpeg render + QC loop                          |
| [belikesaif/StudioAgent](https://github.com/belikesaif/StudioAgent)                                                             | Gemini plan → FFmpeg/MoviePy render pipeline                                      |
| [poseljacob/agentic-video-editor](https://github.com/poseljacob/agentic-video-editor)                                           | Director → EditPlan → FFmpeg → Reviewer loop                                      |
| [HKUDS/VideoAgent](https://github.com/HKUDS/VideoAgent)                                                                         | Agent graph + ffmpeg + Whisper/TTS for edit/remix                                 |
| [OpenAI Shell tool docs](https://developers.openai.com/api/docs/guides/tools-shell)                                             | Hosted container (`container_auto`), `/mnt/data`, optional allowlisted network    |


Do **not** bind the eval to CapCut/Remotion UIs — keep the agent on ffmpeg in the sandbox so OpenAI and Claude share one environment.

### 4.5 Resources


| Resource      | Value                                                |
| ------------- | ---------------------------------------------------- |
| vCPU / RAM    | 8 / 16–32 GB                                         |
| Disk          | ≥ 50 GB scratch (Goodsin zip 334 MB + intermediates) |
| Wall clock    | Green Energy ≤ 2 h; Goodsin ≤ 3 h                    |
| Tool-call cap | 400                                                  |
| Platform      | linux/amd64 (required for package wheels)            |


---



## 5. Creating samples (OpenAI + Claude)



### 5.1 Model roster (7 models)

Pick and freeze exact API strings before the run. Suggested mix (paper + current frontier):


| #   | Model                                                       | Provider  |
| --- | ----------------------------------------------------------- | --------- |
| 1   | GPT-4o                                                      | OpenAI    |
| 2   | o3 / o4-mini (one reasoning model)                          | OpenAI    |
| 3   | GPT-5.x flagship (e.g. `gpt-5.6-sol` or current equivalent) | OpenAI    |
| 4   | Claude Opus 5 / Sonnet 5 (current flagship)                 | Anthropic |
| 5   | Gemini 2.5 Pro or Gemini 3.x                                | Google    |
| 6   | Grok 4 / 4.5                                                | xAI       |
| 7   | One open-weight frontier (e.g. DeepSeek-V4 / Kimi K3)       | open      |


Record in `runs/<run_id>/manifest.json`: model string, snapshot date, reasoning effort, track, image digest, git SHA.

### 5.2 Sampling matrix

```
7 models × 2 tasks × 3 samples = 42 agent runs
```

Optional later: elicited prompt (paper §A.3) as a second condition — not required for the first pass.

### 5.3 Prompt assembly

```
<input> =
  <task prompt from HF>
  + DEFAULT_PROMPT_SUFFIX   # packages available; write to deliverable_files/
  + VIDEO_CHECK_SUFFIX      # ffprobe + extract frames + look before submit
```

**DEFAULT_PROMPT_SUFFIX** (from Inspect / paper):

```
Files can be found using the tools provided. Packages are installed in the
environment, including: libreoffice, av, moviepy, opencv-python, pydub,
librosa, pedalboard, pyloudnorm, srt, gTTS, …

Write your files in a new folder named `deliverable_files`. We will also
grade your final message as part of the deliverable.
```

**VIDEO_CHECK_SUFFIX** (adapted from paper §A.3):

```
Before submitting any .mp4:
1. Run ffprobe; verify codec, resolution, duration, audio stream.
2. Extract ≥1 frame per second (+ frames around cuts); LOOK at them for
   black frames, stretch, letterboxing, clipped text, watermarks.
3. Confirm audio (music / VO / SFX) is present where required and ends cleanly.
4. Keep deliverable_files/sources.json listing every downloaded asset URL.
```

Mount reference files at `/workspace/reference_files/<basename>` (do not auto-unzip `reel footage.zip` — unzipping is part of the Goodsin task).

### 5.4 OpenAI sampling path

**Preferred (parity with paper):** Responses API with hosted **Shell** tool ([docs](https://developers.openai.com/api/docs/guides/tools-shell)) + web search where available.

```python
# sketch — create reusable container, then sample
container = client.containers.create(memory_limit="16g")  # or 64g if needed
# upload reference files into container /mnt/data/reference_files/
response = client.responses.create(
    model=MODEL,
    tools=[
        {"type": "shell", "environment": {"type": "container_reference", "container_id": container.id}},
        # optional: web_search / allowlisted network_policy for stock footage
    ],
    input=[{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
    background=True,  # paper used background sampling
)
# poll until done; download /mnt/data/deliverable_files/** via containers files API
```

**Notes**

- Default memory is 1 GB — too small for Goodsin. Use **16 GB or 64 GB**.
- Containers expire after **20 min idle** — keepalive if encodes are long.
- Hosted Shell package set ≠ paper §A.6.4. If ffmpeg / moviepy are missing, either (a) use allowlisted network + `pip`/`apt` where policy allows, or (b) fall back to **self-hosted Docker** below.
- Artifacts under `/mnt/data` are the downloadable path.

**Fallback (recommended for fair OpenAI↔Claude comparison):** run OpenAI models through the **same local Docker image** as Claude, with Inspect-style `bash` + `python` tools. That is what `[inspect_evals/gdpval](https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/gdpval)` does (“Inspect doesn’t support the code interpreter API”).

### 5.5 Claude sampling path

Paper used the **Claude UI** for file creation. For a reproducible eval, use the **API + the same Docker sandbox**:

1. Spin up `gdpval-video` container with reference files mounted.
2. Agent loop: Claude tool use → `bash` / `python` / `inspect_media` / `web_get` executed in the container → tool results (including images from `inspect_media`) returned to Claude.
3. Stop when Claude finishes or budgets hit; collect `/workspace/deliverable_files/**`.

Use Anthropic’s strongest file/code tool surface available to you (computer use / code execution / bash tool — whatever your org has enabled). **Do not** give Claude a richer tool set than OpenAI on the shared Docker path.

Optional UI-only calibration run (not for the headline table): one Claude sample via claude.ai with file upload of references, to sanity-check the API harness.

### 5.6 Shared self-hosted harness (fair default)

```
for each (model, task, sample_k):
  1. Create container from gdpval-video image
  2. Copy reference files in; create empty deliverable_files/
  3. Run agent loop (OpenAI or Anthropic SDK) with identical tools
  4. On exit: copy deliverable_files/ → runs/<run_id>/<task_id>/<model>/s<k>/
  5. Write transcript.jsonl, metrics.json (wall time, tokens, cost, exit status)
  6. Destroy container
```

**Exit statuses:** `ok` | `no_deliverable` | `corrupt_deliverable` | `timeout` | `tool_error` | `refusal` | `provider_error`  
Only `provider_error` is retried. `no_deliverable` counts as a **loss** in win rate.

### 5.7 Deliverable checklist before shipping a sample to evaluators


| Check                                      | Green Energy     | Goodsin          |
| ------------------------------------------ | ---------------- | ---------------- |
| File exists under `deliverable_files/`     | `.mp4`           | `.mp4`           |
| Decodes (`ffmpeg -v error -i f -f null -`) | yes              | yes              |
| Codec / resolution                         | H.264, 1920×1080 | H.264, 1920×1080 |
| Duration                                   | 29.9–30.1 s      | ≤ 80.0 s         |
| Audio stream present                       | yes              | yes              |


Failing samples still go to evaluators if they play at all; unplayable samples are auto-losses without human time.

---



## 6. Collecting evaluations (3 evaluators × 2 tasks × 8 models)



### 6.1 Protocol (match the paper)

Blinded **pairwise comparison**: evaluator sees the task prompt, reference files, and two unlabeled videos — **A** and **B** (one is the gold expert deliverable, one is the model sample). Order is randomized.

Label for the **model** deliverable:


| Label            | Score |
| ---------------- | ----- |
| better than gold | 1     |
| as good as gold  | 0.5   |
| worse than gold  | 0     |


Also collect: ≥50-word justification + failure tags (`instruction_following`, `formatting`, `accuracy`, `aesthetics`, `incomplete` / `no_deliverable`).

### 6.2 Volume

```
8 models × 2 tasks × 3 samples × 3 evaluators = 144 comparisons
```


| Quantity                   | Value                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Evaluators                 | 3 professional video editors (≥5 years), paid                                                      |
| Samples per model per task | 3                                                                                                  |
| Graders per sample         | 3 (all three rate every sample)                                                                    |
| Comparisons                | 144                                                                                                |
| Est. time                  | paper avg ~1 h per comparison → budget ~150 h total; with a tight UI expect ~20–40 min → ~50–100 h |




### 6.3 Evaluator workflow — step by step

1. **Recruit & NDA** — 3 editors; no one who authored the gold deliverables.
2. **Calibration (shared)** — 6 practice comparisons (2 tasks × 3 fixed pairs from a held-out dry run or deliberately broken fixtures). Compute pairwise agreement; retrain anyone far below the others before live grading.
3. **Grading UI** — side-by-side players, synced scrub, frame step, A/B toggle, waveform optional. Show prompt + references. Filenames scrubbed (`deliverable_A.mp4` / `deliverable_B.mp4`). Model identity hidden. Media metadata stripped (`ffmpeg -map_metadata -1`).
4. **Assignment** — each evaluator rates all 48 samples (8×2×3). Randomize A/B order per comparison independently per evaluator.
5. **Capture** — one JSONL row per (evaluator, task, model, sample):

```json
{
  "task_id": "e222075d-5d62-4757-ae3c-e34b0846583b",
  "model": "gpt-5.6-sol",
  "sample": 0,
  "evaluator_id": "e1",
  "order_shown": ["B", "A"],
  "label": "worse",
  "score": 0.0,
  "failure_tags": ["instruction_following", "formatting"],
  "justification": "…",
  "seconds_spent": 1800
}
```

1. **QC** — flag comparisons finished in <2 minutes; spot-check; require justification length.



### 6.4 Same environment for evaluators

Evaluators do **not** run agents. They need:

- Browser access to the grading UI
- Ability to play H.264 1080p (and Goodsin’s larger files — host via progressive download or signed URLs, not email attachments)
- The **same task brief + reference files** the model saw (read-only)
- Headphones recommended (Goodsin SFX / music sync)

Host media from the sampling machine’s `runs/` tree (or object storage). Do not re-encode before grading — re-encoding can change duration/quality and bias the comparison.

### 6.5 Metrics

```
win_rate_paper   = (wins + ties) / N          # paper headline style
win_rate         = (wins + 0.5·ties) / N      # also report
```

Aggregate levels:

1. Per model, per task (primary — only 2 tasks)
2. Per model, averaged over both tasks
3. Inter-rater agreement: `A = mean(1 − |Hᵢ − Hⱼ|)` with scores in `{0, 0.5, 1}` (paper §A.6.1)

Report 95% cluster bootstrap CIs (resample tasks → samples → raters). With n=2 tasks, **always show per-task charts**; do not overclaim a single ranking.

### 6.6 Optional: severity on losses

For every loss, one evaluator (or a fourth reviewer) tags: `catastrophic` | `bad` | `acceptable_but_subpar` | `disagree_model_better` (paper §A.2.6).

---



## 7. End-to-end checklist


| Step | Action                                                               | Output                         |
| ---- | -------------------------------------------------------------------- | ------------------------------ |
| 1    | `python scripts/fetch_tasks.py --download` for the two task IDs only | `tasks/*.json`, `media/`       |
| 2    | Build `gdpval-video` Docker image                                    | image digest in manifest       |
| 3    | Implement agent loop (OpenAI + Claude) on shared tools               | `harness/`                     |
| 4    | Dry run: 1 model × 2 tasks × 1 sample                                | verify MP4s + transcripts      |
| 5    | Full sample: 8 × 2 × 3                                               | `runs/<run_id>/…` (48 folders) |
| 6    | Gate-check deliverables; upload to grading media host                | playable URLs                  |
| 7    | Calibrate 3 evaluators                                               | agreement log                  |
| 8    | Run 144 blinded pairwise ratings                                     | `pairwise.jsonl`               |
| 9    | Compute win rates + agreement + per-task tables                      | `analysis/`                    |
| 10   | Archive image digest, prompts, manifests, ratings                    | immutable release tag          |


---



## 8. Repo layout (minimal)

```
gdpval-video-eval/
├─ GDPVAL_VIDEO_EVAL_PLAN.md
├─ tasks/                          # 2 task JSONs
├─ media/<task_id>/{reference,deliverable}/
├─ env/
│  ├─ Dockerfile                   # inspect_evals gdpval base + video add-ons
│  ├─ docker-requirements.txt
│  └─ proxy/                       # stock-site allowlist + cache
├─ harness/
│  ├─ README.md                    # ★ agent ↔ Sandbox integration contract
│  ├─ sandbox.py                   # host bridge (bash/python/inspect_media/web_get/…)
│  ├─ run.py                       # 8×2×3 driver (TODO)
│  ├─ prompts.py                   # suffixes (TODO)
│  ├─ tools.py                     # thin wrappers over Sandbox (TODO)
│  └─ openai_path.py / claude_path.py  # (TODO)
├─ human/
│  ├─ ui/                          # blinded A/B player
│  └─ export.py
├─ runs/<run_id>/…
└─ analysis/
```

---



## 9. Cost sketch


| Item                                           | Rough order                                   |
| ---------------------------------------------- | --------------------------------------------- |
| Sampling (48 agent runs, video-long)           | $1–4 k API + compute                          |
| Human grading (144 comparisons)                | dominant cost — budget for ~50–150 paid hours |
| Storage / bandwidth for Goodsin gold + samples | tens of GB                                    |


---



## Appendix — Task rubrics (scoring reference for evaluators)

Full criteria remain in `tasks/<task_id>.json` (`rubric_pretty` / `rubric_json`). Evaluators should use the **pairwise judgment** as the headline; rubrics are a checklist aid during review, not a substitute for the A/B call.

**Green Energy** — 33 items (exact 30 s, H.264 1080p, scratch VO from script, two black/white graphic cards with mandated copy, CA + green-energy visuals, royalty-free sourcing, classical-energetic music). Note the large face-identifiability penalty (−85) conflicts with the prompt’s “diverse Californians” ask — for pairwise grading, instruct evaluators to follow the **task brief**, not to treat the privacy line as a hard fail unless you separately decide that policy.

**Goodsin reel** — 40 items (≤80 s, logos open/close, prescribed SFX on castle/collapse/neon, muted embedded audio except two named clips, beat-aware cuts, physics/sim coverage). Most items are objectively checkable; still score pairwise vs gold for the headline metric.