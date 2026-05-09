# NormRef 总览（官方定义）

## 1. NormRef 是什么
NormRef = 规范参考协议网关（Norm Reference Protocol Gateway）。

它是 DocPeg / CoordOS 体系中专门负责把“规范、标准、规则”结构化、可执行、可验证的核心引擎与协议层。

一句话：把人类文字规则，翻译成机器可读、可自动校验、可 Proof 的主权协议。

## 2. 核心作用
- 统一入口：所有规则通过 `v://normref.com/...` 引用。
- 自动校验：Gate 层自动判断数据是否符合规范。
- 协议化：普通质检表/处方/检查单转为五层结构协议块。
- 可追溯：每次校验和执行都产出 Proof。
- 可复用：同一规范在多项目、多表族复用。

## 3. 五层结构（必须）
1. Header（身份层）
- 作用：定义“这是什么协议、属于谁、依据什么规范”。
- 典型字段：`doc_type`、`v_uri`、`version`、`jurisdiction`、`created_at`。

2. Gate（门槛层）
- 作用：定义“什么条件才允许通过”。
- 典型字段：`pre_conditions`、`entry_rules(gte/lte/range)`、`required_trip_roles`。

3. Body（内容层）
- 作用：定义“需要填什么、怎么算”。
- 典型字段：`basic`、`test_data`、`relations`、计算公式。

4. Proof（证明层）
- 作用：保证不可篡改、可验证。
- 典型字段：`data_hash`、`proof_hash`、`signatures`、`timestamps`、`witness_logs`。

5. State（状态层）
- 作用：描述生命周期与当前进度。
- 典型字段：`lifecycle_stage`、`state_matrix`、`next_action`、`valid_until`。

## 4. 在体系中的位置
- SpecIR：NormRef 是规范定义层的重要实现形式。
- Tab-to-Peg：把原始表格/处方/Excel 自动转换为 NormRef 协议。
- Gate：执行校验的核心。
- ProofIR：每次 NormRef 调用产出 Proof。
- DocPeg Core API：表单提交先过 NormRef，再进入执行链。

## 5. 应用示例
- 工程：桥施 7 表 -> 自动校验孔径、倾斜度是否符合 JTG F80。
- 中医：处方 -> 自动校验配伍禁忌、剂量范围、妊娠禁忌。
- 通用：任何“按标准执行”的业务表单都可协议化。

## 6. 一句话总结
NormRef 是把“人类规范”翻译成“机器可执行、可验证主权协议”的标准层与引擎。

有了 NormRef：
- 表格不再是死数据，而是可自动判定的活协议。
- 每次填写和执行都有可追溯 Proof。
- 系统具备“按规范自动执行”的能力。

## 7. 公路工程质量检验评定标准（JTG F80/1-2017）NormRef 入口（新增）
- 标准目录：
  - `v://normref.com/std/jtg-f80-1-2017@2017`
- 规则示例（独立版本）：
  - `v://normref.com/rule/bridge/pile-hole-check/hole-diameter-tolerance@2026-04`
  - `v://normref.com/rule/bridge/pile-hole-check/hole-verticality-tolerance@2026-04`
  - `v://normref.com/rule/bridge/pile-hole-check/slurry-index-range@2026-04`
- 版本策略：
  - 每条规则独立版本；
  - LayerPeg Header 记录 `rule_snapshots`；
  - Gate 记录 `version_used`；
  - Proof 记录 `normref_snapshot_hash`。

## 8. 规范解析器（Parser Engine）落地方式
- 批量解析脚本：
  - `tools/normpeg/normref_ingest_batch.py`
- 默认支持你当前的 3 本公路规范 PDF（可通过 `--spec` 自定义追加）。
- 典型命令：
  - 仅解析（生成候选规则报告）：
    - `python tools/normpeg/normref_ingest_batch.py`
    - `python tools/normpeg/normref_ingest_batch.py --ocr-max-pages 20`
  - 解析并发布到文档规则库：
    - `python tools/normpeg/normref_ingest_batch.py --publish --write-to-docs --version-tag 2026-04 --ocr-max-pages 40`
- 输出：
  - 运行报告：`docs/normref/std/ingest-report-latest.json`
  - 已发布规则：`docs/normref/rule/imported/**`
- 规则文件命名：
  - `rule_id@version-hash.json`，避免同名规则被覆盖。
- 注意：
  - PDF 解析建议安装 `pdfplumber`，否则会退化到低质量文本提取并触发 fallback 候选规则。
  - 扫描版 PDF（如图片页）建议启用 OCR 依赖：
    - `rapidocr-onnxruntime`
    - `pypdfium2`（通常会随 `pdfplumber` 间接安装）

## 9. 冲突裁决（国家/行业/地方）
- 同一 `rule_id` + `version` 出现多条规则时，系统按 `scope` 自动裁决：
  - `national > industry > local > enterprise > project`
- 可通过 `scope` 强制指定取值来源：
  - `GET /v1/normref/rules/{rule_id}?version=2026-04&scope=local`
- 可查询冲突清单（含最终选中项）：
  - `GET /v1/normref/rules-conflicts?category=bridge/pile-hole-check&version=latest`

## 10. 手工覆盖（Override）机制
- 适用场景：
  - 国家/行业/地方规则并存且项目需临时指定某一来源；
  - 甲方审计要求固定某条规则版本与来源。
- 覆盖原则：
  - 仅覆盖“选中 URI”，不修改原规则内容；
  - 覆盖记录独立保存，支持回滚；
  - 覆盖优先于自动 scope 排序，但仍受 `rule_id + version` 约束。
- 接口：
  - 查询覆盖：`GET /v1/normref/rules-overrides`
  - 设置覆盖：`POST /v1/normref/rules-overrides/set`
  - 清除覆盖：`POST /v1/normref/rules-overrides/clear`
- 存储：
  - `docs/normref/rule/overrides.json`
- 结果回显：
  - `get_rule/list_rules/list_rule_conflicts/validate_rules` 返回 `override_applied` 字段。

## 11. LayerPeg 与 NormRef 的关系（规则注入，不是被动依赖）
- 正确关系：
  - LayerPeg 在创建/编辑/签名关键节点主动拉取 NormRef 规则；
  - Gate 校验使用当前规则；
  - Proof 固化当时规则快照。
- 推荐调用时机：
  - 创建文档：拉规则填充 Gate；
  - 修改 Body：重跑规则校验并更新 Gate 结果；
  - Trip 执行：必须 Gate 通过才放行；
  - 生成 Proof：写入 `rule_snapshots` 和 `normref_snapshot_hash`。
- 核心价值：
  - 规则可升级；
  - 历史可回放；
  - 审计可复现（同 payload + 同版本必得同结论）。

## 12. 生产级版本控制建议
- 版本粒度：
  - 每条规则独立版本（不是整库统一版本）。
- 版本格式：
  - 推荐日期版：`2026-04`（规范类）；
  - 兼容语义版：`v1.2.3`（算法类）。
- 版本寻址：
  - `v://normref.com/rule/{category}/{rule_id}@{version}`
- 兼容策略：
  - 新版规则允许新增字段，不破坏旧版；
  - 历史文档仍按 `rule_snapshots` 校验，不被“最新规则”重写。
- 审计策略：
  - 任何 Proof 必须可还原：规则 URI、版本、哈希、校验结果、时间戳。
