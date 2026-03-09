#!/usr/bin/env bash
set -euo pipefail

# Create a Docker-based web service on Render.
#
# Usage:
#   bash create-service.sh --name <name> --owner <ownerId> --repo <url> [options]
#   bash create-service.sh --help

show_help() {
  echo "Usage: bash create-service.sh --name <name> --owner <ownerId> --repo <url> [options]"
  echo ""
  echo "Options:"
  echo "  --name            Service name (required)"
  echo "  --owner           Owner/workspace ID (required)"
  echo "  --repo            GitHub repo URL (required, e.g. https://github.com/user/repo)"
  echo "  --branch          Git branch (default: main)"
  echo "  --dockerfile      Dockerfile path relative to repo root (default: ./Dockerfile)"
  echo "  --docker-context  Docker build context path (default: .)"
  echo "  --region          Region: oregon, ohio, virginia, frankfurt, singapore (default: oregon)"
  echo "  --plan            Plan: free, starter, standard, pro (default: starter)"
  echo "  --health-check    Health check path (e.g. /health)"
  echo "  --auto-deploy     Auto deploy on push: yes or no (default: yes)"
  echo ""
  echo "Requires: RENDER_API_KEY environment variable"
  exit 0
}

NAME=""
OWNER=""
REPO=""
BRANCH="main"
DOCKERFILE="./Dockerfile"
DOCKER_CONTEXT="."
REGION="oregon"
PLAN="starter"
HEALTH_CHECK=""
AUTO_DEPLOY="yes"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) show_help ;;
    --name) NAME="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --dockerfile) DOCKERFILE="$2"; shift 2 ;;
    --docker-context) DOCKER_CONTEXT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --plan) PLAN="$2"; shift 2 ;;
    --health-check) HEALTH_CHECK="$2"; shift 2 ;;
    --auto-deploy) AUTO_DEPLOY="$2"; shift 2 ;;
    *) echo "{\"error\": \"Unknown option: $1\"}" >&2; exit 1 ;;
  esac
done

if [[ -z "$NAME" || -z "$OWNER" || -z "$REPO" ]]; then
  echo '{"error": "--name, --owner, and --repo are required"}' >&2
  exit 1
fi

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo '{"error": "RENDER_API_KEY environment variable is not set"}' >&2
  exit 1
fi

# Build the serviceDetails object
SERVICE_DETAILS=$(jq -n \
  --arg region "$REGION" \
  --arg plan "$PLAN" \
  --arg dockerfile "$DOCKERFILE" \
  --arg dockerContext "$DOCKER_CONTEXT" \
  '{
    env: "docker",
    region: $region,
    plan: $plan,
    dockerfilePath: $dockerfile,
    dockerContext: $dockerContext
  }')

# Add healthCheckPath if provided
if [[ -n "$HEALTH_CHECK" ]]; then
  SERVICE_DETAILS=$(echo "$SERVICE_DETAILS" | jq --arg hc "$HEALTH_CHECK" '. + {healthCheckPath: $hc}')
fi

# Build the full request body
BODY=$(jq -n \
  --arg type "web_service" \
  --arg name "$NAME" \
  --arg ownerId "$OWNER" \
  --arg repo "$REPO" \
  --arg branch "$BRANCH" \
  --arg autoDeploy "$AUTO_DEPLOY" \
  --argjson serviceDetails "$SERVICE_DETAILS" \
  '{
    type: $type,
    name: $name,
    ownerId: $ownerId,
    repo: $repo,
    branch: $branch,
    autoDeploy: $autoDeploy,
    serviceDetails: $serviceDetails
  }')

curl -sS --fail-with-body \
  -X POST \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services" \
  -d "$BODY" | jq '.'
