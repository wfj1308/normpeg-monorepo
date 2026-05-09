# Component 生成收敛规则（防膨胀）

## 1. 生成条件（满足其一）
- `component_eligibility_score >= 0.7`
- 已被 `Rule/Gate/DTO` 任一引用
- 被单表 `rulepack` 明确需要（`needed_by_rulepack=true`）

## 2. 评分维度
- `executability_score`
- `reusability_score`
- `cross_form_usage`
- `semantic_value_score`
- `stability_score`

综合分（当前实现）：
- `0.30 * executability_score`
- `0.25 * reusability_score`
- `0.15 * cross_form_usage_score`
- `0.20 * semantic_value_score`
- `0.10 * stability_score`

## 3. 阻断条件
以下条款默认阻断，不进入普通 Component 生成：
- 目录节点
- 章节标题
- 纯说明性条款
- `semantic_type=non_executable_clause`

说明：
- 若被 Rule/Gate/DTO 引用或被 rulepack 明确需要，可被强制保留（用于链路完整性）。

## 4. 页面统计改造
页面必须区分三类，不可混算：
- `clause_count`
- `specir_count`
- `component_count`

建议同时展示：
- `blocked_component_count`（被规则拦截的 Component 数）
- 使“条款多”与“高价值可复用构件少”能被直观看到。
