#!/usr/bin/env bash
set -euo pipefail

# Get status of a Render service.
#
# Usage:
#   bash status.sh --id <serviceId>
#   bash status.sh --help

show_help() {
  echo "Usage: bash status.sh --id <serviceId>"
  echo ""
  echo "Options:"
  echo "  --id  Service ID (required, e.g. srv-xxxx)"
  echo ""
  echo "Requires: RENDER_API_KEY environment variable"
  exit 0
}

SERVICE_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) show_help ;;
    --id) SERVICE_ID="$2"; shift 2 ;;
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

curl -sS --fail-with-body \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Accept: application/json" \
  "https://api.render.com/v1/services/${SERVICE_ID}" | jq '.'
