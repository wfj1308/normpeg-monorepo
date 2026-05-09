# Deployment Guide

## Goal

Provide production-ready deployment guidance with a unified config system, supporting:
- `dev`
- `staging`
- `prod`

Configuration is centralized around:
- `env`
- `db`
- `storage`
- `log level`

## 1) Config Model

Runtime config loader:
- `apps/executable-spec-web/server/config/app-config.ts`

Server entrypoints using it:
- `apps/executable-spec-web/server/platform-api.ts`
- `apps/executable-spec-web/server/quality-api.ts`

Config shape:
- `env`: deployment profile and service identity
- `network`: host/port/publicBaseUrl
- `db`: driver/url/schema/ssl/pool
- `storage`: driver/localDir/bucket/region/endpoint
- `log`: level/json mode

## 2) Environment Profiles

### `dev`
- default profile
- db default: `memory`
- storage default: `local`
- log level default: `debug`

### `staging`
- db default: `postgres`
- storage default: `local`
- log level default: `info`

### `prod`
- db default: `postgres`
- storage default: `s3`
- log level default: `info`

## 3) Environment Variables

Use:
- `apps/executable-spec-web/.env.example`

Key variables:
- `NORMPEG_ENV=dev|staging|prod`
- `NORMPEG_HOST`
- `PLATFORM_API_PORT`
- `QUALITY_API_PORT`
- `NORMPEG_PUBLIC_BASE_URL`
- `NORMPEG_DB_DRIVER`, `NORMPEG_DB_URL`, `NORMPEG_DB_SCHEMA`, `NORMPEG_DB_SSL`
- `NORMPEG_DB_POOL_MIN`, `NORMPEG_DB_POOL_MAX`
- `NORMPEG_STORAGE_DRIVER`, `NORMPEG_STORAGE_LOCAL_DIR`
- `NORMPEG_STORAGE_BUCKET`, `NORMPEG_STORAGE_REGION`, `NORMPEG_STORAGE_ENDPOINT`
- `NORMPEG_LOG_LEVEL`, `NORMPEG_LOG_JSON`

## 4) Local Deployment (Non-Docker)

From `apps/executable-spec-web`:

```bash
npm ci
cp .env.example .env
```

Then start API:

```bash
npm run api:start
```

Optional quality API:

```bash
npm run quality:start
```

## 5) Docker Deployment

Files:
- `apps/executable-spec-web/deploy/Dockerfile.platform-api`
- `apps/executable-spec-web/deploy/docker-compose.yml`

Run:

```bash
cd apps/executable-spec-web/deploy
docker compose up -d --build
```

The compose setup mounts persistent volumes for:
- runtime storage
- execution logs

## 6) Cloud Deployment (Container)

Recommended flow:
1. Build image using `deploy/Dockerfile.platform-api`.
2. Push image to your registry.
3. Deploy to cloud runtime (Kubernetes/ECS/App Service/etc.).
4. Inject env vars via secret/config manager.
5. Set `NORMPEG_ENV=prod`.

Minimum prod checklist:
- set `NORMPEG_DB_URL`
- set storage driver + bucket config
- set `NORMPEG_LOG_LEVEL=info` (or `warn`)
- pin `PLATFORM_API_PORT` and ingress route

## 7) Operational Verification

After startup:
- check startup logs for effective config and config warnings
- call:
  - `GET /api/system/config` (non-public internal route; returns redacted effective config + warnings)
  - `GET /api/dashboard`

## 8) Notes

- Current storage/db integration is configuration-ready and can be wired to concrete infra adapters incrementally.
- Config warnings are surfaced at startup for missing critical settings (for example DB URL/bucket under non-local drivers).
