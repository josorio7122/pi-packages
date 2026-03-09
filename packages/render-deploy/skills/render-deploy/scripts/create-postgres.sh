#!/usr/bin/env bash
set -euo pipefail

# Create a PostgreSQL database on Render.
#
# Usage:
#   bash create-postgres.sh --name <name> --owner <ownerId> [--region <region>] [--plan <plan>]
#   bash create-postgres.sh --help

show_help() {
  echo "Usage: bash create-postgres.sh --name <name> --owner <ownerId> [options]"
  echo ""
  echo "Options:"
  echo "  --name     Database name (required)"
  echo "  --owner    Owner/workspace ID (required, get from owners.sh)"
  echo "  --region   Region: oregon, ohio, virginia, frankfurt, singapore (default: oregon)"
  echo "  --plan     Plan: free, basic_256mb, basic_1gb, basic_4gb, pro_4gb (default: starter)"
  echo "  --version  PostgreSQL major version (default: 16)"
  echo ""
  echo "Requires: RENDER_API_KEY environment variable"
  exit 0
}

NAME=""
OWNER=""
REGION="oregon"
PLAN="starter"
PG_VERSION="16"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) show_help ;;
    --name) NAME="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --plan) PLAN="$2"; shift 2 ;;
    --version) PG_VERSION="$2"; shift 2 ;;
    *) echo "{\"error\": \"Unknown option: $1\"}" >&2; exit 1 ;;
  esac
done

if [[ -z "$NAME" || -z "$OWNER" ]]; then
  echo '{"error": "--name and --owner are required"}' >&2
  exit 1
fi

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo '{"error": "RENDER_API_KEY environment variable is not set"}' >&2
  exit 1
fi

curl -sS --fail-with-body \
  -X POST \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/postgres" \
  -d "$(jq -n \
    --arg name "$NAME" \
    --arg ownerId "$OWNER" \
    --arg region "$REGION" \
    --arg plan "$PLAN" \
    --arg version "$PG_VERSION" \
    '{
      name: $name,
      ownerId: $ownerId,
      region: $region,
      plan: $plan,
      version: $version
    }'
  )" | jq '.'
