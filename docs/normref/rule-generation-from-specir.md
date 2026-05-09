# Rule 生成重构：仅从 SpecIR 派生

## 1) Rule Schema
- 文件：`packages/normpeg-schemas/jsonschema/specir-derived-rule-v1.schema.json`
- 必填字段：
  - `rule_id`
  - `specir_id`
  - `normRef`
  - `slotKey`
  - `field`
  - `operator`
  - `value/min/max`（至少一类阈值信息）
  - `unit`
  - `source_text`
  - `confidence`

## 2) 生成条件
- Rule 输入仅允许 SpecIR，不允许直接使用 PDF/Catalog 作为生成输入。
- 仅当 `SpecIR.execution_status in [executable, partial_executable]` 时才可生成正式 Rule。
- `Rule.field` 必须由 `SpecIR.slotKey` 派生。

## 3) 阻断条件
- `SpecIR.execution_status = not_executable`：不生成 Rule。
- `SpecIR.execution_status in [needs_slot, needs_formula, needs_runtime]`：
  - 生成 `pending_task`
  - 不生成正式 Rule。
- 无 `specir_id` 溯源的 Rule 视为 `rejected`。

## 4) 页面 D 区修复方案
- Rule 页面状态统一四态：
  - `ready`
  - `partial`
  - `pending`
  - `rejected`
- 不再将“未生成项”统一算失败。
- 当规则缺失但存在 `needs_slot/needs_formula/needs_runtime` 时，展示 pending_task 列表（信息态）。
