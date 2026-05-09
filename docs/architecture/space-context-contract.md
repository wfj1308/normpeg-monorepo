# Space Context Contract (P0)

This document fixes the minimum contract for the space-context backbone (`slot + container + node + proof`) used by executable-spec.

## 1) State Contract

### 1.1 Container lifecycle (`lifecycle_state` / `norm_execution.current_state`)

Allowed values:

- `DRAFT`
- `RUNNING`
- `VALIDATED`
- `REJECTED`
- `ARCHIVED`

### 1.2 Spec binding status (`spec_bindings[].status`)

Allowed values:

- `DRAFT`
- `RUNNING`
- `PASS`
- `FAIL`

### 1.3 Node completion status (`/node/{id}/complete`)

Allowed values:

- `PASS`
- `FAIL`

### 1.4 Runtime pending actions (`runtime.pending_action`)

Allowed values:

- `""` (idle)
- `EXECUTE_NODE`
- `RETEST`
- `READY_TO_ARCHIVE`
- `MANUAL_REVIEW`
- `LOCKED`

## 2) Reference Contract

Container response now carries both:

- `geo_slot_ref` (canonical existing field)
- `slot_ref` (alias for unified naming)

Volume binding is reserved by:

- `volume_ref` (optional)

Node records also carry:

- `container_ref`
- `volume_ref` (optional)

## 3) Container Proof Minimal Fields

Archived `container_proof` must include:

- `container_id`
- `geo_slot_ref`
- `slot_ref`
- `volume_ref`
- `spec_results`
- `overall_status`
- `signatures`
- `timestamp`
- `audit_trail`

## 4) Backward Compatibility

- `slot_address` in create-container API remains supported.
- `slot_ref` is accepted as alias input.
- Existing `geo_slot_ref` consumers remain unchanged.
