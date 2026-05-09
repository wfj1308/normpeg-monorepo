# LayerPeg / NormRef PRD 架构（整合版）

> 版本：v1.0（2026-04-23）  
> 适用范围：LayerPeg 执行内核、NormRef 规范资产、PegBot/FormPeg/MarkUnit/PegUnit 产品矩阵

## 1. 产品定位

LayerPeg = 可执行规范驱动的工程操作系统（Execution OS）。

核心定义：
- 规范 = 可执行程序（不是静态文本）
- AI = 交互接口（不是最终判断者）
- 工程 = 状态机系统（不是静态数据表）
- 文档 = 可验证证据（不是描述性附件）

## 2. 目标与价值

核心目标：
- 把 PDF 规范转化为可执行构件库。
- 把现场数据执行成“可裁决、可追溯”的工程状态。
- 把 AI 输出约束到规范与执行结果，降低幻觉与误判。
- 形成从输入、执行、裁决、存证到回写的闭环。

业务价值：
- 合规判定从“人工解释”转为“引擎裁决”。
- 质量管理从“事后抽查”转为“过程实时阻断”。
- 项目文档从“留痕”升级为“可审计证据链”。

## 3. 用户与参与方

角色：
- 施工员、试验员、质检员、监理、总工
- 设计方、业主、法务
- 外部系统：BIM、ERP、IoT、第三方平台

核心诉求：
- 一线人员：快速填报、自动计算、自动判定、可解释反馈
- 管理层：状态可视、风险预警、责任可追溯
- 审计/法务：证据链完整、签名有效、锚定可验证

## 4. 总体架构（双视角）

### 4.1 五层模型（PRD视角）

```text
┌────────────────────────────────────┐
│  第5层：交互与AI层（Interface）     │
├────────────────────────────────────┤
│  第4层：业务应用层（Applications） │
├────────────────────────────────────┤
│  第3层：执行引擎层（Execution Core）│
├────────────────────────────────────┤
│  第2层：规范模型层（Spec Layer）   │
├────────────────────────────────────┤
│  第1层：协议与状态层（Protocol）   │
└────────────────────────────────────┘
```

### 4.2 八层运行图（系统视角）
- 0 用户/外部参与方层
- 1 交互与产品入口层
- 2 AI 理解与编排层
- 3 执行引擎层（LayerPeg Core）
- 4 规范模型与知识资产层
- 5 协议与状态内核层
- 6 文档协议五层（LayerPeg Document）
- 7 存储与锚定层
- 8 服务/API 矩阵层

说明：五层用于产品与研发协同，八层用于系统实现与边界划分。

### 4.3 LayerPeg 大模型底座架构（三层）

```text
┌─────────────────────────────────────────┐
│  第3层：生成与交互（大模型）             │
│  • 自然语言理解（NL2Gate）               │
│  • 结果解释（Proof -> 人话）             │
│  • 多轮对话（上下文记忆）                 │
│  • 报告生成（结构化输出）                 │
├─────────────────────────────────────────┤
│  第2层：因果执行（LayerPeg 引擎）        │
│  • 构件定位（Component Registry）         │
│  • Path 执行（计算/转化）                │
│  • Gate 裁决（条件判断）                 │
│  • State 驱动（生命周期）                │
│  • Proof 生成（证据链）                  │
├─────────────────────────────────────────┤
│  第1层：可信知识（NormDoc 构件库）       │
│  • 结构化规范（可执行，非文本）           │
│  • 版本控制（增量更新）                   │
│  • 项目覆盖（本地适配）                   │
│  • 术语映射（CMap 标准化）               │
└─────────────────────────────────────────┘
```

### 4.4 架构全景：三层基础设施

```text
┌─────────────────────────────────────────┐
│  应用层：自然语言交互（大模型）           │
│  NL2Gate -> 意图解析 -> 构件调用         │
├─────────────────────────────────────────┤
│  协议层：LayerPeg 核心（独特能力）        │
│  ├── 主权 UTXO：项目作为独立状态机根      │
│  ├── v:// 寻址：桩号/位置/版本联合定位     │
│  ├── Fork/Split/Merge：工程变更动态操作   │
│  └── Component：可执行构件                │
├─────────────────────────────────────────┤
│  物理层：数据与存证                       │
│  ├── Proof 链（Merkle + 时间戳）          │
│  └── 外部锚定（IPFS/Arweave/法务系统）    │
└─────────────────────────────────────────┘
```

## 5. 从下到上分层详解

### 5.1 第1层：协议与状态层（Protocol Layer）

定义：定义“工程世界如何存在”的底层规则。

核心能力：
- `v://` 统一寻址：`v://{project-id}/{stake-range}?version={hash}&layer={layer}&time=...`
- `ProjectUTXO` 状态模型：项目作为独立状态机根，`unspentOutputs` 表示有效状态
- `Fork / Split / Merge`：支持设计变更、分包切分、历史合并
- 空间模型：`Space Slot`（坐标）/ `Space Container`（坐标+规范+状态）/ `Volume Container`（工程量边界）
- Mapping Kernel：实现“桩号 -> 容器/体积/规范/状态/待办/Proof”

结论：这是系统“内核”，不依赖具体产品 UI。

### 5.2 第2层：规范模型层（Spec Layer）

定义：把规范从文本变成程序。
等价表达：规范 = 构件库 + 执行规则。

核心资产：
- `NormDoc`：结构化规范（条款、表格、公式）
- `SpecIR`：规范中间表示（语义层 + 逻辑层 + 证据层）
- `Component`：执行最小单元（Input + Path + Gate + State + Proof）
- `SPU`：运行态执行单元（Form + Path + Rule + Proof）
- `Override`：项目级、企业级、地方标准覆盖机制

结论：这是“规范编译器 + 标准库”。

### 5.3 第3层：执行引擎层（Execution Core）

定义：执行规范的因果推理系统。

核心模块：
- `Component Registry`：按项目上下文定位执行单元
- `Path Engine`：公式求值、查表、聚合、转换
- `Gate Engine`：`PASS / BLOCK / CRITICAL / OVERRIDE` 裁决与下一步动作生成
- `State Engine`：生命周期管理（`DRAFT -> COMPUTED -> VALIDATED -> QUALIFIED/REJECTED`）
- `Proof Engine`：输入哈希、执行轨迹、签名、时间戳、外部锚定
- `Output Composer`：JSON / Markdown / 报告 / 清单输出

结论：真正“算、判、流转、存证”都在这一层完成。

### 5.4 第4层：业务应用层（Applications）

定义：把执行能力产品化。

产品矩阵：
- `PegBot`：规范问答、判定解释、报告生成
- `FormPeg`：自动挂表单、自动计算、自动判定
- `MarkUnit`：Markdown 编辑、AI 方案辅助
- `PegUnit`：案例库、Fork 复用
- `CSD`：施工组织设计自动生成

结论：这是面向角色的业务编排层，不承载最终裁决逻辑。

### 5.5 第5层：交互与AI层（Interface）

定义：用户与系统交互入口。

核心能力：
- `NL2Gate`：自然语言 -> 执行请求
- 对话系统：多轮上下文、解释生成、报告组装
- AI 边界：AI 负责理解与表达，不负责最终计算与判定

结论：AI 是秘书，不是法官。

## 6. 文档协议五层（LayerPeg Document）

```text
LayerPeg Document
├── Header（身份）
├── Gate（裁决）
├── Body（数据）
├── Proof（证据）
└── State（生命周期）
```

映射关系：
- Header：绑定 `v://`、`DID`、`RootRef`、`NormRef`
- Gate：映射 `Gate Engine` 与执行编排
- Body：承载 DTO、SPU 实例、实测与中间计算
- Proof：承载 Merkle Root、签名、时间戳、锚定信息
- State：承载状态机定义、状态变迁、待办动作

结论：五层是“文档协议视角”，与系统分层是嵌套关系。

## 7. 核心对象与数据模型

### 7.1 Component 抽象

```text
Component = Input + Path + Gate + State + Proof
```

### 7.2 SPU 运行结构

```text
SPU = Form + Path + Rule + Proof
```

### 7.3 典型执行对象
- WorkItem：分项工程
- MeasuredItem：实测项目（如压实度）
- TestMethod：试验方法（如灌砂法）

### 7.4 典型判定样例（压实度）
- 输入：桩号、层位、试验方法、原始试验数据
- 计算：湿密度 -> 干密度 -> 压实度 -> 标准值查表
- 裁决：单点检查 + 代表值检查
- 结果：合格/不合格/特批 + Proof

### 7.5 规范 = 构件目录（Catalog）+ 每个构件的执行约束

```text
规范（Spec）
  -> Catalog（构件目录）
      -> Component A（如压实度）
      -> Component B（如弯沉）
      -> Component C（如平整度）
```

每个构件至少包含：
- `Input DTO`：输入字段与类型约束。
- `Output DTO`：输出结果与可解释字段。
- `Path`：计算与转化步骤。
- `Gate`：裁决条件（PASS/BLOCK/OVERRIDE）。
- `State`：生命周期与状态迁移规则。
- `Proof`：执行证据与签名锚定要求。

### 7.6 规范解析 = 构建构件目录（Catalog）

```text
原始规范（PDF/表格/条款）
  -> NormDoc 结构化
  -> SpecIR 语义/逻辑/证据编译
  -> Component Catalog 产出
  -> SPU 运行实例化
```

目标不是摘要，而是把规范产出为可实例化、可执行、有状态、可存证的构件库。

### 7.7 构件的复用与组合

复用：
- 同一 `TestMethod` 可被多个 `MeasuredItem` 复用。
- 同一 `MeasuredItem` 可被多个 `WorkItem` 在不同场景引用。

组合：
- `WorkItem` 组合多个 `MeasuredItem` 形成分项评定。
- `Project` 组合多类 `WorkItem` 形成项目级执行图谱。

项目化适配：
- 通过 `Override` 做标准值与流程差异化。
- 通过 `Fork/Split/Merge` 管理版本分支与收敛。

### 7.8 Component 与状态分支、Proof 的关系
- Component 执行产生状态变更（`State Transition`）。
- `Fork/Split/Merge` 管理状态变更的历史分支。
- `Proof` 记录谁、何时、在哪个分支执行了什么。

## 8. 服务/API 架构

```text
┌──────────────────────────────────────────────────────────────┐
│                        Web / App / SDK                       │
│   bot.normref.com / form.normref.com / MarkUnit / 第三方系统  │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    API Gateway / 服务编排                     │
└──────────────────────────────────────────────────────────────┘
      │                 │                 │               │
      ▼                 ▼                 ▼               ▼
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│ PDF API    │   │ Mapping API│   │ SPU API    │   │ Spec API   │
│ /pdf       │   │ /mapping   │   │ /spu       │   │ /spec      │
└────────────┘   └────────────┘   └────────────┘   └────────────┘
      │                 │                 │               │
      └──────────────┬──┴──────────────┬──┴───────────────┘
                     ▼                 ▼
              ┌────────────┐   ┌────────────┐
              │ Gate API   │   │ Path API   │
              │ /gate      │   │ /path      │
              └────────────┘   └────────────┘
                     │                 │
                     └───────┬─────────┘
                             ▼
                      ┌────────────┐
                      │ State API  │
                      │ /state     │
                      └────────────┘
                             │
                             ▼
                      ┌────────────┐
                      │ Proof API  │
                      │ /proof     │
                      └────────────┘
```

关键 API：

| API | 作用 |
| --- | --- |
| `/pdf` | 规范数字化入口（章节/表格/公式/条款块） |
| `/mapping` | 桩号空间查询与容器映射 |
| `/spu` | 生成可执行规范单元 |
| `/spec` | 规范资产读取、版本管理、引用定位 |
| `/path` | 计算逻辑执行 |
| `/gate` | 合规裁决与下一步动作生成 |
| `/state` | 生命周期流转与待办驱动 |
| `/proof` | 证据链生成、校验、锚定 |

## 9. 端到端执行闭环

```text
用户提问 / 填表 / 上传 PDF / 触发流程
                │
                ▼
      NL2Gate / 表单 / API 解析输入
                │
                ▼
       v:// 定位项目 + 桩号 + 版本 + 层位
                │
                ▼
      Component Registry 定位构件 / SPU
                │
                ▼
               Path 执行
                │
                ▼
               Gate 裁决
         ┌────────┴────────┐
         │                 │
       PASS          BLOCK / OVERRIDE
         │                 │
         ▼                 ▼
    State 更新        生成整改路径
         │                 │
         └────────┬────────┘
                  ▼
               生成 Proof
                  │
                  ▼
      输出 JSON / Markdown / 报告 / 清单
                  │
                  ▼
      回写 Mapping / 项目状态 / 外部锚定
```

### 9.1 LayerPeg + 大模型（确定性执行链）

```text
输入
  -> 构件定位
  -> Path 执行
  -> Gate 裁决
  -> 约束生成
  -> 输出
```

语义对齐示例：
- “这是压实度 DTO” -> 对齐到 `Component` 输入接口。
- “按 JTG 公式算” -> 对齐到 `Path` 计算步骤。
- “96区标准96%” -> 对齐到 `Gate`/查表规则。
- “结果必须 >= 96-2” -> 对齐到可执行裁决条件。

每一步要求：可验证、可追溯、可干预。

### 9.2 分支场景示例（K15+200, 96.5%）

```text
问："K15+200 压实度 96.5% 合格吗？"
├── NL2Gate 解析：{stake: "K15+200", value: 96.5, intent: "validate"}
├── v:// 寻址：定位 GXX-2024-XXX/K15+200#current
├── 检查分叉：活跃 fork#design-change-001（标准 97%）
├── 执行 Component：
│   ├── 主线：Gate(96.5 >= 96) -> PASS
│   └── 变更分支：Gate(96.5 >= 97) -> BLOCK
├── 大模型生成（基于确定性结果）：
│   "当前主线标准（96%）合格。
│    但存在设计变更分支待审批，若生效则标准提升至97%，当前值将不合格。"
└── 附带：Proof 哈希（可查看完整执行链）
```

## 10. AI 与引擎职责边界

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| 大模型 / NL2Gate | 意图理解、参数抽取、结果解释、文档生成 | 最终裁决、公式计算、状态定版 |
| LayerPeg 执行引擎 | 计算、裁决、状态流转、Proof 生成 | 自由发挥式回答 |

约束原则：
- 大模型输出必须被 Gate/State/Proof 结果约束。
- 任何“看似合理但未经 Gate 验证”的答案均视为未完成结果。
- 对关键判定支持人工干预，但干预必须带 `Override` 理由、签名和 Proof。

## 11. 规范数字化与知识生产流水线

```text
输入（PDF/图片/扫描件/语音）
  -> 预处理（去噪/纠偏/版面分析）
  -> 识别（文本OCR/表格OCR/符号识别/手写识别）
  -> 语义理解（实体抽取/条款关联/SPU结构化）
  -> 规范资产（NormDoc/SpecIR/Component Catalog）
  -> 执行与问答（Gate约束生成）
```

重点：
- 文档识别是入口，语义结构化是壁垒。
- 目标不是“看懂文档”，而是“产出可执行构件”。

## 12. 非功能需求（NFR）

- 可追溯性：任一判定可回放完整输入、路径、裁决、签名。
- 一致性：同一输入在同一版本规范下结果确定。
- 可审计性：Proof 支持内部审计与外部法务核验。
- 可扩展性：支持新规范、项目 Override、第三方系统接入。
- 安全性：身份（DID）与权限分层，关键动作必须可签名。

## 13. 迭代路线（建议）

### 阶段A（MVP）
- 路基场景闭环：压实度类构件端到端（Form -> Gate -> Proof）
- 完成 `v://` 定位、基础状态机、Proof 落盘
- 上线 PegBot + FormPeg 最小可用能力

### 阶段B（规模化）
- 扩展路面/桥梁类构件目录
- 上线 Mapping API 全量查询与分段治理能力
- 完成 OCR/表格/符号识别与 SPU 生产管道

### 阶段C（生态化）
- 完成多系统（ERP/BIM/IoT/法务）联动
- 推进外部锚定与多方签名流程
- 建立行业级可执行规范资产生态

## 14. 竞争壁垒（PRD 结论）

- 协议壁垒：`v:// + ProjectUTXO + Fork/Split/Merge`
- 执行壁垒：`Path + Gate + State + Proof` 确定性闭环
- 知识壁垒：规范解析为可执行构件目录，而非检索语料
- 合规壁垒：执行即存证，证据可审计、可对外验证

## 15. 一句话总结

LayerPeg = 规范程序化 + 工程状态化 + AI 接口化。  
更本质地说：不是在做“工程问答 AI”，而是在定义“工程执行协议”。

## 16. SpecIR 产业化与生态策略

### 16.1 SpecIR 的定位（桥梁与资产）
- LayerPeg 流程：`PDF规范 -> SpecIR（一次性数字化） -> 可执行 Component`
- SpecIR 一经沉淀即成为长期资产：可复用、可组合、可验证。
- 定位语句：SpecIR 是连接“人类法律文本”与“机器可执行逻辑”的关键桥梁。

### 16.2 SpecIR 与现有方案对比

| 维度 | IDS (buildingSMART) | IFC | LayerPeg SpecIR |
| --- | --- | --- | --- |
| 本质 | 需求检查清单 | 几何模型交换 | 可执行规范逻辑 |
| 粒度 | 实体属性要求 | 构件几何参数 | 字段级计算 + 裁决逻辑 |
| 可执行性 | 静态对比 | 无 | Path + Gate + State 驱动 |
| 更新机制 | 重新发布 XML | 版本兼容 | 增量 Patch 热更新 |
| 领域覆盖 | 建筑 BIM | 几何 + 属性 | 工程质检全规范 |

关键差异：IDS/IFC 描述“是什么”，SpecIR 定义“怎么做 + 对不对”。

### 16.3 数字化工厂（PDF -> SpecIR）

```text
AI 提取：章节结构、表格、公式、条件语句
  ->
人工校验：关键条款（安全、强条、争议点）
  ->
自动生成：SpecIR YAML（目标自动化率 70%）
  ->
人工精修：Gate 规则、State 机、特殊约定
```

生产组织：
- 初级工程师：AI 预处理 + 基础 SpecIR 编写。
- 领域专家（总工/教授）：关键条款审核。
- 项目试用团队：反馈规则误差与场景漏项。
- 版本维护团队：持续迭代与回归验证。

### 16.4 翻译机器人（自动化引擎）架构

```text
输入：PDF 规范原文（扫描件或电子版）
  ->
Stage 1 文档理解：OCR、版面分析、章节层级解析
  ->
Stage 2 语义抽取：术语识别、规则抽取、表格结构化、交叉引用
  ->
Stage 3 SpecIR 生成：Schema 映射、公式可执行化、Gate 规则生成、置信度评分
  ->
输出：SpecIR YAML 草稿 + 置信度报告 + 人工校验清单
```

### 16.5 三层供给架构（让规范持续生长）

Layer 1（核心规范，平台自建）：
- 数量建议：10-20 本，覆盖高频高价值场景。
- 目标：树立可执行规范标杆与行业样板。

Layer 2（官方/企业规范，合作共建）：
- 合作对象：标准院、央企、设计院、施工单位、地方监管单位。
- 平台提供：SpecIR 语法标准、编辑器、验证器、执行器。
- 目标：新规范发布与 SpecIR 同步，企业标准可数字化落地。

Layer 3（长尾规范，社区 + AI）：
- 方式：众包翻译 + AI 草稿生成 + 关键条款人工校验。
- 平台提供：众包平台、质量认证、版本托管。
- 目标：低成本扩展覆盖面，形成规范网络效应。

### 16.6 商业模式（协议 + 工具 + 认证）
- 协议授权费：SpecIR 协议与企业内规范适配授权。
- 工具订阅费：编辑器、验证器、执行器与协同平台订阅。
- 认证服务费：SpecIR 质量认证、可执行性审查、发布签章。
- 增值服务费：规范迁移、项目 override 落地、培训与咨询。

### 16.7 规模化路线图（按规范包推进）

P0（立即）：
- 规范包：`JTG F80/1-2017`、`JTG 3450-2019`、`JTG/T F20-2015`。
- 目标：覆盖路基路面核心场景，建立首个端到端标杆。
- 周期建议：60-90 天。

P1（3个月内）：
- 扩展桥梁、隧道等高价值规范包（约 5 本）。
- 目标：覆盖更多复杂工序与关键质控节点。

P2（6个月内）：
- 覆盖土建核心规范体系（约 15 本）。
- 目标：形成区域级项目可复制能力。

P3（1年内）：
- 扩展地方标准与企业标准（约 30 本）。
- 目标：形成“国家标准 + 地方标准 + 企业标准”三位一体库。

成本收益示意（按当前假设）：
- 成本假设：专家日薪 `2000 元 * 10 天 ≈ 2 万元/本规范`。
- 收益假设：单本规范可复用于 `100+` 项目，项目年费 `10 万+`。
- 结论：规范资产一旦形成，可长期复用并持续放大边际收益。

## 17. 翻译机器人 MVP 与 SPU 执行示例

### 17.1 翻译机器人 MVP（OpenAI 版）演示目标

演示主线（目标 2 分钟内）：
- 上传 PDF 规范后自动生成 `SpecIR YAML` 草稿。
- 左侧展示 PDF 原文条款（如压实度条款），右侧展示生成的结构化 YAML。
- 人工校验界面高亮置信度 `< 90%` 的片段，并标注“需专家确认”。
- 一键导出可在 `FormPeg` 直接运行的 SpecIR 文件。

### 17.2 SPU YAML（完整示例）

```yaml
spuId: "highway.subgrade.compaction.4.2.1.soil@v1"
meta:
  name: "路基压实度（土质）"
  norm: "JTG F80/1-2017"
  clause: "4.2.1"
  version: "v1"

forms:
  - formCode: "SUBGRADE_COMPACTION_FORM"
    role: "lab"
    required: true

data:
  inputs:
    - name: massHoleSand
      type: number
      label: "灌入砂质量(g)"
    - name: massSandCone
      type: number
      label: "锥体砂质量(g)"
    - name: volumeSand
      type: number
      label: "标定体积(cm3)"
    - name: moistureContent
      type: number
      label: "含水率(%)"
    - name: maxDryDensity
      type: number
      label: "最大干密度(g/cm3)"
  outputs:
    - name: wetDensity
    - name: dryDensity
    - name: compactionDegree

path:
  - step: calc_wet_density
    formula: "wetDensity = massHoleSand / volumeSand"
  - step: calc_dry_density
    formula: "dryDensity = wetDensity / (1 + moistureContent / 100)"
  - step: calc_compaction
    formula: "compactionDegree = (dryDensity / maxDryDensity) * 100"

rules:
  - ruleId: "RULE-COMPACTION-001"
    field: "compactionDegree"
    operator: ">="
    value: 93
    message: "压实度必须 >= 93%"

proof:
  resultField: "compactionDegree"
  passMessage: "压实度达标"
  failMessage: "压实度不达标"
  requiredSignatures:
    - lab
    - supervision
```

### 17.3 这份 YAML 的系统语义
- `Form`：绑定要填写的表单，创建节点时自动挂载。
- `Path`：定义计算链路，填表后自动执行。
- `Rule`：定义 Gate 判定条件，计算后自动裁决。
- `Proof`：定义签名与结果留痕要求。

关键结论：
- `Form + Path + Rule = 可执行的规范`。
- 该 YAML 不是普通配置文件，而是“规范的可执行版本”。

### 17.4 系统执行流程（SPU 视角）

```text
Step 1: createNode(spuId)
  -> 加载 SPU（forms + path + rules）
Step 2: Lab 填写 SUBGRADE_COMPACTION_FORM
Step 3: 系统执行 Path，得到 compactionDegree
Step 4: Gate 自动判定（compactionDegree >= 93）
Step 5: 监理签字（supervision）
Step 6: 生成 Proof（结果 + 签名要求 + 时间戳）
```

### 17.5 三层定义（Form / Path / Rule）

| 层级 | 关键字 | 功能 | 执行时机 |
| --- | --- | --- | --- |
| Form | `forms` | 绑定表单 | 创建 Node 时自动挂载 |
| Path | `path` | 计算逻辑 | 填表后自动执行 |
| Rule | `rules` | 判定规则 | 计算后自动 Gate |

### 17.6 终端演示输出样例

```text
✅ SPU 加载成功: 路基压实度（土质）
   规范: JTG F80/1-2017 4.2.1

📥 输入数据: { massHoleSand: 2850.5, volumeSand: 2000, ... }

📊 执行结果:
   状态: PASS
   湿密度: 1.4253 g/cm3
   干密度: 1.3136 g/cm3
   压实度: 95.9 %

🔍 计算过程:
   calc_wet_density: wetDensity = massHoleSand / volumeSand = 1.4253
   calc_dry_density: dryDensity = wetDensity / (1 + moistureContent / 100) = 1.3136
   calc_compaction: compactionDegree = (dryDensity / maxDryDensity) * 100 = 95.9

⚖️ Gate 判定:
   ✅ RULE-COMPACTION-001: compactionDegree=95.90 >= 93 -> 通过

📜 Proof 生成:
   时间: 2026-04-16T11:30:00.000Z
   结果: 95.9 PASS
   待签名: lab, supervision

--- 场景2: 不合格数据 ---
压实度: 85.1 % -> FAIL
失败原因: 压实度必须 >= 93%
```

## 18. 空间-体积双容器边界模型

### 18.1 核心哲学
一个桩基和一段路基，就是体积容器与空间槽结合后天然形成的边界。

定义拆解：
- 空间槽（`Space Slot`）与空间容器（`Space Container`）提供逻辑边界：地址、规范框架、Trip/Proof/BOQ 链路约束。
- 体积容器（`Volume Container`）提供物理边界：几何体积、填挖实体、可计量工程量。
- 两者绑定后形成清晰、可执行、可结算的最小工程边界。

### 18.2 概念升级（Space Container + Volume Container）
- 空间容器：`v:/.../container/...`  
  含义：逻辑 + 规范 + 执行框架
- 体积容器：`v:/.../volume/...`  
  含义：物理体积 + 几何边界 + 工程量实体

工程对象表达：
- 一个桩基 = 空间容器 + 体积容器
- 一段路基 = 空间容器 + 体积容器

### 18.3 真实示例

示例1：桩基（桥梁段）

```text
v:/cn.highway/dajin/bridge/DA-01/container/pile-001
  -> 空间容器（逻辑框架）

v:/cn.highway/dajin/bridge/DA-01/volume/pile-001
  -> 体积容器（物理体积）

体积容器内容示例：
- 桩径：Ø1.5m
- 桩长：28m
- 混凝土体积：自动计算约 49.5 m3
- 钢筋体积/重量：自动计算
- 边界：桩底高程、桩顶高程、护筒位置
```

示例2：路基（S2-1 类场景）

```text
v:/cn.highway/dajin/subgrade/DB-01/container/K19+070
  -> 空间容器（规范框架 + Trip + Proof）

v:/cn.highway/dajin/subgrade/DB-01/volume/K19+070
  -> 体积容器（物理体积）

体积容器内容示例：
- 桩号区间：K19+060 ~ K19+080（20m 段）
- 设计高程：284.0628 m
- 平均填挖高度差：由横断面计算
- 路基体积：长度 * 平均横断面面积（自动计算 m3）
- 边界：左/右边坡、路基顶面、路基底面
```

### 18.4 边界效果（执行与结算）
- 空间容器给出规范边界：如压实度、弯沉等规则约束。
- 体积容器给出工程量边界：如混凝土方量、填方土方量。
- 两者绑定形成可结算边界：可作为标段 BOQ 最小单元。
- Trip/Proof 链仅在对应边界内闭环，越界操作必须显式分叉或拆分。

### 18.5 完整地址体系（双容器）

```text
v:/cn.highway/dajin/subgrade/DB-01/
├── container/K19+070    <- 空间容器（逻辑 + 规范框架）
└── volume/K19+070       <- 体积容器（物理工程量）

v:/cn.highway/dajin/bridge/DA-01/
├── container/pile-001   <- 空间容器
└── volume/pile-001      <- 体积容器
```

## 19. 产品命名与品牌架构（SpecBot）

### 19.1 命名建议
推荐：`SpecBot`

理由：
- Spec = Specification，强调“可执行规范定义”。
- Bot = 自动化翻译与执行代理。
- 合并语义清晰：规范数字化机器人。

### 19.2 命名辨析

| 名称 | 含义 | 适用性 |
| --- | --- | --- |
| NormBot | 标准机器人 | 语义偏泛，容易被理解为“符合标准检查” |
| SpecBot | 规范机器人 | 语义精准，对齐 SpecIR/SPU 执行体系 |
| SPU-Bot | 规范处理单元机器人 | 技术味重，传播性较弱 |

结论：对外品牌优先使用 `SpecBot`。

### 19.3 品牌层级建议

```text
LayerPeg（公司/协议层）
├── SpecBot（产品层）      - 规范翻译机器人
│   ├── SpecIR 生成（PDF -> YAML）
│   ├── SPU 验证（语法/可执行性检查）
│   └── 规范库管理（版本/增量）
├── FormPeg（应用层）      - 表单执行
├── CatalogPeg（组织层）   - 目录管理
└── ProofPeg（存证层）     - 证据链
```

对外定位：
- SpecBot = 规范数字化入口。
- FormPeg = 现场执行入口。
- ProofPeg = 审计存证入口。

## 20. 双轨输出与 SpecBundle 规范

### 20.1 双轨输出是工程现场刚需

| 场景 | 格式 | 使用者 | 目的 |
| --- | --- | --- | --- |
| 现场交底 | Markdown | 施工员、班组长 | 人读，快速理解要求 |
| 系统对接 | JSON | FormPeg、Gate 引擎、BIM 平台 | 机读，自动执行 |
| 归档存证 | Markdown + JSON | 监理、审计、法院 | 人可读 + 机器可验 |
| 多方协同 | Markdown（渲染）+ JSON（API） | 设计/施工/监理/业主 | 统一理解并可系统对接 |

结论：
- 单 Markdown：机器无法稳定执行。
- 单 JSON：人无法快速理解。
- 双轨输出：人机协同，各取所需。

### 20.2 SpecBot 双轨输出配置

```yaml
output:
  formats: ["markdown", "json"]
  bundling: true
  bundleExt: ".specbundle"
```

### 20.3 SpecBundle 打包规范

```text
<name>.specbundle
├── spec.md
├── spec.json
└── README.txt
```

文件职责：
- `spec.md`：人读版本，用于交底、培训、审计。
- `spec.json`：机读版本，用于 FormPeg 执行与第三方系统 API 对接。
- `README.txt`：版本、生成时间、签名摘要、校验说明。

### 20.4 双哈希绑定（一致性保障）

绑定规则：
- `spec.md` 写入 `jsonHash`（指向 `spec.json` 的哈希）。
- `spec.json` 写入 `mdHash`（指向 `spec.md` 的哈希）。
- `bundleHash` 覆盖整个 `.specbundle` 内容。

校验流程：
1. 校验 `spec.md` 与 `spec.json` 互引哈希是否一致。
2. 校验打包文件 `bundleHash` 是否匹配发布记录。
3. 校验签名主体（DID/组织证书）是否有效。

### 20.5 执行与审计建议
- 执行系统默认消费 `spec.json`，并回写执行结果到 Proof。
- 人员审阅默认查看 `spec.md`，关键信息与 JSON 字段做可追溯映射。
- 对外交换优先传输 `.specbundle`，避免 md/json 单文件漂移。

## 21. 品牌确认与发布话术（外部版）

### 21.1 品牌确认

| 层级 | 名称 | 用途 |
| --- | --- | --- |
| 公司/协议 | LayerPeg | 底层协议与技术品牌 |
| 产品入口 | NormBot.io | 对外品牌与用户认知入口 |
| 核心引擎 | SpecBot | 内部代号，规范翻译机器人 |
| 输出格式 | `.specbundle` | 交付物（`md + json`） |

对外统一话术：
- `NormBot.io，工程规范的数字化机器人。`

### 21.2 域名与产品角色

核心判断：
- NormBot 的本质是“工具/机器人”，不是“静态知识库”。

```text
normref.com     -> 规范参考网（静态，人读）
bot.normref.com -> 规范机器人（动态，机执行 + 人协作）
```

推荐域名：
- `bot.normref.com`

推荐理由：
- 动作导向：bot 表示执行，不是仅查询。
- 技术属性清晰：子域名直观表达产品形态。
- 扩展友好：`normref.com` 可保留为官网/文档/社区。

### 21.3 品牌架构（最终版）

```text
NormRef（品牌）
├── normref.com      # 官网 + 规范库 + 文档
├── bot.normref.com  # 核心产品：规范翻译机器人
├── api.normref.com  # 开发者 API（未来）
└── spec.normref.com # SpecBundle 下载（未来）

LayerPeg（协议层，对内技术品牌）
├── SPU 格式标准
├── Gate 引擎
└── Proof 协议
```

确认口径：
- 最终选择：`bot.normref.com`
- 主品牌：`NormRef`（规范参考 -> 规范执行）
- 核心产品：`bot.normref.com`
- 交付格式：`.specbundle`（`md + json`）

### 21.4 明天演示话术（标准版）

```text
“张总，这是我们开发的 bot.normref.com —— 规范翻译机器人。

不是让你‘查’规范，是帮你‘执行’规范。

上传 PDF，自动出可执行程序；
现场填数据，自动算、自动判、自动存证。

这三份文件，就是 bot.normref 翻译的成果：
人看 .md，机器跑 .json，两边对齐，不可篡改。”
```

一句话主标语：
- `bot.normref.com —— 让规范从“死的PDF”变成“活的程序”。`

### 21.5 今晚最后冲刺（2小时）

时间窗：`22:00 - 23:00`（技术收尾）

```text
□ 三份 SPU YAML 最终定稿
  ├── subgrade.compaction.spu.yaml
  ├── bridge.pile.strength.spu.yaml
  └── pavement.flatness.IRI.spu.yaml

□ 双轨输出生成（.md + .json）
□ 本地演示脚本验证通过
□ bot.normref.com 指向配置（hosts 或 DNS）
```

## 22. PDF解析API独立化架构

### 22.1 核心判断
规范的 PDF 框架应独立为 API 服务，这是架构解耦的关键。

当前耦合（问题）：

```text
Web界面 <-> PDF解析 <-> SPU生成 <-> 存储
   ^_______________________________|
        单体式，扩展和审计成本高
```

目标解耦（推荐）：

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web/App界面   │---->|   PDF解析API    |<--->|   SPU生成服务    |
│  (bot.normref)  │     │   (独立微服务)   │     │  (NormBot核心)   |
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │   规范存储服务   │
                    │  (版本/增量/检索) │
                    └─────────────────┘
```

### 22.2 PDF解析API独立价值

| 维度 | 耦合在NormBot内 | 独立API |
| --- | --- | --- |
| 复用性 | 仅NormBot可用 | 任意系统可调（BIM/ERP/智慧工地） |
| 扩展性 | 改PDF解析需改主产品 | 独立迭代，互不影响 |
| 商业模式 | 单一产品能力 | API即服务，可按量计费 |
| 技术栈 | 强绑定 | 可分层选型（解析Python，生成Node/Rust） |
| 合规性 | 审计边界不清晰 | 独立日志，全程可追溯 |

### 22.3 API设计（极简OpenAPI草案）

```yaml
openapi: 3.0.0
info:
  title: NormRef PDF Parser API
  version: 1.0.0
  description: 工程规范PDF结构化解析服务
servers:
  - url: https://api.normref.com/v1/pdf
paths:
  /parse:
    post:
      summary: 上传PDF并返回结构化结果
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                standardCode:
                  type: string
                  example: JTG F80/1-2017
                options:
                  type: object
                  properties:
                    extractTables:
                      type: boolean
                      default: true
                    extractFormulas:
                      type: boolean
                      default: true
                    ocrLanguage:
                      type: string
                      default: chi_sim+eng
      responses:
        "200":
          description: 解析成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  parseId:
                    type: string
                  status:
                    type: string
                    enum: [success, partial, failed]
                  extractedData:
                    type: object
                  rawText:
                    type: string
                  confidence:
                    type: number
                  reviewRequired:
                    type: boolean
  /status/{parseId}:
    get:
      summary: 查询解析状态（异步任务）
      parameters:
        - in: path
          name: parseId
          required: true
          schema:
            type: string
  /result/{parseId}:
    get:
      summary: 获取解析结果
      parameters:
        - in: path
          name: parseId
          required: true
          schema:
            type: string
  /validate:
    post:
      summary: 验证解析结果是否符合目标Schema
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                extractedData:
                  type: object
                targetSchema:
                  type: string
                  enum: [SPU-v1, SpecIR-v1, IDS]
```

### 22.4 NormBot 调用流程（TypeScript）

```ts
class NormBotCore {
  async translate(pdfFile: Buffer, standardCode: string): Promise<SpecBundle> {
    const parseResult = await this.pdfApi.parse({
      file: pdfFile,
      standardCode,
      options: { extractTables: true, extractFormulas: true },
    });

    if (parseResult.status === "failed") {
      throw new Error(`PDF解析失败: ${parseResult.error ?? "unknown"}`);
    }

    if (parseResult.confidence < 0.9 || parseResult.reviewRequired) {
      await this.queueForReview(parseResult.parseId);
    }

    const spu = await this.spuGenerator.generate({
      extractedData: parseResult.extractedData,
      standardCode,
    });

    return this.dualOutput.generate(spu);
  }
}

class PDFParseAPI {
  private endpoint = "https://api.normref.com/v1/pdf";
  constructor(private apiKey: string) {}

  async parse(params: ParseParams): Promise<ParseResult> {
    const form = new FormData();
    form.append("file", params.file);
    form.append("standardCode", params.standardCode);
    form.append("options", JSON.stringify(params.options));

    const resp = await fetch(`${this.endpoint}/parse`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    return resp.json();
  }
}
```

### 22.5 商业模式：API即服务

| 层级 | 服务 | 计费方式 | 客户 |
| --- | --- | --- | --- |
| PDF解析API | `api.normref.com/v1/pdf` | 按页/按次 | 规范院、设计院、BIM厂商 |
| SPU生成服务 | `bot.normref.com` | 按规范/订阅 | 施工单位、监理单位 |
| 完整工作流 | `form.normref.com` | SaaS年费 | 工程项目 |

可独立售卖场景：
- 交通领域标准机构：批量数字化历史规范。
- BIM厂商（如广联达、Bentley生态伙伴）：嵌入解析能力。
- 各省主管单位：地方标准数字化治理。

### 22.6 架构确认（域名与服务分层）

```text
用户可见：
├── bot.normref.com        # 规范翻译机器人（完整产品）
└── form.normref.com       # 表单执行入口

底层服务：
├── api.normref.com/v1/pdf   # PDF解析API（独立、可单卖）
├── api.normref.com/v1/spu   # SPU生成服务
├── api.normref.com/v1/gate  # Gate执行引擎
└── api.normref.com/v1/proof # 证据链服务

内部协议：
└── LayerPeg（SPU/Gate/Proof标准）
```

## 23. Mapping API 独立化架构

### 23.1 核心判断
Mapping API 是核心基础设施，用于解决“桩号/位置 -> 规范/构件/状态”的空间索引问题。

为什么必须独立：

```text
问题：现场问“K15+200现在是什么状态？”
├── 传统方式：查图纸 -> 查台账 -> 问监理 -> 结果不确定
├── 普通数据库：SELECT ... WHERE stake='K15+200' -> 单表可查，跨域关联困难
└── Mapping API：空间索引 -> 自动关联容器/体积/状态/规范
```

本质结论：
- 桩号不是普通字段，而是空间键（Spatial Key）。

### 23.2 Mapping API 核心功能

| 功能 | 输入 | 输出 | 场景 |
| --- | --- | --- | --- |
| 正向映射 | 桩号 `K15+200` | 所有关联对象 | “这点有什么？” |
| 反向映射 | 构件ID | 覆盖桩号范围 | “这个构件在哪？” |
| 范围查询 | `K15+000~K16+000` | 区间内全部状态 | “这段进度如何？” |
| 空间叠加 | 桩号 + 层位 | 精确到路基/路面/桥梁 | “K15+200 的96区压实度” |
| 版本映射 | 桩号 + 时间 | 历史状态与版本 | “K15+200 三个月前什么状态？” |

### 23.3 API设计（极简OpenAPI草案）

```yaml
openapi: 3.0.0
info:
  title: NormRef Mapping API
  version: 1.0.0
  description: 工程空间桩号映射服务
servers:
  - url: https://api.normref.com/v1/mapping
paths:
  /resolve:
    post:
      summary: 桩号解析并返回所有关联对象
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                vuri:
                  type: string
                  example: v:/cn.highway/dajin/subgrade/DB-01/K15+200
                context:
                  type: object
                  properties:
                    layer:
                      type: string
                      example: 96区
                    time:
                      type: string
                      format: date-time
                    version:
                      type: string
      responses:
        "200":
          description: 解析成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  location:
                    type: object
                  containers:
                    type: array
                  volumes:
                    type: array
                  activeSpecs:
                    type: array
                  pendingActions:
                    type: array
  /query-range:
    post:
      summary: 区间查询
  /reverse:
    post:
      summary: 反向查询（构件ID查位置）
  /history:
    get:
      summary: 桩号历史状态查询
```

### 23.4 调用示例（TypeScript）

```ts
const mapping = await fetch("https://api.normref.com/v1/mapping/resolve", {
  method: "POST",
  headers: {
    Authorization: "Bearer token",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    vuri: "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
    context: {
      layer: "96区",
      time: "2026-04-17T10:00:00Z",
    },
  }),
}).then((r) => r.json());
```

示例返回（摘要）：

```json
{
  "location": {
    "stake": "K15+200",
    "absoluteChainage": 15200,
    "projectOffset": 5200
  },
  "containers": [
    {
      "containerId": "DB-01",
      "type": "subgrade",
      "vuri": "v:/cn.highway/dajin/subgrade/DB-01/container/K15+200",
      "state": "active"
    }
  ],
  "volumes": [
    {
      "volumeId": "K15+200",
      "quantity": 1250.5
    }
  ],
  "activeSpecs": [
    {
      "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
      "formStatus": "qualified",
      "lastProof": "0xabc123..."
    }
  ],
  "pendingActions": [
    {
      "actionType": "deflection_test_required",
      "deadline": "2026-04-20",
      "assignedTo": "did:peg:ins_002"
    }
  ]
}
```

现场可直接回答的六件事：
1. 这点在哪（空间）。
2. 属于哪个容器（组织）。
3. 工程量是多少（体积）。
4. 生效规范/构件是什么（SPU）。
5. 当前状态是什么（合格/待办）。
6. 下一步动作是什么（Action）。

### 23.5 架构位置（服务矩阵）

```text
NormRef 服务矩阵
├── api.normref.com/v1/pdf      # 输入解析
├── api.normref.com/v1/mapping  # 空间纽带（核心）
├── api.normref.com/v1/spu      # 规范生成
├── api.normref.com/v1/gate     # Gate执行
├── api.normref.com/v1/proof    # 证据链
└── api.normref.com/v1/boq      # 工程量结算（未来）
```

Mapping API 作为枢纽，连接：
- 空间（桩号）与逻辑（容器/规范）。
- 物理（体积）与状态（Form/Proof）。
- 时间（历史）与版本（增量）。

### 23.6 关键特性

| 特性 | 说明 |
| --- | --- |
| 空间索引 | 基于 R-Tree 或 H3，支持桩号快速定位 |
| 多态解析 | 同一桩号在不同层位/时间返回不同状态 |
| 版本感知 | Fork/Split/Merge 后，历史查询自动路由 |
| 实时更新 | Form 提交后，Mapping 立即反映最新状态 |

确认口径：
- Mapping API 是“桩号 -> 一切”的核心查询服务。
- 三大独立API：`/v1/pdf`（输入解析）、`/v1/mapping`（空间纽带）、`/v1/spu`（规范生成）。

## 24. NormRef 完整API矩阵

### 24.1 API全景（v1）

```text
api.normref.com/v1/
├── 输入层（数据进入）
│   ├── pdf          # PDF解析（规范数字化入口）
│   ├── image        # 图纸/照片解析（OCR+识别）
│   └── voice        # 语音输入（现场报数）
│
├── 核心层（空间与规范）
│   ├── mapping      # 空间映射（桩号->容器/体积/状态）
│   ├── spu          # SPU生成与管理
│   └── spec         # 规范库查询（版本/条款）
│
├── 执行层（计算与裁决）
│   ├── gate         # Gate规则执行（实时判定）
│   ├── path         # Path计算引擎（公式执行）
│   └── state        # 状态机驱动（生命周期）
│
├── 输出层（证据与协同）
│   ├── proof        # 证据链生成与验证
│   ├── form         # 表单渲染与提交
│   └── report       # 报告生成（PDF/Excel）
│
├── 资产层（工程与商务）
│   ├── boq          # 工程量清单（计量结算）
│   ├── price        # 价格信息（定额/市场价）
│   └── contract     # 合同条款（支付条件）
│
├── 身份层（权限与责任）
│   ├── did          # 去中心化身份
│   ├── trip         # TripRole权限校验
│   └── sign         # 数字签名与验签
│
└── 系统层（运维与扩展）
    ├── webhook      # 事件订阅（状态变更通知）
    ├── sync         # 离线同步（现场弱网）
    └── export       # 数据导出（归档/迁移）
```

### 24.2 关键接口详细清单

输入层：

| API | 功能 | 场景 |
| --- | --- | --- |
| `POST /pdf/parse` | PDF规范结构化 | 规范院上传新标准 |
| `POST /image/recognize` | 识别现场照片/图纸 | 施工员拍试块编号 |
| `POST /voice/transcribe` | 语音转结构化数据 | 试验员报读数 |

核心层：

| API | 功能 | 场景 |
| --- | --- | --- |
| `POST /mapping/resolve` | 桩号解析全关联 | “K15+200什么情况” |
| `POST /mapping/query-range` | 范围查询 | “K15-K16进度” |
| `POST /spu/generate` | 生成SPU | PDF -> YAML |
| `GET /spec/{spuId}` | 查询规范定义 | 加载表单 |
| `POST /spec/validate` | 验证SPU语法 | 提交前检查 |

执行层：

| API | 功能 | 场景 |
| --- | --- | --- |
| `POST /gate/evaluate` | 执行Gate规则 | 实时判定合格/不合格 |
| `POST /path/execute` | 执行Path计算 | 自动算压实度 |
| `POST /state/transition` | 驱动状态机 | 提交 -> 审核 -> 合格 |
| `GET /state/{vuri}` | 查询当前状态 | “这点表单什么状态” |

输出层：

| API | 功能 | 场景 |
| --- | --- | --- |
| `POST /proof/generate` | 生成证据链 | 检测完成存证 |
| `POST /proof/verify` | 验证Proof真伪 | 审计追溯 |
| `POST /form/render` | 渲染表单UI | 手机显示输入界面 |
| `POST /report/generate` | 生成评定表 | 打印签字归档 |

资产层：

| API | 功能 | 场景 |
| --- | --- | --- |
| `GET /boq/{projectId}` | 工程量清单 | 结算依据 |
| `POST /boq/calculate` | 自动算量 | 体积×单价 |
| `GET /price/{material}` | 查材料价格 | 实时造价 |
| `POST /contract/payment` | 支付条件校验 | 进度款触发 |

身份层：

| API | 功能 | 场景 |
| --- | --- | --- |
| `POST /did/register` | 注册DID | 新人员入场 |
| `POST /did/verify` | 验证身份 | 登录/签名 |
| `POST /trip/check` | 校验TripRole | “你能签这个字吗” |
| `POST /sign/sign` | 数字签名 | 表单提交 |
| `POST /sign/verify` | 验签 | 审计核查 |

系统层：

| API | 功能 | 场景 |
| --- | --- | --- |
| `POST /webhook/subscribe` | 订阅事件 | 不合格自动通知 |
| `POST /sync/push` | 离线数据推送 | 回项目部同步 |
| `POST /sync/pull` | 拉取更新 | 规范修订同步 |
| `POST /export/project` | 项目数据导出 | 竣工归档 |

### 24.3 架构口径（统一）

Mapping API 是枢纽：
- 连接空间（桩号）与逻辑（容器/规范）。
- 连接物理（体积）与状态（Form/Proof）。
- 连接时间（历史）与版本（增量）。

三大独立核心API：
- `api.normref.com/v1/pdf`：输入解析。
- `api.normref.com/v1/mapping`：空间纽带。
- `api.normref.com/v1/spu`：规范生成。

## 25. 对接交付包（Postman + TypeScript SDK）

目标：准备 Postman 集合与 TypeScript SDK，支持“明天开发对接即用”。

### 25.1 Postman 集合（`normref-api.json`）

```json
{
  "info": {
    "name": "NormRef API v1",
    "description": "工程规范数字化 API 集合",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    { "name": "1. PDF解析", "request": { "method": "POST", "url": "{{baseUrl}}/v1/pdf/parse" } },
    { "name": "2. 空间映射解析", "request": { "method": "POST", "url": "{{baseUrl}}/v1/mapping/resolve" } },
    { "name": "3. Gate执行判定", "request": { "method": "POST", "url": "{{baseUrl}}/v1/gate/evaluate" } },
    { "name": "4. SPU生成", "request": { "method": "POST", "url": "{{baseUrl}}/v1/spu/generate" } },
    { "name": "5. 状态流转", "request": { "method": "POST", "url": "{{baseUrl}}/v1/state/transition" } },
    { "name": "6. Proof验证", "request": { "method": "POST", "url": "{{baseUrl}}/v1/proof/verify" } }
  ],
  "variable": [
    { "key": "baseUrl", "value": "https://api.normref.com" },
    { "key": "token", "value": "your-api-token-here" }
  ]
}
```

说明：
- 建议随集合附带 `Environment`，预置 `baseUrl/token/projectId`。
- 6个请求覆盖最小闭环：输入解析 -> 映射 -> 判定 -> 生成 -> 状态 -> 验证。

### 25.2 TypeScript SDK（`normref-sdk.ts`）

```ts
const API_BASE = "https://api.normref.com/v1";

export interface PDFParseRequest {
  file: File | Buffer;
  standardCode: string;
  options?: { extractTables?: boolean; extractFormulas?: boolean; ocrLanguage?: string };
}

export interface MappingResolveRequest {
  vuri: string;
  context?: { layer?: string; time?: string; version?: string };
}

export interface GateEvaluateRequest {
  spuId: string;
  inputs: Record<string, number>;
  context?: { projectId?: string; layerZone?: string; designSpeed?: number };
}

export class NormRefClient {
  constructor(private token: string, private baseUrl: string = API_BASE) {}

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      ...(options.headers as Record<string, string>),
    };
    if (options.body && typeof options.body === "string") headers["Content-Type"] = "application/json";
    const res = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
    if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async parsePDF(request: PDFParseRequest) {
    const form = new FormData();
    form.append("file", request.file as any);
    form.append("standardCode", request.standardCode);
    if (request.options) form.append("options", JSON.stringify(request.options));
    return this.request("/pdf/parse", { method: "POST", body: form as any });
  }

  async resolveMapping(request: MappingResolveRequest) {
    return this.request("/mapping/resolve", { method: "POST", body: JSON.stringify(request) });
  }

  async evaluateGate(request: GateEvaluateRequest) {
    return this.request("/gate/evaluate", { method: "POST", body: JSON.stringify(request) });
  }

  async generateSPU(request: { parseId: string; clauseId: string; standardCode: string; options?: Record<string, boolean> }) {
    return this.request("/spu/generate", { method: "POST", body: JSON.stringify(request) });
  }

  async transitionState(request: { vuri: string; spuId: string; fromState: string; toState: string; triggeredBy: string; signatures?: Record<string, string> }) {
    return this.request("/state/transition", { method: "POST", body: JSON.stringify(request) });
  }

  async verifyProof(request: { proofId: string; proofHash: string; verifyOptions?: Record<string, boolean> }) {
    return this.request("/proof/verify", { method: "POST", body: JSON.stringify(request) });
  }
}
```

### 25.3 SDK使用示例（含React Hook）

```ts
export async function demo() {
  const client = new NormRefClient("your-api-token");

  const mapping = await client.resolveMapping({
    vuri: "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
    context: { layer: "96区" },
  });
  console.log("该点状态:", mapping);

  const gateResult = await client.evaluateGate({
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    inputs: { massHoleSand: 2850.5, volumeSand: 2000, moistureContent: 8.5, maxDryDensity: 2.35 },
  });
  console.log("判定结果:", gateResult);
}

export function useMapping(vuri: string, context?: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const client = new NormRefClient(localStorage.getItem("token") || "");
    setLoading(true);
    client.resolveMapping({ vuri, context }).then(setData).finally(() => setLoading(false));
  }, [vuri, JSON.stringify(context)]);
  return { data, loading };
}
```

### 25.4 建议交付目录

```text
/normref-demo/
├── postman/
│   └── normref-api.json
├── sdk/
│   ├── normref-sdk.ts
│   ├── package.json
│   └── README.md
├── specs/
│   ├── subgrade.compaction.spu.yaml
│   ├── bridge.pile.strength.spu.yaml
│   └── pavement.flatness.IRI.spu.yaml
└── demo/
    └── demo.ts
```

### 25.5 对外确认口径
- Postman集合 + TypeScript SDK 已备齐，可支持明天开发对接即用。
- 这套接口和SDK就绪后，施工组织设计（CSD）可从“文档编制”升级为“自动编排”。

## 26. CSD自动编排（NormRef体系）

### 26.1 传统CSD vs NormRef体系

| 维度 | 传统CSD | NormRef体系 |
| --- | --- | --- |
| 编制方式 | 人编Word/Excel，经验驱动 | 空间容器+规范驱动，自动编排 |
| 工序逻辑 | 文字描述，易遗漏冲突 | SPU状态机驱动，自动排序 |
| 资源配置 | 静态估算，偏差大 | 体积容器量化，动态匹配 |
| 进度计划 | 横道图/网络图，难联动 | 状态流转自动投影时间轴 |
| 变更响应 | 全文修改，版本混乱 | Fork/Split/Merge，热更新 |
| 审批效率 | 纸质流转，周级 | Proof链实时签批，小时级 |

### 26.2 CSD自动生成原理

```text
输入：
├── 设计文件（CAD/BIM） -> 提取空间容器（桩号/桥梁/隧道段）
├── 工程量清单（BOQ） -> 绑定体积容器（土方/混凝土/钢筋量）
├── 规范库（NormRef） -> 加载SPU（工序规范要求）
└── 资源池（设备/人员/材料） -> TripRole匹配

输出：
├── 工序链（Path自动排序：先路基后路面，先下部后上部）
├── 进度计划（State流转时间估算）
├── 资源配置（Volume/产能=设备台班+人员Trip）
├── 质量控制点（Gate触发：关键工序自动插入检测）
└── 风险预警（规范冲突自动识别）
```

核心公式：
- `CSD = 空间容器 × 时间 × 资源 × 规范`

### 26.3 CSD自动生成示例（YAML）

```yaml
csd_id: "dajin-2024-subgrade-DB-01"
generated_by: "normref-csd-engine@v1"

spatial_breakdown:
  - segment: "K15+000~K15+300"
    length: 300m
    volumes:
      - type: "挖方"
        quantity: 4500m3
        spu: "highway.excavation.3.2.1@v1"
      - type: "填方"
        quantity: 3800m3
        spu: "highway.fill.4.1.2@v1"
    containers:
      - "v:/.../DB-01/container/K15+000"
      - "v:/.../DB-01/container/K15+100"
      - "v:/.../DB-01/container/K15+200"

process_chain:
  - step: 1
    name: "清表"
    spu: "highway.clearing.3.1.1@v1"
    duration: "2天"
    predecessor: []
  - step: 2
    name: "挖方"
    spu: "highway.excavation.3.2.1@v1"
    duration: "4500/500=9天"
    predecessor: [1]
  - step: 3
    name: "填方"
    spu: "highway.fill.4.1.2@v1"
    duration: "3800/400=10天"
    predecessor: [2]
    constraint: "分层压实，每层<=30cm"
  - step: 4
    name: "压实度检测"
    spu: "highway.subgrade.compaction.4.2.1@v1"
    duration: "检测2天+养护3天=5天"
    predecessor: [3]
    gate_trigger: "每层填方后强制插入"
  - step: 5
    name: "弯沉检测"
    spu: "highway.subgrade.deflection.4.2.2@v1"
    duration: "1天"
    predecessor: [4]
    condition: "压实度QUALIFIED后"

resource_allocation:
  - role: "excavator_operator"
    count: 2
    trip: "did:peg:operator_001,002"
    assigned_to: [2]
  - role: "compaction_inspector"
    count: 1
    trip: "did:peg:ins_001"
    assigned_to: [4]
    cert_required: ["压实度检测员证"]

schedule:
  - week: "1"
    activities: ["清表", "挖方启动"]
    gates: []
  - week: "2-3"
    activities: ["挖方", "填方启动"]
    gates: ["挖方完成验收"]
  - week: "4"
    activities: ["填方", "压实度检测"]
    gates: ["压实度合格（关键路径）"]
  - week: "5"
    activities: ["弯沉检测", "路基验收"]
    gates: ["弯沉合格", "路基QUALIFIED"]

risk_alerts:
  - type: "season"
    message: "第3周进入雨季，填方SPU触发雨天施工预警"
    mitigation: "调整工序或增加排水措施SPU"
  - type: "resource"
    message: "压实度检测员did:peg:ins_001在第4周已有任务"
    mitigation: "自动分配备用人员did:peg:ins_003"

outputs:
  - format: "横道图（Gantt）"
    file: "csd_DB-01_gantt.png"
  - format: "网络图（PERT）"
    file: "csd_DB-01_pert.png"
  - format: "Word文档（传统报批）"
    file: "csd_DB-01_report.docx"
    auto_generated: true
  - format: "SpecBundle（可执行版本）"
    file: "csd_DB-01.specbundle"
    contains: ["yaml+md+json", "可导入FormPeg执行"]
```

### 26.4 关键突破：CSD从“编”到“算”

```text
传统：工程师凭经验编CSD
  -> 人脑处理复杂约束，易遗漏冲突

NormRef：算法自动优化CSD
  -> 空间+规范+资源+时间 = 多目标优化
```

目标函数：
- 最短工期（关键路径压缩）
- 最低成本（资源均衡）
- 最高质量（Gate前置）
- 最小风险（规范冲突规避）

约束条件：
- 规范强制顺序（先压实后弯沉）
- 资源上限（设备/人员/材料）
- 时间窗口（雨季/冻期/环保）
- 空间冲突（同段落不同工序）

## 27. 空间槽与空间容器的严格定义（NormRef核心）

### 27.1 概念澄清
空间容器不是物理坐标本身，而是坐标/桩号/GPS 的逻辑封装与执行实例。

```text
物理坐标（客观存在）：
├── 国家2000坐标：X/Y/Z
├── 桩号：如 K19+070
├── GPS：lat/lng
└── 这些是“地理信息”，属于容器属性

空间容器（逻辑实体）：
├── v_address（逻辑地址）
├── geo_reference（坐标引用）
├── norm_framework（规范框架）
├── runtime（状态机运行时）
└── 本质：坐标 + 规范 + 状态 的绑定体
```

一句话：
- 坐标是地址，空间容器是“住在地址上的规范执行程序”。

### 27.2 三类对象的关键区分

| 概念 | 本质 | 例子 |
| --- | --- | --- |
| 物理坐标 | 客观空间位置 | `K19+070`、`(X,Y,Z)` |
| 空间容器 | 逻辑对象（坐标+规范+状态） | `v:/.../container/K19+070` |
| 体积容器 | 工程量边界（物理量） | `v:/.../volume/K19+070` |

结论：
- 空间容器不是坐标，而是“坐标的规范执行实例”。

### 27.3 修正后的 K19+070 空间容器（示例）

```json
{
  "v_address": "v:/cn.highway/dajin/subgrade/DB-01/container/K19+070",
  "container_type": "space",
  "geo_reference": {
    "station": "K19+070",
    "coord_system": "国家2000",
    "coords": { "X": 3845231.456, "Y": 456789.123, "Z": 284.523 },
    "gps": { "lat": 34.123456, "lng": 108.654321 }
  },
  "norm_execution": {
    "applicable_specs": [
      "highway.subgrade.compaction.4.2.1@v1",
      "highway.subgrade.deflection.4.2.2@v1"
    ],
    "current_state": "compaction_pending",
    "gate_status": "awaiting_inspector"
  },
  "runtime": {
    "active_form": "SUBGRADE_COMPACTION_FORM",
    "pending_signatures": ["lab"],
    "last_action": "2026-03-25T09:30:15Z"
  }
}
```

### 27.4 空间槽（Space Slot）vs 空间容器（Space Container）

| 维度 | 空间槽（Space Slot） | 空间容器（Space Container） |
| --- | --- | --- |
| 本质 | 地址系统（纯坐标/位置标识） | 执行实体（地址+规范+状态绑定） |
| 类比 | 门牌号码 | 房间里的办公程序 |
| 内容 | 地理信息（桩号/坐标/高程） | 规范框架、运行时状态、待办动作 |
| 行为 | 静态、被动、被引用 | 动态、主动、执行Gate/State流转 |
| 创建 | 设计文件自动生成（CAD/BIM） | 施工启动时实例化（绑定规范+人员） |
| 结束 | 长期保留（地理不变） | 验收后归档（生命周期结束） |

### 27.5 关系图示（设计 -> 施工 -> 验收）

```text
设计阶段：
CAD/BIM -> 提取 -> 空间槽（纯坐标地址库）
                    |
施工阶段：          v 实例化
空间槽K19+070 -> +规范框架 -> 空间容器K19+070（可执行）
                 +TripRole绑定
                 +State机启动
                    |
验收阶段：          v 归档
空间容器 -> 生成Proof -> 历史记录（不可变）
                    |
                    v 释放
空间槽K19+070 -> 保留为地理索引（供下一项目复用）
```

### 27.6 代码对比（地址对象 vs 执行实体）

空间槽（纯地址）：

```json
{
  "v_address": "v:/cn.highway/dajin/geo/K19+070",
  "slot_type": "geo_reference",
  "geo": {
    "station": "K19+070",
    "chainage": 19070,
    "coords_2000": { "X": 3845231.456, "Y": 456789.123 },
    "elevation": 284.523,
    "alignment": "主线右幅"
  },
  "created_from": "design_file_K19+000-K20+000.dwg",
  "is_static": true
}
```

空间容器（执行实体）：

```json
{
  "v_address": "v:/cn.highway/dajin/subgrade/DB-01/container/K19+070",
  "container_type": "execution_instance",
  "geo_slot_ref": "v:/cn.highway/dajin/geo/K19+070",
  "norm_execution": {
    "specs_bound": ["highway.subgrade.compaction.4.2.1@v1"],
    "current_state": "DRAFT",
    "gate_open": true
  },
  "trip_binding": {
    "inspector": "did:peg:ins_001",
    "supervisor": "did:peg:sup_001"
  },
  "runtime": {
    "active_form": "SUBGRADE_COMPACTION_FORM",
    "last_input": "2026-03-25T09:30:15Z",
    "pending_action": "awaiting_supervision_sign"
  },
  "is_dynamic": true,
  "lifecycle": "active"
}
```

关键流程：
1. 设计交付：CAD/BIM 批量生成空间槽。
2. 施工准备：空间槽 + 规范 + 人员 -> 实例化为空间容器。
3. 现场执行：空间容器驱动 `DRAFT -> COMPUTED -> VALIDATED`。
4. 验收归档：空间容器产出 Proof，空间槽保留复用。

### 27.7 对 NotebookLM 的体系升级定位
- 传统“文档理解”路径：回答文档内容。
- NormRef 重构路径：执行文档规则。

定位语句：
- 用 LayerPeg/NormRef 逻辑重构 NotebookLM，不止“理解文档”，而是“执行文档”。

## 28. DocBot：从“理解文档”到“执行文档”

### 28.1 核心洞察：NotebookLM 缺什么

| 维度 | NotebookLM | LayerPeg 重构版 |
| --- | --- | --- |
| 文档处理 | 理解、摘要、问答 | 解析、执行、验证 |
| 输出形态 | 文本/音频摘要 | 可执行程序（SPU） |
| 用户交互 | 对话问答 | 填报 -> 计算 -> 判定 -> 存证 |
| 结果可信度 | 可能幻觉 | Gate裁决，可追溯 |
| 知识更新 | 重新上传 | 增量Patch，热更新 |
| 协作模式 | 个人研究 | 多方TripRole签名 |

### 28.2 重构方案：DocBot（文档执行引擎）

```text
输入：任意专业文档（论文/规范/合同/病历）
  ->
Stage 1: DocParse（文档解析）
  - 公式 -> 可计算代码
  - 条件 -> Gate规则
  - 流程 -> State状态机
  - 角色 -> TripRole权限
  ->
Stage 2: SPU生成（文档 -> 程序）
  - 医学指南 -> 诊疗决策树
  - 合同条款 -> 履约检查点
  - 论文方法 -> 实验复现流程
  - 法律条文 -> 合规判定规则
  ->
Stage 3: 执行与验证（核心差异）
  - 输入数据 -> Path计算
  - Gate实时判定 -> 合规/风险预警
  - Proof存证 -> 决策可追溯
  - TripRole签名 -> 多方确认
```

### 28.3 应用场景对比

场景A：医学指南

```text
NotebookLM：
上传《糖尿病诊疗指南》 -> 询问“胰岛素用量怎么算” -> 文本解释

LayerPeg/DocBot：
上传《糖尿病诊疗指南》 -> 自动生成SPU
  - 输入：血糖值、体重、肾功能
  - Path：胰岛素剂量计算
  - Gate：低血糖风险预警（<3.9mmol/L阻断）
  - Proof：用药决策可追溯存证
医生流程：输入数据 -> 计算剂量 -> 风险预警 -> 电子签名 -> 处方存证
```

场景B：合同审查

```text
NotebookLM：
上传采购合同 -> 询问“付款条件是什么” -> 条款摘要

LayerPeg/DocBot：
上传采购合同 -> 生成履约检查SPU
  - 输入：到货日期、验收结果、发票状态
  - Path：应付款日期自动计算
  - Gate：逾期预警、违约条件判定
  - Proof：每笔付款决策可追溯
法务流程：执行过程自动提醒 -> 风险预警 -> 审批流 -> 存证
```

### 28.4 产品形态：DocBot.io

定位：
- 专业文档的可执行化平台。

Slogan：
- `Don't just read it. Run it.`

核心功能：
1. 文档上传 -> 自动解析为SPU
2. 交互表单 -> 基于SPU生成输入界面
3. 实时计算 -> Path执行 + Gate判定
4. 证据存证 -> Proof链生成
5. 协作签名 -> TripRole多方确认

差异化：
- NotebookLM 问文档，DocBot 用文档。
- 从“知识消费”升级为“知识执行”。

### 28.5 技术复用与新增能力

可直接复用的 NormRef 基础设施：
- PDF解析API -> DocParse
- SPU生成引擎 -> 通用化（不限工程规范）
- Gate执行引擎 -> 跨领域适配
- Proof存证 -> 通用化
- TripRole权限 -> 通用化

新增能力：
- 医学公式库
- 法律规则库
- 金融计算库
- 通用Path模板市场

### 28.6 关键决策与路线

| 选项 | 路径 | 投入 |
| --- | --- | --- |
| A | 专注工程（NormRef） | 集中资源，深壁垒 |
| B | 横向扩展（DocBot） | 复用架构，多场景 |
| C | 双品牌运营 | NormRef（工程）+ DocBot（通用） |

建议：
- 先 A 后 B。

```text
Phase 1（现在-6个月）：NormRef工程领域跑通
  - 积累100+工程规范SPU
  - 验证Gate/State/Proof闭环
  - 建立行业标杆客户

Phase 2（6-12个月）：DocBot横向扩展
  - 医学/法律/金融试点
  - 验证SPU生成引擎通用性
  - 决策：独立品牌 or 统一平台
```

### 28.7 最终确认口径
- 用 LayerPeg 逻辑重构 NotebookLM = DocBot（文档执行引擎）。
- 从“理解”升级为“执行”。
- 体验层（类NotebookLM）是入口，核心价值在 Gate -> execute -> Proof -> 责任闭环。

## 29. NormRef体验层与规范机器人产品化

### 29.1 核心判断：是否自研体验层

结论：应自研“轻量体验层 + 强执行引擎”，不对标通用NotebookLM。

| 维度 | 分析 | 结论 |
| --- | --- | --- |
| 技术复杂度 | 切片解析 -> 施工逻辑生成，本质是结构化数据+规则引擎 | 可控，无需依赖大模型幻觉 |
| 行业know-how | 施工组织设计强规范约束，且项目类型差异大 | LayerPeg积累是壁垒 |
| 竞争格局 | 现有产品偏算量/进度，组织设计智能化不足 | 存在明确差异化空间 |

### 29.2 关键洞察

你们的优势不是“做更好的文档问答”，而是让规范自己跑起来，直接生成可执行施工指令。

| 阶段 | 传统方式 | NormRef方式 | 价值 |
| --- | --- | --- | --- |
| 读规范 | 人工读图纸 | 上传 -> 切片解析 | 秒级 |
| 理解 | 经验脑补 | 上下文关联 -> 案例匹配 | 精准 |
| 写方案 | Word填空 | 结构化生成 -> 对接BIM/工地系统 | 可执行 |

### 29.3 策略建议：跳过“类NotebookLM”对标

| 方案 | 投入 | 产出 |
| --- | --- | --- |
| A. 专注引擎 | 全部资源 | 最强壁垒：切片 -> 指令的精确与合规 |
| B. 轻量界面 | 2-3周 | 快速验证工程师使用意愿 |
| C. 合作/收购 | 谈判周期 | 快速获取模板与行业数据 |

建议路径：
- 先A（引擎壁垒）后B（体验验证），C作为加速器。

### 29.4 MarkUnit 与 PegUnit 的关系策略

战略理解：
- MarkUnit 是主产品工作台（项目写作与执行入口）。
- PegUnit 是案例与模板资源层（Fork/Split/Merge 复用能力）。

| 关系 | 策略 | 界面隐喻 |
| --- | --- | --- |
| A. 主从 | PegUnit 作为MarkUnit下游能力 | 从案例库新建项目 |
| B. 平行 | 两个入口并列，数据互通 | 案例库与项目空间并列 |
| C. 融合 | 统一工作流 | Fork -> 编辑 -> 生成 -> 执行 |

建议：A的界面形态 + C的数据模型（体验轻，底层统一）。

### 29.5 推荐界面：侧边栏双栏（不跳出写作流）

```text
┌─────────────────────────────────────────────────┐
│ Header: MarkUnit - XX项目施工组织设计           │
├─────────────────────────────────────────────────┤
│ 编辑器主区域（Markdown） | PegUnit智能助手侧栏   │
│                         | 上下文卡片            │
│                         | 案例库浏览（树/搜索）  │
└─────────────────────────────────────────────────┘
```

核心原则：
- 案例库是上下文感知助手，不是手动检索数据库。

关键交互流程（深基坑支护示例）：

| 步骤 | 用户动作 | 系统响应 | PegUnit界面 |
| --- | --- | --- | --- |
| 1 | 输入“深基坑” | 识别工艺关键词 | 显示上下文卡片 |
| 2 | 选中段落 | 段落级分析 | 展开规范+类似案例 |
| 3 | 点击“Fork案例” | 打开案例浮层 | 左筛选树+右预览 |
| 4 | 选择案例 | 确认Fork | 插入引用并可导入章节结构 |
| 5 | 继续编辑 | 保持写作流 | 侧栏显示已关联案例 |

### 29.6 PegUnit卡片与浏览面板设计要点

上下文卡片包含：
- 工艺识别结果（如“深基坑支护”）。
- 规范条款摘要与强制等级。
- 相似案例清单与快速Fork入口。

案例浏览面板支持：
- 多维筛选（项目类型/地区/规模/工艺）。
- 预览、Fork、Diff对比。
- 一键关联到当前文档光标位置。

### 29.7 技术实现要点（NormRef导向）

| 模块 | 方案 |
| --- | --- |
| 文本分析 | NL2Gate实时提取工艺关键词与意图 |
| 上下文匹配 | LayerPeg图谱查询：工艺节点 -> 案例/SPU |
| Fork操作 | 复制案例结构并插入Markdown引用 |
| Diff对比 | 案例与草稿参数差异高亮（工期/工艺/成本） |
| 流式判定 | Gate结果流式回传并驱动UI状态变化 |

### 29.8 规范机器人定位（PegBot/SpecBot）

定位：
- 规范解析机器人 = 把静态条文变成可对话、可执行、可验证助手。

核心隐喻：
- 规范调试器（Debugger for Codes）。

| 能力 | 对应体验 |
| --- | --- |
| 断点查看 | 查看条款详细要求 |
| 单步执行 | 逐项检查合规 |
| 堆栈追踪 | 查看规范引用链 |
| 异常捕获 | 强条不符合实时告警 |

与NotebookLM差异：

| 维度 | NotebookLM | NormRef规范机器人 |
| --- | --- | --- |
| 输入 | 上传文档 | 规范库直连（国标/行标/企标） |
| 理解 | 摘要问答 | 条款层级+强条+推荐做法结构化 |
| 输出 | 文本回答 | 检查清单/工艺参数/判定逻辑 |
| 验证 | 用户自核对 | Gate实时校验 |
| 协作 | 单人 | 多方TripRole会签 |

### 29.9 关键模块补齐清单

| 模块 | 已有基础 | 待补能力 |
| --- | --- | --- |
| 规范解析 | NL2Gate | 条款层级图谱与版本Diff |
| 合规判定 | Gate引擎 | 交互式流式判定 |
| 清单生成 | SPU模板 | 动态勾选+责任到人 |
| 会签存证 | Proof | 类Git PR的审核流UI |
| 技术交底 | 部分模板 | 从检查清单自动生成交底文档 |

### 29.10 规范溯源与多轮交互

典型问法：
- “为什么要监测？”

机器人返回：
- 条文来源（具体章节号）
- 强制等级
- 违反后果
- 本项目历史相似案例链接

多轮交互动作：
- 问规范
- 生成检查清单
- 展开条文解释
- 查看版本Diff
- 发起会签

### 29.11 与 PegUnit/MarkUnit 的桥梁关系

```text
PegUnit（案例库） <-> MarkUnit（方案写作）
        \             /
         \  规范机器人 /
          \         /
      检查清单与合规判定
```

规则：
- 从PegUnit Fork模板后，先过规范合规性检查。
- 检查清单确认后，进入MarkUnit工序执行。

### 29.12 技术战略定位

```text
通用大模型底座
   ->
工程知识图谱（LayerPeg/NormRef维护）
   ->
应用层产品（MarkUnit、规范机器人、流程引擎）
```

战略口径：
- 不做行业大模型底座，做行业大模型的最佳使用者。
- 通过结构化知识图谱 + Gate硬规则 + 版本可追溯形成复利。

一句话定位：
- 不是“懂工程的AI”，而是“让AI用好工程知识库的产品”。

## 32. 核心架构最终确认（补充版）

### 32.1 五个独特性确认
- 项目作为独立主权根：`ProjectUTXO + v://`，项目不是公司数据库的一条记录，而是可持续寻址与追溯的主权实体。
- 工程动态操作：`Fork / Split / Merge` 把分布式版本思想映射到桩号、里程、专业、BOQ，并要求价值/里程守恒。
- 规范可执行化：Norm 解析为 `Component + Gate`，从静态文档升级为可实例化、有状态、可裁决执行单元。
- 三层因果架构：`NL2Gate + LayerPeg执行引擎 + 大模型包装`，计算与裁决由引擎确定性完成。
- 目录树责任链：目录树不仅是文件结构，也是执行责任链可视化；桩号作为空间匹配键，通过索引关联构件、Proof、结算。

### 32.2 最终确认的三层架构（清晰版）

第1层：可信知识层（NormDoc 构件库）
- 规范被解析成结构化、可执行构件（Component）。
- 每个构件具备 `Input DTO / Output DTO / Path / Gate / State / Proof`。
- 支持版本管理、增量更新、项目 Override。

第2层：因果执行层（LayerPeg 引擎）
- 构件定位（Component Registry）。
- Path 执行（精确计算）。
- Gate 裁决（硬约束）。
- State 驱动（生命周期）。
- Proof 生成（证据链）。

第3层：交互生成层（大模型）
- NL2Gate：自然语言转结构化查询。
- 结果包装：执行结果转自然语言解释。
- 多轮对话与报告生成。

关键约束：
- 大模型输出必须受第2层执行结果严格约束，不能自由发挥。

### 32.3 压实度 94% 完整流程（确定性示例）

```text
用户输入：K15+200 压实度94%合格吗？
第3层（大模型）：解析意图并提取DTO（stake/value/item）
第2层（执行引擎）：
  1) 定位构件：JTG_F80_1_2017.4.2.1.compaction
  2) Path执行：计算干密度、代表值
  3) Gate裁决：单点检查 + 代表值检查
  4) 判定：不合格（94 < 96-2）
  5) 生成Proof：输入/计算/Gate/状态变化
第3层（大模型）：按执行结果生成可解释回复与整改建议
```

### 32.4 规范解析的核心目标
- 规范 = 可实例化、可执行、可验证的构件库（Catalog）。
- 每个构件必须具备：可输入、可执行、可裁决、有状态、可存证、可组合。
- 现场数据进入后系统自动完成：构件定位 -> Path计算 -> Gate裁决 -> State流转 -> Proof生成。

### 32.5 压实度 Component（精炼YAML）

```yaml
component_id: "JTG_F80_1_2017.4.2.1.compaction"
name: "压实度"
type: "MeasuredItem"
critical: true

input:
  stake: "Chainage"
  layer_depth: ["0-0.8m", "0.8-1.5m", ">1.5m"]
  test_method: ["T0921", "T0923", "T0924"]
  raw_data:
    sand_density: "Number(g/cm3, precision:3)"
    mass_hole_sand: "Number(g)"
    volume_ring: "Number(cm3)"
    moisture_content: "Number(%, precision:1)"
    max_dry_density: "Number(g/cm3)"

path:
  - calc_wet_density: "(mass_hole_sand / sand_density) / volume_ring"
  - calc_dry_density: "wet_density / (1 + moisture_content / 100)"
  - calc_compaction: "dry_density / max_dry_density * 100"
  - determine_zone: "lookup(layer_depth -> zone_type)"
  - determine_standard: "lookup(zone_type -> standard_value)"

gate:
  single_point:
    condition: "compaction_degree >= standard_value - tolerance"
    fail_action: "BLOCK"
  representative:
    method: "t_distribution_95"
    condition: "representative >= standard_value"
    fail_action: "CRITICAL"

lifecycle:
  - DRAFT
  - COMPUTED
  - VALIDATED
  - QUALIFIED
  - REJECTED
  - OVERRIDDEN
  - ARCHIVED

output:
  compaction_degree: "Number(%, precision:1)"
  status: ["合格", "不合格", "特批"]
  representative_value: "Number"
  proof_hash: "Hash"
```

### 32.6 现场协同要点（DTO + 引擎 + 大模型）
- DTO：负责数据结构、类型安全、输入验证。
- LayerPeg：负责执行逻辑、裁决、状态机、Proof存证。
- 大模型：负责解释与报告生成，不负责最终判定。

### 32.7 LayerPeg 五层结构（工程最终版）

LayerPeg 是基于 `USI(v://)` 的主权文档协议，用于把规范、表单、报告、Proof统一组织为可执行载体。

Header（Identity Layer）
- 主权地址、文档类型、版本、所有者DID、RootRef/UTXO、NormRef。
- 本质：可解析存在声明（Existence Declaration）。

Gate（Policy & Execution Layer）
- 可执行规则、准入条件、Pass/Block/Override、执行路径、依赖图（Dependency Graph）。
- 本质：裁决 + 路由 + 执行编排，不是简单校验器。

Body（Payload Layer）
- DTO、实测数据、参数、公式、原始数据与中间计算值。
- 本质：Trip数据承载体。

Proof（Proof Layer）
- Merkle Root、DID签名、时间戳/GPS、IoT签名、外部锚定。
- 本质：TPC（Transformation Proof Chain）落地。

State（State Machine Layer）
- 当前状态、状态机定义、转换规则、Pending Actions、状态历史。
- 本质：QIL 驱动器。

### 32.8 五层一句话与七层映射

五层一句话：
- Header：我是谁（Exist）
- Gate：我合不合格（Decide + Route）
- Body：我具体是什么（Data）
- Proof：我怎么被执行（Verify）
- State：我现在在哪一步（Evolve）

七层映射（概念对齐）：
- Header -> RMS 定位/主权锚点
- Gate -> SCV + GateAgent
- Body -> RMS -> TPS -> PCS
- Proof -> TPC
- State -> CTM -> QIL

结论：
- LayerPeg 是七层系统的文档表达层。
- 该五层具备协议稳定性、工程实现性与理论闭环，可直接转 JSON Schema 工程化。

## 30. PegBot产品需求文档（PRD）

### 30.1 产品概述

定位：
- 让规范主动提醒你该做什么。
- PegBot 是工程领域智能合规助手（规范解析 + 执行判定 + 存证协同）。

目标用户：
- 施工组织设计编制人员
- 项目技术负责人
- 质量/安全管理人员
- 监理工程师

核心价值：

| 传统痛点 | PegBot方案 |
| --- | --- |
| 查规范耗时、理解不一致 | 自然语言问规范，结构化条文秒级返回 |
| 漏项/错项风险高 | 基于工序上下文主动推送检查清单 |
| 规范版本混乱 | 版本锁定，变更自动Diff |
| 责任界定不清 | 检查项关联责任人，未确认拦截 |

### 30.2 功能架构

```text
┌─────────────────────────────────────────┐
│ 用户交互层（聊天界面）                  │
│ • 自然语言输入                           │
│ • 意图识别（问规范/生成清单/查案例）      │
│ • 多轮上下文保持                         │
│ • 快捷操作（原文/交底/会签）              │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ 智能处理层（PegBot Core）               │
│ • NL2Gate：自然语言 -> 结构化查询         │
│ • 规范图谱检索（条文层级/关联引用）       │
│ • 检查清单生成（SPU模板填充）            │
│ • 实时合规判定（Gate）                   │
│ • 版本Diff                               │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ 知识底座（LayerPeg + 规范库）            │
│ • GB/行业/企业标准结构化                 │
│ • 历史案例库（PegUnit）                  │
│ • 项目状态上下文（工序/地区/规模）        │
└─────────────────────────────────────────┘
```

### 30.3 关键功能模块

Ask（智能问答）：
- 示例问题：深基坑 5m 要不要专家论证。
- 输出：条文原文、强制等级、关联条文、推荐做法、快捷动作（查看详解/生成清单/Fork/案例）。

Checklist（检查清单生成）：
- 触发：输入工序名称，或在 MarkUnit 中 `@PegBot`。
- 能力：动态清单、逐项确认、责任人自动关联、未完成拦截。

Trace（规范溯源）：
- 返回图谱路径，不只返回 PDF 页码。
- 支持跨版本差异对比（如 2018 vs 2022）。
- 标记当前项目引用的规范版本。

与 MarkUnit/PegUnit 集成：
- 在 MarkUnit 输入 `@PegBot 深基坑支护`。
- 返回结构化条文 + PegUnit 相似案例 + Fork 到当前项目动作。

### 30.4 非功能需求

| 维度 | 要求 |
| --- | --- |
| 响应速度 | 条文查询 < 1s，清单生成 < 3s |
| 准确性 | 强制条文准确率 100%，推荐做法需人工复核标记 |
| 上下文保持 | 支持 20+ 轮对话并记住项目状态 |
| 数据安全 | 敏感规范/项目数据可本地部署，不出境 |

### 30.5 技术实现要点

| 模块 | 技术方案 |
| --- | --- |
| NL2Gate | 基于现有 NL2Gate 扩展规范意图识别 |
| 规范图谱 | 图数据库（Neo4j/NebulaGraph）存条文层级关系 |
| 清单引擎 | SPU模板 + 规则引擎动态渲染 |
| Gate校验 | 硬规则执行，非模型自由判断 |
| 大模型调用 | DeepSeek/通义千问（条文解释生成） |

### 30.6 成功指标（3个月）

| 阶段 | 指标 | 验证方式 |
| --- | --- | --- |
| Month 1 | 5个核心工序问答准确率 > 90% | 工程师盲测 |
| Month 2 | 检查清单生成采纳率 > 60% | 与现有流程对比 |
| Month 3 | 拦截违规项 > 10次/月 | 案例复盘 |

### 30.7 风险与对策

| 风险 | 对策 |
| --- | --- |
| 大模型幻觉条文 | 所有回复必须附标准编号和可溯源路径 |
| 规范更新滞后 | 建立版本RSS监控，重要变更主动推送 |
| 用户不信任AI | 保留人工确认环节，结果全链路透明 |

### 30.8 与 NotebookLM 对比

| 维度 | NotebookLM | PegBot |
| --- | --- | --- |
| 核心逻辑 | 文档问答 | 规范执行 |
| 输入 | PDF/网页/音频 | 自然语言 + 项目上下文 |
| 输出 | 摘要/回答 | 可执行清单 + 合规判定 |
| 数据更新 | 上传新文档 | 规范库维护（人工审核） |
| 协作 | 单人笔记 | 多方流程（会签/存证） |

### 30.9 CLI 形态（工程师终端伙伴）

核心定位：
- 在命令行里，规范比 Stack Overflow 更快。

```text
$ pegbot ask "深基坑5m要专家论证吗"
📋 GB50202-2018 5.1.3
基坑开挖深度超过5m时，应编制专项施工方案，并经专家论证。
[强制条文] [查看原文] [生成清单]

$ pegbot checklist --project XX大厦 --process 深基坑支护
✅ 深基坑支护施工前检查清单（7项）
□ 1. 地质勘察报告已完成审批 [责任人: 技术负责人]
□ 2. 支护设计方案已通过专家论证 [责任人: 项目经理] ⚠️ 超5m强制
□ 3. 周边环境监测数据已采集 [责任人: 监测单位]

$ pegbot fork --case XX中心2022 --target 当前项目
✅ 已复制案例到当前项目
📁 路径: /projects/XX大厦/cases/深基坑支护-XX中心2022
📝 建议: 地质条件不同，请复核第3项监测频率

$ pegbot status
📊 当前项目规范合规状态
工序          规范引用    检查项    已完成   状态
深基坑支护    GB50202     7项       5/7     待确认
桩基工程      GB50202     12项      12/12   已通过
主体结构      GB50666     待启动    -       未开始

$ pegbot commit -m "完成深基坑支护检查清单" --sign 技术负责人
✅ 已生成 Proof: proof-20240419-001
📋 摘要: 7项检查全部确认，第2项专家论证已通过
🔗 上链存证: 0x7a3f...9e2d
```

## 31. PegBot CLI核心补齐

### 31.1 CLI vs GUI 核心差异

| 场景 | GUI（聊天界面） | CLI（命令行） |
| --- | --- | --- |
| 快速查询 | 适合探索性、多轮对话 | 更快，一行命令出答案 |
| 批量操作 | 逐个处理 | 脚本化，批量生成清单 |
| CI/CD 集成 | 手动触发 | 自动化，提交即检查 |
| 日志审计 | 界面查看 | 管道输出，对接报表系统 |
| 服务器部署 | 需要浏览器 | 无头运行，纯后端服务 |

### 31.2 CLI 命令体系

```text
pegbot
├── ask <query>                # 自然语言问规范
├── lookup <标准编号>          # 精确查条文
├── checklist                  # 生成/查看检查清单
│   ├── --project <id>
│   ├── --process <工序>
│   ├── --export <format>      # yaml/json/markdown
│   └── --sign <角色>          # 责任人确认
├── fork <案例ID>              # 复制案例到项目
├── diff <版本A> <版本B>        # 规范版本对比
├── status                     # 项目合规概览
├── commit -m <message>        # 确认并生成Proof
├── log                        # 操作历史
└── sync                       # 同步最新规范库
```

### 31.3 与 GUI 的协同工作流

```text
写方案（MarkUnit GUI）
  -> @PegBot 深基坑支护
  -> GUI显示上下文卡片
  -> 打开终端深入操作
  -> pegbot checklist --export yaml
  -> 输出到 CI/CD 自动检查
  -> 提交触发 pegbot commit
  -> 回到 GUI 查看 Proof 存证
```

### 31.4 差异化价值

| 竞品CLI | PegBot CLI |
| --- | --- |
| 通用AI CLI | 工程领域专用，支持 GB 编号与工序语义 |
| 传统文档工具CLI | 直连 Gate 校验与 Proof 存证 |
| 企业内部脚本 | 标准化、可共享、可接 PegUnit 生态 |

一句话定位：
- git for codes, pegbot for construction。

### 31.5 多模态到执行输出的管线（CLI可触发）

```text
输入层：PDF/图片/扫描件/拍照/CAD
  ->
预处理层：去噪/纠偏/版面分析/多语言检测
  ->
识别层：文本OCR/表格OCR/符号OCR/手写识别/版面还原
  ->
语义层：NL2Gate实体抽取/条文图谱/Gate预判/SPU YAML输出
  ->
输出层：MarkUnit文档/PegBot问答/PegUnit案例/Proof存证
```

### 31.6 冲击时间表（按模块）

文档识别层（OCR/版面分析）：

| 时间 | 大模型能力 | 你们状态 |
| --- | --- | --- |
| 现在 | 可识别简单表格 | 现有方案可用 |
| 1-2年 | 复杂表格/公式/手写显著提升 | 需转向工程符号自研识别 |
| 3-5年 | 端到端版面理解接近完善 | 通用OCR壁垒降低，语义层成核心 |

规范理解层（NL2Gate）：

| 时间 | 大模型能力 | 你们状态 |
| --- | --- | --- |
| 现在 | 可答条文但有幻觉 | NL2Gate + Gate硬校验是壁垒 |
| 1-2年 | 长上下文降低幻觉 | 需强化实时校验能力 |
| 3-5年 | 接近专家推理 | 重点转向执行路径推演与案例匹配 |

方案生成层（MarkUnit）：

| 时间 | 大模型能力 | 你们状态 |
| --- | --- | --- |
| 现在 | 能生成通用方案 | 差异化在案例Fork与参数可调 |
| 1-2年 | 生成精度继续提升 | 从生成器转向协作编辑器 |
| 3-5年 | 资源约束动态方案 | 保持验证与执行闭环优势 |

执行闭环层（ExecPeg/Gate/Proof）：

| 时间 | 大模型能力 | 你们状态 |
| --- | --- | --- |
| 现在 | 缺乏物理世界责任闭环 | 这是核心护城河 |
| 3-5年 | 可接IoT但难担责 | 合规存证+多方签名仍刚需 |
| 5-10年 | 可能参与智能合约 | 需提前布局法律科技与链上执行 |
