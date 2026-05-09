# Identity Layer（did / trip / sign）最小正式模型（v0）

更新时间：2026-04-24  
范围：补齐第 8 层身份层最小正式实现定义，使 Proof 与审批链中的签字从 UI 行为升级为可审计身份对象。

## 1. 目标

1. 定义可落地的 `DID` 最小对象。
2. 定义 `Trip` 角色绑定对象，覆盖 `inspector/supervisor/expert/admin`。
3. 定义最小 `Sign` 对象，固定包含 `signer/action/timestamp/signaturePayload`。
4. 与现有执行、Proof、审批实现保持兼容，不破坏现有 API 行为。

## 2. DID 最小对象

```ts
type IdentityRole = "inspector" | "supervisor" | "expert" | "admin";

type DIDDocumentMinimal = {
  did: string;                    // 例: did:normpeg:tenantA:user_001
  method: "normpeg";              // v0 固定
  subjectType: "human" | "service";
  actorId: string;                // 与请求头 x-actor-id 对齐
  roles: IdentityRole[];          // 可授予多角色
  status: "active" | "revoked";
  publicKeyRef?: string | null;   // 可选，指向公钥材料
  createdAt: string;              // ISO-8601
  updatedAt: string;              // ISO-8601
};
```

约束（MUST）：

1. `did` 全局唯一，且可反查到唯一 `actorId`。
2. `roles` 至少包含一个角色。
3. `status=revoked` 的 DID 不可用于签字与审批动作。

## 3. Trip / 角色绑定最小对象

`Trip` 在 v0 定义为“某个作用域下可执行角色责任链绑定”。

```ts
type TripBindingMinimal = {
  tripId: string;                 // 例: trip_container_K19+070_001
  scopeType: "container" | "node" | "approval_candidate";
  scopeRef: string;               // containerId / nodeId / candidateId
  projectId?: string | null;

  bindings: {
    inspector?: string | null;    // DID
    supervisor?: string | null;   // DID
    expert?: string | null;       // DID
    admin?: string | null;        // DID
  };

  state: "active" | "closed";
  createdAt: string;
  updatedAt: string;
};
```

职责约束（v0）：

1. `inspector`：执行侧签字与现场责任角色。
2. `supervisor`：归档与监督签字角色。
3. `expert`：审批流评审/决策角色。
4. `admin`：发布、归档与跨角色应急签字角色。

## 4. 最小签名对象（Sign）

```ts
type SignAction =
  | "node.sign"
  | "node.finalize"
  | "container.archive"
  | "approval.submit"
  | "approval.review"
  | "approval.approve"
  | "approval.reject"
  | "approval.publish";

type IdentitySignatureMinimal = {
  signatureId: string;
  signer: {
    did: string;
    actorId: string;
    role: IdentityRole;
  };
  action: SignAction;
  timestamp: string;              // ISO-8601
  signaturePayload: {
    targetType: "node" | "container" | "proof" | "approval_candidate";
    targetRef: string;            // nodeId/containerId/proofId/candidateId
    hash?: string | null;         // proofHash / payloadHash
    note?: string;
  };
};
```

约束（MUST）：

1. 每条签名必须绑定 `did + actorId + role`。
2. `action` 必须可映射到真实业务动作。
3. `timestamp` 必须来自服务端时间，不信任前端自填时间。

## 5. 与现有实现映射（当前仓库）

### 5.1 DID 映射

当前输入：

1. `x-actor-id`
2. `x-user-role`

代码位置：

1. `apps/executable-spec-web/server/services/authorization_service.ts`

映射规则：

1. v0 将 `actorId + role` 视为 DID 解析输入。
2. `DIDDocumentMinimal` 可先以内存注册表实现，再升级到身份存储服务。

### 5.2 Trip 绑定映射

当前容器侧已有：

1. `SpaceContainer.tripBinding.inspector`
2. `SpaceContainer.tripBinding.supervisor`

代码位置：

1. `apps/executable-spec-web/src/platform/types.ts`
2. `apps/executable-spec-web/src/platform/workflow/platform-service.ts`

映射规则：

1. v0 将现有容器 `tripBinding` 视为 `TripBindingMinimal.bindings` 子集。
2. `expert/admin` 角色由审批与授权链补齐（不破坏现有容器字段）。

### 5.3 Sign 映射

当前签字相关：

1. 节点签字：`POST /api/nodes/:id/sign`
2. Proof 签字结果字段：`ProofSignature`（`role/signer/signature/status/signedAt`）
3. 审批动作事件：`CandidateApprovalEvent`（`action/actorId/at`）

代码位置：

1. `apps/executable-spec-web/server/platform-api.ts`
2. `apps/executable-spec-web/src/platform/types.ts`
3. `apps/executable-spec-web/server/services/approval_flow_service.ts`

映射规则：

1. 每次签字/审批动作都产出 `IdentitySignatureMinimal` 记录。
2. `signaturePayload.targetRef` 与 Proof/审批对象主键绑定。
3. Proof 导出时可附带签名对象索引，不再只依赖前端展示状态。

## 6. 最小实现闭环（v0）

1. `did registry`：维护 `DIDDocumentMinimal`。
2. `trip binding registry`：维护 `TripBindingMinimal`。
3. `signature ledger`：append-only 写入 `IdentitySignatureMinimal`。
4. 执行动作前调用 `authorize + trip role check`，动作后写签名账本并回写 Proof/审批事件。

## 7. 验收对照

1. Proof 和审批流中的签字不再只是 UI 行为：签字动作已可映射到 `IdentitySignatureMinimal`，并与对象主键/哈希绑定。
2. 身份层有正式对象：`DIDDocumentMinimal + TripBindingMinimal + IdentitySignatureMinimal` 三类对象已定义并可落地实现。
