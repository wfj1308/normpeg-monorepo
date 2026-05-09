# Architecture Conformance（0~8 层一致性检查与收口）

更新时间：2026-04-24  
检查范围：`docs/layerpeg_normref_architecture_complete.md`（8 层基线）对照当前实现（`backend/app`、`apps/executable-spec-web`、`apps/executable-spec-api`、`apps/nl2gate-api` 与 `docs/*.md`）

## 1. 判定口径

- 已完成：该层关键能力已有可运行实现，且可通过接口/服务调用。
- 部分完成：已有核心能力，但对象模型、接口一致性或持久化治理未闭环。
- 仍缺失：当前仓库仅有概念/文档，缺少可运行实现。

## 2. 0~8 层完成度矩阵

| 层级 | 架构目标（摘要） | 现状证据（代码/文档） | 状态 | 收口结论 |
| --- | --- | --- | --- | --- |
| 0 用户/参与方层 | 面向施工、监理、专家、管理与外部系统协作 | `apps/executable-spec-web/server/services/authorization_service.ts` 角色权限；`backend/app/main.py` 参与方相关 API（如 `did/trip/sign`） | 部分完成 | 角色与权限可运行，但“参与方主数据+跨系统接入契约（BIM/ERP/IoT）”未统一建模 |
| 1 入口层 | PegBot / FormPeg / MarkUnit / PegUnit / CSD / CLI/API Gateway | `apps/executable-spec-web/src/SPUApp.tsx`、`apps/executable-spec-web/server/platform-api.ts`；`docs/markunit-pegunit-csd.md` | 部分完成 | Form/执行入口成熟；C 线（MarkUnit/PegUnit/CSD）以文档规范为主，正式 API/产品入口未统一 |
| 2 AI 层 | NL2Gate、参数抽取、受控编排与解释生成 | `apps/executable-spec-web/server/services/nl2gate_bridge_service.ts`、`/api/nl2gate/query`；`backend/app/main.py` `/api/v1/layer3/query` | 部分完成 | AI 受控入口可用，但多栈并存，术语映射与多模态能力未收口到单一内核 |
| 3 执行层 | Registry / Path / Gate / State / Proof 闭环 | `apps/executable-spec-web/src/platform/runtime/execution-engine.ts`、`platform-service.ts`；`backend/app/core/*`（path/gate/state/proof） | 已完成 | 执行主链可运行，具备“算-判-流转-存证”最小正式能力 |
| 4 规范层 | NormDoc / SpecIR / SPU / Override / 版本治理 | `apps/executable-spec-web/src/spec-compiler/*`、`/api/spec/register-markdown`、`/api/spec/pdf-to-draft`；`backend/app/main.py` `/api/v1/normdoc/compile-spu` | 部分完成 | 规范编译与版本流程已可用；统一规范资产库与术语库仍未形成单一权威存储 |
| 5 协议层 | v://、ProjectUTXO、Fork/Split/Merge、Space/Volume、Mapping | `apps/executable-spec-web/src/platform/vuri/vuri.ts`；`apps/executable-spec-web/src/layerpeg/project-utxo.ts`；`backend/app/services/project_utxo_service.py` 与 `/api/v1/branch/*`、`/api/v1/utxo/split`；`backend/app/services/space_context_service.py`、`mapping_service.py` | 部分完成 | 协议能力已分段落地，但 Web/Backend 两套对象模型并存；审计字段与统一语义仍不一致 |
| 6 文档协议层 | Header/Gate/Body/Proof/State 统一文档协议与索引 | `apps/executable-spec-web/src/layerpeg/document.ts`、`transformer.ts`、`/api/layerpeg/documents*`；`docs/document-ledger.md` | 部分完成 | LayerPegDocument 已可生成与查询；DocumentLedger 的 `vuri/project/type` 统一账本索引尚未完全实装 |
| 7 存储层 | spec store / project state store / proof store / object store + 外部锚定 | `apps/executable-spec-web/server/config/app-config.ts`、`.env.example`、`execution_log_file_store.ts`；`apps/executable-spec-web/src/platform/proof/anchor-service.ts`（mock + IPFS） | 部分完成 | 分层边界已定义且有配置入口；持久化仍以内存/本地为主，四类 Store 接口化改造未完全落地 |
| 8 服务/API 层 | 完整服务矩阵（含 webhook/sync/export/identity/asset） | `backend/app/main.py` 已有 `/api/v1/boq`、`/price`、`/contract/payment`、`/did`、`/trip`、`/sign`、`/webhook/subscribe`、`/sync/*`、`/export/project`；`apps/executable-spec-web/server/platform-api.ts` 提供执行/规范/proof/mapping 公共 API | 部分完成 | 能力覆盖面已较全，但接口分散在多栈，版本与契约未统一，存在重复实现与行为差异 |

## 3. 完成度统计（层级）

- 已完成：1 / 9（第 3 层）
- 部分完成：8 / 9
- 仍缺失：0 / 9（按整层评估）

## 4. 仍缺失能力（能力项视角）

以下能力虽然所在层“部分完成”，但能力本身仍缺失或未闭环：

1. 单一权威 API 基线缺失：`backend/app/main.py` 与 `apps/executable-spec-web/server/platform-api.ts` 存在并行能力与契约差异。
2. ProjectUTXO 统一语义缺失：Web 与 Backend 的 UTXO/Fork/Split/Merge 字段与审计结构不完全一致。
3. 空间三分层未完全一致：`SpaceSlot/SpaceContainer` 已有实现，但 `VolumeContainer` 在 Web 栈仍偏弱。
4. Mapping Full Kernel 未完全收口：按 `stake/vuri/project-range` 的统一查询与回写在多栈中实现深度不同。
5. Document Ledger 未形成统一账本索引：`vuri/project/type` 三维索引与跨对象反查尚未统一到运行时。
6. 四类存储接口仍未完全落地：`SpecStore/ProjectStateStore/ProofStore/ObjectStore` 仍以“边界文档+局部实现”为主。
7. C 线（MarkUnit/PegUnit/CSD）仍缺正式产品 API 闭环：当前更多是文档定义和现有能力拼装。
8. 身份签名与审批流尚未全链绑定：`did/trip/sign` 已有端点，但与 Proof/审批的统一签名账本仍需收口。

## 5. 收口基线（建议）

### P0（先统一，不再分叉）

1. 固化“唯一主服务契约”：明确 `backend/app/main.py` 或 `platform-api.ts` 为权威入口，另一侧仅做适配层。
2. 建立“架构层 -> API -> 对象模型 -> 存储”映射清单（纳入 CI 校验）。
3. 冻结 0~8 层命名与字段基线，禁止同名异义新增。

### P1（补齐关键缺口）

1. 协议层统一：ProjectUTXO、Fork/Split/Merge、Space/Volume、Mapping 字段与审计模型统一。
2. 文档层统一：实装 `DocumentLedgerEntry` 三维索引（`vuri/project/type`）。
3. 存储层统一：四类 Store 接口落地并替换内存权威源。
4. 服务层统一：webhook/sync/export、identity、asset 统一到同一契约版本。

### P2（工程治理）

1. 增加架构一致性回归测试（按 0~8 层能力点验收）。
2. 每个新增功能必须标注所属层与回写到本文件矩阵。

## 6. 结论

当前系统已具备可运行的执行内核与较完整的 API 能力覆盖，但“多栈并行 + 契约分叉”是主要一致性风险。  
本文件给出可执行收口基线：先统一权威契约，再按协议层/文档层/存储层依次收口，确保后续开发持续对齐 0~8 层架构目标。
