# v://normref.com/schema/normdoc-v1

NormDoc（规范文档对象）v1 冻结草案。目标是把 PDF 规范解析为可读可执行的协议对象，稳定对接 `NormRef -> LayerPeg Gate -> FormPeg`。

## 1. 目标与边界

### 1.1 目标

- 把规范文档统一建模为 `NormDoc`。
- 一次解析同时输出：
  - Markdown（人类校对）
  - JSON（机器执行）
- 通过 Gate 层完成条款定位、规则执行、依赖追踪、版本差异与增量修订。

### 1.2 边界

- v1 不要求覆盖所有行业规范，仅先支持公路工程质量检验评定类规范。
- v1 允许保留原文片段与不确定解析结果，但不得跳过核心对象（Header/Body/Gate/Trailer/IncrementalUpdates）。

## 2. 规范术语

- MUST：必须实现，不可省略。
- SHOULD：推荐实现，非阻断。
- MAY：可选实现。

## 3. 标准流水线

```text
PDF 规范文件
  -> OpenDataLoader（解析器）
  -> 双格式输出（Markdown + JSON）
  -> NormRef 引擎
  -> 生成可执行 Gate 函数
  -> LayerPeg Gate 执行
  -> FormPeg 实时校验与交互
```

## 4. 顶层对象模型（MUST）

NormDoc MUST 由以下顶层模块构成：

- `header`
- `body`
- `gate`
- `trailer`
- `incremental_updates`

## 5. Header（规范头）

`header` MUST 包含：

- `standard_id`: 标准编号（例：`JTG F80/1-2017`）
- `version`: 版本标识
- `replaces`: 替代关系（可空）
- `issuer`: 发布机构
- `effective_date`: 生效日期（ISO 日期）
- `scope`: 适用范围

建议字段（SHOULD）：

- `language`
- `jurisdiction`
- `source_uri`
- `source_hash`

## 6. Body（规范主体）

### 6.1 章节对象（Chapter Objects）

`body.chapters` MUST 支持：

- `terms_stream`（术语定义）
- `general_rules`（基本规定）
- `work_items`（分项工程）
- `evaluation_methods`（评定方法）

### 6.2 分项工程对象（Work Item）

每个 `work_item` MUST 包含：

- `basic_requirements`
- `measured_items`
- `visual_inspection`
- `documentation`

其中 `measured_items` MUST 是可执行内容流，至少包含：

- `check_item`
- `required_value`
- `tolerance`
- `check_method`

### 6.3 表格对象（Table XObjects）

`body.tables` MUST 支持：

- `inspection_record_tables`
- `evaluation_tables`
- `summary_tables`

### 6.4 公式对象（Formula Stream）

`body.formulas` MUST 支持：

- `representative_value_formula`
- `pass_rate_formula`
- `score_formula`

### 6.5 引用字典（Ref Dictionary）

`body.ref_dictionary` MUST 支持：

- `outbound_refs`（引用其他规范）
- `inbound_refs`（被反向引用）
- `patch_refs`（局部修订引用）

## 7. Gate（准入控制与交叉引用）

Gate 是 NormDoc 的执行中枢，语义类比 PDF XRef，但面向逻辑执行而非字节定位。

`gate` MUST 包含：

- `clause_xref_table`: 条款号 -> 逻辑偏移/定位键
- `table_rule_tree`: 表格字段约束树
- `dependency_graph`: 字段/公式/条款依赖图
- `diff_xref`: 版本差异映射

### 7.1 Gate 执行语义（MUST）

执行 "压实度评定" 的标准步骤：

1. 通过 `table_rule_tree` 定位目标表（如 T0921）。
2. 装载字段约束（规定值/偏差/单位/方法）。
3. 按 `dependency_graph` 递归装载公式与条款依赖。
4. 运行校验函数并输出 `verdict + actions + proof`。

### 7.2 Gate 与 PDF XRef 差异（MUST 明确）

- PDF XRef：`byte_offset -> object`
- Norm Gate：`logic_dependency -> execution_path`

### 7.3 参考实现（Python）

当前仓库已提供第二层 Gate 引擎参考实现：

- `services/table-engine-adapter/app/gate_engine.py`

并通过 API 暴露：

- `POST /api/v1/gate/validate-field`
- `POST /api/v1/gate/validate-cross-field`
- `POST /api/v1/gate/validate-paragraph`
- `POST /api/v1/gate/apply-incremental-updates`

## 8. Trailer（规范尾）

`trailer` MUST 包含：

- `root`: 规范目录入口
- `info`: 信息字典
  - `chief_editor_org`
  - `contributors`
  - `revision_history`
- `prev`: 前一版本位置（支持增量链）

## 9. Incremental Updates（增量更新）

`incremental_updates` MUST 支持：

- `patches`（局部修订条文）
- `errata_stream`（勘误）
- `project_overrides`（项目覆盖层）

### 9.1 合并优先级（MUST）

最终生效值按顺序叠加：

1. 原始规范
2. 已生效补丁
3. 项目覆盖（有权限与范围约束）

表达式：

```text
effective_value = base + patches(effective_date<=now) + project_overrides(scope+auth)
```

## 10. 术语 CMap（领域语义映射）

`term_cmap` MUST 实现“现场口语 -> 标准术语编码”映射。

示例（MUST 支持可配置扩展）：

- `水稳` -> `水泥稳定碎石基层`
- `二灰` -> `石灰粉煤灰稳定土基层`
- `油面` -> `沥青混凝土面层`
- `压实度代表值` -> `算术平均值下置信界限`

运行要求：

- 输入时先模糊匹配术语。
- 用户确认后锁定标准编码。
- 原始词与标准词均入审计链。

## 11. PDF 对象到 NormDoc 的映射（MUST）

| PDF 概念 | NormDoc 对应 | 场景 |
|---|---|---|
| 对象编号（Obj 1 0 R） | 条款对象标识（Clause 3.2.1） | 压实度条款 |
| 间接引用 | 规范互引 | 自动跳转关联规范 |
| Content Stream | 检查项目流 | 实测项目清单 |
| Dictionary | 检查项目字典 | 规定值/偏差/方法 |
| XObject | 表格模板对象 | 记录表/评定表 |
| ToUnicode CMap | 术语 CMap | 行业俗称映射 |
| 增量更新 | patch/errata/override | 修订与项目特化 |

## 12. 解析与渲染执行流程（MUST）

1. `Lexical Analysis`：原始文本 -> Token
2. `Syntactic Analysis`：Token -> AST（表、字段、值、单位）
3. `Semantic Analysis`：Gate 校验（规则执行、阻断动作、建议）
4. `Rendering`：输出 JSON/Markdown/可视标记/Action Queue/Proof

## 13. 唯一标识与依赖（关键约束）

### 13.1 标识规则（MUST）

对象唯一键建议格式：

```text
{standard_id}:{clause_id}:{table_id}:{field_id}
```

### 13.2 循环依赖（MUST）

- Norm 允许逻辑循环引用（例如代表值依赖全表聚合）。
- 引擎 MUST 做死循环检测并返回可诊断错误。

## 14. 数据压缩与安全（MUST）

- 实测序列 SHOULD 使用 Delta 编码（桩号相邻差值存储）。
- 敏感项目数据 MUST 字段级加密。
- 解密 MUST 受角色密钥与权限约束。

## 15. 双格式输出契约（MUST）

NormDoc 管道输出对象 MUST 同时包含：

- `document_markdown`
- `document_json`
- `table_schema`
- `meta.pipeline = "NormRef -> LayerPeg Gate -> FormPeg"`

示例：

```json
{
  "normref_bundle": {
    "document_markdown": "# ...",
    "document_json": {"header": {}, "body": {}, "gate": {}, "trailer": {}, "incremental_updates": {}},
    "table_schema": {"schema_version": "1.5.0", "cells": []},
    "meta": {
      "source": "opendataloader-adapter",
      "pipeline": "NormRef -> LayerPeg Gate -> FormPeg"
    }
  }
}
```

## 16. v1 验收清单（不得偏离）

以下条目全部满足才可称为 NormDoc v1：

- 顶层五大模块完整。
- Measured Items 可执行字段齐全。
- Gate 四大结构齐全并可执行依赖链。
- 增量更新支持 patch/errata/project override。
- CMap 生效并可审计。
- 双格式输出同时可用。
- 关键动作可输出 Proof 证据链。

## 17. 非目标（v1）

- 不要求一次覆盖所有行业规范语料。
- 不要求替代人工复核，仅要求机器可执行与可追溯。

## 18. 后续实现顺序（建议）

1. `normdoc-v1.json`（JSON Schema）
2. 解析器映射层（PDF -> NormDoc）
3. Gate 执行器（规则树 + 依赖图）
4. 增量更新合并器（patch/override）
5. CMap 服务化与术语审计
6. FormPeg 实时校验接入
