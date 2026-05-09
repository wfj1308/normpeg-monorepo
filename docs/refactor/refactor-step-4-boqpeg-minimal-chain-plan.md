# Step 4 - BOQ 主链最小闭环迁移到 BOQPeg

## 1. 目标

把“上传 BOQ Excel -> 解析 -> 生成 BOQItem -> 生成/关联 UTXO -> 形成 Proof 链”这条最小业务主链收口到独立 `boqpeg` 领域，且保持当前可运行能力。

## 2. 闭环定义（本步必须跑通）

最小闭环包含：

1. Excel/CSV 导入清单行。
2. 标准库引用化：每个 BOQItem 只保留 `ref_spu_uri` 等 ref 字段。
3. 规则绑定：GateRule/SpecDict 通过 ref 关联，不在 BOQItem 内复制规则体。
4. UTXO 创世：按 BOQItem 生成确定性 genesis。
5. Proof 可追溯：可在 Proof 链查到 BOQItem 关联来源。

## 3. 当前基线（关联文件）

1. `services/api/domain/boq/runtime/utxo.py`
2. `services/api/domain/boq/runtime/specdict_gate.py`
3. `services/api/domain/autoreg/runtime/autoreg.py`
4. `services/api/domain/utxo/runtime/transaction.py`
5. `services/api/domain/utxo/runtime/query.py`
6. `infra/supabase/018~026`（SpecIR 与 ref-only 迁移）

## 4. 目标结构与职责

建议新增：

1. `services/api/domain/boqpeg/`
2. `services/api/domain/boqpeg/runtime/parser.py`
3. `services/api/domain/boqpeg/runtime/ref_binding.py`
4. `services/api/domain/boqpeg/runtime/genesis.py`
5. `services/api/domain/boqpeg/runtime/orchestrator.py`

职责边界：

1. `parser.py`: 只做清单结构化解析。
2. `ref_binding.py`: 只做 SPU/规格/计量/定额引用解析与修复。
3. `genesis.py`: 只做 deterministic hash 与 UTXO payload 构建。
4. `orchestrator.py`: 组合流程并返回可审计结果。

## 5. 数据契约（必须落实）

每个 BOQItem 的持久化字段至少包含：

1. `boq_item_uri`
2. `project_uri`
3. `quantity`
4. `unit`
5. `unit_price`
6. `ref_spu_uri`
7. `ref_gate_uri` 或 `ref_gate_uris`
8. `ref_meter_rule_uri`
9. `ref_quota_uri`
10. `genesis_hash`

约束：

1. 不在 BOQItem 行内重复保存完整规则 body。
2. 标准规则变更通过 SpecIR 版本升级体现，不回写 BOQItem 规则体。

## 6. API 与迁移策略

### 6.1 API 过渡

1. 先保留现有 BOQ 路由。
2. 新增 BOQPeg 路由组（建议 `/v1/qcspec/boqpeg/*`）。
3. 旧路由内部转调 `boqpeg/orchestrator.py`，实现行为一致迁移。

### 6.2 数据过渡

1. 使用现有 SQL：`018~026` 作为基础。
2. 对历史项目执行 backfill，补齐缺失 `ref_*` 字段。
3. 对 ref-only 违规行出具审计报表，不静默吞错。

## 7. 测试与验收

新增或强化测试：

1. `services/api/tests/test_boq_ref_only_spu_refs.py`
2. `services/api/tests/test_specir_*`
3. 新增 `services/api/tests/test_boqpeg_e2e_minimal_chain.py`

E2E 断言：

1. 导入 1 份样例 BOQ 后，所有 leaf item 都有 `ref_spu_uri`。
2. 生成的 `genesis_hash` 稳定可复算。
3. 至少 1 条 UTXO 成功写入并可查询。
4. Proof 链页面可按项目 URI 检索到对应记录。

建议命令：

```powershell
pytest services/api/tests/test_boq_ref_only_spu_refs.py
pytest services/api/tests/test_specir_spu_schema.py
pytest services/api/tests/test_boqpeg_e2e_minimal_chain.py
```

## 8. 风险与控制

风险：

1. 历史 BOQ 数据质量不齐，导致 ref 解析失败。
2. 编码污染（乱码）影响 item_no/unit 归一化。

控制：

1. 引入“可修复错误”和“阻断错误”双层策略。
2. 解析阶段输出标准化报告，包含原值、修复值、修复规则。
3. backfill 先 dry-run，再正式写入。

## 9. 输出物

1. BOQPeg 独立运行骨架完成。
2. 最小闭环从导入到 Proof 全链跑通。
3. 旧 BOQ 路由转调新编排，兼容期可平滑切换。

