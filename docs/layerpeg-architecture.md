# LayerPeg / NormRef PRD（重构版）

> 版本：v2.0（2026-04-23）
> 文档目标：给产品、研发、实施、商务团队提供一份可执行、可评审、可落地的统一 PRD 主文档。
> 详细历史内容：见 [layerpeg-architecture.full.backup.md](d:\wfj\project\normpeg-monorepo\docs\layerpeg-architecture.full.backup.md)

## 0. 先看结论（TL;DR）
- LayerPeg 是“规范执行协议层”，NormRef 是“产品与服务层”。
- 核心闭环：`输入 -> 解析 -> 执行(Path/Gate/State) -> Proof -> 输出 -> 回写`。
- AI 只负责理解与表达，不负责最终判定。
- 项目是主权状态实体（`ProjectUTXO + v://`），不是普通数据库记录。
- 交付物采用双轨：`Markdown + JSON`，并打包为 `.specbundle`。

## 1. 产品定位与边界

### 1.1 产品定位
LayerPeg：可执行规范驱动的工程操作系统（Execution OS）。

NormRef：基于 LayerPeg 的规范数字化与执行产品体系（PegBot / FormPeg / MarkUnit / PegUnit / API）。

### 1.2 四个核心定义
- 规范：可执行程序（不是静态文本）
- AI：交互接口（不是最终裁决者）
- 工程：状态机系统（不是静态台账）
- 文档：可验证证据（不是仅描述性附件）

### 1.3 不做什么
- 不做通用大模型底座。
- 不把“问答准确”当终点，必须闭环到“执行正确 + 可审计”。

## 2. 目标用户与核心场景

### 2.1 目标用户
- 施工员、试验员、质检员、监理、总工
- 施工组织设计编制人员、项目技术负责人
- 法务/审计/业主/设计方
- 第三方系统（BIM/ERP/IoT）

### 2.2 三类高频场景
- 问规范：自然语言获取条文、强制等级、关联条款
- 做判定：填报数据后自动计算与 Gate 裁决
- 做留痕：Proof 存证、签名、审计回放

## 3. 核心价值主张

| 传统痛点 | NormRef 方案 | 价值结果 |
| --- | --- | --- |
| 查规范慢、理解不一致 | NL2Gate + 结构化条文 | 秒级一致性输出 |
| 计算与判定靠人工 | Path 自动计算 + Gate 硬约束 | 降低漏判误判 |
| 版本混乱 | 版本锁定 + Diff + Patch | 可追溯可回放 |
| 责任不清 | TripRole + 签名 + Proof | 责任闭环 |

## 4. 总体架构（主视图）

### 4.1 五层产品视图
```text
第5层 交互与AI层（Interface）
第4层 业务应用层（Applications）
第3层 执行引擎层（Execution Core）
第2层 规范模型层（Spec Layer）
第1层 协议与状态层（Protocol）
```

### 4.2 三层因果执行视图（给研发）
```text
第3层 交互生成：NL2Gate、解释、报告
第2层 因果执行：Registry/Path/Gate/State/Proof
第1层 可信知识：NormDoc/SpecIR/Component Catalog
```

### 4.3 关键原则
- 大模型输出必须受执行层结果约束。
- 任何未经过 Gate 的答案，不算最终结果。

## 5. 协议与状态内核（系统底座）

### 5.1 主权寻址与状态
- `v://`：项目/桩号/版本/层位/时间联合寻址
- `ProjectUTXO`：项目作为独立主权状态根
- `Fork/Split/Merge`：工程变更的分支、拆分与合并

### 5.2 空间与体积
- `Space Slot`：纯地理地址（坐标/桩号）
- `Space Container`：地址 + 规范 + 状态
- `Volume Container`：工程量边界（物理体积）

结论：空间容器定义“逻辑执行边界”，体积容器定义“物理计量边界”。

## 6. 规范可执行化（Spec Layer）

### 6.1 规范资产链
`PDF -> NormDoc -> SpecIR -> Component Catalog -> SPU实例`

### 6.2 Component 最小能力模型
```text
Component = Input + Path + Gate + State + Proof
```

### 6.3 规范解析目标
不是摘要，而是把规范编译成可实例化、可执行、可裁决、可存证的构件库。

## 7. 执行引擎（Execution Core）

| 模块 | 职责 |
| --- | --- |
| Component Registry | 按项目上下文定位构件 |
| Path Engine | 公式、查表、聚合、转换 |
| Gate Engine | Pass/Block/Critical/Override 裁决 |
| State Engine | 生命周期驱动与待办动作 |
| Proof Engine | 哈希、签名、时间戳、锚定 |
| Output Composer | JSON/Markdown/报告/清单输出 |

## 8. 文档协议五层（LayerPeg Document）

```text
Header：主权身份层
Gate：裁决执行层
Body：业务载荷层
Proof：证据链层
State：生命周期层
```

五层一句话：
- Header：我是谁
- Gate：我合不合格
- Body：我具体是什么
- Proof：我怎么被执行
- State：我现在在哪一步

## 9. 服务/API矩阵（v1）

```text
api.normref.com/v1/
├── 输入层：pdf / image / voice
├── 核心层：mapping / spu / spec
├── 执行层：gate / path / state
├── 输出层：proof / form / report
├── 资产层：boq / price / contract
├── 身份层：did / trip / sign
└── 系统层：webhook / sync / export
```

三大核心独立API：
- `/v1/pdf`：规范输入解析
- `/v1/mapping`：桩号空间纽带
- `/v1/spu`：可执行规范生成

## 10. 端到端闭环（运行主流程）

```text
用户输入/表单/PDF
 -> NL2Gate与解析
 -> v://定位与构件选择
 -> Path计算
 -> Gate裁决
 -> State流转
 -> Proof生成
 -> JSON/Markdown输出
 -> 回写Mapping/状态/锚定
```

## 11. 产品矩阵与协同

### 11.1 产品分工
- PegBot：规范问答、清单生成、合规提醒
- FormPeg：表单执行、自动计算、自动判定
- MarkUnit：方案编辑与协作
- PegUnit：案例库与 Fork 复用

### 11.2 MarkUnit x PegUnit 关系
建议模式：主从体验 + 统一底层模型。
- MarkUnit 作为主工作台
- PegUnit 作为上下文感知案例助手

## 12. CLI与GUI协同（PegBot CLI）

### 12.1 命令体系
`ask / lookup / checklist / fork / diff / status / commit / log / sync`

### 12.2 协同路径
GUI 写作触发上下文 -> CLI 深度批量操作 -> CI/CD 自动检查 -> 回 GUI 查看 Proof。

一句话：`git for codes, pegbot for construction`。

## 13. 交付规范（SpecBundle）

### 13.1 双轨输出
- 人读：`spec.md`
- 机读：`spec.json`
- 打包：`.specbundle`

### 13.2 一致性约束
- `mdHash` / `jsonHash` 互引
- `bundleHash` 覆盖整体

## 14. MVP与里程碑

### 14.1 近期MVP（0-3个月）
- 路基核心闭环（压实度/弯沉）
- 翻译机器人 MVP（PDF -> SpecIR 草稿）
- Postman + TypeScript SDK 对接包

### 14.2 中期（3-12个月）
- 桥梁/隧道规范扩展
- Mapping 全量查询与历史路由
- CSD 自动编排落地

### 14.3 长期（12个月+）
- 地方/企业标准生态
- 行业级规范网络与认证体系

## 15. 成功指标（示例）

| 指标 | 目标 |
| --- | --- |
| 条文查询响应 | < 1s |
| 清单生成响应 | < 3s |
| 强条准确率 | 100%（可溯源） |
| 清单采纳率 | > 60% |
| 违规拦截次数 | 持续上升并可复盘 |

## 16. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 大模型幻觉 | Gate硬校验 + 可溯源编号 |
| 规范更新滞后 | RSS/发布监控 + 增量Patch |
| 体验阻力 | GUI轻量 + CLI提效 + 强审计价值 |
| 通用能力被替代 | 深耕执行闭环（Gate/State/Proof） |

## 17. 商业模式

| 层级 | 方式 |
| --- | --- |
| 协议层 | 协议授权/认证服务 |
| 平台层 | SaaS订阅 |
| API层 | 按量计费（pdf/mapping/spu等） |
| 实施层 | 标准迁移、培训、集成交付 |

## 18. 本版重构说明
- 本文是 PRD 主干版（决策优先、去重复）。
- 详细内容已拆分为主题附录（建议按需查阅）：
1. [appendix-specir-factory.md](d:\wfj\project\normpeg-monorepo\docs\appendix\appendix-specir-factory.md)
2. [appendix-spatial-container.md](d:\wfj\project\normpeg-monorepo\docs\appendix\appendix-spatial-container.md)
3. [appendix-api-deep-dive.md](d:\wfj\project\normpeg-monorepo\docs\appendix\appendix-api-deep-dive.md)
4. [appendix-experience-layer.md](d:\wfj\project\normpeg-monorepo\docs\appendix\appendix-experience-layer.md)
5. [appendix-branding-gtm.md](d:\wfj\project\normpeg-monorepo\docs\appendix\appendix-branding-gtm.md)
6. [appendix-docbot.md](d:\wfj\project\normpeg-monorepo\docs\appendix\appendix-docbot.md)
- 完整历史版本仍保留在：
  [layerpeg-architecture.full.backup.md](d:\wfj\project\normpeg-monorepo\docs\layerpeg-architecture.full.backup.md)
- 对外路演提纲（10页）：
  [layerpeg-deck-outline.md](d:\wfj\project\normpeg-monorepo\docs\layerpeg-deck-outline.md)
- 团队评审建议：先审主文档，再按主题查附录。
