# ComponentUTXO 修复与收敛方案

更新时间：2026-04-03

## 目标范围（只做三件事）

1. 模型统一到 `ComponentUTXO = boq_items + bom + material_inputs`（`material_bindings` 仅兼容历史输入）。
2. 守恒校验按“每种物料独立守恒”执行，不再按单材料线拆散构件语义。
3. Final Proof 因子必须稳定输出：`material_chain_root_hash`、`bom_deviation_hash`、`norm_acceptance_hash`。

## 已完成

### 1) ComponentUTXO 核心模型与验证

文件：`services/api/domain/execution/triprole_component_utxo.py`

- 新增 `MaterialInputUTXO`，并将 `material_inputs` 作为主输入。
- `ComponentUTXO.compute_proof()` 纳入 `boq_items`、`bom`、`material_inputs`。
- `validate_component_conservation()` 支持按 `material_role` 聚合后计算 `planned/actual/delta`。
- `evaluate_component_conservation()` 支持多级阈值来源：
  - binding 显式阈值
  - bom 约束阈值
  - NormRef（`tolerance_spec_uri`）
  - 默认阈值
- 保留 `material_bindings` 兼容路径，避免历史 payload 断裂。

### 2) TripRole 结算阶段绑定 ComponentUTXO

文件：`services/api/domain/execution/triprole_action_settlement.py`

- `settlement.confirm` 支持读取 `payload.component_utxo` 或 `state_data.component_utxo`。
- 默认启用构件前置校验，缺失时阻断：
  - `settlement_precondition_failed: component_utxo_missing`
- 构件守恒不通过时阻断：
  - `settlement_precondition_failed: component_conservation_failed`
- 结算成功时写入：
  - `state_data.component_utxo`
  - `state_data.final_proof_factors`
  - `state_data.final_proof_factors.final_proof_hash`

### 3) DocPeg 构件报告最小闭环

文件：`services/api/domain/execution/triprole_component_docpeg.py`

- 统一生成 `component_report` 的上下文、二维码链接与 `docx` 输出。
- 模板缺失时提供 fallback 文档渲染。
- 报告上下文中保留字段来源映射，便于验收追溯。

### 4) Beam-L3 离线验收 Demo

文件：`tools/acceptance/component_utxo_beam_l3_demo.py`
配置：`tools/acceptance/config/component_utxo_beam_l3.sample.json`

- 演示链路：`material_inputs -> quality.check -> conservation -> docpeg bundle -> summary JSON`
- 输出文件：`beam_l3_component_demo_summary.json`
- 可用 `--skip-docpeg` 进行纯逻辑验收。
- 样例数据已从脚本硬编码下沉到配置文件，可复用、可扩展、可固定回归。

### 5) 自动化冒烟

文件：`services/api/tests/test_component_utxo_beam_l3_demo_smoke.py`

- 通过子进程执行 Demo（`--skip-docpeg`）。
- 断言：
  - 退出码为 0
  - 输出包含 `[DONE]`
  - summary JSON 存在
  - `ok/passed/proof_hash/material_count` 正常

### 6) 门禁脚本（可挂 CI）

文件：`tools/acceptance/component_utxo_gate.py`

- 一键执行：
  - `test_triprole_component_utxo.py`
  - `test_triprole_action_settlement.py`
  - `test_component_utxo_beam_l3_demo_smoke.py`
  - （可选）离线 Demo 实跑
- 输出统一 `[DONE] component_utxo_gate passed`，便于流水线日志检索。
- 已提供 GitHub Actions 门禁模板：`.github/workflows/component-utxo-gate.yml`

### 7) DocPeg 模块测试补齐

文件：`services/api/tests/test_triprole_component_docpeg.py`

- 覆盖 `build_component_docpeg_context` 的核心字段与 `verify_uri` 拼装。
- 覆盖 fallback docx 渲染（无模板路径）。
- 覆盖 `build_component_docpeg_bundle` 在 `include_docx_base64=False` 场景下的输出结构。

## 待完成（下一步）

1. 将 Beam-L3 Demo 的样例数据沉淀为固定验收数据集（便于回归比对）。
2. 若使用非 GitHub CI（Jenkins/GitLab/Buildkite），按 `component_utxo_gate.py` 复刻同等门禁任务。
3. 对 `triprole_component_docpeg.py` 增补单元测试（当前已能跑，测试覆盖仍偏薄）。

## 验收标准（DoD）

满足以下条件视为本轮完成：

1. 一个构件可同时绑定多个 `boq_items` 与多个 `material_inputs`。
2. 同一物料类型可有多个输入 UTXO，且按类型聚合守恒判定。
3. 返回结果可追溯每条输入来源（UTXO ID、proof hash、boq item）。
4. Final Proof 因子稳定可复算，不依赖前端临时字段。
5. `settlement.confirm` 在缺失构件数据或守恒失败时会硬阻断。

## 建议执行命令

```bash
pytest services/api/tests/test_triprole_component_utxo.py -q
pytest services/api/tests/test_triprole_action_settlement.py -q
pytest services/api/tests/test_component_utxo_beam_l3_demo_smoke.py -q
python tools/acceptance/component_utxo_beam_l3_demo.py --skip-docpeg --payload-file tools/acceptance/config/component_utxo_beam_l3.sample.json
python tools/acceptance/component_utxo_gate.py --skip-demo
```
