# SpecIR 与 Rule/Gate 派生关系（含 Slot 约束）

## 1. 主约束
- SpecIR 是主资产，Rule/Gate 是派生产物。
- Rule 的 `field` 只能来自 `SpecIR.slotKey`，禁止直接使用 `measured_value` 作为正式 field。
- `measured_value` 仅允许作为 fallback/debug 字段留存，不参与正式发布判定。

## 2. 派生映射
1. SpecIR -> Rule
- `specir_id` -> `rule.source_specir_id`
- `normRef` -> `rule.norm_ref`
- `slotKey` -> `rule.field`（唯一正式来源）
- `constraint.operator/value/min/max/unit/formula` -> `rule.operator/value/min/max/unit/formula`
- `evidence.*` -> `rule.traceability`
- `confidence` -> `rule.confidence`

2. Rule -> Gate
- 同一 `specir_id` 下 Rule 聚合为 `gate.rule_refs[]`。
- Gate 仅针对 `execution_status in [executable, partial_executable]` 的 SpecIR 生成。

## 3. 派生前置判定
- Rule 可派生：
  - `slotKey` 合法（`domain.object.property.measure`）
  - `constraint.operator` 非空
  - `evidence.source_text` 非空
- Gate 可派生：
  - Rule 已派生且结构完整
  - `execution_status != needs_slot`
  - 非 `non_executable_clause`

## 4. 失败归因
- 无 `slotKey`：`execution_status = needs_slot`
- 公式缺失：`execution_status = needs_formula`
- 运行时映射缺失：`execution_status = needs_runtime`
- 上述均不算 semantic unresolved。
