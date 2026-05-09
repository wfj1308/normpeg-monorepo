# Execution Log 与 Debug Trace

## 目标
- 在不改变业务逻辑前提下，给 Gate/State/Proof 流程提供统一执行日志。
- 一次失败后，可快速定位在输入、规则、状态机还是 proof 聚合阶段。
- 明确 `Proof` 与 `ExecutionLog` 的边界。

## 日志落盘位置
- 本地文件目录：`apps/executable-spec-web/.execution-logs/`
- 文件命名：`<executionId>.json`
- 每个 `executionId` 对应一份完整执行日志快照。

## ExecutionLog 结构

```ts
interface ExecutionLog {
  executionId: string;
  requestSummary: {
    source: string;
    intent?: string;
    containerId?: string | null;
    nodeId?: string | null;
    spuId?: string | null;
    inputKeys: string[];
    inputCount: number;
  };
  matchedSpu: {
    spuId: string;
    version?: string;
    norm?: string;
    clause?: string;
  } | null;
  stateTransitions: Array<{
    scope: "NODE" | "CONTAINER";
    from: string | null;
    to: string;
    reason: string;
    at: string;
  }>;
  gateDecisionSummary: {
    status: "PASS" | "FAIL" | "BLOCK" | "PENDING";
    passed: boolean;
    totalRules: number;
    passedRules: number;
    failedRules: number;
    failedRuleIds: string[];
  } | null;
  timing: {
    startedAt: string;
    endedAt: string | null;
    durationMs: number | null;
    checkpoints: Array<{
      name: string;
      at: string;
      elapsedMs: number;
    }>;
  };
  errorInfo: {
    stage: "input" | "rule" | "state" | "proof_generation" | "proof_aggregation" | "unknown";
    code: string | null;
    message: string;
    stack: string | null;
  } | null;
  debugTrace: DebugTrace;
}
```

## DebugTrace 结构

```ts
interface DebugTrace {
  pathSteps: Array<{
    step: string;
    formula: string;
    result: unknown;
    at: string;
  }>;
  inputOutputSnapshots: Array<{
    label: string;
    at: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  }>;
  warnings: string[];
}
```

## 插桩点
- Gate：`ExecutionEngine.evaluateRules`、`GateEvaluateService.evaluateGateRequest`
- State：`ExecutionEngine.submitForm/sign/finalize`、`PlatformService.executeSpec`（`PASS -> SIGNING` 人工过渡）、`PlatformService.archiveContainer`（容器归档）
- Proof：
  - 节点 proof 生成：`ExecutionEngine.finalize`
  - 容器 proof 聚合：`PlatformService.archiveContainer` + `buildContainerProof`

## 失败定位方式
- `errorInfo.stage === "input"`：输入缺失/表达式无法计算/输入校验失败
- `errorInfo.stage === "rule"`：规则评估语义失败（通常 `gateDecisionSummary.status = FAIL`）
- `errorInfo.stage === "state"`：状态机不允许迁移、依赖阻塞、签名状态不满足
- `errorInfo.stage === "proof_aggregation"`：容器归档 proof 聚合失败

同时可结合：
- `gateDecisionSummary.failedRuleIds`
- `stateTransitions`
- `timing.checkpoints`
- `debugTrace.inputOutputSnapshots`

## Proof 与 ExecutionLog 的区别
- `Proof`：面向结果存证和可验证性（hash/signature/rule match/final status），是“执行结果证据”。
- `ExecutionLog`：面向开发调试与故障定位（请求摘要、状态迁移、路径快照、warning、错误阶段），是“执行过程诊断日志”。

两者互补，不互相替代。
