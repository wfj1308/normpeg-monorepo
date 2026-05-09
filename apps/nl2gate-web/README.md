# NL2Gate Web (React + TS + Tailwind)

## Run

```bash
cd apps/nl2gate-web
npm install
npm run dev
```

Default dev URL: `http://127.0.0.1:5173`

## API

The page calls:

- `POST /normref/ingest/upload`
- `GET /normref/ingest/jobs/{job_id}`
- `POST /normref/ingest/rule-candidates/{candidate_id}/approve`
- `POST /normref/ingest/rule-candidates/{candidate_id}/reject`
- `POST /normref/ingest/jobs/{job_id}/sign`
- `POST /normref/ingest/jobs/{job_id}/build-normdoc`

Default API base is `http://127.0.0.1:8081`, editable from the UI.

Step 1 summary also shows `identity_check` from backend:
- PDF-detected standard code/year/level
- match status vs current form input
- mismatch warnings
