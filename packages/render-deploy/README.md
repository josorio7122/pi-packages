# render-deploy

[Pi](https://github.com/mariozechner/pi) skill for deploying and managing services on [Render](https://render.com) via the REST API.

## What It Does

Provides shell scripts that wrap the Render API for common deployment operations:

- Create PostgreSQL databases (with pgvector support via migrations)
- Create Docker-based web services from GitHub repos
- Set environment variables
- Trigger deploys and wait for completion
- Monitor service and deploy status
- Get database connection strings

## Prerequisites

- `curl` and `jq` installed
- `RENDER_API_KEY` environment variable set (get from Render Dashboard → Account Settings → API Keys)

## Usage

```
Deploy my app to Render — use the render-deploy skill
```

The skill guides the agent through the full deployment workflow: get owner ID → create database → create services → set env vars → deploy.

## License

MIT
