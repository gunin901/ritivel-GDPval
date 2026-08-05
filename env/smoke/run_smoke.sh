#!/usr/bin/env bash
# Run Gates A–D. Requires Docker. Builds image if missing unless SKIP_BUILD=1.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ENV_DIR/.." && pwd)"
IMAGE="${GDPVAL_IMAGE:-gdpval-video:local}"
OFFLINE_SMOKE="${OFFLINE_SMOKE:-0}"

cd "$REPO_ROOT"

# Load repo-root .env into this shell (PEXELS_API_KEY / PIXABAY_API_KEY) without printing values.
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

echo "=== Gate A: image present / build ==="
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "Image $IMAGE not found; building..."
    "$ENV_DIR/build.sh"
  else
    echo "Image $IMAGE already present"
    docker image inspect --format='{{.Id}}' "$IMAGE" | tee "$ENV_DIR/.image_digest"
  fi
else
  docker image inspect "$IMAGE" >/dev/null
  docker image inspect --format='{{.Id}}' "$IMAGE" | tee "$ENV_DIR/.image_digest"
fi

PLATFORM="$(docker image inspect --format='{{.Architecture}}' "$IMAGE")"
echo "Architecture: $PLATFORM (expect amd64)"
if [[ "$PLATFORM" != "amd64" ]]; then
  echo "WARN: image architecture is $PLATFORM, plan requires linux/amd64"
fi

# Build proxy image
docker compose -f "$ENV_DIR/compose.yaml" build proxy

echo "=== Start compose stack for Gates B–C ==="
export REFERENCE_DIR="$ENV_DIR/smoke/fixtures/reference_placeholder"
export DELIVERABLE_DIR="$ENV_DIR/smoke/fixtures/deliverable_placeholder"
export SCRATCH_DIR="$ENV_DIR/smoke/fixtures/scratch_placeholder"
export COMPOSE_PROJECT_NAME="gdpval-smoke-$$"
mkdir -p "$REFERENCE_DIR" "$DELIVERABLE_DIR" "$SCRATCH_DIR"

cleanup() {
  docker compose -f "$ENV_DIR/compose.yaml" -p "$COMPOSE_PROJECT_NAME" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f "$ENV_DIR/compose.yaml" -p "$COMPOSE_PROJECT_NAME" up -d --no-build proxy sandbox
# Wait for sandbox
CID="$(docker compose -f "$ENV_DIR/compose.yaml" -p "$COMPOSE_PROJECT_NAME" ps -q sandbox)"
for i in $(seq 1 60); do
  if docker exec -u appuser "$CID" true 2>/dev/null; then
    break
  fi
  sleep 1
done
docker exec -u appuser "$CID" bash -lc \
  'mkdir -p /workspace/deliverable_files /workspace/scratch/downloads /workspace/scratch/frames'

echo "=== Gate B: imports / ffmpeg / pdf ==="
docker cp "$SCRIPT_DIR/test_imports.py" "$CID:/workspace/scratch/test_imports.py"
docker exec -u appuser -w /workspace "$CID" python /workspace/scratch/test_imports.py

docker cp "$SCRIPT_DIR/test_ffmpeg_pipeline.sh" "$CID:/workspace/scratch/test_ffmpeg_pipeline.sh"
docker exec -u appuser -w /workspace "$CID" bash /workspace/scratch/test_ffmpeg_pipeline.sh

docker cp "$SCRIPT_DIR/test_pdf_tts.py" "$CID:/workspace/scratch/test_pdf_tts.py"
docker exec -u appuser -e "OFFLINE_SMOKE=$OFFLINE_SMOKE" -w /workspace "$CID" \
  python /workspace/scratch/test_pdf_tts.py

echo "=== Gate C: network policy ==="
docker cp "$SCRIPT_DIR/test_network_policy.sh" "$CID:/workspace/scratch/test_network_policy.sh"
docker exec -u appuser -w /workspace "$CID" bash /workspace/scratch/test_network_policy.sh

echo "=== Gate C+: Pexels / Pixabay APIs ==="
docker cp "$SCRIPT_DIR/test_stock_apis.py" "$CID:/workspace/scratch/test_stock_apis.py"
docker exec -u appuser -w /workspace \
  -e "REQUIRE_STOCK_API=${REQUIRE_STOCK_API:-1}" \
  "$CID" python /workspace/scratch/test_stock_apis.py

# Tear down compose before Gate D (bridge starts its own project)
cleanup
trap - EXIT

echo "=== Gate D: sandbox bridge ==="
PYTHONPATH="$REPO_ROOT" python3 "$SCRIPT_DIR/test_sandbox_bridge.py"

echo ""
echo "All Gates A–D PASSED"
