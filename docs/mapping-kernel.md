# Mapping Kernel (Stake to Everything)

Updated: 2026-04-24

Goal: upgrade mapping from a display helper to a minimal core capability, so one stake can resolve current container, active specs, runtime state, and proof summary.

## 1. MappingEntry Structure

`MappingEntry` is defined in `apps/executable-spec-web/src/platform/types.ts`.

Core fields:

- `projectId`
- `stake` and `location`
- `containerRefs`
- `nodeRefs`
- `activeSpecs`
- `activeProofs`
- `currentStateSummary`

Practical meaning:

- Stake/location gives the spatial anchor.
- Container/node refs give execution lineage.
- Active specs/proofs expose what is currently in force and what has verifiable evidence.
- State summary provides one stable snapshot for external querying.

## 2. Minimal Query APIs

All APIs return `{ item: MappingEntry }`.

### 2.1 Query by stake

- `GET /api/mapping/by-stake?stake=K30+010`

### 2.2 Query by container id

- `GET /api/mapping/container/{containerId}`

### 2.3 Query by node id

- `GET /api/mapping/node/{nodeId}`

If no mapping is found, response is `404`.

## 3. Write-back Strategy

Mapping summary is written back to platform state (`state.mappingEntries`) whenever execution context changes, including:

- container creation/update
- SPU binding
- node create/submit/sign/finalize
- container archive

This makes mapping a first-class runtime index, not just on-demand rendering.

## 4. Data Scope

`activeProofs` currently includes:

- node final proof summaries (`node.proof`)
- container final proof summary (`state.proofs[containerId]`) when archived

`activeSpecs` reflects current container bindings and latest node status per spec.

## 5. Acceptance Mapping

1. Given a stake, system can resolve current container, specs, runtime status, and proof summary.
- Achieved by `GET /api/mapping/by-stake`.

2. Mapping is no longer a peripheral endpoint.
- Achieved by persistent mapping write-back in `PlatformService` and dedicated by-stake/by-container/by-node query APIs.
