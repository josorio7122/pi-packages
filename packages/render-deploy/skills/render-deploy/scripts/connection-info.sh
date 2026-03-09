#!/usr/bin/env bash
set -euo pipefail

# Get connection info for a Render PostgreSQL database.
#
# Usage:
#   bash connection-info.sh --id <postgresId>
#   bash connection-info.sh --help

show_help() {
  echo "Usage: bash connection-info.sh --id <postgresId>"
  echo ""
  echo "Options:"
  echo "  --id  PostgreSQL database ID (required, e.g. dpg-xxxx)"
  echo ""
  echo "Returns internalConnectionString and externalConnectionString."
  echo ""
  echo "Requires: RENDER_API_KEY environment variable"
  exit 0
}

PG_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) show_help ;;
    --id) PG_ID="$2"; shift 2 ;;
    *) echo "{\"error\": \"Unknown option: $1\"}" >&2; exit 1 ;;
  esac
done

if [[ -z "$PG_ID" ]]; then
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
  "https://api.render.com/v1/postgres/${PG_ID}/connection-info" | jq '.'
