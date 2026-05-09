# Batch Execution

## 目标
- 支持一次提交多个检测点/多个 node 执行请求。
- 单项失败不影响其他项执行。
- 返回逐项结果与聚合摘要。

## 请求结构

接口：
- `POST /api/gate/batch-evaluate`
- 兼容别名：`/gate/batch-evaluate`、`/api/v1/gate/batch-evaluate`、`/v1/gate/batch-evaluate`

请求体：
```json
{
  "items": [
    {
      "itemId": "item_1",
      "spuId": "highway.subgrade.compaction.4.2.1@v1",
      "containerId": "container_xxx",
      "nodeId": "node_xxx",
      "inputs": {
        "massHoleSand": 1980,
        "massSandCone": 500
      },
      "context": {
        "source": "batch-run"
      }
    }
  ]
}
```

说明：
- `items[]` 必填，且不可为空。
- 每个 item 支持字段：
  - `spuId` / `containerId` / `inputs` / `context`（你要求的核心字段）
  - `nodeId`（可选，复用已有 node）
  - `itemId`（可选，未传自动生成为 `item_n`）

## 响应结构

```json
{
  "summary": {
    "total": 3,
    "passed": 1,
    "failed": 1,
    "blocked": 1,
    "proofReferences": [
      {
        "itemId": "pass_case",
        "index": 0,
        "executionId": "node_xxx",
        "nodeId": "node_xxx",
        "spuId": "highway.subgrade.compaction.4.2.1@v1",
        "containerId": "container_aaa",
        "proofFragmentKind": "proofFragment",
        "proofFragmentStatus": "PASS",
        "proofId": null,
        "proofHash": null
      }
    ]
  },
  "items": [
    {
      "itemId": "pass_case",
      "index": 0,
      "status": "PASS",
      "response": { }
    },
    {
      "itemId": "blocked_case",
      "index": 1,
      "status": "BLOCKED",
      "error": {
        "code": "GATE_DEPENDENCY_UNMET",
        "statusCode": 409,
        "message": "SPU is blocked by dependency"
      }
    }
  ]
}
```

## 聚合字段含义
- `total`: 本次批量提交条数
- `passed`: 单项执行通过数（`PASS`）
- `failed`: 单项失败数（`FAIL` + `ERROR`）
- `blocked`: 依赖阻塞数（`BLOCKED`）
- `proofReferences`: 成功进入 gate 评估项的 proof 引用信息

## 容错策略（部分失败）
- 执行方式为“逐项独立 try/catch”。
- 任一 item 报错，不会中断后续 item 执行。
- 每个 item 都会有独立状态：
  - `PASS`
  - `FAIL`
  - `BLOCKED`
  - `ERROR`

## 代码位置
- 批量服务实现：`apps/executable-spec-web/server/services/gate_evaluate_service.ts`
- 路由接入：`apps/executable-spec-web/server/platform-api.ts`
- 客户端调用：`apps/executable-spec-web/src/platform/api-client.ts`
