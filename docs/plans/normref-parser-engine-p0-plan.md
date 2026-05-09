# NormRef 规范解析编译引擎（P0 开发落地清单）

## 1. 目标与范围

### 1.1 P0 目标（可上线）
- 支持上传 PDF 规范并自动解析为结构化条文与规则候选。
- 支持将规则候选编译为可执行 SpecIR/Gate。
- 支持版本化发布（规则级版本 + 快照哈希）。
- 支持“自动解析 + 人工确认发布”闭环。

### 1.2 本轮优先规范（3 本）
- 《公路工程质量检验评定标准 第一册 土建工程》（JTG F80/1—2017）
- 《公路养护工程质量检验评定标准 第一册 土建工程》（JTG 5220—2020）
- 《公路工程质量检验评定标准 第二册 机电工程》（JTG 2182—2020）

### 1.3 非目标（P0 不做）
- 不做全行业一次性全量自动覆盖。
- 不做“零人工”自动发布（必须人工确认冲突与歧义）。
- 不做复杂图表识别的 100% 准确率承诺。

---

## 2. 总体流程（上传到可执行）

1. 上传规范 PDF  
2. 文档解析（文本/OCR/目录/条文/表格）  
3. 语义归一（字段、单位、阈值、检验频率）  
4. 规则候选生成（rule candidate）  
5. 冲突检测与裁决池（国家/行业/地方/项目）  
6. 人工审核通过后发布规则版本  
7. 编译为 SpecIR + Gate 模板  
8. 项目 Ref-Link 挂载使用  

---

## 3. API 设计（P0）

> 前缀建议：`/api/v1/normref/ingest`

### 3.1 上传与解析
- `POST /api/v1/normref/ingest/upload`
  - 入参：`multipart/form-data`（pdf 文件、标准编号、发布年份、层级）
  - 出参：`ingest_job_id`

- `GET /api/v1/normref/ingest/jobs/{ingest_job_id}`
  - 返回解析任务状态：`queued/running/review_required/failed/completed`

- `GET /api/v1/normref/ingest/jobs/{ingest_job_id}/artifacts`
  - 返回中间产物：目录树、条文块、表格块、规则候选列表

### 3.2 规则候选与审核发布
- `GET /api/v1/normref/ingest/rule-candidates?job_id=...`
- `POST /api/v1/normref/ingest/rule-candidates/{candidate_id}/approve`
- `POST /api/v1/normref/ingest/rule-candidates/{candidate_id}/reject`
- `POST /api/v1/normref/ingest/publish`
  - 入参：候选 ID 列表 + `version_tag`（如 `2026-04`）
  - 出参：发布的 `rule_id@version` 与 `snapshot_hash`

### 3.3 冲突处理
- `GET /api/v1/normref/ingest/conflicts?status=open`
- `POST /api/v1/normref/ingest/conflicts/{conflict_id}/resolve`
  - 入参：`resolution_strategy`（strictest/contract_override/manual_pick）
  - 出参：裁决结果与审计记录

### 3.4 编译与项目挂载
- `POST /api/v1/normref/ingest/compile-specir`
  - 入参：规则集 ID 或 `rule_id@version` 列表
  - 出参：SpecIR URI、生成的 Gate 模板数量

- `POST /api/v1/normref/ingest/ref-link`
  - 入参：`project_uri` + `specir_uri`
  - 出参：挂载结果

---

## 4. 数据表设计（PostgreSQL / Supabase）

### 4.1 规范与版本
- `normref_documents`
  - `id`, `std_code`, `title`, `level`（national/industry/local/enterprise）
  - `publish_year`, `effective_from`, `effective_to`, `source_file_uri`, `file_hash`
  - `status`, `created_at`, `updated_at`

- `normref_document_versions`
  - `id`, `document_id`, `version_tag`, `content_hash`, `is_active`, `created_at`

### 4.2 解析任务与中间产物
- `normref_ingest_jobs`
  - `id`, `document_id`, `status`, `progress`, `error_message`
  - `started_at`, `finished_at`, `created_by`

- `normref_parsed_sections`
  - `id`, `job_id`, `section_no`, `section_title`, `raw_text`, `page_from`, `page_to`

- `normref_parsed_tables`
  - `id`, `job_id`, `table_no`, `table_title`, `table_json`, `page_no`

### 4.3 规则候选与发布
- `normref_rule_candidates`
  - `id`, `job_id`, `rule_id`, `category`, `field_key`
  - `operator`, `threshold_value`, `unit`, `scope_json`, `norm_ref`
  - `confidence`, `status`（pending/approved/rejected）
  - `candidate_hash`, `created_at`

- `normref_rules`
  - `id`, `rule_id`, `version_tag`, `uri`, `category`
  - `rule_json`, `hash`, `is_active`, `published_at`, `published_by`

- `normref_rule_snapshots`
  - `id`, `snapshot_hash`, `version_tag`, `rule_count`, `snapshot_json`, `created_at`

### 4.4 冲突与裁决
- `normref_rule_conflicts`
  - `id`, `concept_key`, `rule_left`, `rule_right`, `conflict_type`, `status`
  - `detected_at`, `resolved_at`, `resolved_by`, `resolution_json`

---

## 5. 代码目录建议（服务端）

建议新增：

```text
services/api/domain/normref_ingest/
  models.py                 # ingest job / candidate / conflict Pydantic
  repository.py             # DB read/write
  runtime/
    parser.py               # PDF->文本/目录/条文/表格
    extractor.py            # 条文与阈值抽取
    normalizer.py           # 字段/单位/语义归一
    candidate_builder.py    # 规则候选生成
    conflict_detector.py    # 冲突检测
    publisher.py            # 规则发布与快照
    specir_compiler.py      # 规则集->SpecIR
  service.py                # 用例编排
services/api/routers/normref_ingest.py
services/api/workers/normref_ingest_worker.py
services/api/tests/test_normref_ingest_*.py
infra/supabase/0xx_normref_ingest.sql
```

---

## 6. 解析与归一规则（核心）

### 6.1 规则抽取模板
- 条文编号识别：`7.1.1 / 7.1.2 ...`
- 判定词识别：`应/必须/不得/允许偏差/不小于/不大于`
- 阈值识别：数值 + 单位 + 运算符（`>=`, `<=`, `range`, `±`）
- 检验频率识别：`每...`, `不少于...`, `抽检...`

### 6.2 语义归一
- 字段主键：`canonical_concept_id`（如 `hole_diameter_tolerance`）
- 别名映射：`A/B 名称差异` -> 同一概念
- 单位换算：`mm/cm/m`, `%`, `MPa` 等统一

### 6.3 冲突策略（默认）
- 强制性条文 > 推荐性条文
- 合同明确指定 > 默认策略
- 同级冲突取更严（可配置）
- 仍冲突则进入 `conflict_pool` 等人工裁决

---

## 7. 前端页面（P0 最小）

- `NormRef Ingest Console`
  - 上传规范 PDF
  - 查看解析任务状态与日志
  - 查看规则候选列表（可筛选）
  - 冲突列表与裁决操作
  - 发布版本与快照预览

---

## 8. P0 任务拆解（10 个工作日）

### D1-D2：底座
- 建表迁移（ingest/document/candidate/conflict/snapshot）
- 新增 Router + Service 骨架
- 文件上传与任务入队

### D3-D4：解析
- PDF 文本与目录抽取
- 条文块/表格块持久化
- 任务状态推进

### D5-D6：规则候选
- 阈值/单位/运算符抽取
- 规则候选生成与哈希
- 候选审批 API

### D7：冲突
- `concept_key` 归一
- 冲突检测与冲突池 API

### D8：发布
- 规则版本发布
- 快照哈希生成
- 与现有 `/v1|/api/normref/rules` 兼容输出

### D9：编译
- 规则集编译 SpecIR（最小可用）
- 项目 Ref-Link 挂载接口

### D10：联调与验收
- 3 本规范小样本联调
- 单元测试 + 集成测试 + 文档补齐

---

## 9. 验收标准（P0）

- 能上传 3 本规范 PDF 并生成解析任务。
- 每本至少抽取出章节、条文、表格三类中间产物。
- 能生成可审核的规则候选（含阈值、单位、条文出处）。
- 能检测并记录冲突，支持人工裁决。
- 能发布规则版本并生成 `snapshot_hash`。
- 能编译出最小 SpecIR 并被项目侧 Gate 调用。

---

## 10. 风险与控制

- 版权与合规：仅用于内部规则编译，不对外分发原文全文。
- OCR 误差：高风险规则必须人工复核后发布。
- 版本漂移：所有校验写入 `rule_id + version + hash` 快照。
- 误判风险：冲突策略可配置且保留人工最终裁决权。

---

## 11. 与现有系统衔接点

- 复用现有 `NormRefResolverService` 的规则读取与校验能力。
- 增量接入，不破坏现有 `/v1/normref/resolve|verify|rules|validate`。
- 与 SignPeg/Proof 链路对齐：记录规则版本快照用于审计。

