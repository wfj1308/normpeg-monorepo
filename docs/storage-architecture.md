# Storage Architecture（第 7 层存储与锚定层）最小正式模型（v0）

更新时间：2026-04-24  
范围：把当前“内部文件/表/内存 Map”提升为正式存储分层，明确 `spec store / project state store / proof store / object store` 四类边界。

## 1. 目标

构建第 7 层正式存储架构，满足以下原则：

1. 规范、项目状态、Proof、原始对象不再混放。
2. 存储职责明确，接口稳定，后端驱动可替换（memory/local/s3/db）。
3. 上层执行引擎与 API 不直接依赖具体存储实现细节。

## 2. 四类存储边界

### 2.1 Spec Store（规范存储服务）

职责：

1. 持久化规范资产主数据：`NormDoc / SpecIR / SPUDefinition / VersionRecord`。
2. 提供按 `spuId / spuKey / version` 的解析与版本路由。
3. 只管理“可执行规范资产”，不保存运行态节点、Proof 结果。

边界外：

1. PDF 原始文件、导出包二进制由 `Object Store` 承载。
2. 规范执行结果与状态流转由 `Project State Store`/`Proof Store` 承载。

### 2.2 Project State Store（项目状态存储）

职责：

1. 持久化项目运行态状态根：`ProjectUTXO / Fork-Split-Merge / SpaceSlot / SpaceContainer / VolumeContainer`。
2. 持久化执行上下文状态：`ExecutionNode(去 Proof 正文) / Mapping / ProjectContext / Binding`。
3. 提供按 `projectId / stake / containerId / nodeId` 的查询与回写。

边界外：

1. Proof 正文、Proof 链、Anchor 结果不放在此库（只保存 `proofId/proofRef`）。
2. 原始附件与导出二进制不放在此库（只保存 `objectKey/objectRef`）。

### 2.3 Proof Store（Proof 存储）

职责：

1. 持久化 `NodeProof / ContainerProof / ProofChainLink / ProofAnchorReference / AuditTrail`。
2. 提供按 `proofId / nodeId / containerId / projectId` 的可追溯查询。
3. 保证 Proof 版本不可变（append-only），支持验证链路回放。

边界外：

1. 业务运行态主状态不由 Proof Store 负责。
2. 大文件证据本体（PDF、图片、音视频）放 Object Store，Proof Store 仅存引用与哈希。

### 2.4 Object Store（对象存储）

职责：

1. 存储原始文件与二进制对象：PDF、上传附件、导出包、日志归档、报告文件。
2. 提供 `put/get/head/delete/presign` 能力与生命周期策略。
3. 为 Spec/State/Proof 三类数据提供对象引用（`objectKey/url/hash/size`）。

边界外：

1. 不承担业务主键关系，不承担状态机与规则查询。
2. 不替代 Spec/State/Proof 元数据主库。

## 3. 每类对象的最小持久化接口

### 3.1 Spec Store Interface

```ts
interface SpecStore {
  saveSpu(definition: SPUDefinition): Promise<void>;
  getSpuById(spuId: string): Promise<SPUDefinition | null>;
  listSpus(filter?: { classification?: string; norm?: string }): Promise<SPUDefinition[]>;

  listSpuVersions(spuKey: string): Promise<SpuVersionRecord[]>;
  resolveSpuVersion(spuKey: string, selector: SpuVersionSelector): Promise<SPUDefinition | null>;

  saveSpecAssetIndex(item: {
    spuId: string;
    normDocRef?: string | null;
    specIrRef?: string | null;
    bundleObjectRef?: string | null;
    updatedAt: string;
  }): Promise<void>;
}
```

### 3.2 Project State Store Interface

```ts
interface ProjectStateStore {
  saveProjectRoot(root: ProjectUTXO): Promise<void>;
  getProjectRoot(projectId: string): Promise<ProjectUTXO | null>;

  saveSlot(slot: SpaceSlot): Promise<void>;
  saveContainer(container: SpaceContainer): Promise<void>;
  saveVolumeContainer(volume: VolumeContainer): Promise<void>;
  saveNodeState(node: ExecutionNode): Promise<void>; // 只保存状态与引用，不内嵌 proof 正文

  saveMapping(entry: MappingEntry): Promise<void>;
  getMappingByStake(projectId: string, stake: string): Promise<MappingEntry | null>;
  getMappingByContainer(containerId: string): Promise<MappingEntry | null>;
  getMappingByNode(nodeId: string): Promise<MappingEntry | null>;

  saveProjectContext(context: ProjectContext): Promise<void>;
  listProjectContexts(): Promise<ProjectContextSummary[]>;
}
```

### 3.3 Proof Store Interface

```ts
interface ProofStore {
  appendNodeProof(proof: NodeProof): Promise<void>;
  appendContainerProof(proof: ContainerProof): Promise<void>;

  getProofById(proofId: string): Promise<FinalProof | null>;
  getProofByNodeId(nodeId: string): Promise<NodeProof | null>;
  getProofByContainerId(containerId: string): Promise<ContainerProof | null>;
  listProofsByProject(projectId: string): Promise<FinalProof[]>;

  saveProofChainLink(proofId: string, chain: ProofChainLink): Promise<void>;
  saveProofAnchorReference(proofId: string, anchor: ProofAnchorReference): Promise<void>;
  appendAuditEvent(event: AuditEvent): Promise<void>;
}
```

### 3.4 Object Store Interface

```ts
interface ObjectStore {
  putObject(input: {
    key: string;
    contentType: string;
    body: Uint8Array;
    metadata?: Record<string, string>;
  }): Promise<{ key: string; etag?: string; size: number }>;

  getObject(key: string): Promise<{ body: Uint8Array; contentType: string; metadata: Record<string, string> } | null>;
  headObject(key: string): Promise<{ exists: boolean; size?: number; contentType?: string }>;
  deleteObject(key: string): Promise<void>;
  createPresignedUrl(input: { key: string; method: "GET" | "PUT"; expiresInSec: number }): Promise<string>;
}
```

## 4. 当前代码存储位置归类（现状盘点）

### 4.1 Spec Store（当前）

1. `apps/executable-spec-web/src/platform/norm/registry.ts`
2. `NormRegistry.map: Map<string, SPUDefinition>`
3. 现状：以内存为主，进程重启后丢失；尚无独立 DB/Repo 适配层。

### 4.2 Project State Store（当前）

1. `apps/executable-spec-web/src/platform/workflow/platform-service.ts`
2. `state: PlatformState`（`slots/containers/nodes/externalInputSources/mappingEntries`）
3. `projectBindings / projectBindingHistory / projectContexts / specPatchRecords` 也在内存 Map 中
4. `layerPegDocuments: Map<string, LayerPegDocumentRecord>` 当前由 `PlatformService` 内存维护
5. `apps/executable-spec-web/server/services/tenant_platform_registry.ts` 维护租户级 `Map<string, TenantEntry>`
6. `apps/executable-spec-web/server/quality-api.ts` 以 `containerStore` 内存 Map 维护独立 demo/简化运行态
7. 现状：运行态集中在服务内存，尚未抽象为独立状态库。

### 4.3 Proof Store（当前）

1. `apps/executable-spec-web/src/platform/workflow/platform-service.ts`
2. `state.proofs: Record<string, ContainerProof>` + `node.proof` 嵌入节点对象
3. `apps/executable-spec-web/src/platform/audit/event-store.ts`：`events[]` 内存审计流
4. `apps/executable-spec-web/src/platform/proof/anchor-service.ts`：`MockAnchorProvider.records` 与 `MockAnchorService.receipts` 内存锚定记录
5. 现状：Proof、审计、锚定均在内存结构，缺少独立 Proof Repo 与不可变持久层。

### 4.4 Object Store（当前）

1. `apps/executable-spec-web/server/services/execution_log_file_store.ts`：执行日志 JSON 落盘
2. `apps/executable-spec-web/server/platform-api.ts`：`exportedBundleStore: Map<string, Buffer>`（导出包下载缓存，内存）
3. `apps/executable-spec-web/server/config/app-config.ts`：对象存储配置（`local/s3/gcs/azureblob/minio`）已就绪
4. 现状：配置已具备多驱动形态，但对象落库适配器尚未全面接入业务读写路径。

## 5. 分层收敛规则（正式化）

1. 规范写入只走 `SpecStore`；运行态服务不得直接维护规范主数据 Map 作为权威源。
2. 项目状态写入只走 `ProjectStateStore`；节点对象中仅保留 `latestProofId/latestProofRef`，Proof 正文移交 `ProofStore`。
3. Proof 生成后必须 `append` 到 `ProofStore`，并回写 `ProjectStateStore` 的 Proof 摘要。
4. 所有二进制与原始文件（PDF/导出/日志归档）必须走 `ObjectStore`，业务库只存引用和哈希。
5. `LayerPegDocument` 与 `DocumentLedger` 作为跨库索引层，不替代四类底层存储职责。

## 6. 最小迁移顺序（建议）

1. 定义四类接口与内存实现（Adapter v0），替换直接读写内部 Map。
2. 增加 `LocalFileObjectStore + Sqlite/Postgres` 实现，完成 dev/staging 落盘。
3. 将 `Proof` 从 `node/container` 主状态中拆为引用字段，正文入 `ProofStore`。
4. 将导出包与上传文件统一切换到 `ObjectStore`，下线 `exportedBundleStore` 内存缓存。

## 7. 验收对照

1. 规范、项目状态、Proof、原始文件不再混放：四类边界与接口已明确，写入路径分离。
2. 存储职责清晰：每类存储的对象范围、查询维度、回写责任和边界外内容均已定义。
