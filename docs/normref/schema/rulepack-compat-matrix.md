# Rulepack 兼容矩阵（v1/v2）

更新时间：2026-05-07

## 版本定义
- `legacy`：历史包，`meta.schema_version` 缺失。
- `v1`：`meta.schema_version = "v1"`，对应 `rulepack-v1.schema.json`。
- `v2`：`meta.schema_version = "v2"`，对应 `rulepack-v2.schema.json`。

## 兼容矩阵
| 阶段 | legacy | v1 | v2 | 说明 |
|---|---|---|---|---|
| Build 输出 | ❌ | ✅ | ❌ | 构建器当前只直接输出 v1 |
| Publish 输入 | ✅ | ✅ | ✅ | 发布前强制 schema 校验，不通过即失败 |
| Runtime 读取 | ✅ | ✅ | ✅ | 读取时自动识别版本并校验 |
| Migration v1->v2 | ✅* | ✅ | - | `legacy` 先按 v1 基线校验后再迁移 |

\* `legacy` 只有在满足 v1 基线（可归一化校验通过）时允许迁移。

## 不兼容失败策略
1. 若 `meta.schema_version` 为未知值（如 `v3`），发布/运行时立即失败。  
2. 若 schema 校验失败，返回字段路径错误（示例：`rules[3].threshold missing`）。  
3. Build 请求若指定 `schema_version != v1`，立即失败并提示先走迁移脚本。  

## 迁移脚本
脚本：`tools/normpeg/migrate_rulepack_v1_to_v2.py`

示例：
```bash
python tools/normpeg/migrate_rulepack_v1_to_v2.py \
  --input uploads/normref/rulepacks/xxx.rulepack.json \
  --output uploads/normref/rulepacks/xxx.v2.rulepack.json
```

行为：
1. 输入按 v1 基线校验（兼容 legacy）  
2. 迁移为 v2（`gate.ruleRef -> gate.ruleRefs[]`）  
3. 输出按 v2 schema 校验，失败则不落盘  
