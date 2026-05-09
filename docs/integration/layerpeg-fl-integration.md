# LayerPeg / DocPeg 集成总方案（v1.0，2026-04）

## 1. 文档目标

本文将你前面给出的所有关键内容合并为一版可落地的总规范，覆盖：

- LayerPeg Protocol v1.0 最终规范
- DocPeg 最终组成与模块关系
- DocPeg / PegView / PegHMI 的定位与依赖
- LayerPeg-FL（联邦学习）完整结构
- DWG 逆向场景五层落地
- TripRole + DTORole 植入方案
- 与现有 DocPeg API 的联调落地清单（面向 QCSpec）

---

## 2. 三个产品的最终定位与关系

### 2.1 DocPeg

- 定位：主权文档操作系统（整个体系的大脑和神经中枢）
- 核心职责：提供 LayerPeg 五层协议、Proof 链、Gate 校验、State 状态机、NormRef 映射等底层能力
- 比喻：宪法 + 身份证系统 + 执行引擎

### 2.2 PegView

- 定位：图纸语义化与执行平台（眼睛 + 感知系统）
- 核心职责：负责 DWG 等图纸的解析、语义映射、LayerPeg 五层注入、图框智能显示、点击交互
- 比喻：把“死图纸”变成“活的可执行对象”

### 2.3 PegHMI

- 定位：人机交互与监控执行层（脸面 + 手脚）
- 核心职责：基于 PegView 和 DocPeg 的数据，构建实时监控大屏、移动巡检、操作面板等交互界面
- 比喻：把系统处理后的信息以人性化方式呈现，并允许人进行操作和控制

### 2.4 层级依赖关系

`PegHMI（操作界面） ← 消费数据 ← PegView（图纸执行） ← 调用协议 ← DocPeg（文档操作系统）`

- DocPeg 是基础，没有它就没有协议和可信能力。
- PegView 是桥梁，把图纸变成可执行的 LayerPeg 对象。
- PegHMI 是前端应用，负责最终用户交互。

---

## 3. DocPeg 最终完整组成公式

DocPeg =
LayerPeg（五层主权文档执行协议）
+ TripRole（执行角色系统）
+ DTORole（数据所有权角色系统）
+ Guard Agent（智能审查与自修正引擎）
+ Proof Chain（证明链管理器）
+ NormRef 映射引擎（规范自动映射与校验）
+ State Machine（状态机引擎）

这 7 个模块缺一不可，共同构成“可执行、可验证、可主权控制、可自我进化”的主权文档操作系统。

### 3.1 模块作用（精确版）

- LayerPeg：五层基础骨架（Header/Gate/Body/Proof/State），定义统一文档协议。
- TripRole：定义“谁在什么条件下执行什么动作”，让文档可执行。
- DTORole：定义数据所有权与细粒度权限，保障主权控制。
- Guard Agent：对 Gate、Trip、Proof、State 做智能审查与自动修正。
- Proof Chain：对关键动作存证，确保不可篡改与可追溯。
- NormRef 引擎：把 DWG/表单/代码映射为结构化字段并驱动规范校验。
- State Machine：驱动生命周期自动流转与后续动作触发。

### 3.2 对外定位文案

一句话：
DocPeg 是基于 LayerPeg 五层协议的主权文档操作系统，通过 TripRole、DTORole、Guard Agent、Proof Chain、NormRef 映射引擎和 State Machine，实现文档从生成到执行的全流程可验证、可主权控制和自我进化。

三句话：

1. DocPeg 以 LayerPeg 五层结构为核心，将任意文档变成可执行的主权资产。
2. 通过 TripRole 执行操作、DTORole 控制权限、Guard Agent 智能审查、Proof Chain 存证，确保每一份文档都可信、可控、可审计。
3. 它是 DocPeg、PegView、PegHMI、CodePeg 等产品的统一底层操作系统。

---

## 4. LayerPeg Protocol v1.0 最终规范（优化版）

- 全称：LayerPeg 主权文档执行协议
- 简称：LayerPeg
- 版本：v1.0（2026.04）
- 核心原则：最小指纹 + 侧链完整 + 主权可验 + 执行闭环

### 4.1 三层架构

`表现层（PegView / PegHMI） ← 调用 → 协议层（LayerPeg） ← 存储 → 数据层（本地 DWG + 侧链）`

### 4.2 五层结构（最终定义）

| 层级 | 名称 | 职责 | 存储位置 | 大小控制 |
| --- | --- | --- | --- | --- |
| Layer 1 | Header | 身份、主权、版本、时间 | XData 指纹 + 侧链 | 极小 |
| Layer 2 | Gate | 前置条件、校验规则、权限 | 侧链 | 中 |
| Layer 3 | Body | 业务内容（构件、代码、工序等） | 侧链 | 大 |
| Layer 4 | Proof | 证据链、签名、哈希 | 侧链 | 中 |
| Layer 5 | State | 生命周期、待办、当前状态 | 侧链 + 索引 | 小 |

### 4.3 XData 指纹（DWG 内嵌，<= 256 字节）

```text
[0x00-0x0F]  魔数 "LP10" + 版本 (4+4 bytes)
[0x10-0x1F]  Header ID 前缀 (16 bytes)
[0x20-0x2F]  Gate Hash 前缀 (16 bytes)
[0x30-0x3F]  Proof Hash 前缀 (16 bytes)
[0x40-0x5F]  Sidechain Anchor 前缀 (32 bytes)
[0x60-0xFF]  预留 (160 bytes)
```

完整五层数据全部存侧链（Arweave / IPFS），XData 只存最小指纹。

### 4.4 存储策略（关键优化）

- DWG 文件内：只存 XData 指纹（Header ID + Gate Hash + Proof Hash + Sidechain Anchor）
- 侧链：存完整 Protobuf 二进制 `LayerPegDocument`
- 数据库：存索引字段（如 `owner_did_prefix`、`doc_type`、`created_at`）

### 4.5 数据表达（双轨）

- 对外接口：JSON
- 对内传输与存储：Protobuf

### 4.6 安全与权限

- DID 签名（Ed25519 / ES256K）
- ThresholdSignature 多方签名（2/3、3/5 等）
- GateStep 顺序校验：Schema -> Signature -> Permission -> Precondition -> Timestamp

---

## 5. TripRole + DTORole 植入方案（DocPeg 升级核心）

### 5.1 TripRole（执行角色）

目标：定义“谁、在什么条件下、可执行什么动作”。

植入层：LayerPeg State。

```proto
message TripRole {
  string role_id = 1;
  string actor_did = 2;
  string action_type = 3;
  string target_component = 4;
  string precondition_hash = 5;
  google.protobuf.Timestamp deadline = 6;
  bool is_executed = 7;
  bytes execution_proof_hash = 8;
}
```

State 新增：

- `repeated TripRole pending_trips`
- `repeated TripRole completed_trips`

### 5.2 DTORole（数据所有权角色）

目标：定义“谁拥有数据权限”。

植入层：LayerPeg Header + Gate。

```proto
message DTORole {
  string owner_did = 1;
  string creator_did = 2;
  repeated string co_owners = 3;
  string permission_model = 4;
}

message DTOPermission {
  string actor_did = 1;
  string action = 2;
  bool allowed = 3;
  bytes condition_hash = 4;
}
```

Gate 新增：

- `repeated DTOPermission dto_permissions`

### 5.3 升级后的数据流

1. 创建文档 -> 生成 Header（含 DTORole）
2. 录入内容 -> Gate 按 DTORole + NormRef 自动校验
3. 生成待执行任务 -> 创建 TripRole
4. 执行 TripRole -> 生成 Proof -> 更新 State
5. 全程可审计、可追溯

### 5.4 实施优先级

- P0：协议中正式加入 TripRole/DTORole，并更新 Gate 双校验
- P1：打通 Trip 创建 -> 执行 -> Proof 闭环与接口
- P2：PegView/PegHMI 展示并操作 TripRole + DTORole

---

## 6. LayerPeg-FL（Federated Learning）完整集成

### 6.1 定位

协议全称：LayerPeg Protocol for Federated Learning（LayerPeg-FL）

目标：在“数据不出域”前提下，让联邦训练可验证、可审计、可主权控制、可自动审查、自我优化。

### 6.2 五层映射（FL）

- Header：任务身份（`fl_task_id`、`v_uri`、`round`、`participants`、模型版本）
- Gate：数据质量、隐私噪声、身份、性能门槛等前置规则
- Body：超参、客户端增量摘要、聚合策略、性能指标
- Proof：客户端证明哈希、全局模型哈希、多方签名、环境见证
- State：轮次生命周期、全局指标、下一步动作、版本演进

### 6.3 一轮联邦训练 JSON 示例

```json
{
  "header": {
    "fl_task_id": "FL-TASK-20260409-001",
    "v_uri": "v://cn.zhabei/fl/task/qwen2.5-engineering-001",
    "round": 7,
    "participants": ["v://cn.zhabei/client/site01", "v://cn.zhabei/client/site02"],
    "global_model_version": "v3.2"
  },
  "gate": {
    "pre_conditions": ["data_quality_passed", "privacy_noise_sufficient"],
    "entry_rules": ["local_accuracy >= 0.85", "update_delta_within_threshold"],
    "trigger_event": "local_training_completed"
  },
  "body": {
    "hyperparameters": {
      "learning_rate": 0.00002,
      "local_epochs": 3,
      "batch_size": 512
    },
    "aggregation_method": "FedAvg",
    "performance_metrics": {
      "local_accuracy": 0.87,
      "global_loss": 0.32
    }
  },
  "proof": {
    "proof_id": "FL-PROOF-20260409-007",
    "global_model_hash": "sha256:a3f7c2d8e9b1...",
    "client_proof_hashes": ["client01_proof_hash", "client02_proof_hash"],
    "signatures": ["site01_sig", "server_sig", "guard_agent_sig"]
  },
  "state": {
    "lifecycle_stage": "aggregation",
    "current_status": "running",
    "global_metrics": { "accuracy": 0.89 },
    "next_action": "trigger_guard_review",
    "version_history": ["v3.1", "v3.2"]
  }
}
```

### 6.4 Guard Agent 审查建议（FL）

- 更新幅度异常（是否疑似投毒）
- 参与方身份有效性
- 差分隐私参数是否达标
- 聚合前后性能是否异常回退
- Proof 链是否完整（签名、哈希、时间戳）

### 6.5 与 CodePeg 的结合

- FL 全局模型可作为 CodePeg 的推理/审查模型版本来源
- Guard Agent 在 CodePeg 中对代码生成结果进行规范审查
- 训练任务、模型版本、上线动作统一归档到 LayerPeg Proof + State

---

## 7. DWG 逆向场景的五层落地

- Header：自动生成 `v://` 主权地址
  - 示例：`v://cn.zhabei/project/bridge001/dwg/pile-foundation/K12-340`
- Gate：按 NormRef 自动校验逆向结果
  - 示例：钢筋间距是否符合 GB 标准、尺寸偏差是否在阈值内
- Body：图纸几何实体映射为业务对象
  - 一根桩基 -> 一个 Component
  - 钢筋分布 -> SKU 清单（数量/规格/位置）
  - 标注文字 -> 自动提取设计值
- Proof：生成不可篡改逆向证明链
  - 原始 DWG Hash + 逆向结果 Hash + 映射过程记录
- State：记录逆向状态并驱动后续流程
  - 已解析 / 待人工确认 / 已验证 / 已关联工序链
  - 可触发质检表生成、BOQ 更新、Trip 执行

---

## 8. Rust 模块场景示例（LayerPeg 对外 JSON）

```json
{
  "magic": "LAYERPEG",
  "spec_version": "1.0.0",
  "header": {
    "header_id": "550e8400-e29b-41d4-a716-446655440001",
    "owner_did": "did:ir8:org:zhongbei-engineering",
    "creator_did": "did:ir8:person:li-wei-001",
    "doc_type": "code_repository",
    "doc_subtype": "rust_module",
    "title": "工程规范检查模块",
    "description": "用于 Guard Agent 的代码规范自动审查",
    "created_at": "2026-04-09T14:30:00Z",
    "norm_ref": "normref://rust-style-guide/v1.2",
    "norm_ref_hash": "sha256:a1b2c3d4e5f6..."
  },
  "gate": {
    "validation_rules": [
      { "rule_id": "clippy", "rule_type": "lint", "required": true },
      { "rule_id": "test_coverage", "rule_type": "custom", "required": true, "expected_result": "coverage >= 85%" }
    ],
    "default_permission": "org",
    "is_open": true,
    "merkle_root": "sha256:gate-merkle-root..."
  },
  "body": {
    "content": {
      "repo_url": "https://github.com/zhongbei/layerpeg",
      "commit_hash": "a3f7c2d8e9b1...",
      "branch": "main",
      "language": "rust",
      "modules": [
        {
          "path": "src/guard.rs",
          "name": "guard_agent",
          "hash": "sha256:module-hash...",
          "dependencies": ["tokio", "serde"]
        }
      ],
      "lint_result_hash": "sha256:clippy-pass...",
      "test_result_hash": "sha256:tests-pass...",
      "coverage_hash": "sha256:coverage-92%"
    },
    "content_hash": "sha256:body-content-hash...",
    "content_encoding": "raw",
    "content_size": 12480,
    "business_data": {
      "purpose": "AI 生成代码的自动规范审查",
      "target_domain": "engineering_code"
    }
  },
  "proof": {
    "records": [
      {
        "sequence": 1,
        "proof_type": "creation",
        "actor_did": "did:ir8:person:li-wei-001",
        "timestamp": "2026-04-09T14:30:00Z",
        "data_hash": "sha256:creation-data...",
        "signature": "base64:..."
      },
      {
        "sequence": 2,
        "proof_type": "guard_review",
        "actor_did": "did:ir8:agent:guard-v1",
        "timestamp": "2026-04-09T14:32:00Z",
        "data_hash": "sha256:guard-result...",
        "signature": "base64:..."
      }
    ],
    "merkle_root": "sha256:proof-merkle-root..."
  },
  "state": {
    "current_status": "active",
    "valid_from": "2026-04-09T14:30:00Z",
    "pending_actions": [
      {
        "action_id": "deploy",
        "action_type": "execute",
        "required_actor_did": "did:ir8:org:zhongbei-devops"
      }
    ],
    "state_channel_id": "ch://code-review-realtime"
  },
  "document_hash": "sha256:full-document-hash...",
  "sidechain_anchor": "ar://TxLayerPegCode001",
  "owner_signature": "base64:OwnerSig..."
}
```

---

## 9. 对接 DocPeg API 的联调清单（QCSpec）

基地址：`https://api.docpeg.cn`

鉴权：沿用现有 `authorization / x-api-key`（按现网配置）。

常用参数：`projectId`、`chainId`、`component_uri`、`pile_id`、`inspection_location`。

### 9.1 工序链（QCSpec 主流程）

- `GET /projects/{projectId}/process-chains/status`
- `GET /projects/{projectId}/process-chains/{chainId}/summary`
- `GET /projects/{projectId}/process-chains/{chainId}/list`
- `GET /projects/{projectId}/process-chains/list`
- `GET /projects/{projectId}/process-chains/recommend`
- `GET /projects/{projectId}/process-chains/dependencies`
- `POST /api/v1/trips/preview`（兼容 `/trips/preview`）
- `POST /api/v1/trips/submit`（兼容 `/trips/submit`）

### 9.2 分项绑定

- `GET /projects/{projectId}/process-chains/bindings`
- `POST /projects/{projectId}/process-chains/bindings`
- `GET /projects/{projectId}/process-chains/bindings/by-entity?entity_uri=...`

### 9.3 NormRef 表单链路

- `GET /projects/{projectId}/normref/forms`
- `GET /projects/{projectId}/normref/forms/{formCode}`
- `POST /projects/{projectId}/normref/forms/{formCode}/interpret-preview`
- `POST /projects/{projectId}/normref/forms/{formCode}/draft-instances`
- `GET /projects/{projectId}/normref/forms/{formCode}/draft-instances/latest`
- `POST /projects/{projectId}/normref/forms/{formCode}/draft-instances/{instanceId}/submit`
- `GET /projects/{projectId}/normref/forms/{formCode}/latest-submitted`

### 9.4 签章与证明

- `POST /api/v1/signpeg/sign`
- `POST /api/v1/signpeg/verify`
- `GET /api/v1/signpeg/status/{docId}`

### 9.5 前端联调建议（落到现有业务）

1. 在现有质检/验收提交流程中嵌入，不新建独立“联调菜单”。
2. 表单提交时串联：`preview -> submit -> summary/recommend`。
3. 分项打开时先查 `bindings/by-entity` 自动补全 `chainId`。
4. 同步结果写回页面状态：`docpegSyncStatus`、`lastTripProof`。
5. 失败不阻断本地保存，但要给出明确重试入口和错误原因。

### 9.6 页面示例验证（测试阶段）

- 用例 A：仅本地保存（不启用 DocPeg）应成功。
- 用例 B：启用 DocPeg + 参数完整，提交后应出现 `trip/proof` 返回。
- 用例 C：故意缺少必填参数，`preview` 应返回 Gate 拒绝原因。
- 用例 D：按 `component_uri` 自动绑定链成功后再提交，验证状态推进。
- 用例 E：签章后用 `verify/status` 回查 `all_signed`、`proof_id`。

---

## 10. 当前状态建议

- 协议层：按本文件作为 v1.0 基线，不再分散多个“最终版”文档。
- 工程层：继续沿“嵌入现有 QCSpec 业务流”推进，不做独立测试菜单。
- 交付层：优先确保 `preview/submit` 闭环与失败可观测性，再补签章与侧链锚定自动化。


## 11. NormRef + LayerPeg 打通逻辑（核心模型）

### 11.1 核心关系

- NormRef = 规则库（Gate 的来源）
- LayerPeg = 执行容器（五层文档）

打通后的关系：

- Header：引用 NormRef 版本（如 `v://normref.com/...@v1`）
- Gate：直接从 NormRef 加载规则并实时校验
- Body：存放实际业务数据，同时记录引用的 NormRef 条款
- Proof：记录本次校验结果 + NormRef 版本快照
- State：根据 NormRef 规则决定下一 TripRole

### 11.2 统一结构（LayerPeg + NormRef 通用模板）

以下模板适用于合同、付款、质检、图纸等模块：

```json
{
  "magic": "LAYERPEG",
  "spec_version": "1.0",
  "header": {
    "header_id": "LP-20260409-合同-001",
    "doc_type": "contract",
    "owner_did": "did:ir8:org:zhongbei",
    "created_at": "2026-04-09T15:30:00Z",
    "project_ref": "v://cn.zhongbei/YADGS",
    "normref_version": "v://normref.com/std/JTG-F80-1-2017@v1.2"
  },
  "gate": {
    "normref_rules": [
      "v://normref.com/rule/contract/amount_must_match",
      "v://normref.com/rule/contract/party_must_sign"
    ],
    "validation_results": [
      { "rule": "amount_must_match", "passed": true, "message": "" },
      { "rule": "party_must_sign", "passed": false, "message": "甲方尚未签字" }
    ]
  },
  "body": {
    "content": {
      "contract_no": "HT-2026-001",
      "party_a": "中北工程",
      "party_b": "XXX施工单位",
      "total_amount": 35400127,
      "payment_terms": "...",
      "scope": "临潞至临汾高速LL5G-5标段"
    }
  },
  "proof": {
    "proof_id": "PF-20260409-001",
    "data_hash": "sha256:...",
    "signatures": [
      {
        "did": "did:ir8:executor:zhang-san",
        "role": "contractor",
        "signed_at": "2026-04-09T15:35:00Z"
      }
    ]
  },
  "state": {
    "lifecycle_stage": "draft",
    "next_action": "party_b_sign",
    "trip_history": []
  }
}
```

### 11.3 打通后的关键机制

- NormRef 驱动 Gate：文档创建或修改时，自动加载 NormRef 规则并校验。
- 版本控制：NormRef 升级后，历史文档仍绑定当时版本（Proof 记录快照），避免追溯失真。
- 自动 Trip：Gate 全通过后可自动触发下一 TripRole（如合同签订完成后触发首笔付款 Trip）。
- Proof 快照：每次校验都固化 NormRef 规则快照，保障审计可还原。

## 12. NormRef 与 LayerPeg 的正确集成方式（规则注入模型）

### 12.1 正确关系（不是简单调用）

- NormRef = 规则库（规范、标准、业务规则集中管理）
- LayerPeg = 执行容器（五层文档）

正确工作方式：

- LayerPeg 在校验或内容生成时，主动调用 NormRef API 拉取规则。
- 拉取到的规则被注入 LayerPeg 的 `gate/body/proof`。
- 这不是 LayerPeg 被动等待 NormRef，而是 LayerPeg 主动拉取规则并驱动执行闭环。

### 12.2 实际调用方式（推荐）

NormRef API 示例：

```http
GET  /api/normref/rule/{rule_id}
GET  /api/normref/rules?category=contract
POST /api/normref/validate
```

LayerPeg 内部调用示例：

```python
def apply_normref_to_layerpeg(layerpeg_doc):
    # 1) 根据文档类型拉取规则
    rules = normref_api.get_rules(
        category=layerpeg_doc['header']['doc_type'],
        version=layerpeg_doc['header'].get('normref_version')
    )

    # 2) 规则注入 Gate
    layerpeg_doc['gate']['normref_rules'] = rules

    # 3) 执行 Gate 校验
    validation_results = run_gate_validation(
        body=layerpeg_doc['body']['content'],
        rules=rules
    )
    layerpeg_doc['gate']['validation_results'] = validation_results

    # 4) 全通过后生成 Proof 并推进 State
    if all(r['passed'] for r in validation_results):
        layerpeg_doc['proof'] = generate_proof(layerpeg_doc)
        layerpeg_doc['state']['lifecycle_stage'] = "validated"

    return layerpeg_doc
```

### 12.3 推荐调用时机（关键）

- 创建文档时：自动拉取最新 NormRef 规则并填充 Gate。
- 修改 Body 时：重新触发 NormRef 校验并更新 Gate 结果。
- 执行 TripRole 时：必须通过当前 Gate 校验后才能继续。
- 生成 Proof 时：固化当时引用的 NormRef 版本快照，确保审计可追溯。

## 13. NormRef API 版本控制（生产级）

### 13.1 核心原则

- 规则按“单条规则独立版本”管理，不是整库同一版本。
- LayerPeg 文档必须记录当次使用的规则版本与快照。
- 规则可升级，但历史文档引用不变，保证审计可追溯。
- 调用支持“指定版本”与“latest”两种模式。

### 13.2 API 设计（推荐）

```http
GET  /api/normref/rules/{rule_id}?version={version}
GET  /api/normref/rules?category=contract&version=latest
GET  /api/normref/rules?category=contract&version=2026-03
POST /api/normref/validate
```

`POST /api/normref/validate` 请求体示例：

```json
{
  "rules": ["contract.amount_must_match", "contract.party_must_sign"],
  "data": {},
  "normref_version": "2026-04"
}
```

版本格式建议：

- 语义化版本：`v1.2.3`
- 日期版本（规范类优先）：`2026-04`
- 完整标识：`v://normref.com/rule/contract/amount_must_match@2026-04`

### 13.3 LayerPeg 侧实现（版本快照）

```json
{
  "header": {
    "normref_version": "2026-04",
    "rule_snapshots": {
      "contract.amount_must_match": {
        "version": "2026-04",
        "hash": "sha256:xxx",
        "content": "合同金额必须与BOQ一致"
      }
    }
  },
  "gate": {
    "validation_results": [
      {
        "rule_id": "contract.amount_must_match",
        "version_used": "2026-04",
        "passed": true
      }
    ]
  },
  "proof": {
    "normref_snapshot_hash": "sha256:all-rule-hashes"
  }
}
```

关键机制：

- Snapshot：固化规则内容哈希，后续规则升级不影响历史文档可验证性。
- Forward Compatibility：新规则字段可扩展，老文档照旧按原快照校验。
- Audit Replay：根据 Proof 可还原当时的规范版本与校验依据。

### 13.4 版本升级策略（建议）

- 新增规则：增加新 `rule_id`，不影响历史文档。
- 修改规则：发布新版本（如 `2026-04 -> 2026-05`），老文档继续用旧版本。
- 废弃规则：标记 `deprecated`，不物理删除。
- 强制升级：仅新建文档默认用最新版本，存量文档保持原版本。

### 13.5 可选实现（可忽略）

- 在 `validate` 返回里附带 `rule_content_hash`，减少 LayerPeg 二次查询。
- 增加 `compatibility_level`（strict/lenient）控制跨版本校验策略。
- 对高风险规则启用“变更审批流 + 生效窗口”。

## 14. NormRef API 版本控制（原始方案补录）

以下内容按你的原始方案保留，作为生产设计参考。

### 14.1 版本控制核心原则

- 每条规则都有独立版本（不是整个 NormRef 库一起版本）
- LayerPeg 文档记录当时引用的具体规则版本（快照机制）
- 支持规则升级，但历史文档不变（保证审计可追溯）
- 调用时可指定版本或使用最新版本（灵活 + 安全）

### 14.2 NormRef API 版本控制设计（推荐方案）

API 接口定义：

```http
# 1. 获取单条规则（支持版本）
GET /api/normref/rules/{rule_id}?version={version}

# 2. 获取一批规则（按类别 + 版本）
GET /api/normref/rules?category=contract&version=latest
GET /api/normref/rules?category=contract&version=2026-03

# 3. 批量校验（推荐最常用接口）
POST /api/normref/validate
Body:
{
  "rules": ["contract.amount_must_match", "contract.party_must_sign"],
  "data": { "...": "业务数据" },
  "normref_version": "2026-04"
}
```

版本格式（推荐）：

- 语义化版本：`v1.2.3`（主版本.次版本.修订）
- 日期版本：`2026-04`（推荐用于规范类规则）
- 完整标识：`v://normref.com/rule/contract/amount_must_match@2026-04`

### 14.3 LayerPeg 中的版本控制实现

当 LayerPeg 创建或更新文档时：

```json
{
  "header": {
    "normref_version": "2026-04",
    "rule_snapshots": {
      "contract.amount_must_match": {
        "version": "2026-04",
        "hash": "sha256:xxx",
        "content": "合同金额必须与BOQ一致"
      }
    }
  },
  "gate": {
    "validation_results": [
      {
        "rule_id": "contract.amount_must_match",
        "version_used": "2026-04",
        "passed": true
      }
    ]
  },
  "proof": {
    "normref_snapshot_hash": "sha256:所有引用的规则哈希汇总"
  }
}
```

关键机制：

- 快照（Snapshot）：LayerPeg 把当时使用的 NormRef 规则内容哈希记录下来，即使以后 NormRef 规则升级，历史文档仍保留当时的校验依据。
- 向前兼容：新版本规则可以增加字段，老版本文档仍能正常校验。
- 审计友好：任何时候扫码一个 Proof，都能精确还原当时使用的规范版本。

### 14.4 版本升级策略（实际操作建议）

- 新增规则：直接加新 `rule_id`，不影响老文档。
- 修改规则：创建新版本（如 `2026-04 -> 2026-05`），老文档继续使用旧版本。
- 废弃规则：标记 `deprecated`，但不删除，历史文档仍可追溯。
- 强制升级：只有新创建的 LayerPeg 文档默认使用最新版本，老文档保持不变。

## 15. NormRef 存储与调用结构（推荐）

NormRef = Markdown（人类可读） + JSON（机器可执行）

### 15.1 Markdown 文件（人类维护）

文件路径示例：

`normref/highway/JTG-F80-1-2017/桥施2表.md`

内容示例：

```markdown
# 桥施2表 - 钻孔灌注桩护筒（壁）、桩位检查

**规范来源**：JTG F80/1-2017 《公路工程质量检验评定标准》

## Gate 规则

### 1. 护筒埋设深度
- **字段**：burial_depth_m
- **规则**：burial_depth_m >= design_depth_m - 0.2
- **单位**：m
- **严重程度**：critical
- **不通过提示**：护筒埋深不足设计值0.2m以上，需整改

### 2. 桩位中心位置偏差
- **字段**：position_deviation_mm
- **规则**：position_deviation_mm <= 50
- **单位**：mm
- **严重程度**：critical
- **不通过提示**：桩位偏差超过50mm，不合格

### 3. 护筒垂直度
- **字段**：verticality_check_passed
- **规则**：verticality_check_passed == true
- **严重程度**：critical
- **不通过提示**：护筒垂直度不合格

## 使用说明
- 本规则适用于桥施2表的所有桩基检查。
- 所有检查项必须全部通过 Gate 才能生成 Proof。
```

### 15.2 对应 JSON（机器调用）

系统将 Markdown 解析为如下结构供 LayerPeg 调用：

```json
{
  "normref_id": "v://normref.com/std/JTG-F80-1-2017/bridge-casing@v1.0",
  "name": "桥施2表 - 钻孔灌注桩护筒（壁）、桩位检查",
  "source": "JTG F80/1-2017",
  "rules": [
    {
      "rule_id": "bridge.casing.burial_depth",
      "field": "burial_depth_m",
      "operator": "gte",
      "value": "design_depth_m - 0.2",
      "unit": "m",
      "severity": "critical",
      "fail_message": "护筒埋深不足设计值0.2m以上，需整改"
    },
    {
      "rule_id": "bridge.pile.position_deviation",
      "field": "position_deviation_mm",
      "operator": "lte",
      "value": 50,
      "unit": "mm",
      "severity": "critical",
      "fail_message": "桩位偏差超过50mm，不合格"
    },
    {
      "rule_id": "bridge.casing.verticality",
      "field": "verticality_check_passed",
      "operator": "eq",
      "value": true,
      "severity": "critical",
      "fail_message": "护筒垂直度不合格"
    }
  ],
  "applicable_tables": ["桥施2表"],
  "last_updated": "2026-04-09"
}
```

### 15.3 实际工作流程（推荐）

1. 人工维护：用 Markdown 编写规则，便于评审与迭代。
2. 自动解析：Parser 将 Markdown 转换为 JSON 规则集。
3. LayerPeg 调用：通过 API 或本地加载 JSON，执行 Gate 校验。
4. 版本控制：Markdown 与 JSON 都携带版本（如 `@v1.0`），用于审计回放。

## 16. NormRef Parser（Markdown -> JSON）

### 16.1 必要性

必须有规范解析器（NormRef Parser）。

没有 Parser，Markdown 只是“人类可读文档”；有 Parser 后，Markdown 才能转成 LayerPeg 可执行的 Gate 规则。

### 16.2 推荐书写规范（Markdown）

```markdown
# 桥施2表 - 护筒埋设与桩位检查

**规范来源**：JTG F80/1-2017

## Gate 规则

### 1. 护筒埋设深度
- **字段**：burial_depth_m
- **规则**： >= design_depth_m - 0.2
- **单位**：m
- **严重程度**：critical
- **失败提示**：护筒埋深不足设计值 0.2m 以上，需整改

### 2. 桩位中心位置偏差
- **字段**：position_deviation_mm
- **规则**： <= 50
- **单位**：mm
- **严重程度**：critical
- **失败提示**：桩位偏差超过 50mm，不合格
```

### 16.3 Parser 输出 JSON 示例

```json
{
  "normref_id": "v://normref.com/std/JTG-F80-1-2017/bridge-casing@v1.0",
  "name": "桥施2表 - 护筒埋设与桩位检查",
  "source": "JTG F80/1-2017",
  "rules": [
    {
      "rule_id": "bridge.casing.burial_depth",
      "field": "burial_depth_m",
      "operator": "gte",
      "value_expr": "design_depth_m - 0.2",
      "unit": "m",
      "severity": "critical",
      "fail_message": "护筒埋深不足设计值 0.2m 以上，需整改"
    },
    {
      "rule_id": "bridge.pile.position_deviation",
      "field": "position_deviation_mm",
      "operator": "lte",
      "value": 50,
      "unit": "mm",
      "severity": "critical",
      "fail_message": "桩位偏差超过 50mm，不合格"
    }
  ]
}
```

### 16.4 实现要点（轻量版）

- 按 `###` 标题识别规则块。
- 解析 `- **字段**`、`- **规则**`、`- **单位**`、`- **严重程度**`、`- **失败提示**`。
- 支持表达式规则（如 `>= design_depth_m - 0.2`）。
- 统一转换为机器可执行结构，供 LayerPeg Gate 调用。

## 17. 扫描规范文档自动生成 NormRef（可行性与落地方案）

### 17.1 可行性结论

可以实现“扫描规范文档 -> 自动生成 NormRef 规则”，但精度和完整性取决于输入质量与规则复杂度。

影响因素：

- 扫描质量：清晰 PDF/图片效果好，手写或模糊扫描效果差。
- 文档结构：标题、表格、列表越规范，解析成功率越高。
- 规则复杂度：简单数值规则（如“偏差 <= 50mm”）易提取；复杂条件规则需人工或 Agent 辅助。

当前最现实路径是“半自动”：

- OCR + AI 自动提取 80-90%
- 人工或 Agent 复核补齐 10-20%

### 17.2 推荐落地流程（可立即启动）

1. 扫描输入：上传规范 PDF/图片（如 JTG F80、JTG D20）。
2. OCR 解析：使用 PaddleOCR / Google Vision / 本地模型提取文字。
3. 结构化转换：由 Agent 将文本转为标准 Markdown 规则模板。
4. 生成 JSON：NormRef Parser 将 Markdown 转为 LayerPeg 可执行 JSON。
5. 审核确认：人工快速校验关键规则与阈值。
6. 入库发布：写入 NormRef 规则库并生成版本标签。

### 17.3 与当前体系的衔接

- 解析产物统一进入第 15 节定义的 `Markdown + JSON` 双轨结构。
- 版本管理沿用第 13/14 节：单规则独立版本 + 快照审计。
- LayerPeg 调用沿用第 12 节：规则注入 Gate，校验通过后推进 TripRole 与 Proof。

## 18. NormRef Agent 框架（可立即使用）

该框架面向 NormRef 的生产落地，核心目标：

- 把规范文档（PDF / Markdown / 表格）快速转化为可执行规则
- 支持规则校验与版本控制
- 支持质检表格反向修正（规则自动优化）
- 与 LayerPeg 无缝打通

### 18.1 整体架构

```text
NormRef Agent Framework
├── Parser Agent          → 规范文档 → 结构化 Markdown + JSON
├── Validator Agent       → 数据 + 规则 → Gate 校验结果
├── Updater Agent         → 质检数据 → 规则修正建议（反向优化）
├── Version Manager Agent → 规则版本控制 + 快照
└── Orchestrator          → 总控（协调以上 Agent）
```

所有 Agent 围绕 LayerPeg 五层工作，最终输出标准 JSON 供 LayerPeg 调用。

### 18.2 Parser Agent（规范解析 Agent）

功能：把 PDF / 图片 / Markdown 规范文档解析成结构化规则。

Prompt 模板：

```text
你是一个公路工程规范解析专家。
请把下面提供的规范内容解析成 NormRef 标准格式。

要求：
1. 每一条规则对应一个 rule_id（格式：bridge.xxx.yyy）
2. 包含 field、operator、value、severity、fail_message
3. 优先提取数值型、布尔型、范围型规则
4. 输出严格的 JSON 格式

规范内容：
[在这里粘贴 PDF 转出的文字或 Markdown]

输出只返回 JSON，不要解释。
```

### 18.3 Validator Agent（校验 Agent）

功能：把实际数据喂给 NormRef 规则并执行 Gate 校验。

Prompt 模板：

```text
你是一个规范校验 Agent。
给定以下 NormRef 规则和实际业务数据，请严格执行校验。

NormRef Rules:
{json rules here}

Business Data:
{json data here}

对每条规则输出：
- rule_id
- passed (true/false)
- actual_value
- expected
- message（不通过时给出明确提示）

最终返回数组格式。
```

### 18.4 Updater Agent（反向修正 Agent）

功能：从质检表格真实数据中反向优化 NormRef 规则。

Prompt 模板：

```text
你是一个规范优化 Agent。
现在有大量质检数据，请分析哪些规则需要调整。

当前规则：
{rules json}

质检数据统计（过去30天）：
{inspection_summary json}

请输出以下格式的修正建议：
{
  "rule_id": "...",
  "current_rule": "...",
  "suggested_change": "把允许偏差从 50mm 改为 60mm",
  "reason": "实际偏差集中在55-58mm，当前规则过于严格，失败率 42%",
  "new_value": "...",
  "confidence": 0.85
}
```

### 18.5 Version Manager Agent

功能：管理规则版本、生成快照、保证历史兼容。

Prompt 模板：

```text
你是一个 NormRef 版本管理 Agent。
当前规则即将更新，请生成新版本并保留旧版本快照。

旧版本：{old_rules}
新建议：{suggested_changes}

输出：
- 新版本号（如 2026-04-v2）
- 变更记录
- 完整新规则 JSON
- 历史快照（保留旧规则）
```

### 18.6 Orchestrator（总控 Agent）

功能：协调以上 Agent，形成完整闭环。

Python 骨架：

```python
class NormRefOrchestrator:
    def __init__(self):
        self.parser = ParserAgent()
        self.validator = ValidatorAgent()
        self.updater = UpdaterAgent()
        self.version_manager = VersionManagerAgent()

    def process_document(self, doc_path):
        # 1. 解析文档
        markdown = self.parser.parse(doc_path)
        rules = self.parser.to_json(markdown)

        # 2. 保存到规则库
        version = self.version_manager.save_new_version(rules)

        return rules, version

    def validate_data(self, data, rule_version):
        rules = self.version_manager.get_version(rule_version)
        return self.validator.run(rules, data)

    def reverse_optimize(self, inspection_data):
        # 质检数据反向修正
        suggestions = self.updater.analyze(inspection_data)
        return self.version_manager.apply_suggestions(suggestions)
```

结论：该框架可直接作为 NormRef Agent 的初始生产骨架，后续按项目规则密度与数据规模迭代增强。

## 19. NormRef 作为执行体（Executor）的 Trip-SPU 定义

NormRef 不仅是规则库，也可作为执行体（Executor）运行。其核心能力是提供可执行规范规则并完成规则校验闭环。

### 19.1 SPU 定义（能力单元）

```json
{
  "spu_id": "v://normref.com/executor@1.0",
  "spu_type": "norm_provider",
  "name": "公路工程规范执行体",
  "description": "提供JTG系列规范的结构化规则，并支持实时校验",
  "capabilities": [
    {
      "skill": "rule_retrieval",
      "description": "根据文档类型和版本返回对应规则集",
      "input": ["doc_type", "version"],
      "output": "rules_json"
    },
    {
      "skill": "gate_validation",
      "description": "对业务数据执行Gate校验",
      "input": ["data", "rule_ids"],
      "output": "validation_results[]"
    },
    {
      "skill": "reverse_optimize",
      "description": "根据质检数据反向优化规则",
      "input": ["inspection_data"],
      "output": "suggested_rule_changes"
    }
  ]
}
```

### 19.2 Trip-SPU 逻辑（执行过程）

```json
{
  "trip_id": "TRIP-NORM-20260409-001",
  "spu_ref": "v://normref.com/executor@1.0",
  "role": "norm_provider",
  "action": "provide_and_validate_rules",
  "input": {
    "doc_type": "bridge_construction_inspection",
    "version": "2026-04",
    "data_to_validate": {}
  },
  "gate": {
    "pre_conditions": ["normref_version_exists", "data_format_valid"],
    "rules": ["rule_set_integrity_check"]
  },
  "output": {
    "rules_applied": ["bridge.casing.burial_depth"],
    "validation_results": [],
    "proof_id": "PF-NORM-20260409-001"
  },
  "proof": {
    "proof_id": "PF-NORM-20260409-001",
    "data_hash": "sha256:...",
    "normref_snapshot_hash": "sha256:规则快照"
  },
  "state": {
    "lifecycle_stage": "completed",
    "next_action": null
  }
}
```

### 19.3 容器能力（Container Capabilities）

技能容器（Skills）：

- `rule_retrieval`（规则检索）
- `gate_validation`（实时校验）
- `reverse_optimize`（反向优化）
- `version_management`（版本控制）

证书（Certificates）：

- 规范来源证书（如 JTG F80/1-2017 来源证明）
- 规则准确性证书（由 Guard Agent 定期验证）
- 版本一致性证书

能耗（Energy / Cost）：

- 计算能耗：低（规则检索 + 简单校验）
- 存储能耗：中（规则快照 + 历史版本）
- 优化能耗：中（反向修正需要统计分析）

### 19.4 Trip 生命周期（NormRef 执行体）

1. 接收请求：Parser Agent 将规范文档转为规则。
2. Gate 检查：验证请求数据格式与权限。
3. 执行：提供规则或执行校验。
4. 生成 Proof：记录规则版本快照与校验结果。
5. 更新 State：写入执行状态。
6. 反向优化（可选）：根据质检反馈触发 Updater Agent。

## 20. NormRef Agent 框架最终版（完整架构）

```text
NormRef Agent Framework v1.0（最终完善版）
├── Parser Agent          → 规范文档（PDF/MD/图片） → 结构化 Markdown + JSON
├── Validator Agent       → 数据 + 规则 → Gate 校验结果
├── Updater Agent         → 质检数据 → 规则修正建议（反向优化）
├── Guard Agent           → 审核修正建议（最重要，新加）
├── Version Manager Agent → 版本控制 + 快照 + 兼容性
└── Orchestrator          → 总控协调 + 日志 + Proof 生成
```

### 20.1 Guard Agent（审查 Agent）完整定义

Guard Agent 是规则库的安全阀门，负责最终把关。

Guard Agent Prompt 模板（可直接使用）：

```text
你是一个严格的 NormRef Guard Agent，职责是保护规则库的安全性和稳定性。

当前规则版本：{current_version}
Updater Agent 提出的修正建议：
{suggestions_json}

请严格按照以下标准审核：

1. 安全性：修改是否会引入风险？（如放宽关键安全规则）
2. 合理性：建议是否有足够数据支持？（失败率、偏差分布）
3. 兼容性：修改是否会影响历史文档？
4. 必要性：当前规则是否确实需要调整？

输出严格 JSON 格式：
{
  "approved": true/false,
  "reason": "详细理由",
  "risk_level": "low/medium/high",
  "suggested_modification": { ...修改后的规则，如果批准... } 或 null,
  "decision_proof": "Guard 审核记录哈希"
}
```

Guard Agent 核心职责：

- 防止错误或恶意规则修改
- 记录每次审核的 Proof
- 仅在 Guard 批准后允许 Version Manager 生成新版本

### 20.2 完整闭环流程（可跑通）

1. Parser Agent 把规范文档转为规则 JSON。
2. Validator Agent 用规则对质检数据进行校验。
3. Updater Agent 分析质检数据并提出修正建议。
4. Guard Agent 审核建议（关键安全关卡）。
5. Version Manager 生成新版本并保留快照。
6. Orchestrator 把新规则推送给相关 LayerPeg 文档。
7. 生成整体 Proof，记录优化全过程。

### 20.3 Orchestrator 最终代码骨架（Python）

```python
class NormRefOrchestrator:
    def __init__(self):
        self.parser = ParserAgent()
        self.validator = ValidatorAgent()
        self.updater = UpdaterAgent()
        self.guard = GuardAgent()           # 新增
        self.version_manager = VersionManagerAgent()

    def full_process(self, norm_document_path, inspection_data=None):
        # 1. 解析规范
        rules = self.parser.process(norm_document_path)

        # 2. 如果有质检数据，进行校验和反向优化
        if inspection_data:
            validation = self.validator.run(rules, inspection_data)
            suggestions = self.updater.analyze(inspection_data, validation)

            # 3. Guard 审核（安全关卡）
            guard_decision = self.guard.review(suggestions, rules)

            if guard_decision["approved"]:
                new_rules = self.version_manager.create_new_version(
                    rules, guard_decision["suggested_modification"]
                )
                return new_rules, guard_decision
            else:
                return rules, {"status": "rejected_by_guard", "reason": guard_decision["reason"]}

        return rules
```

结论：这是 NormRef Agent 框架的最终完善版，具备“反向优化 + 审查把关 + 版本快照 + 全链路 Proof”能力。

## 21. TripRole 集成到 LayerPeg 的完整流程

### 21.1 统一集成流程（推荐）

1. 创建 Trip（用户或系统触发）。
2. 选择 TripRole 模板（如 `rebar_processing_and_installation` 或 `concrete_pouring`）。
3. 填充 `input_resources` 与 `executor`。
4. 系统自动加载 Gate 规则（来源于 NormRef）。
5. 执行 Gate 校验：Validator Agent 运行全部 `normref_rules` 并输出 `validation_results`。
6. 生成 Proof：
   - Gate 通过 -> Proof Agent 生成 Proof（签名、哈希、NormRef 快照）
   - Gate 不通过 -> 记录失败原因并更新 State
7. 更新 State：`completed` 或 `failed`。
8. 触发下一 Trip：根据 `links.next_trip_types` 自动建议或触发。
9. 执行 SCV（守恒验证）：自动检查材料用量偏差百分比是否合理。

### 21.2 执行后 LayerPeg 文档落位（钢筋加工示例）

- Header：记录 `normref_version`
- Gate：记录校验结果
- Body：记录实际钢筋用量、间距等
- Proof：记录本次 Trip 的完整证据
- State：`rebar_installed -> next_trip = concrete_pouring`

### 21.3 TripRole 体系目录结构（推荐）

```text
Standards/
  TripRoles/
    concrete_batching@v1.0/
      triprole.json
    rebar_processing_and_installation@v1.0/
      triprole.json
    concrete_pouring@v1.0/
      triprole.json

Runtime/
  Trips/
    2026-04-09/
      TRIP-BATCH-20260409-001.json
      TRIP-REBAR-20260409-001.json
      TRIP-POURING-20260409-001.json
  Proofs/
    2026-04-09/
      PF-BATCH-20260409-001.json
  Products/
    PILE-K12-340-001/
      rebar_cage.json
      concrete_batch.json
```

### 21.4 最小够用 API 接口

- `GET /api/triproles`：列出可用 TripRole 模板
- `GET /api/triproles/{trip_type}@{version}`：获取模板详情
- `POST /api/trips`：创建 Trip 执行实例
- `POST /api/trips/{trip_id}/verify`：执行 Gate 校验
- `POST /api/trips/{trip_id}/prove`：提交 Proof 并更新 State
- `GET /api/trips/{trip_id}`：查询 Trip 详情与 Proof 链

## 22. NormRef API / LayerPeg API / TripRole API 的关系与协同

### 22.1 三者定位与先后顺序

- NormRef API = 规则大脑（规范、校验规则、版本管理）
- LayerPeg API = 文档容器（规则 + 数据 + 执行记录的五层封装）
- TripRole API = 执行引擎（动作触发、流程推进）

正确顺序：

`NormRef API -> LayerPeg API -> TripRole API`

说明：NormRef API 是源头。没有规则引擎，LayerPeg 与 TripRole 都失去判断依据。

### 22.2 三者协同流程

1. NormRef API 提供规则集（Gate 规则、版本信息）。
2. LayerPeg API 将规则与业务数据封装为五层文档：
   - Header：记录规则版本
   - Gate：加载并执行规则
   - Body：存业务数据
   - Proof：存校验与执行证据
   - State：管理生命周期
3. TripRole API 执行具体动作时调用 LayerPeg API，并通过 LayerPeg 间接调用 NormRef 进行校验。

### 22.3 实际调用链示例（拌合站）

1. 用户发起“开始拌合”请求 -> TripRole API 接收。
2. TripRole API 调用 LayerPeg API 创建/更新文档。
3. LayerPeg API 调用 NormRef API 获取拌合规则并执行 Gate 校验。
4. 校验通过 -> 生成 Proof -> 更新 State -> 返回成功。

### 22.4 三层 API 的简单定位问答

- NormRef API：规则是什么？当前版本规范要求是什么？
- LayerPeg API：这个业务对象（合同/质检/付款）的完整结构和历史是什么？
- TripRole API：谁执行动作？结果如何？下一步是什么？

## 23. 四层 API 的最终关系与 DocPeg 统一入口

### 23.1 四层 API 关系（清晰总结）

| API 层级 | 职责 | 核心功能 | 谁调用它 |
| --- | --- | --- | --- |
| NormRef API | 规则大脑 | 提供规范、Gate 规则、版本管理 | LayerPeg API |
| LayerPeg API | 文档容器 | 五层结构封装、Proof 生成、State 管理 | TripRole API |
| TripRole API | 执行引擎 | 具体动作触发、流程推进 | 前端 / PegHMI / PegView |
| DTORole API | 权限与视图控制 | 不同角色数据视图、权限校验 | 所有上层 API |

最终形成：

`DocPeg API = NormRef + LayerPeg + TripRole + DTORole` 的统一入口。

### 23.2 DocPeg API 的完整概念

DocPeg API 是系统对外统一大门，将四层能力封装为逻辑一致的接口。

推荐接口设计（简洁版）：

```http
# 1) 创建/操作主权文档（最核心）
POST /api/docpeg/documents
```

请求体示例：

```json
{
  "doc_type": "contract",
  "project_ref": "v://cn.zhongbei/YADGS",
  "component_ref": "v://.../PILE-K12-340-001",
  "trip_type": "concrete_batching",
  "user_input": {}
}
```

返回示例：

```json
{
  "document_id": "LP-20260409-合同-001",
  "layerpeg": {},
  "proof_id": "PF-20260409-001",
  "state": "validated"
}
```

```http
# 2) 执行 Trip（动作层）
POST /api/docpeg/trips

# 3) 权限与视图控制（DTORole）
GET /api/docpeg/documents/{id}?role=inspector
```

### 23.3 DTORole 融入方式（关键补充）

DTORole 在两处生效：

- 查询时：按角色返回不同字段视图（最小暴露原则）。
- 执行时：校验调用者是否有权限执行当前 TripRole。

示例：

- 施工员：仅可见 Body 的部分字段，不可见财务 Proof。
- 监理：可见 Gate 与 Proof，不可修改合同金额。
- 业主：可见完整 Proof 链与 State。

## 24. QCSpec 逻辑架构（落地版）

QCSpec 不是孤立模块，而是 LayerPeg 在质检场景的执行形态。

核心表达：

- 每一次质检 = 一次 TripRole 执行
- 每一张质检表 = 一份 LayerPeg 五层文档
- 所有校验规则 = 来自 NormRef
- 所有执行结果 = 必带 Proof + State

### 24.1 执行流程（现场到闭环）

1. 触发 Trip：质检员选择如“钢筋加工及安装检查（桥施7表）”，创建 TripRole 实例。
2. 加载规则：系统从 NormRef API 拉取对应规则（直径、间距、保护层、强度等）。
3. 填写并校验：输入实测值，Gate 实时校验并高亮不合格项。
4. 生成 Proof：通过后生成 Proof（含照片、签名、测量记录、NormRef 版本快照）。
5. 更新 State：更新为当前阶段通过态，并推荐下一 Trip（如“混凝土浇筑”）。
6. 反向优化（可选）：高频失败规则进入 Updater Agent -> Guard Agent 审核 -> 新版本发布。

### 24.2 与其他模块联动

- 与 PegView：点击图纸构件可直接打开对应 QCSpec Trip。
- 与 SettlePeg/BOQ：质检通过后可驱动 BOQ 状态更新。
- 与运营模拟：长期质检数据回流用于耐久性预测与工艺优化。

## 25. 当前项目完成度盘点（截至 2026-04-10）

### 25.1 已落地（代码可见）

- Web 已有同事侧 DocPeg API Hook：
  - `process-chains`、`bindings`、`normref/forms`、`trips`、`signpeg`
- QCSpec 质检提交流程已嵌入 DocPeg 联动：
  - `preview -> submit -> summary/recommend`
- `chainId` 缺失时支持 `bindings/by-entity` 自动补全。
- 本项目后端已具备：
  - NormRef 规则查询/批量校验 API（`/v1/normref/rules*`, `/v1/normref/validate`）
  - TripRole 执行 API（`/v1/proof/triprole/execute`）
  - SignPeg 签章 API（`/api/v1/signpeg/sign|verify|status`）

### 25.2 部分完成（能力有，业务链未全接）

- Hook 已覆盖同事侧多数接口，但页面主流程实际只用到其中一部分（核心提交链）。
- “下一 Trip”当前是推荐提示，尚未自动创建下一执行实例。
- DTORole 能力在内核存在，但未形成统一对外 `DocPeg API` 入口供前台一站式调用。

### 25.3 未完成（影响“联调全通”）

- 未落地统一入口（目标态）：
  - `POST /api/docpeg/documents`
  - `POST /api/docpeg/trips`
  - `GET /api/triproles`
- 同事侧 API 的“真实参数 + 真实鉴权”全量验收仍未全绿留档。
- NormRef Agent（Updater/Guard/VersionManager）仍以方案文档为主，未服务化部署上线。

### 25.4 结论

当前可判断为“主链路可跑、联调未全通”。要达到“全通”，需补齐真实环境全量接口绿灯和统一入口收口。

## 26. SettlePeg 专项扩展（DocPeg + BOQItem）

SettlePeg 场景下的“过程可信 + 价值守恒”完整方案已独立成文，避免本文件继续膨胀：

- `docs/integration/settlepeg-docpeg-boq-integration.md`
