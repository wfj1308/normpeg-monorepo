# Service Field Trial Checklist

## Goal

- Deliverable: `3 norms digitalized + 1 running validation API`.
- Runtime target: edge box, plug-and-play deployment, onsite smoke checks.

## Deployment Steps

1. Confirm Docker is available on edge box.
2. Copy repository (or pull latest branch) to edge box.
3. Run:
   - PowerShell: `./ops/scripts/nl2gate-api/start.ps1`
   - Bash: `./ops/scripts/nl2gate-api/start.sh`
4. Verify:
   - `GET /health`
   - `GET /ops/ready?project_id=GXX_2024_XXX`
   - `GET /ops/smoke?project_id=GXX_2024_XXX`
   - `GET /ops/deliverables?project_id=GXX_2024_XXX`

## Onsite Trial Scenarios

1. Compaction: `K15+200 压实度 96.5 合格吗`
2. IRI: `K16+100 IRI 1.9 是否通过`
3. Thickness: `K18+600 上面层厚度 58 是否达标`
4. Deflection: `K19+200 弯沉 170 合格吗`

## Acceptance Criteria

1. `/ops/smoke` returns `status=pass`.
2. `/chat` for four key indicators returns valid `form_type` and `api_params`.
3. If Gate is offline, local NormDoc gate fallback still returns deterministic results.
4. Cross-spec links are present in response (`cross_spec_links.items`).

## Stop Service

- PowerShell: `./ops/scripts/nl2gate-api/stop.ps1`
- Bash: `docker compose -f ops/docker/nl2gate-api/docker-compose.edge.yml down`
