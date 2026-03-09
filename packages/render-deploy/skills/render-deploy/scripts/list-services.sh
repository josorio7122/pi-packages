#!/usr/bin/env bash
set -euo pipefail

# List all services in your Render workspace.
#
# Usage:
#   bash list-services.sh [--limit <n>]
#   bash list-services.sh --help

show_help() {
  echo "Usage: bash list-services.sh [--limit <n>]"
  echo ""
  echo "Options:"
  echo "  --limit  Number of results (default: 20)"
  echo ""
  echo "Requires: RENDER_API_KEY environment variable"
  exit 0
}

LIMIT=20

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) show_help ;;
    --limit) LIMIT="$2"; shift 2 ;;
    *) echo "{\"error\": \"Unknown option: $1\"}" >&2; exit 1 ;;
  esac
done

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo '{"error": "RENDER_API_KEY environment variable is not set"}' >&2
  exit 1
fi

curl -sS --fail-with-body \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Accept: application/json" \
  "https://api.render.com/v1/services?limit=${LIMIT}" | jq '.'
