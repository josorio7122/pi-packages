---
name: render-deploy
description: Deploy and manage services on Render via the REST API. Use when deploying Docker-based apps, creating PostgreSQL databases, setting environment variables, triggering deploys, or checking deploy status on Render. Requires RENDER_API_KEY environment variable.
compatibility: "Requires curl, jq, and RENDER_API_KEY environment variable set"
metadata:
  author: josorio7122
  version: "1.0"
---

# Render Deploy

Deploy and manage services on [Render](https://render.com) via the REST API — no dashboard clicks required.

## Prerequisites

```bash
# Verify tools
curl --version
jq --version

# Verify API key is set
echo $RENDER_API_KEY
```

Get an API key at: Render Dashboard → Account Settings → API Keys

## Scripts

All scripts use `curl` + `jq` and output JSON to stdout. Run any script with `--help` for full usage.

| Script | Purpose |
|--------|---------|
| `scripts/owners.sh` | List workspaces to get your owner ID |
| `scripts/create-postgres.sh` | Create a PostgreSQL database |
| `scripts/create-service.sh` | Create a web service (Docker-based from GitHub repo) |
| `scripts/set-env-vars.sh` | Set environment variables on a service |
| `scripts/deploy.sh` | Trigger a deploy and optionally wait for completion |
| `scripts/status.sh` | Get service or deploy status |
| `scripts/list-services.sh` | List all services in the workspace |
| `scripts/connection-info.sh` | Get database connection string |
| `scripts/delete.sh` | Delete a service or database |

## Workflow: Full Stack Deploy

To deploy a typical stack (PostgreSQL + API + Frontend):

### Step 1: Get your owner ID

```bash
bash scripts/owners.sh
```

Save the `id` field from the response — you need it for all create operations.

### Step 2: Create the database

```bash
bash scripts/create-postgres.sh \
  --name "myapp-db" \
  --owner "OWNER_ID" \
  --region "oregon" \
  --plan "starter"
```

Save the `id` from the response (e.g., `dpg-xxxx`). Wait for the database to be ready — it takes 1-2 minutes.

### Step 3: Get the database connection string

```bash
bash scripts/connection-info.sh --id "dpg-xxxx"
```

Save the `internalConnectionString` value.

### Step 4: Create the API service

```bash
bash scripts/create-service.sh \
  --name "myapp-api" \
  --owner "OWNER_ID" \
  --repo "https://github.com/user/repo" \
  --dockerfile "./Dockerfile" \
  --region "oregon" \
  --plan "starter"
```

Save the service `id` (e.g., `srv-xxxx`).

### Step 5: Set environment variables on the API

```bash
bash scripts/set-env-vars.sh \
  --id "srv-xxxx" \
  --vars '[
    {"key": "DATABASE_URL", "value": "postgresql+asyncpg://..."},
    {"key": "OPENAI_API_KEY", "value": "sk-..."}
  ]'
```

### Step 6: Trigger a deploy (env var changes require redeploy)

```bash
bash scripts/deploy.sh --id "srv-xxxx" --wait
```

### Step 7: Create the frontend service

```bash
bash scripts/create-service.sh \
  --name "myapp-frontend" \
  --owner "OWNER_ID" \
  --repo "https://github.com/user/repo" \
  --dockerfile "./frontend/Dockerfile" \
  --docker-context "./frontend" \
  --region "oregon" \
  --plan "starter"
```

### Step 8: Check status

```bash
bash scripts/status.sh --id "srv-xxxx"
bash scripts/list-services.sh
```

## Rules

- Always check `RENDER_API_KEY` is set before running any script
- Owner ID is required for creating resources — get it first with `owners.sh`
- Environment variable updates require a redeploy to take effect
- Database creation takes 1-2 minutes before connection info is available
- The `--wait` flag on `deploy.sh` polls until the deploy succeeds or fails
- All scripts exit with code 0 on success, 1 on error
- Use `--help` on any script for complete usage

## Reference

See [Render API docs](references/api-reference.md) for endpoint details.
