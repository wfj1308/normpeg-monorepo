# SettlePeg：DocPeg API + BOQItem API 打通方案（v1.0）

更新时间：2026-04-10

## 1. 目标与定位

DocPeg API + BOQItem API 是 SettlePeg（施工结算系统）的两大主引擎。打通后，合同、付款、质检、计量形成可执行闭环。

- DocPeg API：负责“过程可信”
  - LayerPeg 五层（Header/Gate/Body/Proof/State）
  - TripRole 执行
  - Proof 存证
  - State 流转
- BOQItem API：负责“价值守恒”
  - SPU 锚点
  - UTXO 消耗
  - 可付余额与计量状态

组合价值：`过程可信 + 价值守恒`。

## 2. 两大 API 的关系

- DocPeg API 管：谁做了什么、是否符合规范、留下了什么证据。
- BOQItem API 管：这个构件对应多少工程量、用了多少材料、应付多少钱。

推荐调用顺序：

1. DocPeg 创建/更新文档与流程状态。
2. BOQItem 做守恒检查与数量/金额更新。
3. NormRef 参与 Gate 校验。
4. TripRole 推进动作并回写 Proof/State。

## 3. 核心调用示例（付款申请）

```http
POST /api/docpeg/documents
Content-Type: application/json

{
  "doc_type": "payment_request",
  "project_ref": "v://cn.zhongbei/YADGS",
  "boq_item_ref": "v://cn.zhongbei/YADGS/boq/403-1-2",
  "trip_type": "payment_approval",
  "user_input": {
    "amount": 1250000,
    "period": "2026-04"
  }
}
```

系统内部动作：

1. DocPeg API 创建 LayerPeg 五层文档。
2. BOQItem API 校验该 BOQItem 的剩余可付金额（守恒校验）。
3. NormRef API 加载付款规则并做 Gate 校验。
4. TripRole 执行审批动作。
5. 生成 Proof，更新 State。
6. 通过后自动更新 BOQItem 已付金额。

## 4. BOQItem API 核心接口（建议）

```http
# 创建/更新 BOQItem
POST /api/boq/items

# 查询 BOQItem 当前状态（剩余量、已付、守恒）
GET /api/boq/items/{boq_item_ref}

# 执行消耗（施工完成后扣减）
POST /api/boq/items/{boq_item_ref}/consume
Body: { "trip_id": "TRIP-REBAR-xxx", "consumed_qty": 1878.0 }

# 守恒验证
GET /api/boq/items/{boq_item_ref}/conservation
```

## 5. 打通收益

1. 合同金额可自动拆分到 BOQItem。
2. 质检通过后自动更新 BOQItem 可计量量。
3. 付款申请自动校验 BOQItem 剩余金额（守恒）。
4. 全链路带 Proof，可审计可追溯。
5. 后续扩展图纸、运营、质检时可自然挂接 BOQItem。

## 6. SPU / SKU / MU / SMU 统一映射（施工场景）

| 概念 | 含义 | 在 BOQ 中的作用 | 与质检关系 |
| --- | --- | --- | --- |
| SPU | 设计能力单元（如“Φ20 HRB400 钢筋加工及安装”） | 定义标准、规范、设计量 | 质检需符合 SPU Gate 规则 |
| SKU | 具体物料/构件实例（如某根钢筋、某个桩基） | 实际执行对象 | 质检就是对 SKU 检查 |
| MU | 计量单元（kg、m3、根） | 结算计量依据 | 质检通过后才能确认 MU |
| SMU | 价值确认单元（结算快照） | 形成可支付价值 | 由质检 + MU 共同生成 |

关键定义：

`质检 = 选择/验证 SKU + 配置/确认 MU`。

## 7. BOQ 打通结构（推荐）

```json
{
  "boq_item_id": "BOQ-403-1-2",
  "spu_ref": "v://normref.com/spu/rebar_processing@v1.0",
  "sku_list": [
    {
      "sku_id": "SKU-REBAR-K12-340-001",
      "description": "K12+340 桩基主筋",
      "design_qty": 1885.0,
      "unit": "kg"
    }
  ],
  "mu_config": {
    "mu_type": "weight",
    "unit": "kg",
    "conversion_rule": "actual_measured_weight"
  },
  "current_smu": {
    "confirmed_qty": 1878.0,
    "payment_status": "partial_paid",
    "last_proof_id": "PF-REBAR-20260409-001"
  },
  "qc_status": "passed"
}
```

状态规则：

- 质检通过：更新 SKU 实测值 -> 确认 MU -> 生成 SMU（可支付）。
- 质检失败：Gate 不通过，不生成 SMU，进入整改 Trip。

## 8. 完整流程（钢筋示例）

1. 创建 BOQItem（绑定 SPU 设计基线）。
2. 施工产生 SKU（具体钢筋加工实例）。
3. 执行 TripRole 质检（验证 SKU 是否符合 SPU）。
4. 质检通过后配置 MU（实际计量 kg）。
5. 生成 SMU（可支付价值）与 Proof。
6. 回写 BOQItem `current_smu` 与可付余额。

## 9. 桥墩（Pier）打通示例

### 9.1 SPU 定义

```json
{
  "spu_id": "v://normref.com/spu/pier_construction@v1.0",
  "spu_type": "structural_component",
  "name": "桥墩施工能力单元",
  "description": "桥墩从钢筋加工、模板安装、混凝土浇筑到验收的全过程能力",
  "normref_refs": [
    "v://normref.com/std/JTG-F80-1-2017@pier_rebar",
    "v://normref.com/std/JTG-F80-1-2017@pier_concrete"
  ]
}
```

### 9.2 BOQItem 枢纽

```json
{
  "boq_item_id": "BOQ-404-2-1",
  "spu_ref": "v://normref.com/spu/pier_construction@v1.0",
  "description": "桥墩混凝土及钢筋工程",
  "design_qty": 245.6,
  "unit": "m3",
  "sku_list": [
    {
      "sku_id": "SKU-PIER-K12-340-P3",
      "component_name": "K12+340 右幅 3号桥墩",
      "design_volume_m3": 245.6,
      "rebar_qty_kg": 18750
    }
  ],
  "mu_config": {
    "mu_type": "volume",
    "unit": "m3",
    "conversion_rule": "actual_poured_volume_after_qc"
  }
}
```

### 9.3 质检 TripRole（SKU 验证 + MU 确认）

```json
{
  "trip_type": "pier_concrete_acceptance",
  "spu_ref": "v://normref.com/spu/pier_construction@v1.0",
  "role": "quality_inspector",
  "action": "perform_pier_acceptance",
  "input_resources": {
    "sku_id": "SKU-PIER-K12-340-P3",
    "poured_volume_m3": 245.6,
    "rebar_qty_kg": 18750,
    "concrete_strength_test_results": [32.5, 31.8, 33.2]
  },
  "gate": {
    "normref_rules": [
      "pier.concrete.strength_minimum",
      "pier.rebar.quantity_deviation",
      "pier.dimensions_tolerance",
      "pier.verticality_tolerance"
    ]
  },
  "output_product": {
    "sku_id": "SKU-PIER-K12-340-P3",
    "actual_volume_m3": 243.8,
    "actual_rebar_qty_kg": 18620,
    "strength_average_mpa": 32.5,
    "qc_result": "passed"
  },
  "verification": {
    "scv": {
      "conservation_check": true,
      "volume_deviation_percent": -0.73,
      "rebar_deviation_percent": -0.69
    }
  },
  "proof": {
    "proof_id": "PF-PIER-ACCEPTANCE-20260409-001"
  },
  "state": {
    "lifecycle_stage": "pier_accepted",
    "next_trip": "pier_curing_monitoring"
  }
}
```

## 10. 关键结论

一句话：

`质检通过（Gate）是 SKU -> MU -> SMU 的唯一放行条件。`

落地后，SettlePeg 可形成：

- DocPeg 保证过程可信
- BOQItem 保证价值守恒
- NormRef 保证规则一致
- TripRole 保证执行闭环

## 11. 当前已语义化基线（后续实施必须对齐）

以下能力已形成统一语义定义，后续开发以此为基线，不再改名或改口径：

1. TripRole 结构（统一模板）
2. LayerPeg 五层文档结构
3. NormRef 规则与 Gate 校验关联
4. SPU 基本定义（能力单元）
5. SKU / MU / SMU 在 BOQ 中的映射思路
6. 质检作为“验证 SKU + 配置 MU”的过程
7. BOQItem 本体模型
8. 全链路连续 TripRole 链（拌合 -> 钢筋 -> 模板 -> 浇筑 -> 验收 -> 计量）
9. 资源消耗与价值守恒（UTXO）语义
10. 不同角色（DTORole）的语义视图

执行要求：

- 新增接口、数据结构、页面流程必须映射到以上 10 项之一。
- 评审与验收统一按“过程可信 + 价值守恒”双轴检查。
- 若需调整基线语义，必须先更新本文档并同步联调清单。

## 12. Trip-SPU 与 TripRole 的精确关系（核心）

### 12.1 定义

- SPU（Service Processing Unit）是能力定义单元：
  - 定义工序“能做什么、需要什么资源、产出什么产品、遵守什么规则”。
- TripRole 是一次具体执行动作：
  - 在 SPU 能力基础上，由具体执行体（人或设备）在特定时间、针对特定构件执行。
- Trip 是 TripRole 的运行实例：
  - 记录某次真实执行的输入、输出、证据和状态。

简化关系：

- SPU = 能力模板（钢筋加工、混凝土拌合、桥墩浇筑等）
- TripRole = 角色 + 动作（谁执行什么）
- Trip = 某时某地某构件上的一次实际执行记录

关键约束：

`Trip-SPU 是 TripRole 的灵魂：TripRole 必须绑定 SPU，否则无法确定规则、资源消耗与产出。`

### 12.2 桥墩钢筋加工示例

SPU（能力模板）：

```json
{
  "spu_id": "v://normref.com/spu/rebar_processing@v1.0",
  "name": "钢筋加工及安装能力",
  "capabilities": ["cutting", "bending", "tying", "installation"],
  "required_resources": ["rebar_spec", "design_qty"],
  "output_product": "rebar_cage",
  "normref_rules": ["diameter_tolerance", "spacing_tolerance", "protection_layer"]
}
```

TripRole（角色动作）：

```json
{
  "trip_type": "rebar_processing_and_installation",
  "spu_ref": "v://normref.com/spu/rebar_processing@v1.0",
  "role": "rebar_worker",
  "action": "execute_rebar_processing"
}
```

Trip（运行实例）：

```json
{
  "trip_id": "TRIP-REBAR-20260409-001",
  "trip_type": "rebar_processing_and_installation",
  "spu_ref": "v://normref.com/spu/rebar_processing@v1.0",
  "component_id": "PILE-K12-340-001",
  "input_resources": { "rebar_spec": "HRB400-Φ20", "design_qty_kg": 1885 },
  "output_product": { "actual_qty_kg": 1878, "qc_result": "passed" },
  "proof": { "proof_id": "PF-REBAR-001" }
}
```

### 12.3 为什么 Trip-SPU 是 TripRole 核心

1. 能力锚点：无 SPU 就无法定义“该执行什么能力”。  
2. 规则来源：TripRole 通过 SPU 关联 NormRef 并加载 Gate 规则。  
3. 守恒基础：SPU 定义输入输出，Trip 执行时才能进行 SCV 守恒验证。  
4. 链路基础：SPU 定义前后工序依赖，TripRole 才能形成连续执行链。  

一句话总结：

`TripRole 是“谁来做”，SPU 是“做什么、怎么做、做到什么程度”，两者结合才是完整可执行单元。`

## 13. 当前闭合与待闭合清单（项目执行基线）

以下清单用于统一当前项目阶段判断，后续迭代按“先闭合关键链路，再做优化扩展”推进。

### 13.1 当前逻辑已闭合内容

1. LayerPeg 五层结构（Header、Gate、Body、Proof、State）作为统一容器。
2. TripRole 统一模板（`rms_spec`、`tps_spec`、`pcs_spec`、`gate`、`verification`、`links`）。
3. NormRef 与 LayerPeg 的调用关系（规则驱动 Gate）。
4. SPU 作为能力锚点，TripRole 作为执行动作。
5. 质检作为“验证 SKU + 配置 MU”的过程。
6. 基本工序示例（拌合站、钢筋加工、桥墩浇筑）已形成 Trip 链雏形。

### 13.2 当前仍需闭合内容

1. 全链路连续 Trip 闭环：
   - 当前有单工序 TripRole，但“原材料进场 -> 拌合 -> 钢筋 -> 模板 -> 浇筑 -> 养护 -> 验收 -> 计量 -> 结算”尚未端到端串联完成，尤其缺前后依赖和资源传递的统一编排。
2. BOQItem 与 SPU/SMU/SKU/MU 的严格语义化：
   - BOQItem 尚未完全成为 SPU 锚点；
   - `SKU -> MU -> SMU` 转换规则仍需精确定义并固化。
3. Guard Agent 最终把关机制：
   - 反向优化（质检数据修正 NormRef）闭环尚未完全闭合；
   - Guard Agent 审核流程与准入规则需最终确认并落地。
4. DTORole 语义视图层：
   - 施工员、质检员、监理、业主等角色差异化视图尚未系统化定义和实现。

### 13.3 后续实施约束

1. 新需求需先标注对应“闭合项”还是“待闭合项”。
2. 涉及链路推进的任务优先补齐 13.2 中 1-2 项。
3. Guard Agent 与 DTORole 相关功能上线前，必须有可审计流程说明和验收用例。

## 14. NormRef 逻辑补全（生产级落地）

本节用于补强当前 NormRef 的 4 个关键缺口，目标是让 NormRef 从“可用规则库”升级为“可执行规则引擎”。

### 14.1 规则语义化映射（Raw Rule -> 业务场景规则包）

问题：当前存在类似 `civil.general-check.measured_value.rule` 的通用规则，但场景语义不足。  
方案：建立“规则映射层”，把通用规则映射到具体业务表单/工序场景。

映射模型（建议）：

```json
{
  "semantic_rule_id": "bridge.table7.rebar_spacing.check",
  "raw_rule_id": "civil.general-check.measured_value.rule",
  "scenario": {
    "domain": "bridge",
    "table_code": "桥施7表",
    "trip_type": "rebar_processing_and_installation"
  },
  "field_binding": {
    "actual_field": "measured_spacing_mm",
    "design_field": "design_spacing_mm",
    "tolerance_field": "spacing_tolerance_mm"
  },
  "operator": "abs(actual - design) <= tolerance",
  "severity": "critical",
  "version": "2026-04"
}
```

实施要求：

1. 每条 raw rule 至少可映射到一个 semantic rule。
2. semantic rule 必须带 `scenario + field_binding + version`。
3. 映射关系写入 NormRef 规则目录并可查询。

### 14.2 与 LayerPeg 深度绑定（Gate 可直接执行）

目标：解析后的规则可直接进入 LayerPeg `gate`，并在 `proof` 保留可审计快照。

最小绑定结构：

```json
{
  "header": {
    "normref_version": "2026-04",
    "rule_snapshots": {
      "bridge.table7.rebar_spacing.check": {
        "raw_rule_id": "civil.general-check.measured_value.rule",
        "hash": "sha256:...",
        "version": "2026-04"
      }
    }
  },
  "gate": {
    "normref_rules": ["bridge.table7.rebar_spacing.check"],
    "validation_results": [
      {
        "rule_id": "bridge.table7.rebar_spacing.check",
        "passed": true,
        "actual_value": 198,
        "expected": "200±10"
      }
    ]
  },
  "proof": {
    "normref_snapshot_hash": "sha256:..."
  }
}
```

实施要求：

1. LayerPeg 在创建/更新时必须记录 `normref_version`。
2. Gate 必须输出结构化 `validation_results`（不能只返回文本）。
3. Proof 必须固化本次规则快照哈希，保证审计可回放。

### 14.3 反向优化闭环（Updater Agent + Guard Agent）

目标：让质检数据能够持续修正规则，但不破坏安全和可追溯性。

闭环流程：

1. Updater Agent 基于质检统计提出规则调整建议。
2. Guard Agent 审核建议（安全性/合理性/兼容性/必要性）。
3. 通过后 Version Manager 生成新版本；不通过则拒绝并留痕。
4. 新版本仅影响新文档；历史文档继续绑定原快照版本。

Guard 决策结构（建议）：

```json
{
  "approved": true,
  "risk_level": "low",
  "reason": "数据支撑充分且不影响历史兼容",
  "decision_proof": "sha256:guard-decision-..."
}
```

实施要求：

1. 未经 Guard 批准不得发布规则版本。
2. 每次规则变更必须生成 `decision_proof`。
3. 版本升级必须保持历史文档可复算。

### 14.4 TripRole 关联（规则如何被执行链调用）

目标：每个 TripRole 都能声明所用规则，并由运行时自动校验。

TripRole 规则引用示例：

```json
{
  "trip_type": "pier_concrete_acceptance",
  "spu_ref": "v://normref.com/spu/pier_construction@v1.0",
  "gate": {
    "normref_rules": [
      "bridge.table2.pile_position_deviation.check",
      "bridge.table7.rebar_spacing.check",
      "pier.concrete.strength_minimum"
    ]
  }
}
```

执行约束：

1. TripRole 必须绑定 `spu_ref` 和 `normref_rules`。
2. Trip 执行前必须先跑 Gate 校验；不通过不得进入产出与计量阶段。
3. Trip 输出必须回写 LayerPeg `proof/state`，并驱动下一 Trip。

### 14.5 落地验收标准（NormRef 补全完成判定）

1. 至少 3 类场景（桥施2表/桥施7表/桥墩浇筑）完成 raw -> semantic 映射。
2. LayerPeg 文档可稳定产出 `normref_version + rule_snapshots + validation_results`。
3. Updater -> Guard -> VersionManager 形成可追溯闭环并有变更样例。
4. TripRole 在质检 Trip 与浇筑 Trip 中都能自动加载规则并拦截不合格执行。

## 15. NormRef 当前解析成果评估与升级样例

### 15.1 当前解析成果评估

当前状态（截至 2026-04）：

1. 已解析规则：244 条
2. 规则结构：`rule_id / operator / value / unit / severity / source`
3. 处理状态：待处理 243，已通过 1
4. 当前版本：`2026-04`

升级目标：

把 raw 规则转换为 LayerPeg Gate 可直接调用的结构化规则，并与 TripRole 绑定形成执行闭环。

### 15.2 升级后的 NormRef 规则示例（桥墩相关）

```json
{
  "normref_id": "v://normref.com/std/JTG-F80-1-2017@v2026-04",
  "rules": [
    {
      "rule_id": "pier.concrete.strength_minimum",
      "category": "pier",
      "field": "strength_test_result_mpa",
      "operator": "gte",
      "value": 30,
      "unit": "MPa",
      "severity": "critical",
      "fail_message": "桥墩混凝土强度未达到设计强度30MPa",
      "applicable_trips": ["pier_concrete_pouring", "pier_acceptance_inspection"]
    },
    {
      "rule_id": "rebar.spacing_tolerance",
      "category": "rebar",
      "field": "spacing_mm",
      "operator": "between",
      "value": [140, 160],
      "unit": "mm",
      "severity": "critical",
      "fail_message": "钢筋间距不在140-160mm允许范围内",
      "applicable_trips": ["rebar_quality_inspection"]
    },
    {
      "rule_id": "pier.verticality_tolerance",
      "category": "pier",
      "field": "verticality_deviation_mm",
      "operator": "lte",
      "value": 20,
      "unit": "mm",
      "severity": "critical",
      "fail_message": "桥墩垂直度偏差超过20mm",
      "applicable_trips": ["pier_acceptance_inspection"]
    }
  ]
}
```

### 15.3 与 LayerPeg 的绑定示例（桥墩浇筑质检）

```json
{
  "header": {
    "header_id": "LP-PIER-POURING-QC-20260409-001",
    "doc_type": "pier_concrete_inspection",
    "normref_version": "v://normref.com/std/JTG-F80-1-2017@v2026-04"
  },
  "gate": {
    "normref_rules": [
      "pier.concrete.strength_minimum",
      "pier.verticality_tolerance"
    ],
    "validation_results": [
      { "rule_id": "pier.concrete.strength_minimum", "passed": true, "actual": 32.5 },
      { "rule_id": "pier.verticality_tolerance", "passed": false, "actual": 25, "message": "垂直度偏差超过20mm" }
    ]
  },
  "body": {
    "content": {
      "pier_id": "K12+340-P3",
      "poured_volume_m3": 243.8,
      "strength_test_result_mpa": 32.5
    }
  },
  "proof": {
    "proof_id": "PF-PIER-QC-001"
  },
  "state": {
    "lifecycle_stage": "inspection_failed",
    "next_action": "rectification_required"
  }
}
```

### 15.4 与 TripRole 的绑定（闭环）

TripRole 示例：

```json
{
  "trip_type": "pier_concrete_acceptance",
  "spu_ref": "v://normref.com/spu/pier_concrete_pouring@v1.0",
  "role": "quality_inspector",
  "action": "perform_pier_acceptance",
  "gate": {
    "normref_rules": ["pier.concrete.strength_minimum", "pier.verticality_tolerance"]
  }
}
```

执行流程：

1. 质检员触发 TripRole。
2. 系统调用 NormRef API 加载规则。
3. 执行 Gate 校验。
4. 生成 LayerPeg 文档 + Proof。
5. 更新 BOQItem 的 SMU 状态。

## 16. Tab-to-Peg 正确落地顺序（修正版）

施工项目应按“BOQ 先行、图纸次之、执行闭环最后”推进，而不是从表格直接起流程。

### 16.1 推荐流程

阶段 1：导入基础数据

1. 导入 BOQ 清单（工程量清单）-> 生成 BOQItem（SPU 锚点）。
2. 导入图纸（DWG / PDF / 图片）-> PegView 解析并注入 LayerPeg。

阶段 2：语义化关联

1. 将图纸构件（SKU）与 BOQItem 关联（按构件 ID/名称匹配）。
2. 生成 LayerPeg 五层文档，Header 记录 `boq_item_ref / drawing_ref`。

阶段 3：执行与闭环

1. 执行 TripRole（质检、浇筑等）。
2. 生成 Proof。
3. 更新 BOQItem 的实际量与 SMU 状态（价值守恒）。

### 16.2 立即可执行最小结构（BOQ + 图纸关联）

```json
{
  "header": {
    "header_id": "LP-PIER-K12-340-P3",
    "doc_type": "pier_construction",
    "project_ref": "v://cn.zhongbei/YADGS",
    "boq_item_ref": "BOQ-404-2-1",
    "drawing_ref": "drawing-pier-p3.dwg"
  },
  "body": {
    "content": {
      "component_type": "pier",
      "design_volume_m3": 245.6,
      "rebar_qty_kg": 18750
    }
  },
  "gate": {},
  "proof": {},
  "state": {
    "lifecycle_stage": "drawing_imported",
    "next_action": "rebar_processing"
  }
}
```

## 17. Zero BOQ（零号清单）语义化设计

Zero BOQ 是项目初始锚点，承载后续质检、计量、支付全部语义关联。

### 17.1 零号清单主结构

```json
{
  "boq_id": "BOQ-ZERO-2026-001",
  "project_ref": "v://cn.zhongbei/YADGS",
  "version": "v1.0",
  "type": "zero_number_bill",
  "description": "京港高速大修工程（2026）零号工程量清单",
  "created_at": "2026-04-09T20:26:44Z",
  "status": "active",
  "boq_items": [
    {
      "boq_item_id": "BOQ-404-2-1",
      "spu_ref": "v://normref.com/spu/pier_construction@v1.0",
      "description": "桥墩混凝土及钢筋工程",
      "design_qty": 245.6,
      "unit": "m3",
      "sku_list": [
        {
          "sku_id": "SKU-PIER-K12-340-P3",
          "component_name": "K12+340 右幅3号桥墩",
          "design_volume_m3": 245.6,
          "rebar_qty_kg": 18750
        }
      ],
      "mu_config": {
        "mu_type": "volume",
        "unit": "m3",
        "conversion_rule": "actual_poured_volume_after_qc"
      },
      "current_smu": {
        "confirmed_qty": 0,
        "payment_status": "not_started"
      }
    }
  ]
}
```

### 17.2 导入与语义化步骤（两天版）

Day 1（导入）：

1. 导入 BOQ Excel/PDF -> 解析为 BOQItem 列表。
2. 导入图纸 -> PegView 解析构件并自动匹配 BOQItem。
3. 每个主要构件生成一份 LayerPeg 文档。

Day 2（语义化）：

1. 为每个 BOQItem 关联 LayerPeg 文档。
2. 初始化 SKU 状态（`design_qty`）。
3. 初始化 SMU（`confirmed_qty=0`）。

## 18. IQC-PQC-QQC-FQC 四级质检链（语义模板）

四级链定义：

1. IQC：Incoming Quality Control（进场材料质检）
2. PQC：Process Quality Control（过程质检）
3. QQC：On-site/In-progress Quality Control（现场工序质检）
4. FQC：Final Quality Control（最终验收质检）

关键原则：

1. 每一阶段 Trip 的 Proof 是下一阶段 pre_condition。
2. 全链路 Proof 可追溯。
3. FQC 通过后才允许更新 BOQItem 的 SMU（进入支付）。

### 18.1 IQC 示例

```json
{
  "trip_type": "iqc_material_inspection",
  "spu_ref": "v://normref.com/spu/material_iqc@v1.0",
  "role": "incoming_qc_inspector",
  "action": "incoming_material_check",
  "gate": {
    "normref_rules": ["material.certificate", "material.visual", "material.dimension", "material.test_report"]
  },
  "proof": { "proof_id": "PF-IQC-001" },
  "state": { "lifecycle_stage": "iqc_passed", "next_action": "move_to_storage" }
}
```

### 18.2 PQC 示例

```json
{
  "trip_type": "pqc_process_inspection",
  "spu_ref": "v://normref.com/spu/process_qc@v1.0",
  "role": "process_qc_inspector",
  "action": "in_process_check",
  "gate": {
    "normref_rules": ["rebar.spacing", "rebar.protection_layer", "rebar.yield_strength"]
  },
  "proof": { "proof_id": "PF-PQC-001" },
  "state": { "lifecycle_stage": "pqc_passed", "next_action": "continue_construction" }
}
```

### 18.3 QQC 示例

```json
{
  "trip_type": "qqc_on_site_inspection",
  "spu_ref": "v://normref.com/spu/on_site_qc@v1.0",
  "role": "site_qc_inspector",
  "action": "on_site_quality_check",
  "gate": {
    "normref_rules": ["concrete.temperature", "concrete.slump", "concrete.vibration"]
  },
  "proof": { "proof_id": "PF-QQC-001" },
  "state": { "lifecycle_stage": "qqc_passed", "next_action": "curing" }
}
```

### 18.4 FQC 示例

```json
{
  "trip_type": "fqc_final_acceptance",
  "spu_ref": "v://normref.com/spu/final_qc@v1.0",
  "role": "final_qc_inspector",
  "action": "final_acceptance_inspection",
  "gate": {
    "normref_rules": ["final.dimension_tolerance", "final.strength_test", "final.appearance"]
  },
  "proof": { "proof_id": "PF-FQC-001" },
  "state": { "lifecycle_stage": "fqc_passed", "next_action": "boq_update_and_payment" }
}
```

## 19. NormRef Ingest 页面定位与 API 关系

NormRef Ingest 页面本质是“规范导入与规则治理工具”，不是最终执行引擎。

### 19.1 页面职责（NormRef Ingest Tool）

1. 上传规范文档（PDF）。
2. 自动解析候选规则（如规则ID、运算符、阈值、严重级别、来源条款）。
3. 展示解析结果并支持人工复核（通过 / 驳回 / 编辑）。
4. 产出结构化 JSON 规则，进入 NormRef 规则库。

### 19.2 后端 API 对应关系

NormRef API（规则管理与校验）：

- `/api/normref/ingest`：上传并解析规范文档（候选规则）。
- `/api/normref/rules`：查询规则列表。
- `/api/normref/rules/{rule_id}`：查询单条规则。
- `/api/normref/validate`：执行 Gate 校验。

DocPeg API（主权文档执行）：

- 接收 NormRef 规则结果，生成/更新 LayerPeg 五层文档。

TripRole API（执行动作）：

- 在 IQC/PQC/QQC/FQC 等 Trip 中调用 NormRef 规则做校验与拦截。

### 19.3 体系关系总结

1. 页面层：NormRef Ingest Tool（前端操作界面）。
2. 规则层：NormRef API（规则来源与版本管理）。
3. 执行层：LayerPeg / TripRole（规则落地执行）。
4. 系统层：最终回到 DocPeg 执行闭环（Gate -> Proof -> State -> BOQ/SMU 更新）。

## 20. 最终闭环目标（BOQ + 图纸 -> IQC-PQC-QQC-FQC）

导入清单（BOQ）+ 图纸（DWG/图片）后的最终结果，是形成 IQC-PQC-QQC-FQC 的完整质检闭环。

### 20.1 阶段 1：导入基础数据

1. 导入 BOQ 清单，生成 BOQItem（SPU 锚点 + 设计量）。
2. 导入图纸，PegView 解析构件并生成 LayerPeg 文档（与 BOQItem 关联）。

### 20.2 阶段 2：语义化关联

1. 系统自动将图纸构件（SKU）与 BOQItem 匹配。
2. 每个构件生成一份 LayerPeg 五层文档，作为数字孪生载体。

### 20.3 阶段 3：质检闭环（IQC-PQC-QQC-FQC）

1. IQC（进场质检）：
   - 检查材料批次、合格证、尺寸等。
   - 通过后更新 BOQItem `material_ready` 状态。
2. PQC（过程质检）：
   - 检查钢筋绑扎、模板安装等过程质量。
   - 通过后更新构件 LayerPeg `state`。
3. QQC（现场质检）：
   - 检查浇筑、振捣等关键工序。
   - 通过后记录实测值并更新 MU（计量单元）。
4. FQC（最终验收质检）：
   - 检查强度、尺寸、外观等最终指标。
   - 通过后生成 SMU（可支付价值）并进入计量支付。

### 20.4 最终结果

1. 每个构件拥有完整质检 Proof 链。
2. BOQItem 的实际量、已付金额、守恒状态可实时更新。
3. 全流程可追溯、可审计。

## 21. 安全合规质检标准框架（增强版）

安全合规质检 = IQC + PQC + QQC + FQC 的安全维度增强版。

核心原则：

1. 每一次安全质检都是一个 TripRole。
2. 所有检查项来自 NormRef 安全规则。
3. 结果记录到 LayerPeg 的 Gate + Proof。
4. 任一关键项不通过自动阻断下一 Trip（安全第一）。

### 21.1 安全 NormRef 规则示例（JTG + 安全规范）

```json
{
  "normref_id": "v://normref.com/std/safety_compliance@v2026-04",
  "category": "safety",
  "rules": [
    {
      "rule_id": "safety.ppe.full_set",
      "field": "ppe_compliance",
      "operator": "eq",
      "value": true,
      "severity": "critical",
      "fail_message": "作业人员未佩戴完整安全防护用品（安全帽、安全带、反光衣等）",
      "applicable_trips": ["all_construction_trips"]
    },
    {
      "rule_id": "safety.scaffolding.stability",
      "field": "scaffolding_stability_check",
      "operator": "eq",
      "value": true,
      "severity": "critical",
      "fail_message": "脚手架稳定性不合格（未固定、未设置剪刀撑）"
    },
    {
      "rule_id": "safety.electrical.safe_distance",
      "field": "electrical_safe_distance_m",
      "operator": "gte",
      "value": 2.0,
      "unit": "m",
      "severity": "critical",
      "fail_message": "电气设备安全距离不足2米"
    },
    {
      "rule_id": "safety.emergency.exit_clear",
      "field": "emergency_exit_clear",
      "operator": "eq",
      "value": true,
      "severity": "high",
      "fail_message": "应急通道被堵塞"
    }
  ]
}
```

### 21.2 安全 TripRole 示例（桥墩浇筑）

```json
{
  "trip_type": "pier_pouring_safety_inspection",
  "spu_ref": "v://normref.com/spu/safety_compliance@v1.0",
  "role": "safety_officer",
  "action": "perform_safety_compliance_check",
  "input_resources": {
    "component_id": "PIER-K12-340-P3",
    "activity": "concrete_pouring",
    "workers_count": 12
  },
  "gate": {
    "normref_rules": [
      "safety.ppe.full_set",
      "safety.scaffolding.stability",
      "safety.electrical.safe_distance",
      "safety.emergency.exit_clear"
    ],
    "pre_conditions": ["previous_iqc_passed", "previous_pqc_passed"]
  },
  "output": {
    "safety_result": "passed",
    "violations_count": 0,
    "corrective_actions": []
  },
  "proof": {
    "proof_id": "PF-SAFETY-PIER-001",
    "photos": ["safety-photo-001.jpg", "safety-photo-002.jpg"]
  },
  "state": {
    "lifecycle_stage": "safety_check_passed",
    "next_action": "start_pouring"
  }
}
```

### 21.3 安全检查在四级质检链中的位置

1. IQC：进场材料安全合规（合格证、安全标签）。
2. PQC：过程安全检查（脚手架、临电、高空作业）。
3. QQC：现场关键工序旁站（浇筑、吊装等）。
4. FQC：最终验收安全设施检查（护栏、警示标识等）。

关键机制：

1. 任一级安全质检失败，阻断下一 Trip。
2. 全部安全检查结果必须入 LayerPeg Gate + Proof。
3. `critical` 违规自动触发告警并进入 Guard Agent 审核。

## 22. 框架通用性定义与扩展规范

本体系是通用框架，不是面向某一单工序（如桥墩）的专用方案。

### 22.1 为什么它是通用框架

1. LayerPeg 五层通用：
   - 合同、付款、质检、图纸、材料、BOQItem 等都可封装为五层文档。
2. TripRole + SPU 通用：
   - 任意工序（拌合、钢筋、模板、浇筑、养护、验收、安全检查）都可定义为 TripRole 并绑定 SPU。
3. NormRef 通用：
   - JTG、JGJ、安全规程、企业标准都可转规则并驱动 Gate。
4. IQC-PQC-QQC-FQC 通用：
   - 四级质检链是可复用的通用质量控制模型。
5. BOQItem + SKU + MU + SMU 通用：
   - 价值守恒逻辑适用于任意清单项。

### 22.2 通用性体现维度

1. 工序通用：桥墩、桩基、梁板、路基、路面、排水、交安设施均可套用。
2. 角色通用：施工员、质检员、监理、业主、安全官可通过 DTORole 获得对应语义视图。
3. 项目通用：可扩展到公路、房建、市政、轨交等流程相近项目。
4. 扩展通用：新增工序只需“TripRole 模板 + NormRef 规则 + BOQItem 绑定”。

### 22.3 快速扩展示例（模板安装）

```json
{
  "trip_type": "formwork_installation",
  "spu_ref": "v://normref.com/spu/formwork_installation@v1.0",
  "role": "formwork_worker",
  "action": "install_formwork",
  "gate": {
    "normref_rules": ["formwork.stability", "formwork.dimension_tolerance", "formwork.safety_bracing"]
  },
  "links": {
    "prev_trip_types": ["rebar_processing_and_installation"],
    "next_trip_types": ["concrete_pouring"]
  }
}
```

### 22.4 达到“全通用”的最后两步

1. 抽象层完善：
   - 将 TripRole、SPU、BOQItem 沉淀为可配置模板库（含版本与兼容策略）。
2. 配置化完善：
   - 新增工序以 `JSON + NormRef 规则` 为主，尽量避免硬编码流程分支。

## 23. 通用 TripRole 模板与扩展指南

### 23.1 通用 TripRole 模板（最简版）

新增工序时，以此模板复制后改字段即可：

```json
{
  "trip_type": "your_trip_type_here",
  "version": "v1.0",
  "spu_ref": "v://normref.com/spu/your_spu_here@v1.0",
  "role": "executor_role",
  "action": "main_action",
  "rms_spec": {
    "required_inputs": ["input1", "input2"],
    "optional_inputs": ["input3"]
  },
  "tps_spec": {
    "executor_type": "team_or_equipment_type",
    "required_capabilities": ["capability1", "capability2"]
  },
  "pcs_spec": {
    "product_type": "output_product_name",
    "required_metrics": ["metric1", "metric2"]
  },
  "gate": {
    "normref_rules": ["rule1", "rule2"],
    "pre_conditions": ["previous_trip1", "previous_trip2"]
  },
  "verification": {
    "scv": {
      "conservation_check": true,
      "max_abs_deviation_percent": 2.0
    }
  },
  "links": {
    "prev_trip_types": ["previous_trip_type1", "previous_trip_type2"],
    "next_trip_types": ["next_trip_type1", "next_trip_type2"]
  }
}
```

使用说明：

1. 重点修改字段：`trip_type`、`spu_ref`、`role`、`action`、`rms_spec`、`pcs_spec`、`gate.normref_rules`、`links`。
2. LayerPeg 封装、Proof 生成、Guard 审核沿用现有框架，无需重复开发。

### 23.2 扩展示例（模板安装）

```json
{
  "trip_type": "formwork_installation",
  "version": "v1.0",
  "spu_ref": "v://normref.com/spu/formwork_installation@v1.0",
  "role": "formwork_worker",
  "action": "install_formwork",
  "rms_spec": {
    "required_inputs": ["formwork_material", "design_drawing"],
    "optional_inputs": ["scaffolding_status"]
  },
  "tps_spec": {
    "executor_type": "formwork_team",
    "required_capabilities": ["assembly", "alignment", "bracing", "safety_check"]
  },
  "pcs_spec": {
    "product_type": "installed_formwork",
    "required_metrics": ["dimension_accuracy", "stability_check", "leak_proof_test"]
  },
  "gate": {
    "normref_rules": ["formwork.dimension_tolerance", "formwork.stability", "formwork.safety_bracing"],
    "pre_conditions": ["rebar_installation_passed"]
  },
  "verification": {
    "scv": {
      "conservation_check": true,
      "max_abs_deviation_percent": 1.5
    }
  },
  "links": {
    "prev_trip_types": ["rebar_processing_and_installation"],
    "next_trip_types": ["concrete_pouring"]
  }
}
```

扩展步骤：

1. 复制通用模板。
2. 填写 `trip_type/spu_ref/role/action`。
3. 定义 `rms_spec/tps_spec/pcs_spec`。
4. 绑定 NormRef 规则与前后工序依赖。
5. 复用 LayerPeg + Guard + Proof 机制直接上线。

### 23.3 通用性评估与未来方向

当前通用性建议评估：`85/100`（施工领域复用度高）。

强项：

1. 工序统一 TripRole 模板。
2. 规则统一由 NormRef 驱动。
3. 执行统一封装在 LayerPeg 五层。
4. 质量统一为 IQC-PQC-QQC-FQC 四级链。
5. 价值统一走 BOQItem + SKU + MU + SMU 守恒。

可扩展方向：

1. 同类施工：房建、市政、轨交、水利。
2. 制造场景：将工序节点映射为产线节点，复用 Trip/SPU/Gate/Proof。
3. 非施工场景：医疗、教育、物流可迁移，但需先完成 SPU 领域化定义。

限制与补强：

1. 高创意行业（广告/影视）流程离散度高，复用度低。
2. 强监管行业（金融/医疗）需增强 DTORole 精细权限与隐私保护策略。

## 24. LayerPeg v1.1 生产模板（严谨增强版）

本节作为 LayerPeg 基线模板的升级提案，用于替换早期 `spec_version=1.0` 的示例化结构，强化审计一致性、事务性校验、状态机约束和 Guard 审核闭环。

### 24.1 v1.1 模板（推荐）

```json
{
  "magic": "LAYERPEG",
  "spec_version": "1.1",
  "header": {
    "header_id": "LP-20260409-桥施2-K12-340-001",
    "doc_type": "bridge_pile_casing_inspection",
    "owner_did": "did:ir8:org:zhongbei",
    "created_at": "2026-04-09T20:26:44Z",
    "project_ref": "v://cn.zhongbei/YADGS",
    "component_ref": "v://cn.zhongbei/YADGS/component/PILE-K12-340-001",
    "normref_version": "v://normref.com/std/JTG-F80-1-2017@v2026-04",
    "guard_version": "v1.0"
  },
  "gate": {
    "normref_rules": [
      "bridge.casing.burial_depth",
      "bridge.pile.position_deviation",
      "bridge.casing.verticality"
    ],
    "validation_results": [
      {
        "rule_id": "bridge.casing.burial_depth",
        "passed": true,
        "actual_value": 12.5,
        "expected": ">= 12.3",
        "executed_at": "2026-04-09T20:27:12Z"
      }
    ],
    "transaction_id": "TX-GATE-20260409-001",
    "execution_context": {}
  },
  "body": {
    "content": {
      "pile_number": "K12+340",
      "casing_type": "钢护筒",
      "diameter_mm": 800,
      "burial_depth_m": 12.5,
      "position_deviation_mm": 65,
      "geology_at_bottom": "中风化砂岩"
    },
    "semantic_version": "1.0"
  },
  "proof": {
    "proof_id": "PF-20260409-001",
    "data_hash": "sha256:完整文档哈希",
    "normref_snapshot_hash": "sha256:当时使用的NormRef规则完整快照",
    "guard_review_hash": "sha256:Guard审核记录",
    "signatures": [
      {
        "did": "did:ir8:executor:zhang-san",
        "role": "quality_inspector",
        "signed_at": "2026-04-09T20:28:00Z",
        "signature": "Ed25519:..."
      }
    ],
    "previous_proof": "PF-20260408-089"
  },
  "state": {
    "lifecycle_stage": "inspection_passed",
    "state_machine_version": "1.0",
    "allowed_next_states": ["payment_ready", "rectification_required"],
    "next_action": "supervisor_review",
    "last_updated": "2026-04-09T20:30:00Z"
  },
  "metadata": {
    "guard_approved": true,
    "guard_reviewed_at": "2026-04-09T20:29:15Z",
    "consistency_check_passed": true
  }
}
```

### 24.2 相对 v1.0 的核心强化

1. Proof 层强化：
   - 新增 `normref_snapshot_hash`、`guard_review_hash`，确保历史审计可还原“规则版本 + 审核记录”。
2. Gate 层强化：
   - 新增 `transaction_id`、`execution_context`，支持多规则校验的事务化与上下文追踪。
3. State 层强化：
   - 新增 `state_machine_version`、`allowed_next_states`，阻断非法状态迁移。
4. 全局一致性强化：
   - 新增 `metadata` 记录 Guard 审核与一致性检查结果，形成闭环可追溯证据。
5. 版本治理强化：
   - 关键层均可标识版本（`spec_version`、`semantic_version`、`state_machine_version`、`guard_version`）。

### 24.3 与现有实现的落地对齐建议

1. Tab-to-Peg 输出升级：
   - `spec_version` 从 `1.0` 升级为 `1.1`。
   - Gate 输出增加 `transaction_id` 与最小 `execution_context`。
2. Proof 生成升级：
   - 现有 `normref_snapshot_hash` 保留。
   - 增加 `guard_review_hash`（即使初期为占位值，也保留字段位）。
3. State 输出升级：
   - 在 State 中加入 `state_machine_version` 与 `allowed_next_states`。
4. Guard 流程对齐：
   - `metadata.guard_approved` 与 `metadata.guard_reviewed_at` 由 Guard Agent 输出回填。

### 24.4 兼容策略（避免一次性切换风险）

1. 读兼容：后端同时兼容 `1.0` 和 `1.1`。
2. 写升级：新创建文档默认写 `1.1`。
3. 历史不变：历史 `1.0` 文档不回写重算，仅在读取层做映射。

## 25. 三产品最终定位与依赖（并入主文档）

1. DocPeg：主权文档操作系统（协议、规则、存证、状态机中枢）。
2. PegView：图纸语义化与执行平台（DWG/PDF 解析与 LayerPeg 注入）。
3. PegHMI：人机交互与监控执行层（大屏、巡检、操作面板）。

层级依赖：

`PegHMI（操作界面） ← 消费数据 ← PegView（图纸执行） ← 调用协议 ← DocPeg（文档操作系统）`

## 26. DocPeg 完整公式（7 模块）

`DocPeg = LayerPeg + TripRole + DTORole + Guard Agent + Proof Chain + NormRef 引擎 + State Machine`

1. LayerPeg：五层协议骨架（Header/Gate/Body/Proof/State）。
2. TripRole：执行角色与动作流转。
3. DTORole：所有权与权限视图。
4. Guard Agent：审查、拦截、修正建议。
5. Proof Chain：哈希/签名/链式引用固化。
6. NormRef 引擎：规则注入 Gate 与结构映射。
7. State Machine：生命周期合法迁移控制。

## 27. LayerPeg Protocol v1.0 规范要点（并入）

### 27.1 三层架构

`表现层（PegView/PegHMI） ← 协议层（LayerPeg） ← 数据层（本地文件 + 侧链）`

### 27.2 双轨格式

1. 对外接口：JSON。
2. 对内传输/存储：Protobuf。

### 27.3 存储策略

1. DWG 内嵌 XData 只存最小指纹（<=256B）。
2. 完整五层文档存侧链（Arweave / IPFS）。
3. 数据库仅存索引字段（owner/doc_type/created_at 等）。

### 27.4 XData 指纹布局（示意）

1. `0x00-0x0F`：魔数 + 版本。
2. `0x10-0x1F`：Header ID 前缀。
3. `0x20-0x2F`：Gate Hash 前缀。
4. `0x30-0x3F`：Proof Hash 前缀。
5. `0x40-0x5F`：Sidechain Anchor 前缀。
6. `0x60-0xFF`：预留。

## 28. NormRef Agent Framework v1.0（并入）

框架组成：

1. Parser Agent：规范文档 -> 结构化规则。
2. Validator Agent：业务数据 + 规则 -> Gate 结果。
3. Updater Agent：质检统计 -> 规则修正建议。
4. Guard Agent：审核修正规则（安全阀门）。
5. Version Manager Agent：版本快照与兼容策略。
6. Orchestrator：全流程编排、日志与 Proof 汇总。

闭环顺序：

1. 解析规则。
2. 执行校验。
3. 生成修正建议。
4. Guard 审核。
5. 发布新版本并保留快照。
6. 回推 LayerPeg 文档与 Gate 校验基线。

## 29. NormRef 作为执行体（Executor）与 Trip-SPU

1. SPU：能力模板（定义可执行能力、输入输出、规则来源）。
2. TripRole：角色动作模板（谁执行）。
3. Trip：一次具体执行实例（何时对哪个构件执行）。

执行语义：

1. NormRef Executor 提供 `rule_retrieval/gate_validation/reverse_optimize/version_management` 能力。
2. Trip 执行时通过 `spu_ref` 拉规则、校验、产出 Proof、回写 State。
3. 所有执行结果进入 Proof Chain，供审计回放。

### 29.1 容器能力补充（生产要素）

1. Skills：`rule_retrieval`、`gate_validation`、`reverse_optimize`、`version_management`。
2. Certificates：规范来源证书、规则准确性证书、版本一致性证书。
3. Energy/Cost：
   - 计算能耗：低（规则检索与校验）。
   - 存储能耗：中（版本快照与历史留存）。
   - 优化能耗：中（统计分析 + 修正建议）。

## 30. 四层 API 最终关系（并入）

1. NormRef API：规则源头（规则检索、版本、校验）。
2. LayerPeg API：五层容器（结构封装、Proof、State）。
3. TripRole API：动作执行（创建 Trip、校验、提交、推进）。
4. DTORole API：权限与视图控制（按角色返回数据、执行授权）。

统一入口定义：

`DocPeg API = NormRef + LayerPeg + TripRole + DTORole`

## 31. NormRef 版本治理（并入）

1. 每条规则独立版本，文档记录 `rule_snapshots` 与哈希。
2. 新增规则：新增 `rule_id`，不影响历史。
3. 修改规则：发布新版本，历史文档保留旧版本依据。
4. 废弃规则：标记 `deprecated`，不物理删除。
5. 强制升级：仅新建文档默认跟随最新版本，存量文档保持原版本。

## 32. 规范扫描与半自动入库流程（并入）

1. 输入：PDF/图片扫描件。
2. OCR：PaddleOCR / Vision / 本地模型提取文本。
3. Parser：转规范化 Markdown/JSON 规则。
4. 人工或 Agent 复核关键阈值与适用范围。
5. 发布到 NormRef 规则库并生成版本快照。
6. LayerPeg 在创建/更新文档时主动拉取规则并注入 Gate。

## 33. LayerPeg-FL（联邦学习）并入摘要

### 33.1 定位

`LayerPeg-FL = 在数据不出域前提下，将联邦训练过程结构化为可验证、可审计、可主权控制的五层执行协议。`

### 33.2 五层映射（FL 场景）

1. Header：`fl_task_id`、`round`、参与方、模型版本。
2. Gate：隐私/质量/身份前置条件与准入规则。
3. Body：超参数、本地更新摘要、聚合方法、性能指标。
4. Proof：客户端证明哈希、全局模型哈希、多方签名。
5. State：训练生命周期、当前状态、下一动作、版本历史。

### 33.3 最小落地要求

1. 每轮训练必须生成 `proof_id + global_model_hash + signatures`。
2. Gate 必须包含隐私阈值与更新幅度阈值。
3. State 必须可表达 `running/paused/compromised/optimized`。
4. 训练结果可回挂 CodePeg/DocPeg 执行链（部署与审计一体化）。

## 34. 页面与菜单架构（业务闭环驱动，V1）

目标：将系统从“接口驱动页面”改成“业务闭环驱动页面”，统一为：

`项目 -> 构件 -> 工序 -> 质检 -> 计量 -> 结算 -> 审计`

### 34.1 页面路由架构

```text
/workspace
/projects
/projects/:projectId/overview
/projects/:projectId/components
/projects/:projectId/components/:componentId
/projects/:projectId/components/:componentId/process
/projects/:projectId/components/:componentId/quality
/projects/:projectId/components/:componentId/measurement
/projects/:projectId/settlement
/projects/:projectId/audit
/rules/normref
/admin/integration-health
```

### 34.2 每页职责（核心）

1. Project Overview  
   作用：项目上下文一次性确定（`projectId`、角色、阶段）。  
   约束：全局 DocPeg 上下文在此确定，不在质检表单重复填写。

2. Components（构件/桩位列表）  
   作用：选中业务对象（`component_uri`/`pile_id`），查看当前状态和下一动作。  
   约束：对象绑定、`chain` 绑定入口统一放在该域。

3. Component Process（工序页）  
   作用：展示 `process-chain`、当前 step、可执行动作。  
   约束：`preview/submit`（TripRole）入口放在此页。

4. Component Quality（质检页）  
   作用：只做质检录入和结果提交。  
   包含：NormRef interpret、质检提交、不合格整改提示。  
   不包含：`projectId/chainId/component_uri` 手工输入。

5. Measurement（计量守恒页）  
   作用：查看 BOQItem、UTXO、可计量量、已付/剩余。  
   约束：价值守恒回显与质检录入分离。

6. Settlement（结算页）  
   作用：付款申请、审批、支付状态。  
   依赖：质检通过 + 计量可付。

7. Audit（审计页）  
   作用：Proof、签章、状态迁移、Trace 回放。

8. NormRef（规则治理页）  
   作用：规则版本、发布、冲突处理、生效范围。

9. Integration Health（联调健康页）  
   作用：接口绿灯、错误率、最近失败 case、Trace 定位。

### 34.3 前端发起 DocPeg API 的页面位置

统一放在两级：

1. 项目页：确定全局上下文。  
2. 构件工序页：发起执行动作。  

质检页仅负责数据输入与提交，不承担系统上下文配置。

### 34.4 菜单与页面排版规范（桌面端）

#### A. 菜单结构

| 一级菜单 | 二级页面 | 主要内容 |
| --- | --- | --- |
| 项目驾驶舱 | 项目看板 | 项目进度、告警、待办、下一动作 |
| 项目与构件 | 构件列表 / 构件详情 / 工序链 | 选择 `component/pile`、查看 `chain`、执行 `preview/submit` |
| 质量验收 | 质检录入 / 草稿与提交 / 不合格整改 | NormRef 校验、Trip 提交、整改流转 |
| 计量与结算 | BOQ 守恒 / 可计量 / 付款申请 | BOQItem、UTXO、已付/剩余、结算动作 |
| 审计与追溯 | Proof 链 / 签章状态 / 状态机历史 | `proof_id`、签章进度、过程追溯 |
| 现场资料 | 现场影像 / 施工日志 | 过程影像与日志留存 |
| 组织与标准 | 执行体管理 / 组织成员 / 角色权限 / 规范标准 / 系统设置 | 团队、权限、规则与配置管理 |

补充约束（避免“同业务多入口”）：

1. QCSpec 不提供项目注册；项目由上游系统创建后同步至 QCSpec。  
2. `新增执行体`不在侧栏独立展示，统一放在“执行体管理”页内操作。  
3. 侧栏只放稳定业务域，不放一次性动作按钮。  

#### B. 统一排版模板

1. 顶部固定上下文条：项目 + 标段 + 当前构件 + 当前角色。  
2. 左侧固定业务菜单：仅业务域，不暴露底层接口名。  
3. 中间主工作区：单页只保留一个主任务。  
4. 右侧状态栏：当前步骤 / `next_action` / `proof_id` / 异常提示。  
5. 底部日志抽屉：API trace、最近提交记录。

#### C. 防杂乱约束

1. `InspectionForm` 只做“质检录入与提交”，不再手填 `project/chain/component`。  
2. 工序上下文配置面板仅放在“工序推进”页，不放在“质检录入”页。  
3. 质检页不承载联调流水按钮（拉项目/拉模板/草稿/一键闭环），只展示联动状态与提交结果。  
4. 基础参数在“项目总览 + 构件详情 + 工序推进”确定并全局透传。  
5. 一个页面只保留一个主按钮（示例：`提交质检`）。  
6. 菜单顺序固定按业务闭环：构件 -> 质检 -> 计量 -> 结算 -> 审计。  

### 34.5 角色视图（必做）

1. 施工员：只看“我可执行的下一步”。  
2. 质检员：重点看规则命中和不通过原因。  
3. 监理：重点看审批、签章、阻断原因。  
4. 结算员：重点看可付余额、守恒状态。  
5. 管理员：重点看联调健康、规则与权限配置。

### 34.6 落地顺序（4 周）

1. 第 1 周：拆页面职责，先把上下文输入从 `InspectionForm` 移走。  
2. 第 2 周：上线 `Component Process + Quality` 双页闭环。  
3. 第 3 周：接 `Measurement + Settlement`。  
4. 第 4 周：补 `Audit + Integration Health`，形成可验收系统。

## 35. InspectionPage 联调验收映射（当前实现）

本节用于把“页面动作、接口调用、验收口径”一一对齐，直接服务联调与汇报。

### 35.1 页面闭环（当前可演示）

`InspectionPage` 已形成：

`工序推进 -> 质检录入 -> 计量守恒 -> 结算准备 -> 审计追溯`

并补充两类右侧辅助面板：

1. 业务闭环状态：展示当前步骤、next_action、proof 与结算 readiness。
2. 联调健康：展示 health、OpenAPI 路径数、服务摘要与最近 trace。

### 35.2 标签页与 API 映射

| 页面/面板 | 主动作 | 主要 API |
| --- | --- | --- |
| 工序推进（Process） | 查看链路状态、依赖、Trip 记录 | `getBindingByEntity`、`getProcessChainStatus`、`getProcessChainSummary`、`getProcessChainRecommend`、`getProcessChainDependencies`、`listTripRoleTrips` |
| 质检录入（Quality） | 录入质检并提交 | `interpretPreview`、`saveDraftInstance`、`submitDraftInstance`、`submitTripRole` |
| 计量守恒（Measurement） | 查看 BOQ/UTXO 守恒快照 | `getBoqItems`、`getBoqUtxos`、`getLayerpegChainStatus` |
| 结算准备（Settlement） | 预演结算申请、提交结算申请 | `previewTripRole`、`submitTripRole` |
| 审计追溯（Audit） | 查看 Anchor/Trip/签章阻塞 | `getLayerpegAnchor`、`listTripRoleTrips`、`getSignStatus` |
| 联调健康（Integration Health） | 查看系统连通性与接口覆盖 | `getHealth`、`getDocpegSummary`、`getOpenApi` |

### 35.3 验收口径（页面可见）

1. 工序页能看到 `chainState/currentStep/nextAction`，且支持刷新。
2. 质检页提交后，统计与记录列表可刷新回显。
3. 计量页可看到 `BOQ` 与 `UTXO` 两类数据快照。
4. 结算页只有在“质检通过 + 计量可读 + 审计无阻塞”时才允许提交。
5. 审计页能看到 `proof/doc/sign blocked_reason`。
6. 联调健康页能看到 `health/openapi paths/trace`。

### 35.4 URL 回放能力（用于评审复现）

`InspectionPage` 通过 `inspection_tab` 查询参数保持当前标签页状态：

1. 首次进入可按 URL 还原当前标签。
2. 切换标签会同步写回 URL。
3. 浏览器前进/后退可回放页面状态。

示例：

`/workspace?inspection_tab=settlement`
