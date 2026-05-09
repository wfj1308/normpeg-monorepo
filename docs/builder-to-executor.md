# Builder to Executor Pipeline

Updated: 2026-04-23
Scope: make newly registered SPU immediately executable with minimal UI/architecture changes.

## 1. Goal

After registering an SPU from Template/PDF/Markdown, user can move directly into execution without manual hidden steps.

Required outcomes:

1. Registered SPU auto appears and is selected in spec selection area
2. SPU can be bound to current container/node context
3. Execution form fields come directly from `SPU.data.inputs`
4. Execute button calls Gate API directly
5. Execution generates Proof fragment and writes back runtime state

## 2. Implemented Flow

### 2.1 Register -> Executor auto handoff

Source callback:

- `apps/executable-spec-web/src/SPUApp.tsx`
- function: `handleMarkdownRegistered(...)`

Behavior:

1. Refresh registry/dashboard/layerpeg ledger
2. Auto select new `spuId`
3. Auto switch module to `Executor`
4. Auto prepare execution context via `ensureExecutionContextForSpu(spuId)`:
   - if no slot: import fixed slot (`K19+070`)
   - if no editable container: auto create a new container with `autoBindSpuIds: [spuId]`
   - if current container exists but not bound: auto call `bindSpu`
5. Auto sync execution panel (`syncCurrentExecutionPanel`) and scroll to execution area

### 2.2 Bind to current container/node

Source:

- `handleBindSelectedSpu(...)` in `SPUApp.tsx`

Behavior:

- If already bound: refresh and reuse current node context
- If not bound: reuse `ensureExecutionContextForSpu` (auto bind or auto create container when needed)
- Node context is synced from latest attempts of selected SPU

### 2.3 Form fields from SPU inputs

Source:

- execution form render in `SPUApp.tsx` (`selectedSpu?.data.inputs.map(...)`)
- input sync effect:
  - keep only keys declared in `selectedSpu.data.inputs`
  - initialize missing keys to empty string

### 2.4 Execute button -> Gate API

Source:

- `handleSubmitNode(...)` in `SPUApp.tsx`

API:

- `evaluateGate(...)` -> `POST /api/gate/evaluate`

Call mode:

- Prefer current `nodeId` when selected node matches current SPU
- Otherwise call with `containerId + spuId` (backend auto-creates node)

### 2.5 Proof + state writeback after execution

Source:

- `applyGateExecutionPatch(...)` in `SPUApp.tsx`

Writeback behavior:

1. Save `proofFragment` and `statePatch` to UI state
2. Optimistically patch node/container state in local UI
3. Refresh canonical runtime state from backend (`refreshContainerState`)
4. Refresh layerpeg ledger
5. Show "Gate writeback" card in execution area with:
   - `statePatch`
   - Proof fragment JSON

Note:

- This is execution-level proof fragment writeback.
- Final container-level proof is still produced at archive stage (`archiveContainer`), unchanged.

## 3. Main Files

- `apps/executable-spec-web/src/SPUApp.tsx`
- `apps/executable-spec-web/src/platform/api-client.ts`
- `apps/executable-spec-web/server/services/gate_evaluate_service.ts`

## 4. Acceptance Mapping

- Register one SPU from Template/PDF/Markdown -> it is selected and routed to Executor: done
- SPU can bind to current container/node context: done
- Inputs render from SPU schema automatically: done
- Execute button directly hits Gate API: done
- Gate execution writes back proof fragment + runtime state: done
