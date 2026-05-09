# NL2Gate 多轮补问（受控入口）

更新时间：2026-04-23

目标：升级 NL2Gate 为“可补问、可续跑”的受控入口，仍然禁止自由聊天结论直出。

## 1. 原则

1. 只允许 `NL -> intent/target/inputs/context -> Gate` 的受控路径。
2. 参数不足时不执行 Gate，只返回结构化补问。
3. 参数补齐后继续走 `gate.preview` / `gate.evaluate`。
4. 最终结论必须来自 Gate 执行结果，并可追溯到 `executionId`。

## 2. 缺失参数响应结构

当参数不足时，`structured` 中新增：

```json
{
  "missingResponse": {
    "missingFields": [
      { "field": "inputs.maxDryDensity", "reason": "input_value_missing", "required": true, "expected": "number" }
    ],
    "suggestedQuestions": [
      "Please provide numeric value for maxDryDensity (number)."
    ],
    "partialContext": {
      "intent": "gate.preview",
      "target": {
        "metric": "compaction",
        "stake": "K99+999",
        "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
        "containerId": null,
        "nodeId": null
      },
      "collectedInputs": {
        "massHoleSand": 1980,
        "massSandCone": 500,
        "volumeSand": 1000,
        "moistureContent": 5
      },
      "context": {}
    }
  }
}
```

说明：
- `missingFields`：缺失字段清单（不猜测）。
- `suggestedQuestions`：结构化补问建议。
- `partialContext`：当前已确认的意图、目标和已收集输入。

## 3. 最小多轮状态结构

`structured.conversation`：

```json
{
  "conversationId": "uuid",
  "pendingIntent": "gate.preview",
  "pendingSpu": "highway.subgrade.compaction.4.2.1.soil@v1",
  "collectedInputs": {
    "massHoleSand": 1980
  }
}
```

含义：
- `conversationId`：多轮会话键。
- `pendingIntent`：待继续执行的 intent。
- `pendingSpu`：已锁定的待执行 SPU。
- `collectedInputs`：多轮累计输入。

## 4. 执行流

1. **首轮解析**
   1. 解析 `intent/target/inputs/context`。
   2. 若缺参：返回 `missing + missingResponse + conversation`，`command=null`，`execution=null`。
2. **补问轮**
   1. 客户端携带 `conversationId` 再次调用 `/api/nl2gate/query`。
   2. 服务端合并历史 `collectedInputs` 与本轮补充。
3. **参数齐全**
   1. 生成受控 `command`。
   2. 调用 Gate（preview/evaluate）。
   3. 返回 `execution`（含 `executionId`）并清理会话挂起状态。

## 5. API 变更点

请求：
- `POST /api/nl2gate/query`
- 新增可选字段：`conversationId`

响应：
- `structured` 新增：
  - `missingResponse: object | null`
  - `conversation: object | null`

Schema：
- `apps/executable-spec-web/src/platform/schemas/nl2gate-input.schema.json`
- `apps/executable-spec-web/src/platform/schemas/nl2gate-output.schema.json`

## 6. 验收映射

1. **不会瞎猜缺失参数**：
   - 缺失项只来自显式解析与 SPU 必填输入校验。
   - 缺参时只返回补问，不执行 Gate。
2. **支持 1~2 轮补问完成执行**：
   - 通过 `conversationId + collectedInputs` 续跑。
3. **最终结果可追溯到 Gate 执行**：
   - 成功响应包含 `structured.execution.executionId` 与 `intent/endpoint`。

## 7. 代码位置

- 服务：`apps/executable-spec-web/server/services/nl2gate_bridge_service.ts`
- 路由：`apps/executable-spec-web/server/platform-api.ts`
- 客户端类型：`apps/executable-spec-web/src/platform/api-client.ts`
- 测试：`apps/executable-spec-web/server/services/nl2gate_bridge_service.test.ts`
