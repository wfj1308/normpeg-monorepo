# Core Models (Frozen)

更新时间：2026-04-23  
范围：冻结最小核心对象模型，不新增业务能力。

## 1. 冻结对象

本次冻结以下 7 个核心对象：

1. `SPU`
2. `GateRequest`
3. `GateResult`
4. `ExecutionState`
5. `Proof`
6. `Container`
7. `Node`

## 2. Schema 位置（可直接引用）

主入口：
- `backend/app/schemas/core-models.schema.json`

对象级入口：
- `backend/app/schemas/spu.schema.json`
- `backend/app/schemas/gate-request.schema.json`
- `backend/app/schemas/gate-result.schema.json`
- `backend/app/schemas/execution-state.schema.json`
- `backend/app/schemas/proof.schema.json`
- `backend/app/schemas/container.schema.json`
- `backend/app/schemas/node.schema.json`

后续接口建议直接用对象级 schema（例如 OpenAPI 中 `$ref` 指向对象级文件）。

## 3. 对象定义

以下“必填/可选”以当前冻结 schema 为准。

### 3.1 SPU

语义：可执行规范单元，承载规则、执行路径、状态与证明配置。

必填：
- `version`
- `path`
- `gate`
- `state`
- `proof`
- 且至少具备一个主标识：`spuId` 或 `component_id`

常用可选：
- `component_name`
- `metadata` / `meta`
- `input_dto` / `output_dto`
- `data`
- `source_type`
- `status`

引用关系：
- `GateRequest.spuId` -> `SPU.spuId | SPU.component_id`
- `Node.spu_id` -> `SPU.spuId | SPU.component_id`
- `Container.norm_execution.specs_bound[*]` -> `SPU`

### 3.2 GateRequest

语义：Gate 执行请求。

必填：
- `spuId`

可选：
- `containerId`
- `nodeId`
- `inputs`
- `context`
- `branchId`

引用关系：
- `spuId` -> `SPU`
- `containerId` -> `Container.v_address`（或容器主键映射）
- `nodeId` -> `Node.node_id`

### 3.3 GateResult

语义：Gate 执行判定输出。

必填：
- `summary_status`
- `rule_results[]`

可选：
- `failed_rule_ids[]`
- `gate_trace[]`

引用关系：
- `ExecutionState.final_status` <- `GateResult.summary_status`
- `Proof` 可嵌入 Gate 判定摘要

### 3.4 ExecutionState

语义：执行状态流转（状态机视角）。

必填：
- `lifecycle_status`
- `state_trace[]`

可选：
- `final_status`

引用关系：
- `final_status` <- `GateResult.summary_status`
- `Node.status`、`Container.lifecycle_state` 与 `ExecutionState.lifecycle_status` 需保持映射一致

### 3.5 Proof

语义：执行证据对象（含执行级与容器归档级证明信息）。

必填：
- `timestamp`
- 且至少满足一个标识：`proof_id` / `proof_hash` / `container_id`

常用可选：
- 执行级：`canonical_payload`、`proof_fields`、`signature`、`merkle_root`、`proof_path`
- 容器级：`geo_slot_ref`、`spec_results[]`、`overall_status`、`audit_trail[]`、`archived_at`

引用关系：
- `Node.proof` -> `Proof`
- `Container.container_proof` -> `Proof`

### 3.6 Container

语义：运行时容器，聚合多 SPU/Node 的执行与归档状态。

必填：
- `v_address`
- `container_type`
- `geo_slot_ref`
- `norm_execution`
- `trip_binding`
- `runtime`
- `lifecycle`
- `lifecycle_state`
- `locked`
- `nodes[]`
- `spec_bindings[]`
- `is_dynamic`

常用可选：
- `container_id`
- `slot_ref`
- `volume_ref`
- `container_proof`

引用关系：
- `nodes[*]` -> `Node.node_id`
- `spec_bindings[*].latest_node` -> `Node.node_id`
- `norm_execution.specs_bound[*]` -> `SPU`
- `container_proof` -> `Proof`

### 3.7 Node

语义：一次具体执行实例（SPU 在容器中的执行尝试）。

必填：
- `node_id`
- `spu_id`
- `container_ref`
- `attempt_index`
- `created_at`
- `status`

常用可选：
- `volume_ref`
- `proof`
- `result_summary`
- `completed_at`
- `archived_at`

引用关系：
- `spu_id` -> `SPU`
- `container_ref` -> `Container.v_address`
- `proof` -> `Proof`

## 4. Mermaid 对象关系图

```mermaid
flowchart LR
    SPU[SPU]
    GRQ[GateRequest]
    GRS[GateResult]
    EST[ExecutionState]
    PRF[Proof]
    CTR[Container]
    NOD[Node]

    GRQ -->|spuId| SPU
    GRQ -->|containerId| CTR
    GRQ -->|nodeId| NOD

    SPU -->|gate/state/proof config| GRS
    GRS -->|summary_status| EST

    CTR -->|specs_bound[*]| SPU
    CTR -->|nodes[*]| NOD
    CTR -->|container_proof| PRF

    NOD -->|spu_id| SPU
    NOD -->|proof| PRF
    EST -->|lifecycle mapping| NOD
    EST -->|lifecycle mapping| CTR
```

## 5. 接口引用建议

建议后续接口按对象级 schema 直接引用：

- 请求体（Gate）：`gate-request.schema.json`
- 响应体（Gate）：`gate-result.schema.json`
- 状态补丁：`execution-state.schema.json`
- 运行时对象：`container.schema.json`、`node.schema.json`
- 证据对象：`proof.schema.json`

如果需一体化引用（SDK 代码生成/聚合校验），使用：
- `core-models.schema.json`
