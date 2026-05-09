# Docs 导航与归类清单

## 1) 当前状态

- 当前 `docs/` 下共 `39` 个 Markdown 文件（含本索引）。
- 已完成目录归类迁移，目标是“先清晰，再演进”。
- 本次保留原文档内容，不做语义改写。

## 2) 主入口

- 集成总方案：`docs/integration/layerpeg-fl-integration.md`
- 架构蓝图：`docs/architecture/architecture-blueprint.md`
- 联调清单：`docs/integration/api-integration-checklist.md`
- NormRef 总览：`docs/normref/OVERVIEW.md`
- 迁移映射：`docs/MIGRATION_MAP.md`

## 3) 目录结构（已落地）

### A. 架构与协议（`docs/architecture`）

- `docs/architecture/architecture-blueprint.md`
- `docs/architecture/docpeg-core-concepts-and-flow.md`
- `docs/architecture/normpeg-boq-docpeg-workflow.md`
- `docs/architecture/proof-utxo-rollout.md`
- `docs/architecture/rebar-live-closure-e2e.md`
- `docs/architecture/release-acceptance-engineering-standard.md`
- `docs/architecture/v-executor-protocol-foundation.md`

### B. 联调与集成（`docs/integration`）

- `docs/integration/api-integration-checklist.md`
- `docs/integration/docpeg-api-joint-debug-playbook.md`
- `docs/integration/docpeg-api-joint-debug-testcases.md`
- `docs/integration/erpnext-integration-methods.md`
- `docs/integration/layerpeg-fl-integration.md`
- `docs/integration/qcspec-docpeg-integration-status.md`
- `docs/integration/settlepeg-docpeg-boq-integration.md`

### C. 产品与交付（`docs/product`）

- `docs/product/product-requirements-web-mobile.md`
- `docs/product/product-jira-backlog-web-mobile.md`
- `docs/product/product-delivery-plan-web-mobile.md`
- `docs/product/labpeg-les-smart-lab-execution-system.md`
- `docs/product/vpeg-les-smart-lab-execution-system.md`

### D. 重构专题（`docs/refactor`）

- `docs/refactor/refactor-progress-dashboard.md`
- `docs/refactor/refactor-step-1-structure-adapter-plan.md`
- `docs/refactor/refactor-step-2-proof-schemas-router-prefix-plan.md`
- `docs/refactor/refactor-step-3-core-domain-dependency-fix-plan.md`
- `docs/refactor/refactor-step-4-boqpeg-minimal-chain-plan.md`

### E. 模板标签（`docs/templates`）

- `docs/templates/docpeg-template-tags.md`
- `docs/templates/rebar-live-report-template-tags.md`

### F. 单项计划（`docs/plans`）

- `docs/plans/normref-parser-engine-p0-plan.md`
- `docs/plans/utxo-component-smu-remediation-plan.md`

### G. NormRef 规则体系（`docs/normref`）

- `docs/normref/OVERVIEW.md`
- `docs/normref/core@v1.md`
- `docs/normref/construction/highway@v1.md`
- `docs/normref/prompts/tab-to-peg-engine@v1.md`
- `docs/normref/qc/pile-foundation@v1.md`
- `docs/normref/qc/raft-foundation@v1.md`
- `docs/normref/qc/rebar-processing@v1.md`
- `docs/normref/qc/concrete-compressive-test@v1.md`
- `docs/normref/qc/template/general-quality-inspection@v1.md`
- `docs/normref/schema/qc-v1.md`
- `docs/normref/schema/docpeg-specir-v1.1.md`
- `docs/normref/spu/raft-foundation@v1.md`
- `docs/normref/std/jtg-f80-1-2017@2017.md`

## 4) 维护规则（建议）

1. 新文档优先放入对应分类目录，避免回到顶层平铺。
2. 每个主题只保留一个“active”主文档，旧稿转 `archive`（后续可加目录）。
3. 文档间引用统一使用新路径（见 `docs/MIGRATION_MAP.md`）。
