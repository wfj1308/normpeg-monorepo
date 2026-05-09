# NormPeg Monorepo

NormPeg is organized as a standards-first monorepo. The repository focuses on structured standards assets, executable NormDocs, and validation services.

## Top-Level Layout

- `apps/`: runnable services
- `packages/`: shared libraries and schemas
- `standards/`: standard-level digital assets (`standarddoc`)
- `normdocs/`: form-level executable norm assets (`normdoc`)
- `projects/`: project profiles and bindings
- `mappings/`: cross-spec mappings and dictionaries
- `ops/`: docker and operational scripts
- `tests/`: smoke and integration tests
- `docs/`: architecture and playbooks

## Quick Start

```bash
pip install -r apps/nl2gate-api/requirements.txt
uvicorn main:app --app-dir apps/nl2gate-api --host 0.0.0.0 --port 8081
```

```bash
python tests/smoke/nl2gate_smoke.py --project-id GXX_2024_XXX --base-url http://127.0.0.1:8081
```

## Edge Deployment

- `ops/scripts/nl2gate-api/start.ps1`
- `ops/scripts/nl2gate-api/start.sh`
- `ops/scripts/nl2gate-api/stop.ps1`
- `ops/scripts/nl2gate-api/stop.sh`

## Asset Validation Gate

Local run:

```bash
pip install -r requirements-dev.txt
python tools/validate_assets.py
```

Convenience scripts:

- `ops/scripts/assets/validate.ps1`
- `ops/scripts/assets/validate.sh`

CI gate:

- `.github/workflows/asset-validation.yml`
- Automatically validates `standards/`, `normdocs/`, `projects/` assets on PR and main branch pushes.

## NormRef Parser Ingest (PDF -> Rule Candidates)

```bash
pip install -r tools/normpeg/requirements.txt
python tools/normpeg/normref_ingest_batch.py --input /path/to/standard.pdf
```

Optional publish to docs rule library:

```bash
python tools/normpeg/normref_ingest_batch.py \
  --input /path/to/standard.pdf \
  --publish --write-to-docs --version-tag 2026-04
```

## Current Pilot Assets

- Project profile: `projects/gxx-2024-xxx/project.profile.json`
- NormDocs: `normdocs/library/cn/mot/*/*/normdoc.json`
- Standards: `standards/library/cn/mot/*/*/standarddoc.json`
