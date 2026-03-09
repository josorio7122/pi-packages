#!/usr/bin/env bash
set -euo pipefail

# Delete a Render service or database.
#
# Usage:
#   bash delete.sh --id <serviceId> --type service
#   bash delete.sh --id <postgresId> --type postgres
#   bash delete.sh --help

show_help() {
  echo "Usage: bash delete.sh --id <id> --type <service|postgres>"
  echo ""
  echo "Options:"
  echo "  --id    Resource ID (required)"
  echo "  --type  Resource type: service or postgres (required)"
  echo ""
  echo "WARNING: This permanently deletes the resource."
  echo ""
  echo "Requires: RENDER_API_KEY environment variable"
  exit 0
}

RESOURCE_ID=""
RESOURCE_TYPE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) show_help ;;
    --id) RESOURCE_ID="$2"; shift 2 ;;
    --type) RESOURCE_TYPE="$2"; shift 2 ;;
    *) echo "{\"error\": \"Unknown option: $1\"}" >&2; exit 1 ;;
  esac
done

if [[ -z "$RESOURCE_ID" || -z "$RESOURCE_TYPE" ]]; then
  echo '{"error": "--id and --type are required"}' >&2
  exit 1
fi

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo '{"error": "RENDER_API_KEY environment variable is not set"}' >&2
  exit 1
fi

case "$RESOURCE_TYPE" in
  service)
    ENDPOINT="https://api.render.com/v1/services/${RESOURCE_ID}"
    ;;
  postgres)
    ENDPOINT="https://api.render.com/v1/postgres/${RESOURCE_ID}"
    ;;
  *)
    echo "{\"error\": \"Unknown type: ${RESOURCE_TYPE}. Use 'service' or 'postgres'.\"}" >&2
    exit 1
    ;;
esac

HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
  -X DELETE \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  "$ENDPOINT")

if [[ "$HTTP_CODE" == "204" || "$HTTP_CODE" == "200" ]]; then
  echo "{\"status\": \"deleted\", \"id\": \"${RESOURCE_ID}\", \"type\": \"${RESOURCE_TYPE}\"}"
else
  echo "{\"error\": \"Delete failed\", \"http_code\": ${HTTP_CODE}, \"id\": \"${RESOURCE_ID}\"}" >&2
  exit 1
fi
