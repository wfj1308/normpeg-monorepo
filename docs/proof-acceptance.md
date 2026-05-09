# Proof 验收凭证（最小可用版）

## 目标

将 `Proof` 从“系统内部 JSON”升级为“可直接用于工程验收/审计的凭证包”，同时保持现有执行主链不变：

`NormDoc -> SpecIR -> SPU -> Gate -> State -> Proof`

## 1. 验收凭证输出结构

系统在导出时生成 `acceptanceCertificate`，核心字段如下：

- `projectId`：项目标识
- `stake`：桩号/位置
- `containerId`：容器标识
- `executionId`：执行实例标识
- `spuId`：对应 SPU
- `inputData`：输入数据快照
- `decisionResult`：判定结果（PASS/FAIL/BLOCK/PENDING + 规则统计）
- `normReferences`：规范引用（`norm/clause/version/title`）
- `signatures`：签字信息
- `archive`：验收归档状态（`archived/archivedAt`）
- `integrity`：完整性字段（见第 4 节）

## 2. 双格式输出（系统 + 人类）

导出接口统一返回三类载荷：

- `jsonExport`（系统对接）
  - 含完整 `acceptanceCertificate`
  - 含 `integrity` 字段，便于机器校验
- `markdownSummary`（人类可读）
  - 验收范围、判定结果、规范引用、签字、时间、完整性摘要
- `pdfReadyPayload`（PDF-ready）
  - 结构化模板数据，当前先输出 payload，不强制服务器侧生成 PDF 文件

## 3. 一键导出与验收归档

### 已支持接口

- 导出（已有）  
  `POST /api/proof/export`  
  `POST /api/public/v1/proofs/export`

- 一键归档并导出（新增）  
  `POST /api/proof/archive-export`  
  `POST /api/public/v1/proofs/archive-export`

### 一键归档导出行为

1. 对 `containerId` 执行归档（可选 anchor 参数）
2. 生成最终 `proof`
3. 同步生成验收导出包（JSON + Markdown + PDF-ready）
4. 返回 `proof + exportPackage`，可直接进入验收归档系统

## 4. 防篡改（hash）

导出包包含双层完整性信息：

- `proofHash`：原始 proof 的 SHA-256 哈希（final proof 优先使用已写入 hash）
- `exportHash`：导出包的 SHA-256 哈希（基于规范化导出内容计算）
- `hashAlgorithm`：固定为 `sha256`
- 可选锚定信息：`anchorProvider`、`anchorRef`

这保证：

- 可以验证“proof 本体”是否被改动
- 可以验证“导出内容”是否被改动
- 外部系统无需理解全部内部字段也能做完整性校验

## 5. 可验收性说明

当前实现满足以下验收目标：

- Proof 不再只是日志，已具备工程验收凭证结构
- 同时提供机器消费（JSON）与人工审阅（Markdown/PDF-ready）能力
- 支持一键归档导出，便于现场闭环
- 具备 hash 防篡改基础，可直接用于审计链路
