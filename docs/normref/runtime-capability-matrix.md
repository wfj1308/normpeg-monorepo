# Runtime Capability Matrix

## Runtime Schema
- 基于 `SpecIR Asset v1` 增加字段：
  - `runtime_requirements[]`:
    - `manual_input`
    - `sensor`
    - `lab_test`
    - `design_value`
    - `measured_value`
    - `bim_model`
    - `formula_engine`
    - `external_standard`
    - `human_judgement`
  - `runtime_mode`:
    - `automatic`
    - `semi_automatic`
    - `manual_confirmed`
    - `non_executable`

## 规则约束
1. 缺运行时输入时，`execution_status = needs_runtime`。  
2. 不可机器判定但可人工判断时，`runtime_mode = manual_confirmed`。  
3. 纯说明性条款，`runtime_mode = non_executable`（且 `semantic_type=non_executable_clause`，`execution_status=not_executable`）。  

## 示例
- 示例文件：`docs/normref/specir-asset-examples.json`
  - 例 1：自动执行（`automatic` + `measured_value`）
  - 例 2：半自动（`semi_automatic` + `sensor/formula_engine/manual_input`，且 `needs_runtime`）
  - 例 3：不可执行说明性条款（`non_executable`）

## 页面展示方式
- C 区（SpecIR 主资产）新增：
  - `Runtime Mode Matrix`：automatic / semi_automatic / manual_confirmed / non_executable
  - `Runtime Requirements Coverage`：9 类 requirements 覆盖计数
- 与现有 execution_status 联动：
  - `needs_runtime` 不再泛化为失败，而是明确为“运行时依赖未满足”的待补齐状态。
