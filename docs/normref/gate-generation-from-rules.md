# Gate 生成重构：仅从 ready Rule 组合

## 1) Gate Schema
- 文件：`packages/normpeg-schemas/jsonschema/rule-composed-gate-v1.schema.json`
- 必填字段：
  - `gate_id`
  - `rule_refs`
  - `logic`
  - `decision`
  - `on_pass`
  - `on_fail`
  - `confidence`
  - `evidence_refs`
  - `gate_status`

## 2) Gate 状态机
状态：
- `ready`
- `partial`
- `blocked`

转移规则：
1. `blocked`
- `rule_refs` 为空
- 或 Gate schema 不完整
- 或 rule_refs 未覆盖实际 Rule

2. `partial`
- `rule_refs` 中存在 `pending/partial/rejected` Rule
- 或并非全部 Rule 为 `ready`

3. `ready`
- `rule_refs` 全部命中
- 且全部关联 Rule 状态为 `ready`
- 且 Gate schema 完整

## 3) 生成约束
- Gate 不允许直接依赖 PDF/Catalog/normRef。
- Gate 输入只能是 Rule 集合。
- 若 `ready_rule_count=0`，Gate 不得判定为“已定义可用”。

## 4) 页面 E 区修复方案
必须展示：
- `gate_count`
- `ready_gate_count`
- `partial_gate_count`
- `blocked_gate_count`

并增加一致性检查：
- 若 `gate_count > 0` 且 `ready_rule_count = 0`，显示“逻辑不一致”告警。
