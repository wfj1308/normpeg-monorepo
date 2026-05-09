# 附录A：SpecIR工厂与翻译机器人

## 范围
来源于历史章节：16、17、20。

## A1. SpecIR 产业化主线
- 规范处理目标：`PDF -> SpecIR -> Component Catalog -> SPU`。
- 核心价值：把一次性解析变成长期复用资产。
- 与 IDS/IFC 区别：SpecIR 强调可执行逻辑（Path/Gate/State），不只是描述。

## A2. 数字化工厂流程
1. AI 预处理：章节、条文、表格、公式、条件语句。
2. 人工校验：强条、安全条款、争议条款。
3. 自动生成：SpecIR YAML 草稿。
4. 人工精修：Gate规则、状态机、项目特例。

## A3. 翻译机器人（PDF -> SpecIR）
- Stage 1：文档理解（OCR、版面分析、结构树）。
- Stage 2：语义抽取（术语、规则、交叉引用）。
- Stage 3：SpecIR 生成（Schema 映射、公式执行化、置信度评分）。
- 输出：`SpecIR YAML + 置信度报告 + 人工复核清单`。

## A4. SPU MVP 示例要点
- `Form + Path + Rule + Proof` 一体生成。
- 关键示例：路基压实度（自动计算 + 自动判定 + 签名要求）。
- 交付：可导入 FormPeg 执行。

## A5. 双轨输出（SpecBundle）
- `spec.md`（人读）+ `spec.json`（机读）+ `README.txt`。
- 互引哈希：`mdHash/jsonHash`。
- 整包哈希：`bundleHash`。
