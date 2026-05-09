# Real Anchor Integration（首个真实 Provider）

更新时间：2026-04-24  
范围：在保留现有 `AnchorProvider` 抽象层的前提下，从 `mock` 升级到首个可接入的真实外部锚定 provider。

## 1. 首个接入目标选择

本次首个真实 provider 选择：`IPFS HTTP API (Kubo-compatible)`。

选择理由：

1. 可本地部署（`ipfs daemon`）也可对接托管网关，工程落地门槛低。
2. 返回标准 `CID`，可直接作为外部 `anchor ref`（`ipfs://<cid>`）。
3. 与后续 Arweave/侧链/法务存证并不冲突，抽象层可继续扩展。

## 2. 保留并扩展抽象层

保留原有抽象接口不变：

```ts
interface AnchorProvider {
  providerName: string;
  submit(proof: Record<string, unknown>): AnchorSubmitResult;
  verify(anchorRef: string): AnchorVerifyResult;
  status(): AnchorProviderStatus;
}
```

新增实现：

1. `IpfsHttpAnchorProvider`
2. `CurlIpfsAnchorTransport`（默认传输实现）
3. `IpfsAnchorTransport`（可注入，便于测试与替换）

代码位置：

1. `apps/executable-spec-web/src/platform/proof/anchor-service.ts`
2. `apps/executable-spec-web/src/platform/proof/anchor-service.test.ts`

## 3. 实际能力实现

### 3.1 submit proof package

流程：

1. 将 proof package 序列化为 JSON。
2. 调用 IPFS API：`POST /api/v0/add` 上传内容。
3. 解析返回 CID，生成 `anchorRef = ipfs://<cid>`。
4. 回填 `AnchorSubmitResult`（含 providerName/hash/anchoredAt）。

### 3.2 receive anchor ref

接收与回写路径：

1. `PlatformService.finalizeNode(..., { anchor: { enabled: true } })`
2. `PlatformService.archiveContainer(..., { anchor: { enabled: true } })`
3. 在 proof 中写入：
   - `anchorReference`
   - `extensions.anchorReference`
   - `extensions.anchorReceipt`

### 3.3 verify anchor ref

流程：

1. 从 `anchorRef` 提取 CID（支持 `ipfs://`、`/ipfs/`、纯 CID）。
2. 调用 IPFS API：`POST /api/v0/block/stat?arg=<cid>`。
3. 存在则返回 `ANCHORED`，不存在/失败返回 `NOT_FOUND`。
4. `verifyProof` 会结合：proof hash + proof chain + anchor check 做完整验证。

## 4. 运行配置

平台 API 新增按环境变量选择 provider：

1. `NORMPEG_ANCHOR_PROVIDER=mock|ipfs_http`
2. `NORMPEG_IPFS_ANCHOR_PROVIDER_NAME`（默认 `ipfs_http_anchor_provider`）
3. `NORMPEG_IPFS_API_BASE_URL`（默认 `http://127.0.0.1:5001`）
4. `NORMPEG_IPFS_AUTH_TOKEN`（可选）
5. `NORMPEG_IPFS_PIN=true|false`

涉及文件：

1. `apps/executable-spec-web/server/platform-api.ts`
2. `apps/executable-spec-web/.env.example`

## 5. 对现有流程的影响控制

兼容策略：

1. 默认仍是 `mock`，不改现有默认行为。
2. 锚定步骤仅在 `anchor.enabled=true` 时触发。
3. 外部 provider 提交失败时，记录 `PROOF_ANCHOR_FAILED` 审计并降级，不阻断主执行/归档流程。
4. `verifyAnchor` 对 provider 异常做容错，返回 `NOT_FOUND` 而非中断服务。

结论：内部流程保持可用，外部锚定是可选增强能力。

## 6. 验收映射

1. Proof 可真正获得外部 anchor ref：`ipfs://<cid>` 已接入并回写。
2. 不影响现有内部流程：默认 mock 不变，真实 provider 失败可降级，主流程不被阻断。
