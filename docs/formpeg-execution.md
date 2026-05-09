# FormPeg Execution Entry (Minimal Hardening)

## Goal

FormPeg is upgraded from helper UI to a first-class execution entry forÏÖ³¡Ö´ÐÐ:

- SPU-driven auto form generation
- auto calculation + auto decision + real-time PASS/FAIL feedback
- offline fill cache
- multi-point batch input
- submit -> Gate -> Proof chain (no bypass)

## Scope

This implementation is minimal and keeps the controlled execution principle:

- no direct "free answer" mode
- no direct result write without Gate
- no direct proof write without execution chain

## Implementation

### 1. SPU -> Auto Form Schema

Implemented in:

- `apps/executable-spec-web/src/platform/formpeg/formpeg-runtime.ts`
- `apps/executable-spec-web/src/SPUApp.tsx`

`buildFormPegSchema(spu)` generates runtime form fields from `SPU.data.inputs`:

- `name`
- `label`
- `type`
- `unit`
- `required`
- `range(min/max)`
- `acceptedUnits`

UI now renders these directly, including required marker and unit/range hints.

### 2. Auto Calculation / Auto Decision / Real-time Feedback

Implemented in:

- `buildFormPegPreview(spu, rawInputs)` in `formpeg-runtime.ts`

Flow:

1. input validation + normalization via `validateAndNormalizeSpuInputs(...)`
2. path formula execution (same formula semantics as runtime engine)
3. gate evaluation via `RuleEngine`
4. return live preview payload:
   - normalized inputs
   - outputs
   - gate result
   - missing fields / validation issues

UI behavior:

- shows live outputs and live PASS/FAIL as user types
- shows missing required fields instead of guessing
- shows unit conversion records when applied

### 3. Offline Fill Cache

Implemented in `SPUApp.tsx` with localStorage draft hydration + autosave.

Storage key format:

- `normref.formpeg.draft.v1:{containerId|no-container}:{spuId|no-spu}`

Cached content:

- current form values
- batch rows
- saved timestamp

Capabilities:

- auto restore when SPU/container context reopens
- auto-save during editing
- manual clear action

### 4. Batch Input (Multi-point)

Implemented in `SPUApp.tsx`.

Capabilities:

- add/remove multi-point rows
- copy main form into batch row
- edit point label + field values per row
- row-level validation before submit

Execution path:

- batch submit calls `evaluateGateBatch(...)`
- each row carries `spuId + containerId + normalized inputs`
- row result mapped back as `PASS/FAIL/BLOCKED/ERROR/INVALID`
- row-level proof references (`proofId/proofHash`) shown when available

### 5. Submit Must Trigger Gate and Proof

Single submit:

- `handleSubmitNode` -> `evaluateGate(...)`
- uses normalized inputs from `buildFormPegPreview(...)`
- returns Gate state patch + proof fragment + node proof data

Batch submit:

- `handleSubmitBatchRows` -> `evaluateGateBatch(...)`
- aggregated summary + per-row status + proof references

No direct state/proof bypass is introduced.

## Test Coverage

Added test file:

- `apps/executable-spec-web/src/platform/formpeg/formpeg-runtime.test.ts`

Covers:

- schema includes unit/required metadata
- live preview pass path
- missing required field detection (no guessing)

## Acceptance Mapping

- SPU -> auto form fields/unit/required: done
- auto calc + auto decision + live PASS/FAIL: done
- offline filling cache: done
- batch multi-point input: done
- submit auto triggers Gate + Proof: done
- worker can fill form without deep spec knowledge: improved via schema hints + live feedback + one-click execute
