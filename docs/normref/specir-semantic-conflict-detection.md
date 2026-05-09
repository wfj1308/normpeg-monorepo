# SpecIR 语义冲突检测

## 冲突 Schema
- 文件：`packages/normpeg-schemas/jsonschema/specir-semantic-conflict-v1.schema.json`
- 核心字段：
  - `slotKey`
  - `condition`
  - `conflict_type`
  - `left/right`（两侧规则：operator/threshold/unit/version）
  - `override_required`
  - `override_status`

## 检测算法说明
1. 归一化输入：
   - 从 SpecIR 提取 `slotKey/condition/constraint/evidence.version/normRef`。
   - `condition` 为空时按 `global` 处理。
2. 主检测（同 `slotKey` + 同 `condition`）：
   - `operator` 不同 -> `threshold_conflict`
   - 阈值（`value|min|max`）不同 -> `threshold_conflict`
   - `unit` 不同 -> `unit_conflict`
   - `version` 不同 -> `version_conflict`
   - 完全相同 -> `duplicate_rule`
   - 同 operator 且数值不同 -> `stricter_rule_override`
3. 范围检测（同 `slotKey` + 不同 `condition`）：
   - 若 operator/threshold 不一致 -> `scope_conflict`
4. 去重：
   - 用 `conflict_type + slotKey + condition + left_specir_id + right_specir_id` 去重。

## 页面展示
- E 区新增冲突表：
  - 列：`type / slotKey / condition / left / right / override`
  - 支持逐条填写 `override comment` 并点击“确认 override”
- F 区发布判定：
  - 展示 `语义冲突未处理数量`
  - 若存在 `pending` 冲突，发布状态强制 `blocked`

## 人工 Override 流程
1. 审核人打开 E 区冲突列表，逐条确认冲突原因。
2. 对允许覆盖的冲突填写 `override 说明` 并执行 `确认 override`。
3. 未 override 冲突数必须为 0，F 区才允许发布。
4. 若拒绝覆盖，保留冲突并继续阻断发布，需回到 SpecIR/Rule 修订后重新检测。
