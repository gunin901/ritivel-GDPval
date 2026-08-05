# Allowlist forward proxy

Sidecar for the `gdpval-video` sandbox. The sandbox has **no direct internet**; HTTP(S) goes only through this proxy (`HTTP_PROXY=http://proxy:3128`).

## Behavior

- **Allowlist:** hosts in [`allowlist.txt`](allowlist.txt) (suffix match, so `pexels.com` covers `www.pexels.com`).
- **Methods:** GET / HEAD for plain HTTP proxy requests; HTTPS uses `CONNECT` to allowlisted hosts only.
- **Deny:** non-allowlisted hosts get `403` / failed CONNECT (e.g. `example.com`).
- **Cache:** successful GET bodies under `/var/cache/gdpval-proxy` inside the proxy container.

Build / run via [`../compose.yaml`](../compose.yaml) (service `proxy`).

## Cloudflare / bot blocking (important)

Allowlisting a host ≠ a successful download of **HTML** pages.

| Host | Observed via sandbox `curl` / `web_get` |
|------|----------------------------------------|
| `api.pexels.com` (with `PEXELS_API_KEY`) | **HTTP 200** JSON — preferred Pexels path |
| `pixabay.com/api/...` (with `PIXABAY_API_KEY`) | **HTTP 200** JSON — preferred Pixabay path |
| `mixkit.co`, `coverr.co`, `freesound.org`, `archive.org`, Wikimedia, … | Usually **HTTP 200** (keyless) |
| `pexels.com` / `pixabay.com` **HTML** | Often **HTTP 403** Cloudflare |
| Not on allowlist | Proxy rejects before origin |

Smoke Gate C probes Mixkit; Gate C+ exercises the official APIs when keys are in repo-root `.env`.

## Rebuild after allowlist edits

```bash
docker compose -f env/compose.yaml build proxy
```
