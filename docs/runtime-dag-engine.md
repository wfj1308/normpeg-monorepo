# Runtime DAG Engine

## 目标

将原“下一步推荐”升级为完整 DAG 调度引擎，支持复杂工序链、并行执行、阻塞传播与局部重算。

实现位置：

- `apps/executable-spec-web/src/platform/runtime/runtime-graph.ts`
- `apps/executable-spec-web/src/platform/runtime/runtime-scheduler.ts`

## DAG 调度模型

### Node

- `nodeId`
- `spuId`
- `priority`
- `executionState.status`

状态集合：

- `draft`
- `ready`
- `running`
- `pass`
- `failed`
- `blocked`

### Edge

- `fromNodeId`
- `toNodeId`
- `dependencyType`

依赖类型：

- `hard`：必须满足（上游必须 `pass`）才可执行
- `soft`：不阻塞执行，但会产生日志/告警

### 输入模型

引擎输入为 `container graph + state`：

- 图：节点与边（依赖）
- 状态：每个节点当前 execution state
- 优先级：节点 priority
- 可选：`partialRerunNodeIds`

### 输出模型

- `nextExecutableNodes`
- `blockedNodes`
- `schedulePlan`

其中 `schedulePlan` 含：

- 分阶段并行计划（`stages`）
- 建议执行顺序（`suggestedOrder`）
- 并行组（`parallelizableNodeGroups`）
- 环检测（`hasCycle` / `cycleNodeIds`）
- partial re-run 影响范围

## 核心能力

### 1) 并行执行

同一阶段中满足 hard 依赖的节点会被并行输出；阶段内按 `priority` 排序。

### 2) 阻塞传播

当 hard 上游未 `pass`（含 `failed/running/draft/blocked`）时，下游进入阻塞。
阻塞会沿 hard 边逐层传播，形成 `blockedNodes` 列表。

### 3) 局部重算（partial re-run）

可传入 `partialRerunNodeIds`：

- 指定节点会被标记为“可重跑”
- 其 hard 下游分支被失效化（invalidated）
- 输出 `partialRerun.affectedNodeIds`，仅重算局部分支而非全图重跑

## 与 Runtime 的集成

`computeRuntimeContainerNextExecution(...)` 已切换为 DAG 引擎输出：

- `graph`（含 hard/soft edges）
- `nextExecutableNodes`
- `blockedNodes`
- `schedulePlan`
- 兼容现有 `decision/nextTasks` 输出

API `GET /api/runtime/containers/:id/model` 已回传 `schedulePlan`，可用于自动推进工序链而非人工判断下一步。

## 验证

已补充并通过：

- `runtime-graph.test.ts`（并行、soft/hard、阻塞传播、partial re-run、阶段计划）
- `runtime-scheduler.test.ts`（容器级调度接入）
