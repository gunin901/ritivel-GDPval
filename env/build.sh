#!/usr/bin/env bash
# Build gdpval-video:local and record its digest.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_TAG="${IMAGE_TAG:-gdpval-video:local}"
PLATFORM="${PLATFORM:-linux/amd64}"

echo "Building ${IMAGE_TAG} for ${PLATFORM}..."
echo "First build may take 10–20+ minutes and needs tens of GB free disk."
echo ""

docker build \
  --platform "${PLATFORM}" \
  -t "${IMAGE_TAG}" \
  -f "${SCRIPT_DIR}/Dockerfile" \
  "${SCRIPT_DIR}"

DIGEST="$(docker image inspect --format='{{.Id}}' "${IMAGE_TAG}")"
echo "${DIGEST}" > "${SCRIPT_DIR}/.image_digest"
echo ""
echo "Built ${IMAGE_TAG}"
echo "Digest: ${DIGEST}"
echo "Wrote ${SCRIPT_DIR}/.image_digest"
