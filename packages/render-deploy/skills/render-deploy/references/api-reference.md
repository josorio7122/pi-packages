# Render API Reference

Base URL: `https://api.render.com/v1/`
Auth header: `Authorization: Bearer $RENDER_API_KEY`

## Endpoints

### Owners
- `GET /owners` — list workspaces/owners

### PostgreSQL
- `POST /postgres` — create database
  - Body: `{"name", "region", "plan", "ownerId"}`
- `GET /postgres/{id}` — get database details
- `GET /postgres/{id}/connection-info` — get connection strings
  - Response: `{"internalConnectionString", "externalConnectionString", ...}`
- `DELETE /postgres/{id}` — delete database

### Services
- `POST /services` — create web service
  - Body: `{"type": "web_service", "name", "ownerId", "repo", "autoDeploy": "yes"|"no", "serviceDetails": {"env": "docker", "dockerfilePath", "dockerContext", "region", "plan", "envVars": [...], "healthCheckPath"}}`
- `GET /services` — list services (query: `?limit=20`)
- `GET /services/{id}` — get service details
- `PATCH /services/{id}` — update service
- `DELETE /services/{id}` — delete service

### Deploys
- `POST /services/{id}/deploys` — trigger deploy
- `GET /services/{id}/deploys` — list deploys
- `GET /services/{id}/deploys/{deployId}` — get deploy status
  - Status values: `created`, `build_in_progress`, `update_in_progress`, `live`, `deactivated`, `build_failed`, `update_failed`, `canceled`, `pre_deploy_in_progress`, `pre_deploy_failed`

### Environment Variables
- `GET /services/{id}/env-vars` — list env vars
- `PUT /services/{id}/env-vars` — replace all env vars
  - Body: `[{"key": "NAME", "value": "val"}, ...]`

## Regions
`oregon`, `ohio`, `virginia`, `frankfurt`, `singapore`

## Plans (Web Services)
`free`, `starter`, `standard`, `pro`, `pro_plus`, `pro_max`, `pro_ultra`

## Plans (PostgreSQL)
`free`, `basic_256mb`, `basic_1gb`, `basic_4gb`, `pro_4gb`, `pro_8gb`, etc.
