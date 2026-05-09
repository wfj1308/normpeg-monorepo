# External Inputs (Minimal Integration)

Updated: 2026-04-23

Goal: allow external data to enter execution, but keep the controlled path:

`External Data -> SPU.inputs mapping -> Gate evaluate/preview -> Proof`

No direct bypass to final conclusion is allowed.

## 1. ExternalInputSource structure

Core model (`src/platform/types.ts`):

- `sourceId`
- `sourceType`: `csv | device | api | manual_import`
- `mappingRules`
- `validationStatus`

Supporting fields for runtime use:

- `records`
- `sourceRef`
- `createdAt`
- `updatedAt`

### mappingRules

Each rule maps external field to `SPU.inputs`:

- `sourceField`
- `targetInput`
- `typeHint`: `number | string | boolean | auto`
- `required`
- `defaultValue`

### validationStatus

- `status`: `valid | warning | invalid`
- `errors`
- `warnings`
- `validatedAt`

## 2. Minimal import APIs

### 2.1 CSV import

`POST /api/external-inputs/import/csv`

Body:

- `sourceId?`
- `sourceType?` (defaults to `csv`)
- `sourceRef?`
- `csvText`
- `mappingRules`

Behavior:

- Parse CSV rows into `records`
- Validate mappings against sample record
- Upsert `ExternalInputSource`

### 2.2 JSON API import

`POST /api/external-inputs/import/json`

Body:

- `sourceId?`
- `sourceType?` (defaults to `api`)
- `sourceRef?`
- `records? | data? | payload?`
- `mappingRules`

Behavior:

- Normalize object/array payload into `records`
- Validate mappings
- Upsert `ExternalInputSource`

## 3. Mapping external fields to SPU.inputs

### 3.1 Preview mapping result

`POST /api/external-inputs/map-to-spu`

Body:

- `sourceId`
- `spuId`
- `recordIndex?`
- `inputs?` (manual override)
- `strict?`

Response:

- `mappedInputs`
- `missingInputs`
- selected `record`
- selected `source`

Rules:

- No guessing: only mapped values (or explicit default/manual override) are used.
- Type coercion is explicit by `typeHint` or `SPU input` type.
- `strict=true` blocks invalid mapping target/type.

## 4. Gate/Proof chain is preserved

Gate endpoints now accept optional external input selector:

- `POST /api/gate/preview`
- `POST /api/gate/evaluate`
- `POST /api/gate/batch-evaluate`

Extended payload:

- `externalInput.sourceId`
- `externalInput.recordIndex?`
- `externalInput.strict?`

Execution behavior:

1. Resolve external source and mapping.
2. Merge mapped values into `inputs` (manual inputs can override).
3. Call original `evaluateGateRequest/evaluateGateBatchRequest`.
4. Build `proofFragment` as before.

So imported data enters through the same SPU/Gate/Proof pipeline and is traceable in execution response (`externalInputMapping`).

## 5. Key files

- Types: `apps/executable-spec-web/src/platform/types.ts`
- External import parsing/validation: `apps/executable-spec-web/server/services/external_input_service.ts`
- Platform source storage + mapping: `apps/executable-spec-web/src/platform/workflow/platform-service.ts`
- API routes: `apps/executable-spec-web/server/platform-api.ts`
- Client APIs: `apps/executable-spec-web/src/platform/api-client.ts`
- Tests: `apps/executable-spec-web/server/services/external_input_service.test.ts`
