# Observability（系统监控与指标）

## 目标

在现有 execution log 基础上建立系统级可观测能力，支持：
- 查看系统整体健康度
- 追踪最近窗口趋势
- 快速发现异常波动

## 核心指标定义

1. `execution success rate`
- 含义：已完成执行中，成功执行占比。
- 公式：`successfulExecutions / completedExecutions * 100`。
- 成功判定：execution log 已结束（`timing.endedAt`）且无 `errorInfo`。

2. `avg latency`
- 含义：执行平均时延（毫秒）。
- 公式：`sum(durationMs) / count(durationMs)`。
- 统计范围：已完成且有 `durationMs` 的执行。

3. `gate pass rate`
- 含义：参与 gate 判定的执行中，PASS 占比。
- 公式：`gatePassedExecutions / gateEvaluatedExecutions * 100`。
- 统计范围：`gateDecisionSummary` 存在且状态非 `PENDING`。

4. `proof generation rate`
- 含义：应生成 proof 的执行中，成功生成占比。
- 公式：`proofGeneratedExecutions / proofExpectedExecutions * 100`。
- 成功判定：checkpoint 包含 `proof_fragment_built` / `proof_finalized` / `proof_aggregated`。

## 收集模块

实现位置：
- `server/services/observability_metrics_service.ts`

主要组件：
- `ObservabilityMetricsCollector`
  - 实现 `ExecutionLogSink`
  - 在每次 execution log `persist` 时增量收集最新执行状态
  - 支持窗口化聚合和趋势输出
- `CompositeExecutionLogSink`
  - 复用现有 file sink，同时把日志送入 metrics collector

接入方式（`server/platform-api.ts`）：
- `ExecutionLogService` 采用组合 sink：
  - `LocalExecutionLogFileStore`
  - `ObservabilityMetricsCollector`

这样既保留原日志落盘，又新增实时指标采集。

## Dashboard 数据接口

### 1) 概览接口

`GET /api/dashboard`

返回原有 dashboard 字段，并新增：
- `observability`（summary）
- `observabilityAlerts`（异常告警）

### 2) 指标接口

`GET /api/dashboard/metrics?windowMinutes=60&bucketMinutes=5`

参数：
- `windowMinutes`：统计窗口（默认 60）
- `bucketMinutes`：趋势分桶粒度（默认 5）

返回结构：
- `window`：时间窗口信息
- `summary`：当前窗口总体指标
- `trend`：分桶趋势点（每桶包含成功率、时延、gate 通过率、proof 生成率）
- `alerts`：基于最近桶与历史基线的异常提示
- `updatedAt`：collector 最近更新时间

## 异常趋势识别（最小规则）

当前内置规则：
- `SUCCESS_RATE_DROP`
- `LATENCY_SPIKE`
- `GATE_PASS_RATE_DROP`
- `PROOF_RATE_DROP`

判定方式：
- 以“最近非空桶”对比“历史非空桶平均基线”
- 当下降/上升超过阈值时发出 `warning` / `critical`

## 对接建议

- 运营看板每 10~30 秒拉取 `/api/dashboard/metrics`。
- 推荐默认：`windowMinutes=60`, `bucketMinutes=5`。
- 当 `alerts` 非空时高亮展示，并跳转 execution log 明细排查。

## 验收映射

- 可以看到系统整体运行状态：
  - 通过 `summary` 暴露系统级四大指标。
- 能快速发现异常趋势：
  - 通过 `trend` + `alerts` 输出趋势与告警。
