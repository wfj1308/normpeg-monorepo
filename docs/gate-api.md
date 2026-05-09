# Gate API (Execution-Only Contract)

更新时间：2026-04-23  
范围：Gate 只负责执行与判定；规则定义来自 SPU；不改 UI、不加页面。

## 1. 目标

统一 `POST /gate/evaluate` 输入输出，确保调用方不需要猜返回结构。

Gate 职责边界：
- 读取 SPU 规则（不负责规则注册）
- 执行与判定
- 生成解释
- 返回状态补丁（statePatch）
- 返回 proof 片段（proofFragment）

不承担：
- SPU 注册
- 调度编排
- 市场/目录职责

## 2. Endpoint

主路径：
- `POST /gate/evaluate`

兼容路径（保留）：
- `POST /api/gate/evaluate`
- `POST /api/v1/gate/evaluate`
- `POST /v1/gate/evaluate`

## 3. 请求体

```json
{
  "spuId": "highway.subgrade.compaction.4.2.1@v1",
  "containerId": "container_xxx",
  "nodeId": "node_xxx",
  "inputs": {
    "massHoleSand": 1980,
    "massSandCone": 500,
    "volumeSand": 1000,
    "moistureContent": 5,
    "maxDryDensity": 1.95
  },
  "context": {
    "source": "executor-ui",
    "projectId": "dajin-2024"
  }
}
```

字段约束：
- 必填：`inputs`
- 定位执行对象（二选一）：
  1. `nodeId`
  2. `containerId + spuId`
- `context` 可选，透传上下文

## 4. 返回体（稳定结构）

```json
{
  "status": "PASS",
  "result": {
    "executionId": "node_xxx",
    "passed": true,
    "outcome": "PASS",
    "gateStatus": "PASS",
    "outputs": {}
  },
  "explanation": "Gate evaluation passed",
  "matchedRules": [],
  "statePatch": {
    "nodeId": "node_xxx",
    "nodeStatus": "PASS",
    "containerId": "container_xxx",
    "containerLifecycleState": "RUNNING",
    "containerOverallStatus": "PENDING"
  },
  "proofFragment": {
    "kind": "proofFragment"
  }
}
```

字段说明：
- `status`: 顶层兼容状态（`PASS|FAIL`）
- `result`: 执行与判定摘要
  - `executionId`: 本次执行节点 ID
  - `passed`: 布尔判定
  - `outcome`: `PASS|FAIL|BLOCK`
  - `gateStatus`: 与 outcome 对齐的 Gate 状态
  - `outputs`: 计算输出
- `explanation`: 人类可读解释
- `matchedRules`: 规则命中详情（含 actual/expected）
- `statePatch`: 对 Node/Container 的状态补丁
- `proofFragment`: Proof 片段（用于后续汇总）

## 5. 兼容层（保留）

为不破坏现有前端与旧调用方，继续返回兼容字段：
- `node`
- `executionId`
- `spuId`
- `inputs`
- `outputs`
- `trace`
- `gateResults`
- `proof`
- `calculation`

新调用方应优先使用第 4 节的稳定字段。

## 6. 错误语义

### 6.1 参数缺失（400）

```json
{
  "error": "inputs is required",
  "code": "GATE_REQUEST_INVALID"
}
```

### 6.2 依赖未满足（409）

```json
{
  "error": "SPU is blocked by dependency",
  "code": "GATE_DEPENDENCY_UNMET"
}
```

## 7. 最小测试矩阵

已覆盖：
1. PASS
2. FAIL
3. 参数缺失
4. 依赖未满足

对应测试文件：
- `apps/executable-spec-web/server/services/gate_evaluate_service.test.ts`
