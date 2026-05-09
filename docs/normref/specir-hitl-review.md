# SpecIR 主资产人工校验

## 校验表 Schema
- 文件：`packages/normpeg-schemas/jsonschema/specir-review-checklist-v1.schema.json`
- 每条可执行 SpecIR 校验记录必须包含：
  - `body_check`：`normRef_correct/source_text_consistent/slotKey_correct/unit_correct`
  - `gate_check`：`operator_correct/threshold_correct/decision_logic_correct/on_fail_correct`
  - `cal_check`：`formula_required/inputs_complete/formula_correct/outputUnit_correct`
  - 签字字段：`reviewer_id/reviewer_name/review_status/review_comment/signed_at/signature_hash`

## 页面交互设计
- 人工确认列表只展示 `SpecIR`（`execution_status=executable|partial_executable`）。
- 列表默认按 `confidence` 排序：`low -> medium -> high`。
- 每行展示：
  - SpecIR 标识（`specir_id` + `semantic_type/normRef`）
  - `body/gate/cal` 三段检查摘要
  - `confidence`
  - 闭环提示（缺失项或低置信度）
  - 当前审核结论
- 行级操作：
  - `通过`：写入 `review_status=approved`
  - `需修改`：写入 `review_status=needs_edit` 并支持展开 patch 修复
  - `驳回`：写入 `review_status=rejected`
- Patch 面板默认模板针对 SpecIR 字段（`slotKey/constraint/gate/outputUnit`）。

## 通过/驳回/需修改流程
1. 系统生成可执行 SpecIR 清单并预填 body/gate/cal 检查项。
2. 审核人选择结论：
   - `通过`：记录审核与签字，进入可发布统计。
   - `需修改`：记录审核，提交 patch 回写 `13_specir.json`，自动触发后续派生刷新。
   - `驳回`：记录审核并阻断发布（写入 blocker）。
3. 每次提交均写入审计：
   - `reviewed_at/signed_at/signature_hash`
   - `reviewer_id/reviewer_name`
   - `decision/review_status/comment/changed_fields`
