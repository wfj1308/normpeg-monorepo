# v:// 最小正式协议规范（vURI）

## 1. 目标
- 将 `v://` 从概念地址升级为可执行协议层，提供统一的生成、解析、校验、归一化能力。
- 为核心对象（`container / node / proof`）提供稳定可追溯地址。
- 让 Mapping 查询与 Proof 文档导出可直接引用 `vuri`。

## 2. URI 结构

基础结构：

```text
v://{project-id}/{target-path}?version={version}&layer={layer}&time={time}
```

其中：
- `project-id`：项目根标识，必填。
- `target-path`：目标路径，支持：
  - 项目根：`(empty)`  
  - 桩号/区间：`stake/{stake-range}`
  - 容器：`container/{container-id}`
  - 节点：`node/{node-path}`
  - 证明：`proof/{proof-id}`
- query 参数（可选）：
  - `version`
  - `layer`
  - `time`（unix 时间戳或 ISO 时间）

## 3. 地址类型示例

```text
v://GXX-2024-XXX
v://GXX-2024-XXX/stake/K15+200-K15+260?version=hash_a1&layer=subgrade&time=1713196800
v://GXX-2024-XXX/container/container_001
v://GXX-2024-XXX/node/container_001/node_abc
v://GXX-2024-XXX/proof/proof_123456
```

## 4. 协议能力

实现位置：
- `apps/executable-spec-web/src/platform/vuri/vuri.ts`

提供能力：
- `parseVuri(vuri)`：解析 `projectId / targetKind / target id / query`。
- `validateVuri(vuri)`：校验结构、目标路径合法性、`time` 格式。
- `normalizeVuri(vuri)`：归一化输出（路径编码一致、query 顺序固定为 `version -> layer -> time`）。
- 生成器：
  - `buildProjectRootVuri`
  - `buildStakeVuri`
  - `buildContainerVuri`
  - `buildNodeVuri`
  - `buildProofVuri`

## 5. 对象接入

已为以下对象增加 `vuri` 字段并在运行时写入：
- `SpaceContainer.vuri`
- `ExecutionNode.vuri`
- `FinalProof.vuri`（含 `NodeProof / ContainerProof`）

写入时机：
- 创建 container 时生成 container vuri。
- 创建 node 时生成 node vuri。
- 生成 node/container final proof 时生成 proof vuri。

## 6. Mapping 与文档输出接入

Mapping 接口增加可引用 `vuri` 字段：
- `MappingContainerRef.vuri`
- `MappingNodeRef.vuri`
- `MappingActiveProof.vuri`

Proof 导出文档引用（LayerPeg refs）优先使用 `vuri` 作为 `sourceRef`：
- execution ref：优先 `node.vuri`
- proof ref：优先 `proof.vuri`，其次 `container.vuri`

## 7. 兼容策略
- 历史 `vAddress` 字段继续保留（兼容旧逻辑/旧数据）。
- 新增 `vuri` 不改变原有 Gate、State、Proof 主流程。
- 对于缺少项目上下文的对象，使用默认 `project-unscoped` 作为项目根，保证地址可生成、可解析。
