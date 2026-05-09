# MarkUnit / PegUnit / CSD（C 线）最小闭环模型（v0）

更新时间：2026-04-24  
范围：补齐交互与产品入口层 C 线最小能力，形成“案例 -> 编辑 -> 生成草稿”闭环。

## 1. 目标与边界

目标：

1. MarkUnit 可进行最小 Markdown 编辑，并插入 `LayerPegDocument / Proof / Spec` 引用。
2. PegUnit 可浏览最小案例库（已归档 container/proof/spec），并支持 fork 出新草案。
3. CSD 可基于 `container + active specs + runtime state` 生成最小施工组织设计草稿。

边界（v0 不做）：

1. 不做复杂多人协同编辑冲突合并。
2. 不做完整知识推荐与相似度排序引擎。
3. 不做复杂工期成本优化，只输出最小可执行草稿。

## 2. MarkUnit：最小 Markdown 编辑器

### 2.1 最小对象

```ts
type MarkUnitRefType = "layerpeg_document" | "proof" | "spec";

type MarkUnitReference = {
  refId: string;                        // 本地引用 id
  type: MarkUnitRefType;
  sourceId: string;                     // usi / proofId / spuId
  sourceRef: string;                    // 例如 spec:xxx / container:xxx
  vuri?: string | null;
  title?: string | null;
  resolvedAt: string;
};

type MarkUnitDraft = {
  draftId: string;
  projectId: string;
  title: string;
  markdown: string;
  references: MarkUnitReference[];
  sourceCaseId?: string | null;         // PegUnit fork 来源
  status: "DRAFT" | "FORKED" | "GENERATED";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
```

### 2.2 引用插入语法（最小）

```text
[[layerpeg:usi=<USI>]]
[[proof:id=<PROOF_ID>]]
[[spec:spuId=<SPU_ID>]]
```

解析规则：

1. `layerpeg`：解析到 `GET /api/layerpeg/documents/:usi`。
2. `proof`：优先 `proofId` 解析，无法直达时可经 `containerId -> /api/containers/:id/proof`。
3. `spec`：解析到 `GET /api/registry/spus` 或 `GET /api/layerpeg/spec/:spuId`。

### 2.3 最小操作

1. 新建草稿：`createDraft(projectId, title)`
2. 编辑 Markdown：`updateDraftMarkdown(draftId, markdown)`
3. 插入引用：`insertReference(draftId, token)`
4. 引用解析预览：`resolveReferences(draftId)`（返回引用卡片）
5. 导出草稿：`export markdown/json`

### 2.4 与现有能力映射

可直接复用：

1. 编辑组件：`MarkdownSpecImportPanel.tsx`（textarea）与 `MarkdownRenderer.tsx`。
2. LayerPeg 文档索引：`GET /api/layerpeg/documents`、`GET /api/layerpeg/documents/:usi`。
3. Spec 注册链路：`POST /api/spec/register-markdown`（草稿可转可执行规范）。

## 3. PegUnit：最小案例库与 Fork

### 3.1 最小案例对象

```ts
type PegUnitCaseEntry = {
  caseId: string;
  projectId: string | null;
  title: string;
  tags: string[];
  archivedAt: string;

  archivedContainerRefs: Array<{
    containerId: string;
    vuri?: string;
    lifecycleState: "ARCHIVED";
  }>;

  proofRefs: Array<{
    proofId: string | null;
    proofHash: string | null;
    containerId: string | null;
    status: "PASS" | "FAIL" | "BLOCK" | "PENDING";
    generatedAt: string | null;
  }>;

  specRefs: Array<{
    spuId: string;
    version?: string | null;
    sourceRef?: string | null;
  }>;
};
```

### 3.2 最小浏览能力

1. 浏览归档容器：`GET /api/containers` 后按 `lifecycleState=ARCHIVED` 过滤。
2. 浏览归档 proof：`GET /api/containers/:id/proof`，或 `GET /api/layerpeg/documents?docType=proof`。
3. 浏览 spec：`GET /api/registry/spus` / `GET /api/registry/spu-versions` / `GET /api/layerpeg/documents?docType=spec`。

### 3.3 Fork 出新草案

```ts
type PegUnitForkAction = {
  forkId: string;
  caseId: string;
  targetProjectId: string;
  newDraftId: string;
  sourceRefs: string[];                 // container/proof/spec refs
  reason: string;
  operator: string;
  createdAt: string;
};
```

最小行为：

1. 从 `PegUnitCaseEntry` 复制标题、关键段落模板与 refs。
2. 生成 `MarkUnitDraft(status=FORKED, sourceCaseId=caseId)`。
3. 写入 `sourceRefs + reason + operator + createdAt`，保证追溯。

## 4. CSD：最小自动草稿生成

### 4.1 输入对象（最小）

```ts
type CSDDraftInputMinimal = {
  projectId: string;
  containerId: string;
  container: {
    geoSlotRef: string;
    lifecycleState: string;
    overallStatus: string;
  };
  activeSpecs: Array<{
    spuId: string;
    status: string;
    latestNodeId: string | null;
  }>;
  runtimeState: {
    phase: "idle" | "running" | "signing" | "completed";
    nextAction: "EXECUTE" | "RETRY_FAILED" | "WAIT" | "ARCHIVE_READY";
    nextSpuId: string | null;
    blockedBy: string[];
  };
};
```

### 4.2 输出对象（最小）

```ts
type CSDDraftMinimal = {
  csdDraftId: string;
  projectId: string;
  containerId: string;
  generatedAt: string;
  markdown: string;                     // 最小施工组织设计草稿
  sections: {
    basicContext: Record<string, unknown>;
    processChain: Array<Record<string, unknown>>;
    runtimeSuggestion: Record<string, unknown>;
    proofAndSpecRefs: string[];
  };
};
```

### 4.3 生成规则（基于现有运行时）

1. 拉取容器与节点：`GET /api/containers/:id`。
2. 拉取运行建议：`GET /api/runtime/minimal/next?containerId=...`。
3. 拉取调度建议：`GET /api/scheduler/next?containerId=...` 或 `GET /api/runtime/containers/:id/model`。
4. 组合 `container + active specs + runtime state` 生成 Markdown 草稿。
5. 将草稿写回 MarkUnit：`MarkUnitDraft(status=GENERATED)`。

## 5. C 线最小链路（案例 -> 编辑 -> 生成草稿）

```text
PegUnit 案例库（归档 container/proof/spec）
  -> Fork 为 MarkUnitDraft（保留 sourceRefs/reason/operator/timestamp）
  -> MarkUnit 编辑并插入 LayerPeg/Proof/Spec 引用
  -> CSD 读取 container + active specs + runtime state 自动生成草稿段落
  -> 输出 CSDDraftMinimal（markdown + refs）
```

## 6. 最小接口建议（v0）

在不破坏现有接口前提下，新增最小入口：

1. `POST /api/v1/markunit/drafts`：新建草稿
2. `PATCH /api/v1/markunit/drafts/:id`：更新 markdown 与引用
3. `POST /api/v1/pegunit/fork-draft`：从案例 fork 草稿
4. `POST /api/v1/csd/generate-draft`：生成 CSD 最小草稿

兼容复用现有：

1. `GET /api/containers`、`GET /api/containers/:id/proof`
2. `GET /api/layerpeg/documents`、`GET /api/layerpeg/documents/:usi`
3. `GET /api/registry/spus`、`GET /api/registry/spu-versions`
4. `GET /api/runtime/minimal/next`、`GET /api/scheduler/next`

## 7. 验收对照

1. C 线不再只是概念：  
`MarkUnitDraft + PegUnitCaseEntry + CSDDraftMinimal` 三类对象和最小操作已定义，且有现有接口映射。
2. 可以形成“案例 -> 编辑 -> 生成草稿”最小链路：  
已定义 fork、引用插入、runtime 驱动生成三步闭环，并要求全链路保留 `source refs` 与时间审计信息。
