# Execution Performance（执行并发与性能）

## 目标

为执行引擎提供最小但可落地的并发与性能能力，支持大规模工程场景（成百上千检测点）的批量执行，同时保持既有 `SPU -> Gate -> Proof` 主链路不变。

## 并发执行模型

实现位置：
- `server/services/execution_worker_pool.ts`
- `server/services/gate_evaluate_service.ts`
- `server/platform-api.ts` (`/api/gate/batch-evaluate`)

核心模型：

1. `worker pool`
- 使用 `AsyncExecutionWorkerPool` 作为有界并发池。
- `poolSize` 控制同一时刻最大执行任务数。
- 超出并发上限的任务进入 FIFO `queue`。

2. `async execution`
- 每个批量项按异步任务提交，内部执行仍调用既有 `evaluateGateRequest(...)`。
- 保证结果仍对应同一条 Gate 执行链路，可追溯 executionId/proof。

3. `queue`
- 当活跃 worker 已满时，任务排队等待可用 slot。
- 提供 `peakQueueSize`、`submittedTasks`、`completedTasks` 统计。

## 批量并发化

接口：`POST /api/gate/batch-evaluate`

新增可选参数：

```json
{
  "items": [
    {
      "itemId": "item_1",
      "spuId": "highway.subgrade.compaction.4.2.1@v1",
      "containerId": "container_x",
      "inputs": {
        "massHoleSand": 1980,
        "massSandCone": 500,
        "volumeSand": 1000,
        "moistureContent": 5,
        "maxDryDensity": 1.95
      }
    }
  ],
  "executionOptions": {
    "concurrency": 8,
    "timeoutMs": 3000,
    "maxRetries": 1,
    "retryDelayMs": 100
  }
}
```

说明：
- `concurrency`：并发 worker 数（自动归一化，最小 1）。
- `timeoutMs`：单任务超时毫秒数。
- `maxRetries`：单任务最大重试次数（不含首轮）。
- `retryDelayMs`：重试间隔。

## 超时控制

- 单任务执行采用超时保护，超时后返回 `408` 风格错误语义（`GATE_EXECUTION_FAILED`）。
- 超时任务可按策略重试。
- 统计字段 `timeoutCount` 记录本次批量的超时个数。

## 重试机制

- 重试只针对可重试执行失败（`GATE_EXECUTION_FAILED`）。
- 参数 `maxRetries` 控制重试上限。
- 指标 `retryCount` 记录实际发生的重试次数。
- 依赖未满足（`GATE_DEPENDENCY_UNMET`）不进入重试。

## 执行指标

批量返回新增 `performance`：

```json
{
  "performance": {
    "workerPool": {
      "poolSize": 8,
      "peakQueueSize": 32,
      "submittedTasks": 100,
      "completedTasks": 100
    },
    "timeoutMs": 3000,
    "maxRetries": 1,
    "retryCount": 7,
    "timeoutCount": 2,
    "latency": {
      "avgMs": 121.3,
      "p95Ms": 260.8,
      "maxMs": 411.7
    },
    "throughput": {
      "itemsPerSecond": 62.5
    },
    "failureRate": 4.0,
    "startedAt": "2026-04-24T08:00:00.000Z",
    "finishedAt": "2026-04-24T08:00:01.600Z",
    "durationMs": 1600
  }
}
```

指标定义：
- `latency.avgMs`：任务平均延迟。
- `latency.p95Ms`：P95 延迟。
- `latency.maxMs`：最大延迟。
- `throughput.itemsPerSecond`：吞吐（每秒处理项数）。
- `failureRate`：失败率（含 `ERROR` + `BLOCKED`，单位 %）。

## 与主流程关系

- 并发能力仅提升批量调度方式，不改变单项 Gate 判定逻辑。
- 每个成功项依然产出可追溯 proof 引用（`proofReferences`）。
- 外部输入映射与 Proof 生成流程保持原有行为，不绕过 Gate/Proof。

## 默认行为

- 若不传 `executionOptions`，系统仍可批量执行并自动选取安全默认并发。
- 旧调用方可无缝兼容；仅在需要压榨性能时按需开启并发参数。
