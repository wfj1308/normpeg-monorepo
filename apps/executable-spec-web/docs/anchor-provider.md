# Anchor Provider (外部锚定抽象层)

## 目标

为 Proof 增加可扩展的外部锚定能力，但当前阶段只提供抽象层与 `mock` 实现，不接真实区块链或外部存证平台。

设计原则：

- 锚定是可选步骤，不影响默认主流程。
- 不绕过现有 `SPU -> Gate -> Proof` 链路。
- 锚定结果写回 Proof，便于审计与追溯。

## 核心接口

实现位置：`src/platform/proof/anchor-service.ts`

```ts
export interface AnchorProvider {
  providerName: string;
  submit(proof: Record<string, unknown>): AnchorSubmitResult;
  verify(anchorRef: string): AnchorVerifyResult;
  status(): AnchorProviderStatus;
}
```

字段说明：

- `providerName`: provider 唯一标识。
- `submit(proof)`: 提交 proof 并返回锚定回执（`anchorRef/hash/anchoredAt`）。
- `verify(anchorRef)`: 校验某锚点是否存在。
- `status()`: 提供 provider 运行状态和统计信息。

## Mock Provider

默认注册 `MockAnchorProvider`：

- provider 名称：`mock_anchor_provider`
- `submit` 返回 `mock://...` 形式的 `anchorRef`
- `verify` 支持查询已提交锚点
- `status` 返回 `ready/degraded/offline` 之一（当前 mock 为 `ready`）

## 平台接入点

实现位置：`src/platform/workflow/platform-service.ts`

新增可选参数：

- `finalizeNode(nodeId, { anchor?: { enabled?: boolean; providerName?: string } })`
- `archiveContainer(containerId, { anchor?: { enabled?: boolean; providerName?: string } })`

行为：

1. 默认 `anchor.enabled !== true` 时，不执行锚定。
2. `anchor.enabled === true` 时：
   - 在 Proof 生成后调用 provider `submit(proof)`。
   - 将回执回写到 `proof.extensions.anchorReceipt`。
   - 记录执行日志 checkpoint：`proof_anchored`。

## Proof 回写格式

```json
{
  "extensions": {
    "anchorReceipt": {
      "anchorId": "mock://mock_anchor_provider/...",
      "anchorRef": "mock://mock_anchor_provider/...",
      "providerName": "mock_anchor_provider",
      "hash": "sha256...",
      "anchoredAt": "2026-04-24T10:00:00.000Z",
      "status": "ANCHORED"
    }
  }
}
```

## API 接口

实现位置：`server/platform-api.ts`

- `POST /api/nodes/:id/finalize`
  - 支持 body: `{ "anchor": { "enabled": true, "providerName": "mock_anchor_provider" } }`
- `POST /api/containers/:id/archive`
  - 支持 body: `{ "anchor": { "enabled": true } }`
- `GET /api/anchors/providers`
  - 返回 provider 状态列表
- `POST /api/anchors/verify`
  - body: `{ "anchorRef": "...", "providerName": "mock_anchor_provider" }`

## 可追溯性

- Proof 仍由原有 Gate 结果生成，锚定只作为后置增强步骤。
- 最终审计可同时查看：
  - Gate/Proof 主结果
  - `extensions.anchorReceipt`
  - 执行日志 `proof_anchored` checkpoint

## 扩展方向

后续接入 Arweave/IPFS/第三方审计平台时，只需新增 `AnchorProvider` 实现并注入 `PlatformService`，无需改动主执行链路。
