# 规范库全局 Slot System

## 1) Slot Schema
- 文件：`packages/normpeg-schemas/jsonschema/slot-system-v1.schema.json`
- `slotKey` 格式：`domain.object.property.measure`
- 正则：`^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){3}$`
- 示例：
  - `bridge.rebar.cover_thickness`
  - `bridge.grouting.pressure`
  - `bridge.compaction.degree`

## 2) Slot 生成规则
1. 来源优先级
- `SpecIR.slotKey`（人工确认/规则库既有映射）
- 历史映射（相同 `normRef + semantic_type + subject`）
- 语义生成（domain/object/property/measure 分解）

2. 生成规范
- 全小写
- 4 段固定结构
- 仅 `a-z0-9_`（段间用 `.`）
- 禁止保留值：`measured_value`

3. Rule 派生规则
- `Rule.field = SpecIR.slotKey`
- 若无合法 `slotKey`，Rule 不进入可执行态。

## 3) Slot 绑定失败处理
1. 状态处理
- 缺 slot：`execution_status = needs_slot`
- 缺公式：`execution_status = needs_formula`
- 运行时依赖缺失：`execution_status = needs_runtime`

2. 错误分流
- 以上属于执行层阻塞，不计入 semantic unresolved。
- semantic unresolved 仅由 `semantic_status in [ambiguous, conflicted, rejected]` 定义。

3. fallback/debug
- `measured_value` 仅可保存到 debug 字段（如 `debug_field`），禁止作为正式 `Rule.field`。

## 4) 页面展示方式
1. Rule 区（D）
- 每条显示：
  - `slot_key`
  - `field`（正式，来自 slotKey）
  - `debug_field(fallback)`
  - `semantic_status`
  - `execution_status`
- 筛选“仅 unresolved”只看 semantic unresolved。

2. Gate 区（E）
- Gate 失败提示必须引用 `SpecIR.execution_status` 分布。
- 若仅因 `needs_slot/needs_formula/needs_runtime/not_executable` 无 Gate，展示为信息态（非错误）。
