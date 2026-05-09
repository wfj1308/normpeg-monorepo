# SPU Execution Hardening

## Goal

Strengthen execution stability for the core chain:

`NormDoc -> SpecIR -> SPU -> Gate -> State -> Proof`

without introducing new business features.

## 1) SPU Input Validation Hardening

### What is enforced

For every SPU execution submit:

- required field check (missing input is rejected)
- type check (`number` / `string` / `boolean`)
- range check:
  - explicit range from SPU input definition (`input.range.min/max`)
  - optional range from `meta.extensions.inputValidation`
  - safe default range by unit (for example `%` in `[0,100]`)
- unit normalization (auto conversion to SPU canonical unit)

### Unit normalization behavior

Supported examples:

- `kg -> g`
- `l -> cm3`
- `kg/m3 -> g/cm3`
- `ratio -> %`
- `mm <-> cm <-> m`
- `0.01mm` compatible length conversion

Input payload can provide numeric values as:

- plain number
- string with unit (for example `"8 %"`)
- object `{ value, unit }`

### Implementation

- `src/platform/runtime/input-normalizer.ts`
- integrated into `ExecutionEngine.submitForm(...)`

Validation failure throws `InputValidationError` (`SPU_INPUT_INVALID`) and blocks execution before path/gate.

## 2) Path Engine Traceability Hardening

### What is recorded per step

Path trace now includes richer step-level provenance:

- `stepIndex`
- `step/formula`
- `inputSnapshot` (pre-step context)
- `outputField`
- `result`
- `startedAt/completedAt`
- full post-step `context`

### Implementation

- `src/platform/runtime/execution-engine.ts`
- `src/platform/runtime/execution-log.ts`

Execution logs keep step-by-step calculation evidence, enabling deterministic replay/explanation.

## 3) Gate Decision Hardening (PASS/BLOCK/OVERRIDE)

### Decision model

Gate decision is explicitly normalized to:

- `PASS`: all rules satisfied
- `BLOCK`: at least one blocking rule failed
- `OVERRIDE`: blocked result manually overridden with explicit approval

`GateResult` now carries `decision` and optional `override` metadata.

### Override contract (controlled)

Override is only accepted when input includes:

```json
{
  "__gateOverride": {
    "approvedBy": "...",
    "reason": "..."
  }
}
```

No silent override is allowed.

### Compatibility

Legacy response fields (`status`, `result.outcome`, `result.gateStatus`) are preserved for existing clients.

New explicit field:

- `gateDecision` in gate evaluate response

### Implementation

- `src/platform/runtime/rule-engine.ts`
- `src/platform/runtime/execution-engine.ts`
- `server/services/gate_evaluate_service.ts`

## 4) State Mutation Hardening

Container state recomputation is now explicitly source-tagged.

Allowed triggers only:

- `gate`
- `manual`

Each container state change writes auditable event:

- `CONTAINER_STATE_CHANGED`
- payload includes `trigger`, `reason`, `from`, `to`

### Implementation

- `src/platform/workflow/platform-service.ts`
- `src/platform/audit/events.ts`

This prevents untraceable implicit state drift.

## 5) Proof Completeness Hardening

Node/container proof technical details now explicitly include:

- input snapshot and input validation snapshot
- calculation chain
- gate decision + override metadata
- decision basis (matched/failed rules)
- signatures and timestamps (existing)

### Implementation

- `src/platform/proof/proof-service.ts`

## 6) Tests Added / Updated

Added:

- `src/platform/runtime/input-normalizer.test.ts`
- `src/platform/workflow/platform-service.hardening.test.ts`

Updated:

- `server/services/gate_evaluate_service.test.ts`
  - new override decision test (`OVERRIDE`)

## 7) Acceptance Mapping

### Same SPU repeated execution consistency

- normalized input pipeline + deterministic step evaluation remove unit/type ambiguity
- equivalent inputs with different units normalize to same canonical values

### Explainable and traceable

- full per-step path trace
- explicit gate decision (`PASS/BLOCK/OVERRIDE`)
- state mutation trigger audit (`gate/manual`)
- proof includes input, chain, decision basis, timestamps/signatures
