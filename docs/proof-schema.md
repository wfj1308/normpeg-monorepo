# Proof Schema (Frozen)

更新时间：2026-04-23  
范围：只统一 Proof 结构；不做上链、不做外部锚定。

## 1. 目标

统一执行链路中的证明对象，确保以下区域使用同一套结构：

- 执行区（Node 执行后）
- 复检区（Node 多次尝试）
- 验收区（Container 归档后）

本次冻结两个对象：

- `proofFragment`：Gate 返回的阶段性证明片段
- `finalProof`：执行完成后的标准证据对象（Node 或 Container）

## 2. 统一字段（核心）

以下字段为统一 Proof 主干字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `executionId` | `string \| null` | 是 | 执行标识。Node 场景可用 `nodeId`；Container 归档场景使用归档执行 ID。 |
| `spuId` | `string` | 是 | 命中的 SPU。容器聚合时固定为 `container:aggregate`。 |
| `nodeId` | `string \| null` | 是 | 节点 ID。容器级为 `null`。 |
| `containerId` | `string \| null` | 是 | 容器 ID。 |
| `inputSnapshot` | `object` | 是 | 输入快照。 |
| `resultSnapshot` | `object` | 是 | 输出/判定快照。 |
| `matchedSpecVersion` | `string` | 是 | 命中的规范版本。 |
| `matchedRules` | `array` | 是 | 命中规则结果。 |
| `status` | `PASS \| FAIL \| BLOCK \| PENDING` | 是 | 证明状态。 |
| `signatures` | `array` | 是 | 签字状态列表。 |
| `timestamps` | `object` | 是 | 时间戳集合。 |
| `archiveStatus` | `NOT_ARCHIVED \| ARCHIVED` | 是 | 归档状态。 |

## 3. 两类 Proof 区分

### 3.1 proofFragment（Gate 返回）

- `kind = "proofFragment"`
- `archiveStatus = "NOT_ARCHIVED"`
- 不要求 `proofId/hash/schemaVersion`
- 用于“执行判定阶段”的可追溯片段

### 3.2 finalProof（标准证据）

- `kind = "finalProof"`
- 必填：`proofId`、`schemaVersion`
- 可选：`hash`、`technicalDetails`、`extensions`
- Node 与 Container 均使用此结构

## 4. 子结构定义

### 4.1 `matchedRules[]`

- `ruleId: string`
- `condition?: string`
- `passed: boolean`
- `severity?: string`
- `message?: string`
- `actual?: unknown`
- `expected?: unknown`

### 4.2 `signatures[]`

- `role: string`
- `signer?: string \| null`
- `signature?: string \| null`
- `status: "PENDING" \| "SIGNED"`
- `signedAt?: string \| null`

### 4.3 `timestamps`

- `createdAt: string`
- `evaluatedAt?: string \| null`
- `finalizedAt?: string \| null`
- `archivedAt?: string \| null`

## 5. 容器级 Proof 聚合规则

`aggregateContainerFinalProof(...)` 的最小规则：

1. 输入必须有 `latestNodesBySpu`。
2. 仅当所有最新 Node 均为 `FINAL_PASS` 才允许聚合。
3. 聚合后输出 `kind = "finalProof"`、`archiveStatus = "ARCHIVED"`。
4. 输出 `specResults`（兼容字段）并将统一主字段写入 `resultSnapshot`。

## 6. 验收证明 JSON 页面接入

验收页继续展示 `JSON.stringify(proof)`，但底层对象统一为 `finalProof`（`ContainerProof`）。

- 页面入口：`SPUApp.tsx` -> `7. 验收与存证`
- 展示对象：`proof: ContainerProof`
- 下载 JSON：同一对象原样导出

## 7. 正式 Schema 文件

- `apps/executable-spec-web/src/platform/schemas/proof.schema.json`

该 Schema 使用 `oneOf` 区分 `proofFragment` 与 `finalProof`，并统一校验核心字段。

## 8. 示例文件

- `docs/proof-fragment.example.json`
- `docs/final-proof.example.json`

## 9. 迁移与兼容

1. 保留兼容字段：`specResults`、`auditTrail`、`geoSlotRef`、`overallStatus`。
2. 新代码优先读取统一字段：`executionId/spuId/nodeId/containerId/...`。
3. Gate、Node finalize、Container archive 全部走统一 Proof 结构。
