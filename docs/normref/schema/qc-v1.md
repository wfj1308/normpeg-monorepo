# v://normref.com/schema/qc-v1

DocPeg / NormRef 通用质检协议模板（五层结构 + Gate 判定 + Proof 产出）。

- 协议类型: `QualityCheckProtocol`
- 版本: `v1`
- 适用域: `construction/highway`
- 推荐入口: `/v1/normref/resolve`, `/v1/normref/verify`（兼容 `/api/normref/*`）

## 必备结构

1. `metadata`: 文档锚点与上下文
2. `gates`: 阈值阵列（operator + value + unit）
3. `verdict_logic`: 判定逻辑（输入 -> 结果）
4. `output_schema`: 统一输出
5. `layers`: Header / Gate / Body / Proof / State

## State Matrix 双命名约定

规范命名（协议内核）：
- `expected_qc_table_count`
- `generated_qc_table_count`
- `signed_pass_table_count`
- `pending_qc_table_count`

展示命名（兼容前端和看板）：
- `total_qc_tables`
- `generated`
- `signed`
- `pending`

建议：协议输出同时包含两套键名，避免历史版本互通时丢字段。
