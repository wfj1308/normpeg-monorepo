# System Services（webhook / sync / export）最小正式模型（v0）

更新时间：2026-04-24  
范围：补齐第 8 层系统层最小能力，覆盖 `webhook / sync / export`，并与当前已存在的 proof/spec 导出能力兼容。

## 1. 目标

1. 让外部系统可订阅关键事件：`execution completed`、`proof generated`、`spec published`。
2. 提供最小离线缓存同步模型，支持现场断网与恢复后补齐。
3. 把导出能力提升为系统级协议：`project export package` 与 `proof export package`。
4. 不破坏现有 API 行为，优先做兼容增强。

## 2. 系统层对象总览

```ts
type SystemServiceDomain = {
  webhook: {
    subscriptions: Record<string, WebhookSubscription>;
    deliveries: WebhookDeliveryRecord[];
  };
  sync: {
    checkpoints: Record<string, SyncCheckpoint>; // key: projectId:deviceId
    mutationQueue: OfflineMutation[];            // client-side append-only
    changeFeed: SyncChangeEvent[];               // server-side append-only
    conflicts: SyncConflictRecord[];
  };
  export: {
    projectPackages: Record<string, ProjectExportPackage>;
    proofPackages: Record<string, ProofExportPackageRef>;
  };
};
```

## 3. Webhook（关键事件订阅）

### 3.1 事件类型（v0 固定）

```ts
type WebhookEventType =
  | "execution.completed"
  | "proof.generated"
  | "spec.published";
```

### 3.2 订阅对象

```ts
type WebhookSubscription = {
  subscriptionId: string;
  projectId: string | null;       // null 表示租户级订阅
  endpoint: string;               // HTTPS URL
  events: WebhookEventType[];
  secretRef: string;              // 用于 HMAC 签名
  status: "active" | "paused";
  retryPolicy: {
    maxAttempts: number;          // 建议 v0=5
    backoffSec: number[];         // 建议 [10,30,60,300,900]
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
```

### 3.3 事件信封与投递记录

```ts
type WebhookEventEnvelope = {
  eventId: string;
  eventType: WebhookEventType;
  eventVersion: "webhook.event@v1";
  occurredAt: string;
  projectId: string | null;
  refs: {
    containerId?: string;
    nodeId?: string;
    proofId?: string;
    spuId?: string;
    vuri?: string;
  };
  payload: Record<string, unknown>;
};

type WebhookDeliveryRecord = {
  deliveryId: string;
  subscriptionId: string;
  eventId: string;
  attempt: number;
  status: "pending" | "delivered" | "failed" | "dead_letter";
  responseCode?: number;
  responseBodySnippet?: string;
  deliveredAt?: string;
  nextRetryAt?: string;
  createdAt: string;
};
```

### 3.4 最小操作

1. 创建订阅：`POST /api/v1/webhook/subscribe`
2. 暂停/恢复订阅：`POST /api/v1/webhook/subscriptions/:id/status`
3. 列出订阅：`GET /api/v1/webhook/subscriptions?projectId=...`
4. 事件投递：系统内部触发，采用 at-least-once + 幂等 `eventId` 去重

### 3.5 事件映射（与现有流程对齐）

1. `execution.completed`  
来源：节点终结（`NODE_FINALIZED`）后触发，带 `containerId/nodeId/status`。
2. `proof.generated`  
来源：proof 生成或归档时触发，带 `proofId/proofHash/containerId`。
3. `spec.published`  
来源：SPU 发布接口成功后触发，带 `spuId/version/publishedAt`。

## 4. Sync（最小离线缓存同步模型）

### 4.1 同步对象

```ts
type SyncCheckpoint = {
  projectId: string;
  deviceId: string;
  lastPulledSeq: number;          // 已消费的服务端变更序号
  lastPushedMutationId?: string;  // 最近成功上行 mutation
  updatedAt: string;
};

type OfflineMutation = {
  mutationId: string;             // 客户端生成，全局唯一（幂等键）
  projectId: string;
  deviceId: string;
  actor: string;
  entityType: "container" | "node" | "mapping" | "proof_ref";
  entityId: string;
  operation: "upsert" | "patch" | "append_event";
  baseVersion?: string | null;    // 可选，用于冲突检测
  payload: Record<string, unknown>;
  createdAt: string;
};

type SyncChangeEvent = {
  seq: number;                    // 服务端单调递增
  projectId: string;
  eventType: "execution.completed" | "proof.generated" | "spec.published" | "state.updated";
  entityType: string;
  entityId: string;
  patch: Record<string, unknown>;
  occurredAt: string;
};

type SyncConflictRecord = {
  conflictId: string;
  mutationId: string;
  entityType: string;
  entityId: string;
  reason: "version_mismatch" | "archived_locked" | "invalid_transition";
  serverSnapshot: Record<string, unknown>;
  createdAt: string;
};
```

### 4.2 最小同步协议

1. `POST /api/v1/sync/push`  
客户端上传 `mutations[]`，服务端按 `mutationId` 幂等接收，返回 `accepted/rejected/conflicts`。
2. `POST /api/v1/sync/pull`  
客户端按 `projectId + lastPulledSeq` 拉取增量 `changeFeed`。
3. `GET /api/v1/sync/checkpoint`  
返回当前设备 checkpoint，支持断点续传。

### 4.3 最小冲突策略（v0）

1. 默认策略：`baseVersion` 一致则应用，不一致进入 `conflict`。
2. 保护状态：`ARCHIVED/FINALIZED` 对象拒绝覆盖写入。
3. 客户端恢复：收到 `conflict` 后先 `pull` 最新快照，再人工或策略重放 mutation。

### 4.4 离线恢复闭环

1. 断网期间本地只做 `OfflineMutation` 追加，不直接假定服务端成功。
2. 恢复网络后先 `push`，再 `pull`，最后更新 `checkpoint`。
3. 本地 UI 状态采用 `pending/synced/failed/conflict` 四态。

## 5. Export（系统级导出）

### 5.1 Project Export Package（新增系统能力）

```ts
type ProjectExportPackage = {
  packageId: string;
  schemaVersion: "project-export@v1";
  projectId: string;
  snapshotAt: string;
  manifest: {
    projectRootRef: string;       // ProjectUTXO root
    mappingSummaryRef: string;
    containerCount: number;
    proofCount: number;
    documentCount: number;
  };
  sections: {
    projectState: Record<string, unknown>;   // UTXO + branches + spatial + mapping summary
    proofIndex: Array<{ proofId: string; proofHash?: string; ref?: string }>;
    documentIndex: Array<{ documentId: string; vuri?: string; type: string }>;
  };
  checksums: {
    packageHash: string;
  };
  objectRef?: string | null;      // 对象存储位置（可选）
};
```

建议接口：`POST /api/v1/export/project`（支持 `projectId` + `includeSections`）。

### 5.2 Proof Export Package（复用现有能力）

```ts
type ProofExportPackageRef = {
  packageId: string;
  schemaVersion: "proof-audit-export@v1";
  source: {
    nodeId?: string;
    containerId?: string;
    proofId?: string;
  };
  exportApiPath: string;          // 例如 /api/proof/export
  generatedAt: string;
};
```

现有接口可直接作为系统层 proof 导出实现：

1. `POST /api/proof/export`
2. `POST /api/proof/archive-export`
3. `POST /api/public/v1/proofs/export`
4. `POST /api/public/v1/proofs/archive-export`

### 5.3 导出与系统层的关系

1. `webhook` 负责通知“有新导出/新证据可取”。
2. `sync` 负责在离线终端恢复后拉到导出摘要与引用。
3. `export` 负责生成可归档可迁移的正式包。

## 6. 与当前仓库落点映射

### 6.1 已有能力

1. Proof 导出：`platform-api.ts` 已有 proof export / archive-export。
2. Spec 导出：`POST /api/v1/spec/export` + `/downloads/:bundle`。
3. 事件基础：`EventStore` 与 `AUDIT_EVENT` 已可作为 webhook 触发源。

### 6.2 待补齐能力（本次文档定义目标）

1. Webhook 订阅对象与投递队列（含重试/死信）。
2. Sync push/pull/checkpoint 与冲突记录。
3. Project export 正式包接口与打包清单。

## 7. 验收对照

1. 外部系统可以订阅关键事件：  
`execution.completed`、`proof.generated`、`spec.published` 已有统一事件模型、订阅对象与投递规则。
2. 现场离线/恢复场景有最小支持：  
`OfflineMutation + SyncCheckpoint + push/pull + conflict` 形成最小闭环，支持断网缓存与恢复同步。
