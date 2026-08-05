# Image source

Vendored from [UKGovernmentBEIS/inspect_evals](https://github.com/UKGovernmentBEIS/inspect_evals) `src/inspect_evals/gdpval/`.

| Field | Value |
|-------|-------|
| Upstream commit | `d229c0898a1c12ec68048670cd78aa2be213c828` |
| Fetched | 2026-08-05 |
| Local image tag | `gdpval-video:local` |
| Platform | `linux/amd64` |

Package pins in `docker-requirements.txt` track Inspect's reconstruction of OpenAI GDPval paper §A.6.4. Video task add-ons live in `video-requirements.txt`.

**Local fixes (agent sandbox):**
- Uninstall `coverage` / `pytest-cov` — numba 0.66 expects `coverage.types.Tracer`, which modern coverage removed.
- Force `librosa==0.10.2` — Inspect's `0.8.1` uses removed `np.complex` under numpy 1.24.
- Re-pin `numpy==1.24.0` after librosa so `opencv-python==4.5.5.62` ABI still imports.

**Network note:** see [`proxy/README.md`](proxy/README.md) — HTML Pexels/Pixabay may Cloudflare-block bots; use `api.pexels.com` / Pixabay `/api/` with keys from repo-root `.env`. Keyless smoke still uses Mixkit.
