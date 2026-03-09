#!/usr/bin/env bash
set -euo pipefail

# Trigger a deploy for a Render service.
#
# Usage:
#   bash deploy.sh --id <serviceId> [--wait] [--timeout <seconds>]
#   bash deploy.sh --help

show_help() {
  echo "Usage: bash deploy.sh --id <serviceId> [--wait] [--timeout <seconds>]"
  echo ""
  echo "Options:"
  echo "  --id       Service ID (required, e.g. srv-xxxx)"
  echo "  --wait     Wait for deploy to complete (polls every 10s)"
  echo "  --timeout  Max wait time in seconds (default: 600)"
  echo ""
  echo "Requires: RENDER_API_KEY environment variable"
  exit 0
}

SERVICE_ID=""
WAIT=false
TIMEOUT=600

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) show_help ;;
    --id) SERVICE_ID="$2"; shift 2 ;;
    --wait) WAIT=true; shift ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "{\"error\": \"Unknown option: $1\"}" >&2; exit 1 ;;
  esac
done

if [[ -z "$SERVICE_ID" ]]; then
  echo '{"error": "--id is required"}' >&2
  exit 1
fi

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo '{"error": "RENDER_API_KEY environment variable is not set"}' >&2
  exit 1
fi

# Trigger deploy
RESPONSE=$(curl -sS --fail-with-body \
  -X POST \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
  -d '{}')

echo "$RESPONSE" | jq '.'

if [[ "$WAIT" == "false" ]]; then
  exit 0
fi

# Extract deploy ID
DEPLOY_ID=$(echo "$RESPONSE" | jq -r '.id')
if [[ -z "$DEPLOY_ID" || "$DEPLOY_ID" == "null" ]]; then
  echo '{"error": "Could not extract deploy ID from response"}' >&2
  exit 1
fi

echo "Waiting for deploy ${DEPLOY_ID} to complete..." >&2

ELAPSED=0
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  sleep 10
  ELAPSED=$((ELAPSED + 10))

  STATUS_RESPONSE=$(curl -sS --fail-with-body \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    "https://api.render.com/v1/services/${SERVICE_ID}/deploys/${DEPLOY_ID}")

  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
  echo "Deploy status: ${STATUS} (${ELAPSED}s elapsed)" >&2

  case "$STATUS" in
    live)
      echo "$STATUS_RESPONSE" | jq '.'
      exit 0
      ;;
    build_failed|update_failed|canceled|pre_deploy_failed)
      echo "$STATUS_RESPONSE" | jq '.' >&2
      exit 1
      ;;
  esac
done

echo "{\"error\": \"Deploy timed out after ${TIMEOUT}s\", \"deploy_id\": \"${DEPLOY_ID}\"}" >&2
exit 1
