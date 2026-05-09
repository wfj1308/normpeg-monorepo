# Executable Spec API (MVP)

## Run

```bash
cd apps/executable-spec-api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8091
```

## Test

```bash
cd apps/executable-spec-api
pytest -q
```

## Key Endpoints

- `GET /api/v1/layer1/components`
- `POST /api/v1/layer1/resolve`
- `POST /api/v1/layer2/execute/compaction`
- `POST /api/v1/layer2/execute/compaction-table`
- `POST /api/v1/layer2/rule-update-impact`
- `GET /api/v1/layer2/notifications`
- `POST /api/v1/layer2/notifications/{notification_id}/ack`
- `POST /api/v1/layer3/query`

