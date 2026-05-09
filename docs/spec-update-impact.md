# Spec Update Impact & Recalculation

## Goal

When a spec is updated (`old -> new`), the platform should automatically:

1. Identify impact scope
2. Mark old execution results invalid
3. Generate pending retest items
4. Support one-click rerun

This is implemented as a minimal production-oriented mechanism, without introducing a complex migration protocol.

## 1) Patch model (`old -> new`)

Patch apply API:

- `POST /api/versioning/spec-patches/apply`

Request:

```json
{
  "oldSpuId": "demo.spec.patch.compaction@v1",
  "newDefinition": { "...new SPUDefinition..." },
  "note": "raise threshold",
  "invalidatePreviousResults": true
}
```

Behavior:

- Publishes new SPU version
- Enforces same `spuKey` (`deriveSpuKey(old) === deriveSpuKey(new)`)
- Computes version diff (`diffSummary`)
- Computes impact analysis (`specImpactAnalysis`)
- Rebinds project-level active binding from old to new (same `spuKey`)
- Optionally invalidates old execution results

## 2) Impact identification

Patch record includes:

- `affectedSpuIds`: all versions under same `spuKey`
- `affectedExecutions`:
  - node execution records that used `oldSpuId`
  - container proofs whose `specResults` include `oldSpuId`
- `affectedProjectIds`: projects touching impacted bindings/executions

Execution impact record (`SpecPatchAffectedExecution`) includes:

- `recordType` (`node` / `container_proof`)
- `proofId` / `nodeId` / `containerId`
- `spuId`
- `status`
- `matchedSpecVersion`
- `finalizedAt`
- `invalidated`

## 3) Auto-generated impact list and retest queue

Patch record also includes:

- `pendingRetests` (`SpecPatchPendingRetest`)
  - `containerId`
  - `oldSpuId` / `newSpuId`
  - latest node/proof refs
  - `canAutoRerun`
  - reason
- `summary`
  - affected counts
  - invalidated count
  - pending retest count
  - auto-rerun-ready count

Read APIs:

- `GET /api/versioning/spec-patches`
- `GET /api/versioning/spec-patches/:patchId`

## 4) Mark old results invalid

When `invalidatePreviousResults=true`:

- Node results executed on `oldSpuId` are marked invalid:
  - `node.outputs.__resultValidity = "INVALIDATED"`
  - proof extensions include `specPatchInvalidation`
- Container proofs including `oldSpuId` are marked invalid:
  - proof extensions include `specPatchInvalidation`
- For editable containers, binding status is reset to `DRAFT` so retest can proceed

This ensures old results are explicitly traceable as invalidated by patch id.

## 5) One-click rerun

Rerun API:

- `POST /api/versioning/spec-patches/:patchId/rerun`

Request:

```json
{
  "autoSignRequired": true,
  "maxItems": 100
}
```

Behavior for each pending item:

1. Skip archived/locked/active-running containers
2. Switch container binding from old SPU to new SPU version
3. Reopen binding (`DRAFT`) and trigger new node execution
4. Reuse latest historical inputs for rerun
5. Auto-sign/finalize if configured and possible

Response includes per-container item result:

- `rerun_triggered` / `skipped` / `failed`
- reason
- generated node id
- final node status

## 6) Client SDK surface

Added in `src/platform/api-client.ts`:

- `applySpecPatch(...)`
- `listSpecUpdatePatches()`
- `getSpecUpdatePatch(patchId)`
- `rerunSpecUpdatePatch(...)`

And typed models:

- `SpecUpdatePatchRecord`
- `SpecPatchAffectedExecution`
- `SpecPatchPendingRetest`
- `SpecPatchRerunResult`

## 7) Verification

New test:

- `src/platform/workflow/platform-service.spec-update-impact.test.ts`

Covers:

- patch apply impact detection
- old result invalidation
- pending retest generation
- one-click rerun on new version

Build and test pass for current implementation.
