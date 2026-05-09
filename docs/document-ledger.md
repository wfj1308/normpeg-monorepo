# Document Ledger（LayerPeg 文档账本索引）最小正式模型（v0）

更新时间：2026-04-24  
范围：将 `LayerPegDocument` 从“单文档输出格式”升级为“统一可检索的文档账本索引系统”。

## 1. 目标与定位

`LayerPegDocument` 继续作为第 6 层标准文档壳（`Header / Gate / Body / Proof / State`），  
`Document Ledger` 负责把所有文档统一登记、统一索引、统一查询。

最小目标：

1. 文档不再散落为孤立 JSON。
2. 任意规范、节点、Proof、容器对象，都能通过账本索引追溯到对应 `LayerPegDocument`。
3. 支持按 `vuri / project / type` 检索。

## 2. DocumentLedgerEntry 正式结构

```ts
type DocumentLedgerType =
  | "spec"
  | "node"
  | "proof"
  | "container"
  | "report"
  | "form"
  | "other";

type DocumentLedgerRefs = {
  projectRef: string | null;      // 项目引用（建议 v://{projectId}）
  rootRef: string | null;         // 文档根对象引用
  sourceRef: string;              // 生成来源（如 spec:SPU-001 / node:N001）
  objectRefs: string[];           // 关联对象（spuId/nodeId/containerId/proofId 等）
  upstreamDocumentIds: string[];  // 上游文档链（可为空）
};

type DocumentLedgerEntry = {
  documentId: string;             // 对应 LayerPeg header.usi
  vuri: string;                   // 账本标准定位键（canonical）
  documentType: DocumentLedgerType;
  refs: DocumentLedgerRefs;
  createdAt: string;              // ISO-8601，对应 header.createdAt
  version: string;                // 对应 header.version
};
```

字段约束（MUST）：

1. `documentId` 全局唯一，不允许为空。
2. `vuri` 必须可用于稳定查询（同一对象同一版本定位一致）。
3. `documentType` 至少覆盖 `spec/node/proof/container` 四类。
4. `refs.sourceRef`、`createdAt`、`version` 必填。

## 3. 类型映射（LayerPeg -> Ledger）

| Ledger `documentType` | LayerPeg `header.docType` | 典型来源 |
| --- | --- | --- |
| `spec` | `spec` | `layerPegFromSpu` |
| `node` | `execution` | `layerPegFromNodeExecution` |
| `proof` | `proof` | `layerPegFromContainerProof` / 节点最终 Proof |
| `container` | `container` | 容器状态快照/归档文档 |
| `report` | `report` | 报告型文档 |
| `form` | `form` | 表单型文档 |
| `other` | `sku` / `other` | 兼容扩展 |

说明：账本将 `execution` 语义归一为 `node`，便于“节点文档”维度检索。

## 4. 账本索引内核

```ts
type DocumentLedgerIndex = {
  entriesById: Record<string, DocumentLedgerEntry>; // documentId -> entry
  byVuri: Record<string, string[]>;                 // vuri -> documentId[]
  byProject: Record<string, string[]>;              // projectRef -> documentId[]
  byType: Record<DocumentLedgerType, string[]>;     // type -> documentId[]
  latestByObjectRef: Record<string, string>;        // objectRef -> latest documentId
};
```

索引最小要求：

1. `entriesById` 为主索引（权威记录）。
2. `byVuri`、`byProject`、`byType` 为查询索引。
3. `latestByObjectRef` 提供“任意对象 -> 最新文档”直达能力。

## 5. 四类索引建立规则

### 5.1 Spec Docs

来源：`layerPegFromSpu(...)`。  
入账时写入：

1. `documentType = "spec"`
2. `refs.objectRefs` 至少含 `spu:{spuId}`
3. `byType["spec"]`、`byVuri[...]`、`byProject[...]` 同步更新

### 5.2 Node Docs

来源：`layerPegFromNodeExecution(...)`。  
入账时写入：

1. `documentType = "node"`
2. `refs.objectRefs` 至少含 `node:{nodeId}`，有容器则加 `container:{containerId}`
3. 节点状态变更后版本升级，保留历史 entry

### 5.3 Proof Docs

来源：`layerPegFromContainerProof(...)` 或节点最终 Proof 文档。  
入账时写入：

1. `documentType = "proof"`
2. `refs.objectRefs` 至少含 `proof:{proofId}`，建议附带 `container:{containerId}`
3. `latestByObjectRef["proof:{proofId}"] = documentId`

### 5.4 Container Docs

来源：容器快照、归档、状态固化文档。  
入账时写入：

1. `documentType = "container"`
2. `refs.objectRefs` 至少含 `container:{containerId}`
3. 容器 split/merge/archive 后生成新版本 entry，历史不覆盖

## 6. 查询能力（最小接口契约）

### 6.1 By VURI

```ts
queryByVuri(vuri: string, options?: { type?: DocumentLedgerType; includeHistory?: boolean })
  => DocumentLedgerEntry[]
```

用途：按对象地址获取文档链（默认返回最新，可选历史）。

### 6.2 By Project

```ts
queryByProject(projectRef: string, options?: { type?: DocumentLedgerType; limit?: number })
  => DocumentLedgerEntry[]
```

用途：项目维度查看文档总览或按类型筛选。

### 6.3 By Type

```ts
queryByType(type: DocumentLedgerType, options?: { projectRef?: string; limit?: number })
  => DocumentLedgerEntry[]
```

用途：按文档类别检索（例如全量 Proof 文档）。

## 7. 入账与回写（统一规则）

### 7.1 入账入口

所有 `LayerPegDocument` 生成后必须走统一入口：

1. `upsertLayerPegDocument(document, sourceRef)`
2. `registerDocumentLedgerEntry(document, sourceRef, refs)`
3. 同步刷新 `byVuri/byProject/byType/latestByObjectRef`

### 7.2 vuri 归一化规则（兼容现有实现）

`vuri` 计算优先级：

1. `document.header.rootRef`（若为有效 `v://`）
2. `refs.sourceRef`（若本身为 `v://`）
3. 从 `projectRef + objectRefs` 组装标准 `vuri`
4. 回退到 `documentId`（仅兼容旧记录，后续应迁移）

### 7.3 版本规则

1. 同一对象新版本文档生成时，新增 entry，不覆盖历史。
2. `version` 来自 `header.version`。
3. `latestByObjectRef` 永远指向最新版本 entry。

## 8. 与现有 LayerPeg 索引兼容

现有轻量索引项（`usi/docType/sourceRef/updatedAt/...`）可作为账本视图的裁剪输出。  
升级后建议：

1. 保留原 `/api/layerpeg/documents` 响应兼容。
2. 新增账本查询参数：`vuri`、`project`、`type`。
3. 底层统一由 `DocumentLedgerEntry` 驱动，不再直接遍历散落 JSON。

## 9. 验收对照

1. 文档不再是散落 JSON：所有文档生成后必须入 `Document Ledger`，且可从索引读取。
2. 任意对象可被索引命中：通过 `vuri/project/type` 与 `latestByObjectRef`，可定位对应 `LayerPegDocument`。
