# NL2Gate API (NormPeg Monorepo)

## Purpose

This app exposes a lightweight API for:

- NL -> form intent parsing
- NormDoc-based validation
- Cross-spec consistency checks
- subset baseline / deliverable readiness checks

## Runtime Data Roots

The app resolves data from repository-level directories:

- `projects/`
- `normdocs/library/cn/mot/`
- `standards/library/cn/mot/`

## Local Run

```bash
pip install -r apps/nl2gate-api/requirements.txt
uvicorn main:app --app-dir apps/nl2gate-api --host 0.0.0.0 --port 8081
```

If module import by package path is inconvenient, run from app folder:

```bash
cd apps/nl2gate-api
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8081
```

## Key Endpoints

- `GET /health`
- `GET /project/{project_id}/subset-readiness`
- `GET /project/{project_id}/day1-2` (legacy alias)
- `GET /ops/ready?project_id=GXX_2024_XXX`
- `GET /ops/smoke?project_id=GXX_2024_XXX`
- `GET /ops/deliverables?project_id=GXX_2024_XXX`
- `POST /normref/ingest/upload` (multipart PDF upload + parse)
- `GET /normref/ingest/jobs/{job_id}` (人工校验任务详情)
- `GET /normref/ingest/jobs/{job_id}/candidates` (候选规则列表)
- `POST /normref/ingest/rule-candidates/{candidate_id}/approve`
- `POST /normref/ingest/rule-candidates/{candidate_id}/reject`
- `POST /normref/ingest/jobs/{job_id}/sign` (专家签名)
- `POST /normref/ingest/jobs/{job_id}/build-normdoc` (自动生成 NormDoc)
- `POST /chat`
- `POST /v1/components/compaction/execute` (压实度 Component 可执行链路)
- `POST /layer2/rule-updates` (规则热更新 + 影响识别 + 通知生成)
- `GET /layer2/rule-updates/{update_id}?project_id=...`
- `GET /layer2/rule-updates/{update_id}/impact?project_id=...`
- `GET /layer2/notifications?project_id=...`
- `POST /layer2/notifications/{notification_id}/ack`
- `POST /layer2/retrospect`
- `POST /layer2/demo/compaction-95-96?project_id=...`

## Smoke Test

```bash
python tests/smoke/nl2gate_smoke.py --project-id GXX_2024_XXX
python tests/smoke/nl2gate_smoke.py --project-id GXX_2024_XXX --base-url http://127.0.0.1:8081
```

## Docker / Edge

- Compose file: `ops/docker/nl2gate-api/docker-compose.edge.yml`
- Start script: `ops/scripts/nl2gate-api/start.ps1` or `ops/scripts/nl2gate-api/start.sh`
- Stop script: `ops/scripts/nl2gate-api/stop.ps1` or `ops/scripts/nl2gate-api/stop.sh`

## PDF Upload Parse

```bash
curl -X POST "http://127.0.0.1:8081/normref/ingest/upload" \
  -F "file=@/path/to/JTG-F80-1-2017.pdf" \
  -F "std_code=JTG-F80-1-2017" \
  -F "level=industry" \
  -F "ai_preprocess=true" \
  -F "ai_model=deepseek-chat" \
  -F "publish=false" \
  -F "write_to_docs=false"
```

默认建议使用 Ollama（OpenAI 兼容接口）：
- `OPENAI_BASE_URL=http://host.docker.internal:11434/v1`
- `NORMPEG_AI_MODEL=deepseek-chat`

Upload response now includes `review_job_ids`, which can be used for Step2/Step3.
Upload response also includes `identity_check`:
- detected `std_code/year/level` from PDF preview text (fallback: filename)
- consistency result against provided `std_code/level`
- warning messages for mismatch

## PostgreSQL (Optional, for manual review persistence)

If you want `POST /normref/ingest/assets/review` to persist to PostgreSQL (in addition to file artifacts):

1. Initialize schema:

```bash
psql "$PG_DSN" -f apps/nl2gate-api/db/postgres/001_init_normref.sql
```

2. Set env vars before starting API:

```bash
set NORMREF_DB_BACKEND=postgres
set NORMREF_PG_DSN=postgresql://postgres:postgres@127.0.0.1:5432/normref
```

Without these vars, service keeps default JSON-file behavior.

## Step2 + Step3 Minimal Closed Loop

```bash
# 1) 查看候选
curl "http://127.0.0.1:8081/normref/ingest/jobs/<job_id>/candidates"

# 2) 人工审批（approve/reject）
curl -X POST "http://127.0.0.1:8081/normref/ingest/rule-candidates/<candidate_id>/approve" \
  -H "Content-Type: application/json" \
  -d "{\"job_id\":\"<job_id>\",\"reviewer_id\":\"expert.001\",\"reviewer_name\":\"领域专家\",\"comment\":\"条款确认\"}"

# 3) 专家签名
curl -X POST "http://127.0.0.1:8081/normref/ingest/jobs/<job_id>/sign" \
  -H "Content-Type: application/json" \
  -d "{\"expert_id\":\"expert.001\",\"expert_name\":\"领域专家\",\"comment\":\"同意发布\"}"

# 4) 自动生成 NormDoc
curl -X POST "http://127.0.0.1:8081/normref/ingest/jobs/<job_id>/build-normdoc" \
  -H "Content-Type: application/json" \
  -d "{\"form_type\":\"T0921-2019\",\"standard_id\":\"JTG 3450-2019\",\"standard_version\":\"2019\"}"
```

## Notes

- Default Gate endpoint: `http://localhost:8080/v1/gate/validate`
- Override by env var: `GATE_URL`
- Override repository root in container/runtime: `NORMPEG_REPO_ROOT`
