#!/usr/bin/env bash
# Deploy GDPval human eval: AWS S3 bucket + Render Docker web service.
#
# Required:
#   AWS_ACCESS_KEY_ID
#   AWS_SECRET_ACCESS_KEY
#   RENDER_API_KEY          # Dashboard → Account Settings → API Keys (rnd_…)
#
# Optional:
#   S3_BUCKET=ritivel-gdpval-eval-videos
#   S3_REGION=us-east-1
#   RENDER_BRANCH=cursor/ship-human-eval-79af
#   RENDER_SERVICE_NAME=gdpval-human-eval
#   RENDER_OWNER_ID=        # workspace/owner id if API requires it
#   RENDER_ORIGIN=https://….onrender.com  # for S3 CORS after first deploy
#
# Usage:
#   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... RENDER_API_KEY=rnd_...
#   ./human/s3/deploy-platform.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BUCKET="${S3_BUCKET:-ritivel-gdpval-eval-videos}"
REGION="${S3_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
BRANCH="${RENDER_BRANCH:-cursor/ship-human-eval-79af}"
REPO_URL="https://github.com/ritivel/ritivel-GDPval"
SERVICE_NAME="${RENDER_SERVICE_NAME:-gdpval-human-eval}"
API="https://api.render.com/v1"

need() { [[ -n "${!1:-}" ]] || { echo "ERROR: missing env $1"; exit 1; }; }
need AWS_ACCESS_KEY_ID
need AWS_SECRET_ACCESS_KEY
need RENDER_API_KEY

command -v aws >/dev/null || { echo "aws CLI missing"; exit 1; }
command -v render >/dev/null || { echo "render CLI missing"; exit 1; }
command -v curl >/dev/null
command -v python3 >/dev/null
command -v openssl >/dev/null

auth_hdr=(-H "Authorization: Bearer ${RENDER_API_KEY}" -H "Accept: application/json" -H "Content-Type: application/json")

echo "==> AWS identity"
aws sts get-caller-identity

echo "==> Render identity"
curl -fsS "${API}/owners" "${auth_hdr[@]}" | python3 -m json.tool | head -40
OWNER_ID="${RENDER_OWNER_ID:-}"
if [[ -z "$OWNER_ID" ]]; then
  OWNER_ID="$(curl -fsS "${API}/owners" "${auth_hdr[@]}" | python3 -c '
import sys,json
data=json.load(sys.stdin)
# API returns [{owner:{id,...},...}] or list of owners
items=data if isinstance(data,list) else []
for it in items:
  o=it.get("owner") or it
  if o.get("id"):
    print(o["id"]); break
')"
fi
echo "Owner/workspace: ${OWNER_ID:-unknown}"
[[ -n "$OWNER_ID" ]] || { echo "Set RENDER_OWNER_ID manually"; exit 1; }

echo "==> Provision S3"
bash "$ROOT/human/s3/setup-bucket.sh" "$BUCKET" "$REGION" "${RENDER_ORIGIN:-http://localhost:3000}"
ENV_FILE="$ROOT/human/s3/render-env.generated.txt"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE"; exit 1; }

SESSION_SECRET="$(openssl rand -hex 24)"
# Build envVars JSON for Render API from generated file
ENV_JSON="$(python3 - <<PY
import json, os
vars = []
path = "${ENV_FILE}"
with open(path) as f:
    for line in f:
        line=line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k,v = line.split("=",1)
        vars.append({"key": k, "value": v})
vars.append({"key": "SESSION_SECRET", "value": "${SESSION_SECRET}"})
vars.append({"key": "NODE_ENV", "value": "production"})
print(json.dumps(vars))
PY
)"

echo "==> Look for existing Render service named ${SERVICE_NAME}"
SERVICE_ID="$(curl -fsS "${API}/services?limit=50" "${auth_hdr[@]}" | python3 -c '
import sys,json
name="'"${SERVICE_NAME}"'"
data=json.load(sys.stdin)
items=data if isinstance(data,list) else data.get("items") or []
for it in items:
  s=it.get("service") or it
  if s.get("name")==name:
    print(s.get("id",""))
    break
' || true)"

if [[ -z "${SERVICE_ID}" ]]; then
  echo "==> Creating Docker web service from GitHub"
  # Persistent disk for SQLite
  CREATE_BODY="$(python3 - <<PY
import json
body = {
  "type": "web_service",
  "name": "${SERVICE_NAME}",
  "ownerId": "${OWNER_ID}",
  "repo": "${REPO_URL}",
  "branch": "${BRANCH}",
  "autoDeploy": "yes",
  "serviceDetails": {
    "runtime": "docker",
    "plan": "starter",
    "region": "oregon",
    "healthCheckPath": "/login",
    "dockerContext": ".",
    "dockerfilePath": "./human/ui/Dockerfile",
    "disk": {
      "name": "gdpval-data",
      "mountPath": "/var/data",
      "sizeGB": 5
    },
    "envVars": json.loads('''${ENV_JSON}''')
  }
}
print(json.dumps(body))
PY
)"
  RESP="$(curl -sS -X POST "${API}/services" "${auth_hdr[@]}" -d "${CREATE_BODY}")"
  echo "$RESP" | python3 -m json.tool | head -60
  SERVICE_ID="$(python3 -c 'import json,sys; d=json.load(sys.stdin); s=d.get("service") or d; print(s.get("id") or "")' <<<"$RESP")"
  [[ -n "$SERVICE_ID" ]] || { echo "Create failed"; exit 1; }
else
  echo "==> Updating env on existing service ${SERVICE_ID}"
  # PUT env vars (best-effort; API shapes vary by account)
  curl -sS -X PUT "${API}/services/${SERVICE_ID}/env-vars" "${auth_hdr[@]}" \
    -d "${ENV_JSON}" | python3 -m json.tool | head -40 || true
fi

echo "==> Trigger deploy"
DEPLOY="$(curl -sS -X POST "${API}/services/${SERVICE_ID}/deploys" "${auth_hdr[@]}" \
  -d "{\"clearCache\":\"do_not_clear\"}")"
echo "$DEPLOY" | python3 -m json.tool | head -40
DEPLOY_ID="$(python3 -c 'import json,sys; d=json.load(sys.stdin); x=d.get("deploy") or d; print(x.get("id") or "")' <<<"$DEPLOY")"

echo "==> Waiting for deploy ${DEPLOY_ID}…"
for i in $(seq 1 60); do
  ST="$(curl -fsS "${API}/services/${SERVICE_ID}/deploys/${DEPLOY_ID}" "${auth_hdr[@]}" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); x=d.get("deploy") or d; print(x.get("status") or "")')"
  echo "  status=$ST"
  case "$ST" in
    live|succeeded|successful) break ;;
    build_failed|update_failed|canceled|deactivated|failed) echo "Deploy failed: $ST"; exit 1 ;;
  esac
  sleep 10
done

# Resolve public URL
URL="$(curl -fsS "${API}/services/${SERVICE_ID}" "${auth_hdr[@]}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); s=d.get("service") or d; print(s.get("serviceDetails",{}).get("url") or s.get("url") or "")')"

echo ""
echo "============================================"
echo "Deployed service: ${SERVICE_ID}"
echo "URL: ${URL:-check Render dashboard}"
echo "S3 bucket: ${BUCKET}"
echo "Env file: ${ENV_FILE}"
echo "============================================"
echo "Next: open ${URL}/login — then refresh S3 CORS with that origin:"
echo "  RENDER_ORIGIN=${URL} ./human/s3/setup-bucket.sh ${BUCKET} ${REGION} ${URL}"
