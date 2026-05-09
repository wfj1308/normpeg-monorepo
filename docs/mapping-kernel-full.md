# Mapping Kernel Full（桩号到全量执行摘要）

更新时间：2026-04-24  
范围：将 Mapping 从“最小查询”升级为“完整内核索引”。

## 1. 目标

实现架构要求的“桩号 -> 容器 / 体积 / 规范 / 状态 / 待办 / Proof”一体化映射：

- 输入 `stake` 或 `vuri`，可直接获得该位置完整执行摘要。
- 支持项目区间级检索与聚合。
- 支持执行、Proof、Split/Merge 三类回写驱动索引一致更新。

## 2. Full MappingEntry Schema

```ts
type MappingEntry = {
  mappingId: string;                 // 全局唯一
  projectId: string | null;
  branchId: string | null;
  stake: string | null;              // 例: K15+200

  slot: {
    slotRef: string;                 // SpaceSlot.v_address
    station: string | null;
    chainage: number | null;
    x: number | null;
    y: number | null;
    elevation: number | null;
    alignment: string | null;
  };

  spaceContainerRefs: Array<{
    containerId: string;
    containerRef: string;            // v_address or vuri
    slotRef: string;
    lifecycleState: string;          // DRAFT/RUNNING/VALIDATED/REJECTED/ARCHIVED...
    overallStatus: string;           // PENDING/PASS/FAIL...
    runtimePhase: string;            // idle/running/signing/completed...
    currentSpuId: string | null;
    currentNodeId: string | null;
    latestNodeId: string | null;
    latestNodeStatus: string | null;
    updatedAt: string | null;
  }>;

  volumeContainerRefs: Array<{
    volumeId: string;
    volumeRef: string;               // v://space/volume/...
    containerRef: string | null;
    slotRef: string | null;
    layer: string | null;
    quantity: number | null;
    unit: string | null;             // 默认 m3
    geometrySummary: Record<string, unknown> | null;
    updatedAt: string | null;
  }>;

  activeSpecs: Array<{
    spuId: string;
    spuKey: string | null;
    version: string | null;
    bindingStatus: string;           // DRAFT/RUNNING/PASS/FAIL...
    latestNodeId: string | null;
    latestNodeStatus: string | null;
    lastExecutionId: string | null;
  }>;

  activeProofs: Array<{
    proofKind: "node_final" | "container_final" | "branch_decision";
    proofId: string | null;
    proofHash: string | null;
    executionId: string | null;
    containerId: string | null;
    nodeId: string | null;
    status: "PASS" | "FAIL" | "BLOCK" | "PENDING";
    generatedAt: string | null;
    anchorRef: string | null;
  }>;

  pendingActions: Array<{
    actionType: string;
    description: string | null;
    priority: "high" | "medium" | "low" | null;
    assignedTo: string | null;
    deadline: string | null;
  }>;

  currentAggregatedState: {
    lifecycleState: string;
    overallStatus: string;
    runtimePhase: string;
    latestProofId: string | null;
    latestProofStatus: string | null;
    totalContainers: number;
    totalVolumes: number;
    totalActiveSpecs: number;
    totalActiveProofs: number;
    updatedAt: string;
  };
};
```

必填核心（MUST）：

1. `stake` 或 `slot.slotRef` 至少一个可定位键。  
2. `spaceContainerRefs`、`volumeContainerRefs`、`activeSpecs`、`activeProofs`、`pendingActions` 五组摘要字段必须返回（可为空数组）。  
3. `currentAggregatedState` 必须返回，作为单点状态判断入口。

## 3. 查询能力（Full）

### 3.1 By Stake

用途：给定桩号查看该点完整执行摘要。  
建议接口：

- `GET /api/v1/mapping/by-stake?stake=K15+200&projectId=...&branch=...&layer=...&time=...&version=...`

返回：

- `{ item: MappingEntry }`

实现映射：

- 可基于现有 `POST /api/v1/mapping/resolve` 封装（stake -> vuri -> resolve）。

### 3.2 By VURI

用途：给定 `vuri/v://` 精确解析（含 branch/version/time/layer）。  
建议接口：

- `POST /api/v1/mapping/by-vuri`（或继续使用 `POST /api/v1/mapping/resolve`）

返回：

- `{ item: MappingEntry, raw: resolvePayload }`

实现映射：

- 复用现有 `mapping.resolve(vuri, context)`，再标准化为 `MappingEntry`。

### 3.3 By Project Range

用途：项目区间态势检索。  
建议接口：

- `POST /api/v1/mapping/by-project-range`
- 入参：`projectId, startStake, endStake, branch?, version?, layer?, stateFilters?`

返回：

- `{ range, items: MappingEntry[], summary }`

实现映射：

- 复用现有 `POST /api/v1/mapping/query-range`，并对每个命中 container 聚合为 `MappingEntry`。

## 4. 回写机制（Write-back Kernel）

### 4.1 执行后更新 state summary

触发事件：`execution_completed`

输入：执行结果（含 `project_id, v_address, component_id, final_status, lifecycle_status, branch_id`）。  
回写动作：

1. 更新/创建 `spaceContainerRefs` 命中项。
2. 更新 `activeSpecs`（`bindingStatus/latestNodeStatus/lastExecutionId`）。
3. 更新 `pendingActions`（如失败触发人工复核）。
4. 重算 `currentAggregatedState`。

现有落点：

- `POST /api/v1/mapping/sync/execution`（已具备基础能力）。

### 4.2 Proof 后更新 proof summary

触发事件：`proof_generated`（node_final/container_final/branch_decision）。

回写动作：

1. 追加或更新 `activeProofs`（按 `proofId/proofHash` 去重）。
2. 回写相关 `activeSpecs[*].lastProof`（若 proof 对应 spec）。
3. 更新 `currentAggregatedState.latestProofId/latestProofStatus`。

建议接口：

- `POST /api/v1/mapping/sync/proof`

兼容策略：

- 在 `sync/execution` 中已有 `proof_hash` 时可做“轻量回写”；完整 proof 元数据由 `sync/proof` 补齐。

### 4.3 Split/Merge 后更新 refs

触发事件：

- `container_split_applied`
- `branch_merge_applied`

回写动作：

### Split
1. 将父容器标记为“非活跃引用”（不删历史）。
2. 新增多个 `spaceContainerRefs` 子引用。
3. 将 `volumeContainerRefs.containerRef` 由父映射到对应子容器（可一对多）。
4. 重算 `currentAggregatedState.totalContainers/totalVolumes`。

### Merge
1. 把 source branch 的有效容器/proof/spec 引用映射到 target branch。
2. 保留来源关系（建议在 ref 中记录 `mergedFromBranch` 元信息）。
3. 对 stake 同位冲突时，以目标分支最新 `updatedAt` 为主，冲突写入审计日志。

建议接口：

- `POST /api/v1/mapping/sync/branch-change`

最小入参：

- `eventType: "split" | "merge"`
- `projectId`
- `sourceRefs`
- `targetRefs`
- `operator`
- `reason`
- `timestamp`

## 5. 内核一致性规则

1. 同一 `(projectId, branchId, stake)` 在任意时刻只允许一个“主摘要”条目。  
2. `spaceContainerRefs` 和 `volumeContainerRefs` 必须可双向追踪（containerId <-> volumeId）。  
3. `currentAggregatedState.updatedAt` 必须等于参与聚合字段中的最大更新时间。  
4. 删除原则：索引可软失效，不做硬删除历史。

## 6. 与现状接口的兼容/升级

现有接口（可复用）：

- `POST /api/v1/mapping/resolve`（By VURI）
- `POST /api/v1/mapping/query-range`（By Range）
- `POST /api/v1/mapping/sync/execution`（执行回写）
- `POST /api/v1/mapping/upsert/container`
- `POST /api/v1/mapping/upsert/volume`

建议新增（Full Kernel）：

- `GET /api/v1/mapping/by-stake`
- `POST /api/v1/mapping/sync/proof`
- `POST /api/v1/mapping/sync/branch-change`
- `POST /api/v1/mapping/by-project-range`（可作为 `query-range` 的聚合增强别名）

## 7. 验收对照

1. 输入一个 stake 或 vuri，可以看到该位置完整执行摘要：  
   由 `MappingEntry` 的 `slot/container/volume/spec/proof/pending/currentAggregatedState` 全量字段保证。  
2. Mapping 从最小查询升级为完整内核：  
   由三类查询 + 三类回写 + 一致性规则共同保证。
