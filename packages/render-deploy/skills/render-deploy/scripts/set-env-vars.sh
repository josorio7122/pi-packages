#!/usr/bin/env bash
set -euo pipefail

# Set environment variables on a Render service.
# This REPLACES all existing env vars — include all vars you want to keep.
#
# Usage:
#   bash set-env-vars.sh --id <serviceId> --vars '<json-array>'
#   bash set-env-vars.sh --help

show_help() {
  echo "Usage: bash set-env-vars.sh --id <serviceId> --vars '<json-array>'"
  echo ""
  echo "Options:"
  echo "  --id    Service ID (required, e.g. srv-xxxx)"
  echo "  --vars  JSON array of env vars (required)"
  echo ""
  echo "Example:"
  echo "  bash set-env-vars.sh --id srv-abc123 --vars '[{\"key\":\"DB_URL\",\"value\":\"postgres://...\"}]'"
  echo ""
  echo "WARNING: This replaces ALL env vars. Include every var you want to keep."
  echo ""
  echo "Requires: RENDER_API_KEY environment variable"
  exit 0
}

SERVICE_ID=""
VARS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) show_help ;;
    --id) SERVICE_ID="$2"; shift 2 ;;
    --vars) VARS="$2"; shift 2 ;;
    *) echo "{\"error\": \"Unknown option: $1\"}" >&2; exit 1 ;;
  esac
done

if [[ -z "$SERVICE_ID" || -z "$VARS" ]]; then
  echo '{"error": "--id and --vars are required"}' >&2
  exit 1
fi

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo '{"error": "RENDER_API_KEY environment variable is not set"}' >&2
  exit 1
fi

curl -sS --fail-with-body \
  -X PUT \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/${SERVICE_ID}/env-vars" \
  -d "$VARS" | jq '.'
