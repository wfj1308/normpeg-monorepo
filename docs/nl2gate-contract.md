# NL2Gate Contract

更新时间：2026-04-23  
范围：NL2Gate 只作为“自然语言 -> 受控 Gate 命令”入口，不作为自由聊天机器人。

## 1. 目标

NL2Gate 的职责是把自然语言严格映射为可执行、可追溯的 Gate 命令：

1. `intent`（`gate.preview | gate.evaluate`）
2. `target`（`spu/spec` 目标）
3. `inputs`（用于 Gate 的参数）
4. `context`（`stake/containerId/nodeId/...`）

任何业务结论都必须来自 Gate 执行结果，不能绕过 SPU/Gate 直接回答。

## 2. 解析与映射规则

实现位置：
- `apps/executable-spec-web/server/services/nl2gate_bridge_service.ts`

解析流程：
1. 从 `query + mode` 决定 `intent`。
2. 从自然语言解析 `metric/stake`，并解析或推断 `spuId`。
3. 生成 `target`。
4. 生成 `inputs`：
   1. 优先使用 `context.inputs` / `context.formData`。
   2. 否则读取 `nodeDataStore[stake][metric]`。
   3. 若缺失，返回结构化缺失项，不猜测。
5. 生成受控命令 `command`。
6. 执行 Gate 并返回 `execution`（含 `executionId`，可追溯）。

## 3. 缺失参数策略（不猜）

当参数不足时：

- `success=false`
- `structured.missing` 返回结构化缺失项
- `structured.command=null`
- `structured.execution=null`

对于“自由聊天”类输入（无法识别 `metric/stake`）同样按缺参处理，不生成执行命令。

缺失项结构：

```json
{
  "field": "inputs.maxDryDensity",
  "reason": "input_value_missing",
  "required": true,
  "expected": "number"
}
```

## 4. Preview / Evaluate

受控动作支持两类：

1. `gate.preview`
   1. 命令端点：`/api/gate/preview`
   2. 作为预演语义执行（可追溯到 `executionId`）
2. `gate.evaluate`
   1. 命令端点：`/api/gate/evaluate`
   2. 作为正式执行语义

服务端路由统一支持：
- `/api/gate/preview` / `/gate/preview` / `/api/v1/gate/preview` / `/v1/gate/preview`
- `/api/gate/evaluate` / `/gate/evaluate` / `/api/v1/gate/evaluate` / `/v1/gate/evaluate`

## 5. 响应 Contract

响应同时包含两部分：

1. `answer`：自然语言回答（仅总结 Gate 结果）
2. `structured`：结构化 JSON（系统消费主入口）

`structured` 最小字段：

- `intent`
- `target`：`metric/stake/spuId/containerId/nodeId`
- `inputs`
- `context`
- `missing[]`
- `command`
- `execution`

## 6. 追溯性要求

所有成功 NL 查询必须满足：

1. `structured.command` 非空。
2. `structured.execution.executionId` 非空。
3. `answer` 仅来自 `execution.gate/results`，不走自由聊天推理。

## 7. Schema

- 输入：`apps/executable-spec-web/src/platform/schemas/nl2gate-input.schema.json`
- 输出：`apps/executable-spec-web/src/platform/schemas/nl2gate-output.schema.json`

## 8. 验收映射

1. 已严格映射 `intent/target/inputs/context`。
2. 参数缺失返回结构化 `missing`，无猜测填充。
3. 已支持 `Gate preview / evaluate` 双路径。
4. 响应同时输出自然语言回答与结构化 JSON。
5. NL 结果可追溯到 Gate 执行，不是黑盒聊天。
