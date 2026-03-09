#!/usr/bin/env bash
set -euo pipefail

# List Render workspaces/owners to get your owner ID.
#
# Usage:
#   bash owners.sh
#   bash owners.sh --help

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: bash owners.sh"
  echo ""
  echo "Lists all workspaces/owners for your Render account."
  echo "Returns JSON array with id, name, email, type fields."
  echo ""
  echo "Requires: RENDER_API_KEY environment variable"
  exit 0
fi

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo '{"error": "RENDER_API_KEY environment variable is not set"}' >&2
  exit 1
fi

curl -sS --fail-with-body \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Accept: application/json" \
  "https://api.render.com/v1/owners" | jq '.'
