# JTG F80/1-2017 压实度交底说明（SpecBot 生成）

## 1. 规范基本信息
- 规范编号：`JTG F80/1-2017`
- 规范名称：公路工程质量检验评定标准（第一册 土建工程）
- SpecIR ID：`JTG_F80_1_2017.4.2.1.compaction`
- 版本：`2017`
- 来源 PDF：`standards/raw/JTG_F80_1_2017.pdf`
- 来源页码：第 `126`、`128` 页

## 2. 适用范围
本说明用于路基工程中“土方路基压实度”现场检测与质量评定，适用于施工员、班组长、监理工程师、审计与质量追溯人员统一理解与执行。

## 3. 工程部位
- Category：路基工程
- WorkItem：土方路基
- MeasuredItem：压实度
- Component：`highway.subgrade.compaction.4.2.1`

## 4. 检测项目
- 检测项目名称：压实度
- 对应条款：`4.2.1`
- 组件绑定条款 ID：`JTG_F80_1_2017.4.2.1`

## 5. 检测方法
- 试验方法：`T0921`
- 方法说明：按灌砂法获取实测压实度数据，作为本组件输入。

## 6. 输入参数说明
- `compaction_degree`：现场实测压实度（%）
- `design_minimum`：设计或标准要求最小压实度（%）
- `section_id`：检测段标识（可选）
- `lane_id`：车道/分层标识（可选）

## 7. 计算过程
- 路径计算 1：`delta = compaction_degree - design_minimum`
- 路径计算 2：`pass_flag = compaction_degree >= design_minimum`
- 解释：`delta` 表示与下限差值，`pass_flag` 直接给 Gate 判定使用。

## 8. 合格标准
- Gate 条件：`pass_flag == true`
- 合格判定：`compaction_degree >= design_minimum`
- 不合格后果：阻断（`blocking`），状态进入 `FAIL`

## 9. 质量责任
- 施工员：确保输入数据真实、完整、可追溯
- 班组长：组织复测与整改闭环
- 监理：对检测过程与判定结果进行见证与签认
- 审计：依据 Proof 与原始条款进行责任核验

## 10. 附件要求
- 现场检测原始记录（含时间、桩号、点位）
- 检测方法记录（T0921 相关记录）
- 计算与判定结果快照（系统导出）
- 电子签名与 Proof 归档文件

## 11. 对应 JSON 文件路径
本 Markdown 对应的可执行 JSON 文件为：

- `normdocs/library/cn/mot/jtg-f80-1-2017/compaction/spec.json`

说明：`spec.md` 与 `spec.json` 必须成对发布，不允许仅发布技术 JSON 而无人读说明。

## 12. 原始条款引用
以下为原始条款引用（保留原文语义，不改写）：

- 条款 `4.2.1`（`JTG_F80_1_2017.4.2.1`）  
  “压实度应符合设计及规范要求，检测结果应满足相应评定标准。”

- 条款 `4.2`（`JTG_F80_1_2017.4.2`）  
  “路基实测项目应按规定频率检测，并按本标准进行评定。”

## Hash Binding
- spec.md_hash: `f20dc30b5ec45b0738fdfc7deb7de0026eb024a8eadfa7879d27bdfe2e494da4`
- spec.json_hash: `0f6f19c0062b6f98ae0ae9cfff990d34be392c6988dddcd5ac7d3a409a351494`
- bundle_hash: `6e989191ff60bbdebe262ad5033e00f121027f002caaed593df812324f47bdb0`
