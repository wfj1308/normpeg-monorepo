#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-GXX_2024_XXX}"
BASE_URL="${2:-http://127.0.0.1:8081}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/../../docker/nl2gate-api/docker-compose.edge.yml"

docker compose -f "${COMPOSE_FILE}" up -d --build
sleep 4

READY_JSON="$(curl -fsS "${BASE_URL}/ops/ready?project_id=${PROJECT_ID}")"
SMOKE_JSON="$(curl -fsS "${BASE_URL}/ops/smoke?project_id=${PROJECT_ID}")"
DELIVERABLES_JSON="$(curl -fsS "${BASE_URL}/ops/deliverables?project_id=${PROJECT_ID}")"

echo "ops/ready -> ${READY_JSON}"
echo "ops/smoke -> ${SMOKE_JSON}"
echo "ops/deliverables -> ${DELIVERABLES_JSON}"

if ! echo "${SMOKE_JSON}" | grep -q '"status":"pass"' || ! echo "${DELIVERABLES_JSON}" | grep -q '"status":"pass"'; then
  echo "Smoke check failed." >&2
  exit 1
fi

echo "Edge deployment is up and smoke checks passed."
