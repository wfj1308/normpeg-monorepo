# DocPeg 核心概念与流程总览（统一口径）

## 1. 目的与范围
本文只使用以下术语体系，统一解释它们：

- v://（主权寻址）
- NormRef
- SpecIR
- SPU
- BOQ
- BOM
- SKU
- UTXO
- ComponentUTXO
- Container（执行体容器）
- DTORole
- TripRole
- Gate/状态机
- IQC + 检验批
- SignPeg
- SMU
- Proof
- LogPeg

目标是回答四个问题：

1. 这些概念都是什么  
2. 各自做什么用  
3. 它们之间是什么关系  
4. 端到端流程怎么跑通

---

## 2. 概念定义（最短可用版）

| 概念 | 定义 | 主要作用 |
|---|---|---|
| v://（主权寻址） | 全链路统一寻址协议，为对象与关系提供唯一 URI | 保证跨模块可定位、可引用、可追溯 |
| NormRef | 规则来源，存规范条文与判定依据 | 提供“按什么标准做” |
| SpecIR | 规范编译表示，把规范转成可执行规则 | 提供机器可执行规则 |
| SPU | 标准单元，定义对象与过程模板 | 提供“做的是什么对象/过程” |
| BOQ | 合同清单，定义工程项、工程量、单价 | 提供合同与计量口径 |
| BOM | 资源需求展开，定义每项需要哪些资源 | 提供资源计划口径 |
| SKU | 资源项本体（材料/工时/台班等） | 提供资源分类单位 |
| UTXO | 资源余额与消费轨迹 | 保证每次消耗可追溯、不可重复花 |
| ComponentUTXO | 构件级 UTXO 视图 | 汇总单个构件的消耗、余量、进度状态 |
| Container（执行体容器） | 执行主体承载模型（资质/技能/容量/能耗） | 决定谁能做、是否可接单 |
| DTORole | 静态授权角色 | 定义“谁可以做什么” |
| TripRole | 动态执行角色 | 记录“这次实际做了什么” |
| Gate/状态机 | 流程控制器 + 阶段状态 | 决定能否执行下一步、锁定/解锁/拦截 |
| IQC + 检验批 | 进场检验 + 使用检验双层校验 | 保证材料先合格再使用 |
| SignPeg | 签名执行动作引擎 | 把行为锚定为可验证执行事件 |
| SMU | 价值账本 | 把资源消耗与工时折算为金额 |
| Proof | 可验证证据（哈希/签名/时间/URI） | 审计、验真、归档依据 |
| LogPeg | 自动日志聚合层 | 输出日报/周报/月报与运营视图 |

---

## 3. 主链关系（统一视图）

```text
[v://寻址层：贯穿全链路对象与关系]

NormRef -> SpecIR -> SPU -> BOQ/BOM -> SKU -> UTXO -> ComponentUTXO
                                             |
Container + DTORole -> Gate/状态机 -> TripRole + SignPeg -> SMU -> Proof -> LogPeg
```

说明：

1. `v://` 不属于单一步骤，而是全链路寻址底座  
2. ComponentUTXO 只是被 `v://` 寻址的一个对象，不是 `v://` 的唯一挂载点  
3. 除 ComponentUTXO 外，NormRef、SpecIR、SPU、BOQ、UTXO、Trip、Proof 等都可由 `v://` 统一寻址  
1. 上半段是“标准与资源主线”  
2. 下半段是“执行与证据主线”  
3. 两条主线在 Gate 与 TripRole 阶段汇合  
4. 汇合后同时产出两类结果：  
   - 资源结果：UTXO/ComponentUTXO 更新  
   - 价值结果：SMU 入账  
5. 最终由 Proof 固化，由 LogPeg 聚合呈现

---

## 4. 端到端流程（按执行顺序）

### 步骤 1：规范可执行化
1. NormRef 提供条文与判定依据  
2. SpecIR 将条文编译成规则、阈值、前置条件

输出：可执行规则集合

### 步骤 2：对象与合同建模
1. SPU 定义对象/过程模板  
2. BOQ 定义合同项与计量口径  
3. BOM 从 SPU + BOQ 展开资源需求

输出：对象模板 + 合同约束 + 资源需求

### 步骤 3：资源准备与合格性确认
1. SKU 定义资源项  
2. IQC 完成材料进场合格判定  
3. 检验批确认“本次使用部分”是否合格  
4. UTXO 建立资源余额与消费轨迹

输出：可用资源余额与检验状态

### 步骤 4：执行资格与动作准入
1. Container 提供执行体能力信息（资质/技能/容量/能耗）  
2. DTORole 判断当前执行体是否有权限  
3. Gate/状态机检查前置条件、步骤顺序、是否锁定

输出：允许执行或阻断执行

### 步骤 5：执行与签名
1. 动作发生，形成 TripRole（动态执行记录）  
2. SignPeg 对动作签名锚定

输出：已签名执行事件

### 步骤 6：双账本入账
1. 资源侧：UTXO 扣减，并同步到 ComponentUTXO  
2. 价值侧：SMU 按规则折算金额

输出：资源变化 + 价值变化

### 步骤 7：证据固化与运营输出
1. 生成 Proof（可验真证据）  
2. LogPeg 自动聚合 Trip、UTXO、SMU、签名、状态

输出：可审计、可追溯、可运营的日志与证据链

---

## 5. 关键关系说明（最容易混淆）

### 5.1 DTORole vs TripRole
- DTORole：授权配置（能不能做）
- TripRole：执行记录（做了什么）

### 5.2 BOQ vs BOM
- BOQ：合同与计量视角（做什么、按什么结算）
- BOM：生产与资源视角（需要消耗什么）

### 5.3 SKU vs UTXO vs ComponentUTXO
- SKU：资源定义
- UTXO：资源流转与余额轨迹
- ComponentUTXO：构件层汇总视图

### 5.4 SignPeg vs Proof
- SignPeg：签名引擎（动作）
- Proof：签名后的证据结果（产物）

### 5.5 Gate vs 状态机
- Gate：单次准入判定（能不能执行当前动作）
- 状态机：全过程阶段推进（现在做到哪一步）

### 5.6 Container vs ComponentUTXO
- Container 管“谁来做、能否做、还能否接”
- ComponentUTXO 管“构件消耗了什么、还剩什么、当前进度”

### 5.7 v:// vs ComponentUTXO
- v:// 是寻址层（协议）
- ComponentUTXO 是被寻址对象（构件级账本视图）
- 关系是“v:// 负责定位 ComponentUTXO”，不是“v:// 只对应 ComponentUTXO”

---

## 6. 每个模块的输入与输出（落地视角）

| 模块 | 关键输入 | 关键输出 |
|---|---|---|
| NormRef | 规范条文 | 条文规则引用 |
| SpecIR | 规范规则 | 可执行规则与阈值 |
| SPU | 规则模板 | 对象/过程标准定义 |
| BOQ | 合同清单 | 合同项与计量口径 |
| BOM | SPU + BOQ | 资源需求清单 |
| IQC + 检验批 | 材料批次与检测结果 | 合格/不合格判定 |
| Container | 执行体能力档案 | 可执行性判断基础 |
| DTORole | 授权配置 | 角色可执行动作集 |
| Gate/状态机 | 前置条件 + 当前阶段 | 通过/阻断 + 阶段推进 |
| TripRole + SignPeg | 执行动作 | 签名执行事件 |
| UTXO/ComponentUTXO | 资源消耗事件 | 余额、去向、构件聚合 |
| SMU | 资源与工时消耗 | 金额账本条目 |
| Proof | 签名与数据摘要 | 可验证证据 |
| LogPeg | Trip + UTXO + SMU + 状态 | 日报/周报/月报 |

---

## 7. 业务闭环检查清单（最小闭环）

满足以下 8 条，可认为链路跑通：

1. NormRef 规则可被 SpecIR 编译并被 Gate 调用  
2. SPU、BOQ、BOM 三者映射一致  
3. 材料经过 IQC 与检验批双层校验  
4. Gate 能检查 Container + DTORole + 前置状态  
5. 执行动作能形成 TripRole 并经 SignPeg 签名  
6. 资源变化进入 UTXO，并可在 ComponentUTXO 聚合  
7. 价值变化进入 SMU，并可与执行事件对应  
8. 最终产出 Proof，LogPeg 可自动汇总

---

## 8. 一句话总括

在 `v://` 统一寻址下，按 NormRef/SpecIR 的规则，对 SPU 对象，基于 BOQ/BOM 资源计划，由 Container 在 Gate 约束下执行并签名（SignPeg），把资源变化写入 UTXO/ComponentUTXO，把价值写入 SMU，最终形成可验证 Proof，并由 LogPeg 自动汇总为可审计运营视图。

---

## 9. DocPeg 七模块架构（补充）

DocPeg =  
LayerPeg（五层主权文档执行协议）  
+ TripRole（执行角色系统）  
+ DTORole（数据所有权角色系统）  
+ Guard Agent（智能审查与自修正引擎）  
+ Proof Chain（证明链管理器）  
+ NormRef 映射引擎（规范自动映射与校验）  
+ State Machine（状态机引擎）

这 7 个模块共同构成可执行、可验证、可主权控制、可自我进化的主权文档操作系统。

### 9.1 模块精确定义与作用

#### 9.1.1 LayerPeg（五层主权文档执行协议）
- 作用：基础骨架与统一数据协议
- 核心：Header / Gate / Body / Proof / State 五层结构
- 价值：把任意文档、图纸、代码对象化、结构化、可执行化

#### 9.1.2 TripRole（执行角色系统）
- 作用：执行引擎
- 核心：定义“谁在什么条件下，对文档执行什么动作”
- 价值：把静态文档变成可执行资产

#### 9.1.3 DTORole（数据所有权角色系统）
- 作用：权限与主权控制
- 核心：定义“谁拥有该文档的数据权限”
- 价值：实现主权控制、所有权转移、精细化授权

#### 9.1.4 Guard Agent（智能审查与自修正引擎）
- 作用：审查与纠偏中枢
- 核心：自动审查 Gate 判定、Trip 执行合规、Proof 有效性
- 价值：发现问题后给出修正建议或触发修正流程（EvolutionIR）

#### 9.1.5 Proof Chain（证明链管理器）
- 作用：证据 Backbone
- 核心：生成、验证、链式存储 Proof
- 价值：保证不可篡改、可追溯、可审计

#### 9.1.6 NormRef 映射引擎
- 作用：规范翻译器
- 核心：把 DWG/表单/代码等原始数据映射为 LayerPeg Body 结构化字段
- 价值：驱动 Gate 自动规范校验

#### 9.1.7 State Machine（状态机引擎）
- 作用：生命周期控制器
- 核心：管理文档/工序/代码的状态流转规则
- 价值：TripRole 执行后自动更新 State 并触发下一动作

### 9.2 七模块关系矩阵（谁依赖谁）

1. LayerPeg 是协议底座，其他 6 个模块都依赖它。  
2. TripRole 负责“执行动作”，DTORole 负责“动作授权”。  
3. Guard Agent 持续审查 TripRole + DTORole + Gate + Proof Chain 的结果。  
4. NormRef 映射引擎为 Gate 提供可执行规则输入。  
5. State Machine 负责承接 TripRole 的执行结果并推进生命周期。  
6. Proof Chain 对 TripRole/DTORole/Guard Agent 输出做可验证固化。  

### 9.3 七模块“精确作用与关系”表

| 模块 | 精确作用 | 主要输入 | 主要输出 | 绑定层 |
|---|---|---|---|---|
| LayerPeg | 文档执行协议骨架，定义统一结构与语义 | 文档对象、执行上下文 | Header/Gate/Body/Proof/State 五层实例 | 全层 |
| TripRole | 记录并驱动一次具体执行动作 | 执行人、动作、目标文档、前置条件结果 | Trip 事件、动作结果 | State、Proof |
| DTORole | 定义文档数据所有权与操作授权 | 组织关系、角色配置、权限策略 | 可执行动作白名单/拒绝原因 | Header、Gate |
| Guard Agent | 审查并纠偏执行链路 | Gate 结果、Trip 事件、Proof 校验结果 | 告警、修正建议、修正触发 | Gate、Proof、State |
| Proof Chain | 固化证据并支持验真 | Trip 结果、签名、哈希、时间戳 | 可验证 Proof 链条 | Proof |
| NormRef 映射引擎 | 把原始内容映射为可校验结构字段 | 规范条文、原始数据（DWG/表单等） | 结构化 Body 字段、Gate 校验上下文 | Body、Gate |
| State Machine | 管理生命周期状态推进与锁定/解锁 | 当前状态、Trip 结果、Gate 判定 | 新状态、待办、下一动作触发 | State |

### 9.4 七模块执行闭环（最短链路）

1. `NormRef 映射引擎` 把原始数据结构化到 `LayerPeg.Body`。  
2. `DTORole` 判定“谁有权做什么”，写入 `LayerPeg.Header/Gate`。  
3. `State Machine` 给出当前可执行状态（是否锁定/解锁）。  
4. `TripRole` 发起动作，`Gate` 完成准入校验。  
5. 动作通过后写入 `Proof Chain` 并更新 `LayerPeg.Proof`。  
6. `State Machine` 推进到下一状态。  
7. `Guard Agent` 对全链路做持续审查与自修正建议。  

### 9.5 DocPeg 对外定位文案

#### 一句话定义
DocPeg 是基于 LayerPeg 五层协议的主权文档操作系统，通过 TripRole、DTORole、Guard Agent、Proof Chain、NormRef 映射引擎和 State Machine，实现文档从生成到执行的全流程可验证、可主权控制和自我进化。

#### 三句话介绍
1. DocPeg 以 LayerPeg 五层结构为核心，将任意文档变成可执行的主权资产。  
2. 通过 TripRole 执行操作、DTORole 控制权限、Guard Agent 智能审查、Proof Chain 存证，确保每份文档可信、可控、可审计。  
3. 它可作为 DocPeg、PegView、PegHMI、CodePeg 等产品的统一底层操作系统。  

---

## 10. LayerPeg Protocol v1.0

### 10.1 协议元信息
- 全称：LayerPeg 主权文档执行协议
- 简称：LayerPeg
- 版本：v1.0（2026.04）
- 核心原则：最小指纹 + 侧链完整 + 主权可验 + 执行闭环

### 10.2 整体架构（三层分离）

```text
表现层（PegView / PegHMI）
    -> 调用 ->
协议层（LayerPeg）
    -> 存储 ->
数据层（本地 DWG + 侧链）
```

### 10.3 五层结构（最终定义）

| 层级 | 名称 | 职责 | 存储位置 | 大小控制 |
|---|---|---|---|---|
| Layer 1 | Header | 身份、主权、版本、时间 | XData 指纹 + 侧链 | 极小 |
| Layer 2 | Gate | 前置条件、校验规则、权限 | 侧链 | 中 |
| Layer 3 | Body | 实际业务内容（构件/代码/工序） | 侧链 | 大 |
| Layer 4 | Proof | 证据链、签名、哈希 | 侧链 | 中 |
| Layer 5 | State | 生命周期、待办、当前状态 | 侧链 + 索引 | 小 |

### 10.4 与本文主链的对应关系

1. Header 对应 `v://` 身份与版本锚点。  
2. Gate 对应 `NormRef/SpecIR` 可执行规则 + `DTORole` 授权判断。  
3. Body 对应 `SPU/BOQ/BOM/SKU/UTXO/ComponentUTXO` 的业务内容映射。  
4. Proof 对应 `SignPeg + Proof Chain` 的证据固化。  
5. State 对应 `State Machine + TripRole` 的生命周期推进。  

### 10.5 LayerPeg v1.0 运行约束（落地口径）

1. Header 保持“最小指纹”，只放身份锚点与版本锚点。  
2. Gate 只承载“可执行判定”所需规则，不混入业务明细。  
3. Body 承载业务实体与字段，不直接承载权限决策。  
4. Proof 必须可独立验真，不依赖运行时内存状态。  
5. State 只表达生命周期事实，不承载未执行的推测值。  

### 10.6 LayerPeg 与 DocPeg 七模块的总映射

```text
LayerPeg.Header  <- DTORole / 身份与主权锚点
LayerPeg.Gate    <- NormRef 映射 + DTORole 授权 + Guard Agent 审查
LayerPeg.Body    <- NormRef 映射后的结构化业务内容
LayerPeg.Proof   <- TripRole 执行结果 + Proof Chain 固化
LayerPeg.State   <- State Machine 生命周期推进 + TripRole 动作回写
```

### 10.7 NormRef API 规则注入机制（补充）

核心口径：
1. `NormRef` 是规则库（规范、标准、业务规则集中管理）。  
2. `LayerPeg` 是执行容器（五层文档协议）。  
3. 不是“简单调用”，而是“规则注入”：由 `LayerPeg runtime` 主动拉取规则并注入执行链。  

工作方式（按时机）：
1. 创建文档时：主动拉取最新 NormRef 规则，填充 `Gate` 初始规则集。  
2. 修改 `Body` 时：重新调用 NormRef 校验并刷新 Gate 判定结果。  
3. 执行 `TripRole` 时：必须通过当前 Gate 校验才允许继续。  
4. 生成 `Proof` 时：记录本次引用的 `normref_uri + version + rule_hash`。  

实现约束：
1. 不仅要“拉最新”，还要“版本钉住”，避免历史执行结果随规则更新漂移。  
2. Proof 默认记录“规则指纹”（引用+哈希），必要时再展开规则快照。  
3. 历史 Proof 必须支持离线复验：仅凭 payload + rule_hash 可重算校验结果。  

最短一句话：
`LayerPeg runtime` 主动拉取 NormRef 规则并注入 Gate/Body，执行时钉住规则版本，Proof 固化规则指纹，保证可追溯与可复验。  

### 10.8 NormRef API 版本控制规范（生产级）

#### 10.8.1 核心原则
1. 每条规则独立版本化，不采用整库单版本覆盖。  
2. LayerPeg 文档固化“当次引用规则版本”与规则指纹。  
3. 规则可升级，但历史文档校验结果不可漂移。  
4. 调用支持“显式指定版本”与“latest”，满足安全与灵活并存。  

#### 10.8.2 API 形态（推荐）

```http
# 获取单条规则（可指定版本）
GET /api/normref/rules/{rule_id}?version={version}

# 获取一批规则（按类别 + 版本）
GET /api/normref/rules?category=contract&version=latest
GET /api/normref/rules?category=contract&version=2026-04

# 批量校验（高频主接口）
POST /api/normref/validate
Content-Type: application/json
{
  "rules": ["contract.amount_must_match", "contract.party_must_sign"],
  "data": { "...": "..." },
  "normref_version": "2026-04"
}
```

#### 10.8.3 版本标识（推荐）
1. 语义化版本：`v1.2.3`（主.次.修）。  
2. 日期版本：`2026-04`（规范类规则优先推荐）。  
3. 完整规则 URI：`v://normref.com/rule/contract/amount_must_match@2026-04`。  

#### 10.8.4 LayerPeg 文档内落地结构

```json
{
  "header": {
    "normref_version": "2026-04",
    "rule_snapshots": {
      "contract.amount_must_match": {
        "version": "2026-04",
        "hash": "sha256:xxx",
        "content": "合同金额必须与BOQ一致"
      }
    }
  },
  "gate": {
    "validation_results": [
      {
        "rule_id": "contract.amount_must_match",
        "version_used": "2026-04",
        "passed": true
      }
    ]
  },
  "proof": {
    "normref_snapshot_hash": "sha256:all_rule_hashes"
  }
}
```

#### 10.8.5 快照机制与审计约束
1. 快照不是“复制整库”，而是固化“规则引用 + 版本 + 哈希”。  
2. `normref_snapshot_hash` 由本次所有引用规则哈希汇总计算。  
3. 审计或验真时必须可还原“当时规则上下文”，并可独立复验。  

#### 10.8.6 向前兼容策略
1. 新版本规则允许增量字段（Additive），不得破坏旧字段语义。  
2. 旧文档继续按其 `version_used` 校验，不自动切换新版本。  
3. 仅当触发“显式重校验/迁移”流程时，才允许提升规则版本。  
