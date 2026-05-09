# DocPeg 五层通用文档结构 v1.1

所有文档（质检报告、合同、会议纪要、竣工资料等）统一采用五层结构：

## Layer 1: Header
- `doc_type`: `v://normref.com/doc-type/...@v1`
- `doc_id`
- `v_uri`
- `version`
- `created_at`
- `project_ref`
- `jurisdiction`
- `trip_role`
- `dtorole_context`

## Layer 2: Gate
- `pre_conditions`
- `entry_rules`
- `trigger_event`
- `norm_refs`
- `required_trip_roles`
- `dtorole_permissions`

## Layer 3: Body
- `basic`
- `items`（可映射 `test_data` / `clauses` / `items`）
- `relations`（BOQItem、Trip、MaterialUTXO、Personnel 等）
- `trip_context`（executed_by / executed_at / input / output）

## Layer 4: Proof
- `signatures`
- `timestamps`
- `data_hash`
- `witness_logs`
- `audit_trail`
- `proof_hash`
- `trip_proof_hash`
- `dtorole_proof`

## Layer 5: State
- `lifecycle_stage`（`draft -> pending_review -> approved -> archived`）
- `valid_until`
- `retention_period`
- `access_level`
- `next_action`
- `state_matrix`
- `current_trip_role`
- `dtorole_state`

## Canonical Schema URI
- `v://normref.com/schema/docpeg-specir-v1.1`
