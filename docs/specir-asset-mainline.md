# SpecIR 资产主线重构说明

## 1) 主流程（主资产 = SpecIR）
统一主线：

`PDF -> Document IR -> Catalog -> normRef -> SpecIR -> Rule -> Gate -> 单表 rulepack -> NormDoc -> 发布`

约束：
- SpecIR 是唯一主资产（authoritative asset）。
- Rule/Gate/Component/NormDoc 都是 SpecIR 派生资产，不可反向覆盖 SpecIR。
- 发布前校验以 SpecIR 完整度为先，再校验 Rule/Gate/rulepack/NormDoc。

## 2) 状态字段设计（建议统一结构）
每个阶段使用统一结构：

```json
{
  "status": "not_started | running | success | failed | blocked",
  "output_count": 0,
  "error": "optional_error_code",
  "blocked_by": "optional_previous_stage_key"
}
```

阶段 key 顺序：

1. `pdf`
2. `documentIR`
3. `catalog`
4. `normRef`
5. `specIR`
6. `rule`
7. `gate`
8. `rulepack`
9. `normDoc`
10. `publish`

Root cause 约束：
- 仅允许一个 root cause（首个失败/阻断点）。
- 推荐错误码：
  - `catalog_failed`
  - `normref_empty`
  - `specir_empty`

## 3) 页面展示规则
### 3.1 顶部流程条
- 必须按上述 10 阶段顺序显示。
- 文案必须体现 `SpecIR主资产`。
- 阻断显示 `blocked_by`，并在 Root Cause 卡片中单点呈现。

### 3.2 状态统计优先级
- 所有统计先展示 SpecIR 层指标，再展示 Rule/Gate。
- 推荐顺序：
  1. SpecIR：`specir_count / approved_count / unresolved_count / confidence_distribution`
  2. Rule/Gate：`rule_count / gate_count / unresolved`
  3. rulepack：`selected_specir_count / publishable`
  4. NormDoc/发布：`valid / publish_status`

### 3.3 文案约束
- 禁止出现“Rule 是核心资产/主资产”表述。
- Rule 区文案统一为“SpecIR 派生执行规则”。
- 输入区文案统一为“目标输入终点是 SpecIR”。
