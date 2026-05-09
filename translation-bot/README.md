# NormRef Translation Bot

`translation-bot` is the orchestration layer for:

1. `pdf-parser-api` (parse PDF -> extractedData)
2. `spu-generator-api` (generate SPU -> spec outputs)
3. auto validation + human review
4. template recommendation and reuse

It does not parse PDF by itself and does not generate SPU semantics by itself.

## Run

```bash
cd translation-bot
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

Optional env:

```bash
PDF_PARSER_API_BASE_URL=http://127.0.0.1:8010
PDF_PARSE_POLL_INTERVAL_SECONDS=1.0
PDF_PARSE_MAX_WAIT_SECONDS=600
SPU_GENERATOR_API_BASE_URL=http://127.0.0.1:8020
PLATFORM_API_BASE_URL=http://127.0.0.1:8790
EXECUTION_UI_BASE_URL=http://127.0.0.1:5173
```

## Main APIs

- `POST /translate`
- `GET /result/{task_id}`
- `GET /ui`

Review:

- `POST /api/v1/spu/review/validate`
- `POST /api/v1/spu/review/approve`
- `POST /api/v1/spu/review/reject`

Template:

- `GET /api/v1/templates`
- `GET /api/v1/templates/{template_id}`
- `DELETE /api/v1/templates/{template_id}` (test usage)
- `POST /api/v1/templates/recommend`
- `POST /api/v1/templates/apply`

Execution:

- `POST /execute/{task_id}/entry`
- `POST /template/{task_id}/save`
- `GET /download/{task_id}.specbundle`
