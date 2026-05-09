# labpeg.cn - 高速公路实验室执行管理系统

## 1. 正式定义

- 系统全称：`labpeg Lab Execution System`（`labpeg LES`）
- 核心定位：面向高速公路项目的实验室管理与执行系统，覆盖“委托受理 -> 收样留样 -> 试验任务 -> 判定复核 -> 报告签发 -> 台账归档”全流程
- 命名含义：`labpeg = Lab + Peg`
- 建设目标：以实验室业务流程为主线，以 `v:// + Trip + Proof` 为底层能力，做到可执行、可追溯、可审计、可结算

---

## 2. 模型边界与原则

- 引擎边界：`v://` 地址体系 + 标段驱动 + Trip/Proof 链 + RailPact 结算边界
- 构建原则：不引入外部 MES 方案，直接原生复用现有引擎
- 标段原则：实验室被定义为“特殊标段”，与桥梁标、路基标并行治理，统一进入结算与审计边界

### 2.1 三大零号资源（已固化）

在 `labpeg` 中，目录、时间、地点共同构成系统三大零号坐标系。  
所有 Trip、Proof、Formpeg 实例都必须同时锚定这三类资源。

| 零号资源 | 定义 | 固化要求 |
|---|---|---|
| 目录（Directory） | 空间结构坐标（如 `v://cn.highway/dajin/section/lab/CL-01/`） | 作为系统空间骨架，稳定且可追溯 |
| 时间（Time） | 时间轴坐标（项目日历 + 每个 Trip 绝对时间戳 + 里程碑节点） | 必须记录不可篡改时间戳并可映射项目日历 |
| 地点（Location） | 地理坐标（GIS 坐标 + 桩号 + 物理位置描述） | 必须可定位到实验室、工地试验室、取样点等物理实体 |

固化原则：零号资源（Directory + Time + Location）是系统“三维坐标轴”，固定不变。

GIS 坐标整合规则（固化）：

1. 每个标段（含实验室标）必须同时具备“桩号范围 + GIS 坐标范围（经纬度或边界多边形）”
2. 中心实验室标（`CL-xx`）默认采用“中心点坐标 + 服务范围多边形”，桩号可标注“全线共享”或明确范围
3. 工地试验室标（`SL-xxx`）的桩号与 GIS 范围应与服务标段基本重合或略大
4. 所有 Trip、样品、设备、Proof 必须同时绑定“桩号 + GIS 坐标”

### 2.2 TripRole 的动态本质

`TripRole` 不是零号资源，而是随着 Trip 注册与流转不断变化的动态角色标识。  
实验室检测典型流转：

`取样员 -> 运输员 -> 制备员 -> 检测员 -> 复核员 -> 授权签字人（Final Proof）`

同一人员、同一样品，在不同 Trip 阶段可拥有不同 `TripRole`。

固化要求：

1. 所有 Formpeg 表单、Proof 链、判定结果必须同时锚定：`Time + Location + Directory + 当前 TripRole`
2. `TripRole` 可变，零号资源不可变
3. 所有对外数据交换必须携带 `TripRole + DTORole`（`DTORole` 由当前 `TripRole` 映射得到）

### 2.2.1 DTORole（数据传输角色）固化定义

`DTORole = Data Transfer Object Role`，是 `TripRole` 在数据交换层的轻量映射。  
它不负责执行逻辑，只负责在 API、Formpeg 实例、Proof 交换时标记“当前数据由谁、在哪个环节产生”。

核心区别（固化）：

1. `TripRole`：执行过程中的动态业务角色，随 Trip 流转变化
2. `DTORole`：数据传输时的角色标签，用于快速识别传输上下文

使用规则（固化）：

1. 每次数据传输（API 调用、表单提交、Proof 同步）必须携带 `DTORole`
2. `DTORole` 必须从当前 `TripRole` 映射得到，禁止脱离 Trip 上下文独立伪造
3. 平台以 `tripId + DTORole + vAddress` 作为传输审计最小上下文

TripRole 与 DTORole 最终对应关系（实验室场景，正式版）：

| TripRole（对应产品/资源） | DTORole（对应文档） | 说明 |
|---|---|---|
| `Sampler` | `Sampler` | 取样员 -> 取样记录文档 |
| `Transporter` | `Transporter` | 运输员 -> 运输记录、温湿度记录文档 |
| `Preparer` | `Preparer` | 制备员 -> 试件制备记录文档 |
| `Tester` | `Tester` | 检测员 -> 检测原始数据、曲线图文档 |
| `Reviewer` | `Reviewer` | 复核员 -> 复核意见、质控记录文档 |
| `Signer` | `Signer` | 授权签字人 -> Final Proof 报告文档 |
| `Auditor` | `Auditor` | 审计/质控员 -> 质控报告、偏差记录文档 |
| `LabManager` | `LabManager` | 试验室负责人 -> 综合管理文档 |
| `Owner / PMO` | `Owner` | 业主/代建 -> 最终验收报告文档 |

QC 扩展映射（固化）：

| TripRole（执行主体） | DTORole（文档/数据） | 适用环节 |
|---|---|---|
| `IncomingInspector / Supplier` | `IQCRecorder` | `IQC`（Incoming Quality Control） |
| `ProcessInspector / Operator` | `PQCRecorder` | `PQC`（Process Quality Control） |
| `QualityInspector` | `QQCRecorder` | `QQC`（Quality Quality Control） |
| `FinalInspector / Signer` | `FQCRecorder / Signer` | `FQC`（Final Quality Control） |

语义边界（固化）：

1. `TripRole` 负责实际操作产品和资源（样品、设备、材料），属于执行层角色
2. `DTORole` 负责文档和数据（表单填写、Proof 记录、报告生成），属于传输层角色
3. 多数场景下两者名称相同，但语义不同：`TripRole = 我在干活`，`DTORole = 我正在产生/传输这份文档`

### 2.3 Trip 类型区分（Project Trip vs Lab Trip）

注册项目的 Trip 与注册实验室的 Trip 是两类本质不同的 Trip，必须分型治理。

| 维度 | 项目级 Trip（Project Trip） | 实验室级 Trip（Lab Trip） |
|---|---|---|
| 适用对象 | 施工标段（如 `section/bridge/DA-01`、`section/roadbed/DB-01`） | 实验室标（如 `section/lab/CL-01`、`section/lab/SL-DA01`） |
| 目录零号资源 | 施工标段目录 | 实验室目录 |
| TripRole 流转 | 取样员 -> 施工员 -> 质检员 -> 监理 -> 业主 | 取样员 -> 运输员 -> 制备员 -> 检测员 -> 复核员 -> 授权签字人 |
| 典型 Trip | 桩基浇筑、路基填筑、梁板架设 | 混凝土取样、沥青检测、试块养护、报告签发 |
| Proof 重点 | 施工过程合规、计量支付、RailPact 结算 | 数据真实性、JTG 判定准确性、CMA/CNAS 合规 |
| Formpeg 侧重 | 桥施表格、路基表格、计量单 | JTG 检测模板、原始记录、质控图、电子签章 |
| 终点导向 | 计量支付（RailPact） | Final Proof 报告签发（合规交付） |

### 2.4 双 Trip 并存规则（样品关联）

同一个物理样品可同时存在项目级 Trip 与实验室级 Trip。  
两者通过 `v://` 地址关联，但 `TripRole` 流转与 Proof 链彼此独立，不可混用。

### 2.5 三大 Root（根坐标）固化定义

在整个 `vpeg / labpeg` 体系里，存在三个最顶层 Root。  
一切 Trip、Proof、Formpeg、UTXO 都必须挂在这三个 Root 之下。

| Root | 定义 | 作用 |
|---|---|---|
| Directory Root（目录根） | `v://` 地址体系根（如 `v://cn.highway/dajin/`） | 定义“在哪里”，即空间结构（行业 -> `section/` 标段总层 -> 标段编码节点（桩号区间 + 专业组合） -> 构件） |
| UTXORoot（账本根/资产根） | 可计量资产与结算根 | 定义“值多少钱”，承载 BOQ、合同额、完成额、支付额、RailPact，以及实验室检测费用 |
| VRoot（验证根 / `v://` 根） | `v://` 地址体系的最高验证根 | 定义“是否可信”，承载版本控制、Proof 链、Final Proof、Append-only 事件流与时间戳可信性 |

核心定义：

- `VRoot = v://` 根，是整个数字孪生体系的信任锚点与版本总根
- 一切 Proof、Trip、Formpeg 实例最终都必须挂入 VRoot 体系，才能保证可验证、不可篡改

三根关系总结（固化）：

1. `Directory Root` 定义空间结构
2. `UTXORoot` 定义资产与结算
3. `VRoot` 定义可验证性与不可篡改性

强制关联规则：

1. 所有 Trip 必须可追溯到 `Directory Root + UTXORoot + VRoot`
2. 所有 Formpeg 实例必须携带目录锚点，并关联 UTXO 与版本证明上下文
3. 所有 Proof（含 Final Proof）必须挂在 `VRoot`，并可反查目录位置与资产来源

实际体现（`CL-01` 示例）：

当创建中心实验室标 `CL-01` 后，系统自动形成三根映射：

1. `Directory Root`：`v://cn.highway/dajin/section/lab/CL-01/`（定位该资源属于哪个目录结构）
2. `UTXORoot`：该实验室标下检测费用、BOQ、结算事件等可计量资产
3. `VRoot`：`CL-01` 下检测原始记录、判定结果、Final Proof、电子签章等 Proof 链验证根

同一个混凝土试块检测会同时记录在：

1. `Directory Root`：属于哪个实验室标与目录节点
2. `UTXORoot`：本次检测对应费用与结算资产
3. `VRoot`：本次检测的完整 Proof 链与版本历史

### 2.6 三项前置坐标系（立即执行方案，固化）

目录、时间、地点是系统运行的三项基础坐标系。  
当前按“今日可落地”节奏，采用 `CL-01` 先行锚点策略。

立即执行（3 步）：

1. 第一步：目录（Directory）  
创建中心实验室标 `CL-01`，作为目录层起点  
`Section Code = CL-01`；`名称 = 中心实验室 CL-01（全线共享，可管辖123个标段）`；`类型 = 实验室标`
2. 第二步：时间（Time）  
创建 `CL-01` 后，系统自动生成项目日历入口；补齐关键节点（开工、检测周期、报告截止、交工等）
3. 第三步：地点（Location）  
在 `CL-01` 与 `SL-DA01` 下挂载 GIS 坐标、桩号与物理位置描述（中心实验室位置、工地试验室位置、取样点桩号等）

执行完成判定：

1. 目录坐标已形成（`CL-01` 可寻址）
2. 时间坐标已形成（项目日历与 Trip 时间戳可关联）
3. 地点坐标已形成（GIS + 桩号 + 物理描述可追溯）

---

## 3. 地址与目录结构

目录采用“行业根 + `section/` 标段总层（按桩号区间 + 专业组合定义）”结构：

- 一级：行业根（`v://cn.highway/dajin/`）
- 二级：`section/`（标段总层，执行主线）
- 三级及以下：按标段编码节点组织，每个标段节点必须配置“桩号区间 + 专业组合”

```text
v://cn.highway/dajin/
├── section/                        标段总层
│   ├── bridge/DA-01                桩号：K0+000 ~ K20+000；专业：桥梁 + 部分路基 + 实验室
│   ├── roadbed/DB-01               桩号：K0+000 ~ K15+000；专业：路基 + 路面 + 实验室
│   ├── pavement/PM-01              桩号：K20+000 ~ K60+000；专业：路面
│   └── lab/                        实验室标（始终独立）
│       ├── CL-01                   全线桩号；专业：实验室（中心共享）
│       ├── SL-DA01                 服务 DA-01 的工地试验室
│       └── SL-DB01                 服务 DB-01 的工地试验室
└── ...（可扩展资源目录）
```

说明：

- 标段唯一业务定义：`一个标段 = 一个桩号区间 + 一个或多个专业`
- 系统按“桩号区间 + 专业组合”自动挂载规范、工序链、Formpeg 模板、BOQ 映射等
- 实验室标（`section/lab/CL-xx`、`section/lab/SL-xxx`）始终独立存在，通过管辖映射服务施工标段
- 每个标段节点（施工标与实验室标）都必须绑定“桩号范围 + GIS 坐标范围”

前置约束：项目首个锚点可先创建 `CL-01`；随后必须立即补齐 `Project Calendar + Project Map`。  
在扩展创建其他标段前，必须完成 `Directory Root + Project Calendar + Project Map` 三项基础坐标系初始化。

每个实验室标创建后自动挂载：

- `/boq/`：检测项目清单（水泥、沥青、混凝土、压实度等）
- `/trip/`：检测 Trip 台账（取样 -> 运输 -> 制备 -> 检测 -> 复核 -> 报告）
- `/proof/`：全程 Proof 链（原始数据 + 照片 + 视频 + 电子签名 + 时间戳）
- `/form/`：JTG 标准报告模板 + 电子签章
- `/monitor/`：环境监控 + 设备 IoT + 视频看板
- `/executor/`：试验员资质 + 授权签字人
- `/readiness/`：CMA/CNAS 合规检查 + 上线就绪度

### 3.1 目录自动生成机制（DocPeg / vpeg.cn 创世规则）

在 `labpeg`（以及 `vpeg.cn / 大锦·孪生引擎`）体系中，目录结构由系统自动生成，不由业主手动创建。

业主只做一件事：

1. 在 DocPeg / vpeg.cn 选择 `ProjectKind = highway`
2. 输入项目基本信息（例如 `v://cn.highway/dajin/`）
3. 提交创世流程

系统自动完成其余目录层级与挂载：

1. 一级：`ProjectKind = highway`（业主只需确认）
2. 二级：`section/` 标段总层自动生成
3. 三级：创建施工标段节点（如 `section/bridge/DA-01`、`section/roadbed/DB-01`、`section/pavement/PM-01`）
4. 每个施工标段必须配置：`桩号区间 + 专业组合`
5. 实验室标：`section/lab/CL-01`、`section/lab/SL-DA01`、`section/lab/SL-DB01` 与施工标段映射运行
6. 所有节点自动绑定地点双标识：`桩号范围 + GIS 坐标范围`
7. 四级及以下：构件级 `v://` 地址、Trip 链、Proof 链、Formpeg 表单实例、API 权限等全部自动挂载

注册前置检查（新增）：

1. `Directory Root` 已完成 `section/` 标段总层初始化，并启用“桩号区间 + 专业组合”配置
2. `Project Calendar` 已建立项目里程碑时间轴（开工、关键节点、交工）
3. `Project Map / GIS` 已建立基础地图图层并可定位标段/实验室/取样点

### 3.2 与传统系统的关键差异

- 传统系统：手动建目录、建表、配权限
- labpeg / vpeg.cn：只需“创建标段”，后续目录、模板、工序链、表单、Proof 链与接口权限按“桩号区间 + 专业组合”规则自动挂载

### 3.2.1 标段驱动 + 自动挂载机制（固化）

创建任一标段（如 `CL-01` 或 `SL-DA01`）后，系统自动挂载以下能力：

1. 目录结构（`v://` 地址）
2. Formpeg 五层协议
3. Trip 执行体模板
4. Proof 链框架
5. 对应 JTG 规范、表格、工序链

系统默认行为（免人工配置）：

1. 不需要手动建文件夹
2. 不需要手动配模板
3. 不需要手动写权限
4. 三大零号资源（目录 + 时间 + 地点/桩号）自动关联
5. `TripRole` 按 Trip 流转动态变化，并与零号资源持续联动

### 3.3 中心实验室与施工标段的管辖关系（共享型，多中心）

中心实验室不是“一个标段管另一个标段”，而是共享型治理节点。  
在模型上采用“中心实验室 <-> 施工标段”的管辖映射关系，支持多中心、多标段并行治理。

```text
v://cn.highway/dajin/
└── section/
    ├── bridge/DA-01           K0+000 ~ K20+000（桥梁 + 部分路基 + 实验室）
    ├── roadbed/DB-01          K0+000 ~ K15+000（路基 + 路面 + 实验室）
    ├── pavement/PM-01         K20+000 ~ K60+000（路面）
    ├── lab/CL-01              全线共享（中心点 + 服务范围多边形）
    ├── lab/SL-DA01            K0+000 ~ K20+000（服务 DA-01）
    └── lab/SL-DB01            K0+000 ~ K15+000（服务 DB-01）
```

说明：

- `CL-xx`：中心实验室标，执行路径位于 `section/lab/CL-xx/`
- `SL-xxx`：工地试验室标，执行路径位于 `section/lab/SL-xxx/`（三级目录）
- 每个 `SL-xxx` 必须配置“服务标段”（如 `DA-01`、`DB-01`）与“所属中心实验室”（`CL-xx`）
- 所有 `SL-xxx` 数据归集到所属 `CL-xx` 完成最终质控与签发
- 每个施工标段与实验室标都必须配置“桩号范围 + GIS 坐标范围（经纬度或多边形）”

### 3.4 实验室标类型定义（固化规则）

| 实验室标类型 | 所属关系 | 管理范围 | 自动挂载内容 |
|---|---|---|---|
| `CL-xx`（中心实验室标） | 独立共享标，不挂在任何单个施工标段下 | 按管辖关系同时管理多个施工标段及其工地试验室（如 `CL-01` 管123个，`CL-02` 管45个） | 全套 JTG 模板、中心设备、Final Proof 签发权限 |
| `SL-DAxx`（桥梁工地试验室标） | 位于 `section/lab/` 下，并绑定所属中心实验室与服务标段 `DA-xx` | 服务对应桥梁标段现场检测 | `DA-xx` 专用检测工序链、现场设备、离线采集能力 |
| `SL-DBxx`（路基工地试验室标） | 位于 `section/lab/` 下，并绑定所属中心实验室与服务标段 `DB-xx` | 服务对应路基标段现场检测 | `DB-xx` 专用检测工序链、现场设备、离线采集能力 |

### 3.5 核心治理规则与实际操作

核心治理规则：

1. 中心实验室采用共享治理：`CL-01` 可管辖 123 个施工标段，`CL-02` 可管辖 45 个施工标段
2. `section/lab/` 下可创建多个 `SL-xxx`（三级标段），每个 `SL-xxx` 必须配置“服务标段 + 所属中心实验室”
3. `SL-xxx` 数据必须回传所属 `CL-xx`，Final Proof 必须由该中心实验室授权签字人最终签发
4. 每个 `CL-xx` 与 `SL-xxx` 必须维护地点双标识：`桩号 + GIS`

DocPeg / vpeg.cn 实际操作顺序：

1. 先创建中心实验室标（例如 `CL-01`、`CL-02`，均为共享型，不挂施工标段）
2. 再创建施工标段（`DA-01`、`DB-01` 等）
3. 在 `section/lab/` 下创建 `SL-xxx`（例如 `section/lab/SL-DA01`），并设置服务标段（`DA-01`）与所属中心实验室（`CL-01`）
4. 系统自动建立管辖关系：`CL-01` 可查看并审核其 123 个标段下所有 `SL-xxx` 的 Trip/Proof/报告，`CL-02` 同理管理其45个标段

### 3.6 实验室标创建权限模型（UTXO 固化规则）

在 `labpeg` 中，创建实验室标（`CL-xx`、`SL-xxx`）的权限由 UTXO 角色类型决定，而非固定给某个单一角色。

| 角色类型 | 是否可以创建实验室标 | 说明 |
|---|---|---|
| `OwnerUTXO`（业主） | 可以（最高权限） | 可创建中心实验室标与工地试验室标 |
| `PMOUTXO`（代建） | 可以 | 可代业主执行实验室标创建与治理配置 |
| `SupervisionUTXO`（监理） | 可以（受限） | 可创建/管理工地试验室标；创建中心实验室标通常需业主授权 |
| `LabUTXO`（试验室） | 可以（有限） | 可在既有实验室标下管理子结构，不可从零创建新的中心实验室标 |
| `ContractorUTXO`（施工单位） | 不可以 | 仅可使用已创建的工地试验室能力 |
| `DesignUTXO`（设计院） | 不可以 | 无实验室标创建权限 |
| `SupplierUTXO`（供应商） | 不可以 | 无实验室标创建权限 |
| `AuditUTXO / GovUTXO` | 可查看，不可创建 | 审计与政府侧仅保留监管可见权限 |

固化总结规则：

1. `OwnerUTXO` 与 `PMOUTXO` 是顶层创建者，可创建 `CL-xx` 与 `SL-xxx`
2. `SupervisionUTXO` 以执行治理为主，可创建 `SL-xxx`，默认不可独立创建新 `CL-xx`
3. `LabUTXO` 负责已建实验室标下的运营，不承担新中心实验室创世职责

### 3.7 授权委派流程（业主总控 + 监理执行 + 试验室操作）

DocPeg / vpeg.cn 推荐流程：

1. 业主或代建创建中心实验室标（例如 `CL-01`）
2. 将 `CL-01` 管辖权限授予总监理或专业监理（`SupervisionUTXO`）
3. 监理在授权范围内创建具体工地试验室标（例如 `SL-DA01`、`SL-DB01`）
4. 试验室（`LabUTXO`）负责日常检测执行、Trip 填报与 Proof 维护

系统自动执行的权限结果：

1. 监理可按授权管理 `SL-xxx` 的创建与配置
2. 施工单位仅可使用，不能自行创建新实验室标
3. Final Proof 必须回到所属 `CL-xx` 的授权签字链完成签发

### 3.8 标段定义规则（固化）

最终定义（已锁定）：  
`一个标段 = 一个桩号区间 + 一个或多个专业`

一级目录（固定）：

- `v://cn.highway/dajin/`

推荐目录结构（已固化）：

- `section/bridge/DA-01`、`section/roadbed/DB-01`、`section/pavement/PM-01` ...（施工标段）
- `section/lab/CL-01`、`section/lab/SL-DA01` ...（实验室标，始终独立配套）

固化规则（新增）：

1. 桩号区间是标段的物理边界，是地点零号资源的关键部分
2. 专业组合是标段的技术边界，决定挂载哪些规范、表格模板与工序链
3. 系统根据“桩号区间 + 专业组合”自动决定挂载内容与管辖关系
4. 每个标段（施工标、实验室标）必须同时绑定 `桩号范围 + GIS 坐标范围`
5. 所有 Trip、样品、设备、Proof 必须继承并绑定所属标段的“桩号 + GIS”地点双标识

示例（固化）：

1. `DA-01` = `K0+000 ~ K20+000` + `桥梁专业 + 部分路基专业 + 实验室专业`
2. `DB-01` = `K0+000 ~ K15+000` + `路基专业 + 路面专业 + 实验室专业`
3. `PM-01` = `K20+000 ~ K60+000` + `路面专业`
4. `CL-01` = `全线桩号` + `实验室专业（中心实验室共享）`

自动挂载规则（固化）：

1. 创建任一标段后，系统按其“桩号区间 + 专业组合”自动挂载对应规范、工序链与模板
2. 当专业组合包含实验室专业时，自动开放实验室相关表单、设备与质控链
3. 实验室标（`CL-01 / SL-xxx`）保持独立，通过管辖映射服务对应施工标段

---

## 4. 核心对象映射

- 样品 = 构件  
  `v://cn.highway/dajin/section/lab/CL-01/sample/C-20260413-001`
- 检测流程 = Trip 链  
  取样 Trip -> 运输 Trip -> 制备 Trip -> 检测 Trip -> 复核 Trip -> 报告 Final Proof
- 设备 = 子构件  
  每台试验机绑定专用 Trip（检定 / 校准 / 使用记录）
- 报告 = Final Proof  
  一键生成 + 三级电子签名 + 扫码验真伪
- 工地试验室 = 标段层实验室类型下的三级实验室标（`section/lab/SL-xxx`）  
  逻辑上服务指定施工标段并归属中心实验室，支持离线 Trip，在线后同步回中心审核签发链

### 4.1 资源产品转化 Trip 模型（父 Trip / 子 Trip，固化）

在 `labpeg` 中，取样不是孤立动作，而是“资源产品通过执行体由初始产品转化为目标产品”的一个父 Trip（大 Trip）阶段。  
父 Trip 由多个子 Trip 组成，切分原则为：每一次 `TripRole` 变化，形成一个新的子 Trip。

定义（固化）：

1. 初始产品：转化起点（如沙子、石子、水泥、水等原材料）
2. 目标产品：转化终点（如可用于强度检测的合格混凝土试块与其强度数据）
3. 父 Trip：完整产品转化过程（端到端执行体）
4. 子 Trip：父 Trip 内按角色变化拆分的阶段执行单元

沙子到混凝土试块示例（父 Trip 拆解）：

注：该示例包含施工与实验室协同的工艺链扩展角色（如 `MaterialHandler`、`MixingStation`、`Curer`），用于表达端到端转化过程。

| 子 Trip | TripRole（执行角色） | 产品状态变化 | DTORole 关联文档 |
|---|---|---|---|
| 子 Trip 1：原材料准备 | `MaterialHandler` | 沙子、石子、水泥、水（初始资源产品）就位 | 原材料交接记录 |
| 子 Trip 2：拌合 | `MixingStation` | 原材料 -> 新鲜混凝土（中间产品） | 拌合单、配合比记录 |
| 子 Trip 3：取样 | `Sampler` | 新鲜混凝土 -> 取样样品 | 取样记录 |
| 子 Trip 4：运输 | `Transporter` | 样品由现场 -> 实验室 | 运输记录、温湿度记录 |
| 子 Trip 5：制备 | `Preparer` | 样品 -> 标准试块 | 制备记录 |
| 子 Trip 6：养护 | `Curer` | 试块养护至规定龄期 | 养护记录 |
| 子 Trip 7：抗压检测 | `Tester` | 试块 -> 强度数据 | 原始数据、曲线图 |
| 子 Trip 8：判定与签发 | `Reviewer -> Signer` | 强度数据 -> Final Proof 报告 | 复核意见、Final Proof |

规则（固化）：

1. 每次 `TripRole` 变化必须生成新的子 Trip，并与父 Trip 建立可追溯关系
2. 每个子 Trip 必须绑定输入产品、输出产品与执行体角色
3. `DTORole` 负责标记该子 Trip 的文档与数据传输上下文（表单、记录、Proof）
4. 父 Trip 的 Final Proof 必须可反查全部子 Trip 的文档证据链

### 4.2 IQC / PQC / QQC / FQC 与 Trip 模型映射（固化版）

在 `labpeg` 中，`IQC -> PQC -> QQC -> FQC` 可作为父 Trip 下的质量控制子 Trip 主链。  
四大 QC 环节与 `TripRole`、`DTORole`、产品状态、子 Trip 阶段一一对应。

| 质量环节 | 全称 | 对应 TripRole（执行主体） | 对应 DTORole（文档/数据） | 产品状态 | 子 Trip 阶段 |
|---|---|---|---|---|---|
| `IQC` | Incoming Quality Control | `IncomingInspector / Supplier` | `IQCRecorder` | 原材料/进场材料 | 入场检验子 Trip |
| `PQC` | Process Quality Control | `ProcessInspector / Operator` | `PQCRecorder` | 过程半成品（拌合后混凝土） | 过程控制子 Trip |
| `QQC` | Quality Quality Control | `QualityInspector` | `QQCRecorder` | 过程质量验证对象（制备后试块） | 质量验证子 Trip |
| `FQC` | Final Quality Control | `FinalInspector / Signer` | `FQCRecorder / Signer` | 最终产品（试块强度报告） | 最终验收子 Trip |

混凝土检测全流程（父 Trip + 4 个 QC 子 Trip）：

1. 父 Trip：混凝土检测 Trip（从原材料到 Final Proof）
2. `IQC` 子 Trip：`IncomingInspector` / `IQCRecorder`；检验原材料合格证与入场质量；输出 IQC 记录与合格 Proof
3. `PQC` 子 Trip：`MixingStation + Operator` / `PQCRecorder`；执行拌合过程控制与坍落度检测；输出 PQC 数据与过程 Proof
4. `QQC` 子 Trip：`QualityInspector` / `QQCRecorder`；执行试块制备与养护过程验证；输出 QQC 记录与中间 Proof
5. `FQC` 子 Trip：`Tester + FinalInspector + Signer` / `FQCRecorder -> Signer`；执行抗压试验、判定与签发；输出 Final Proof（含标准值、检测值、差值）

规则（固化）：

1. 整个流程是一个父 Trip，由 4 个 QC 子 Trip 串联
2. 每个 QC 子 Trip 必须同时绑定 TripRole、DTORole、输入产品、输出产品
3. QC 子 Trip 的输出 Proof 必须逐级汇聚到父 Trip 的 Final Proof

---

## 5. 业务主线（实验室管理系统视角）

### 5.1 委托受理

- 登记委托单（来源标段、试验类型、样品批次、标准依据）
- 绑定地点双标识（`桩号范围 + GIS`）与受理时间
- 自动生成受理 Trip，并进入试验任务池

### 5.2 收样与留样

- 样品收取、登记、条码/RFID 绑定、留样位置登记
- 校验来源标段与 `section/*` 目录锚点是否一致（兼容不同专业组合路径）
- 异常样品（信息不全、时效超限）自动门禁拦截

### 5.3 试验任务与排程

- 按标准模板自动拆解试验任务（人、机、料、法、环）
- 支持中心实验室与工地试验室协同分配（`CL-xx <-> SL-xxx`）
- 任务执行全程记录 Trip，形成可审计过程链
- 系统按 `TripRole` 变化自动拆分子 Trip，并维护父 Trip（大 Trip）汇总视图

### 5.4 设备与环境管理

- 设备台账、检定/校准、期间核查、使用记录
- 温湿度与环境监控实时采集并关联当前任务
- 设备或环境异常自动告警，并触发质量门禁

### 5.5 原始记录与自动判定

- 试验员按 Formpeg 模板填写原始记录
- 系统按 JTG 规则自动判定，并生成判定 Proof
- 不合格结果自动阻断后续环节并发起复检/复核

### 5.5.1 检测三组值规则（固化）

在 `labpeg` 中，所有检测数据（混凝土、水泥、路基填料、压实度等）必须同时记录三组值：

1. 标准值（`Standard Value`）：JTG 规范或设计要求的合格标准
2. 检测值（`Measured Value`）：实际试验/检测数据
3. 差值（`Deviation`）：`检测值 - 标准值`（或按对应 JTG 规则计算）

固化要求：

1. 每张 Formpeg 检测表必须具备三组值字段
2. 每个 Lab Trip 在检测阶段（`TripRole = Tester`）必须完成三组值记录
3. 所有 Proof 与 Final Proof 必须展示三组值
4. 差值超阈值时自动触发 Gate 阻断或预警

混凝土抗压强度示例：

| 项目 | 标准值 | 检测值 | 差值 / 判定 |
|---|---|---|---|
| 抗压强度 | `40 MPa` | `42.5 MPa` | `+2.5 MPa`（合格） |
| 强度代表值 | `>= 40 MPa` | `41.8 MPa` | `+1.8 MPa`（合格） |
| 单组最小值 | `>= 0.95 x 40` | `39.2 MPa` | `-0.8 MPa`（合格） |

系统自动动作：

1. 按 JTG 规则计算差值并完成智能判定（合格 / 不合格 / 预警）
2. 将 `标准值 + 检测值 + 差值` 全量写入 Proof 链并继承到 Final Proof

### 5.6 复核审批与报告签发

- 执行“试验员 -> 复核员 -> 授权签字人”审批链
- 自动生成报告与电子签章，输出 Final Proof
- 报告可按 `v://` 地址、样品号、标段、桩号、GIS 反查

### 5.7 质量门禁与整改闭环

- 门禁规则覆盖资料完整性、判定合规性、设备有效性、地点一致性
- 阻断项自动生成整改任务并跟踪闭环状态
- 全部操作写入 Proof，满足审计与监管核查

### 5.8 台账统计与对外交付

- 自动生成试验台账、报告台账、设备台账、异常台账
- 按项目/标段/专业/时间/桩号区间/GIS 区域多维统计
- 对外提供质监、监理、业主所需报表与可验证证据链

### 5.9 前端页面建议（最小可用）

1. 委托受理
2. 样品管理
3. 试验任务
4. 设备与环境
5. 原始记录与判定
6. 报告签发
7. 质量门禁
8. 台账中心
9. 地图与时间轴

---

## 6. 技术底座：Formpeg 定义与五层协议（正式定义）

### 6.1 Formpeg 在 labpeg 中的定位

`Formpeg` 被定义为 `labpeg` 的表单与协议层，专门负责把所有检测表格、报告模板、工序链、判定规则进行协议化管理。

### 6.2 Formpeg 五层协议结构（从底到顶）

1. 第 1 层：基础地址层（v:// Anchor）  
每一张表单、每一个检测记录都拥有唯一 `v://` 地址。  
示例：`v://cn.highway/dajin/section/lab/CL-01/form/C-20260413-001`  
作用：实现“表单即构件”，所有 Formpeg 表单天生可寻址、可追溯、可钉住。

2. 第 2 层：模板协议层（Template Protocol）  
统一管理所有 JTG 标准表格（桥施系列、路基系列、检测报告模板等）。  
支持自动挂载：创建“实验室标”后，系统自动导入对应 JTG 模板。  
模板具备版本号与合规校验规则（CMA/CNAS）。

模板机制（固化）：

- `Formpeg 表格 = 全线共用模板 + 标段自动适配实例`
- 模板层（全线共用）：在 `professional/lab/` 维护统一 JTG 模板库（检测报告、原始记录、质控表格等）
- 实例层（标段适配）：创建 `CL-01`、`SL-DA01` 等标段后，系统自动从共用模板生成该标段实例
- 实例自动继承并绑定：`桩号区间 + 专业组合 + 当前 TripRole + v://目录锚点`
- 模板升级采用可控版本策略：新实例自动使用新版本，历史实例按原版本保留可追溯性
- 每张检测模板必须定义三组值字段：`standardValue`、`measuredValue`、`deviation`

3. 第 3 层：实例协议层（Instance Protocol）  
每一份实际填写的表单 = 一个 Formpeg 实例。  
每个实例自动绑定 Trip 链（谁在什么时候填了什么）。  
支持离线填写与增量同步（工地试验室场景必备）。

实例 API 域机制（固化）：

- 每一张 Formpeg 表格实例都是一个独立 API 域（独立 API 实体）
- 该实例的 `v://` 地址就是该 API 域根地址
- 对该表的创建、填写、审核、判定、签发、Proof 查询等操作，均在该实例域内完成，与其他表实例隔离
- 每张表实例独立维护：`TripRole` 流转、`DTORole` 传输轨迹、Proof 链、版本历史、细粒度权限

4. 第 4 层：判定协议层（Judgment Protocol）  
内置 JTG 智能判定引擎。  
示例：混凝土强度判定（统计法 / 非统计法）自动执行。  
判定结果直接生成 Proof 记录，并可触发 Gate（不合格自动阻断后续 Trip）。  
判定阶段必须产出并固化三组值（`standardValue + measuredValue + deviation`）。

5. 第 5 层：证据协议层（Proof Protocol）  
聚合 Formpeg 实例 + Trip 记录 + 判定结果 + 电子签名 + 时间戳 + 可选区块链存证。  
最终输出 `Final Proof`（报告），支持扫码验真伪、全程留痕、修改审计。  
Proof 与 Final Proof 必须可追溯展示三组值（标准值、检测值、差值）。

### 6.3 Formpeg 在 labpeg 中的自动动作（CL-01 示例）

当创建实验室标 `CL-01` 后，Formpeg 自动完成：

1. 地址层：生成实验室专属 `v://` 根地址
2. 模板层：自动挂载水泥检测、混凝土抗压、压实度等 JTG 标准表单
3. 实例层：试验员现场填写时自动创建 Formpeg 实例，并绑定当前 Trip
4. 判定层：数据录入后自动运行 JTG 判定规则，生成判定 Proof
5. 证据层：最终报告作为 Final Proof 存证，可供质监站、业主随时查验

实验室场景示例（实例域 API）：

1. 混凝土抗压强度检测表实例  
   API 域根：`v://cn.highway/dajin/section/lab/CL-01/formpeg/instance/C-20260413-001`
2. 水泥物理性能检测表实例  
   API 域根：`v://cn.highway/dajin/section/lab/CL-01/formpeg/instance/Cement-20260413-002`

实例域调用示例（以第一张表为例）：

- `POST v://.../formpeg/instance/C-20260413-001/submit`：提交检测数据
- `POST v://.../formpeg/instance/C-20260413-001/judgment`：触发 JTG 智能判定
- `GET v://.../formpeg/instance/C-20260413-001/proof`：获取该表完整 Proof 链
- `POST v://.../formpeg/instance/C-20260413-001/sign`：授权签字人签发

隔离性（固化）：

- 不同实例 API 域完全隔离，互不影响
- 权限可精确到“单表实例级”（谁可填、谁可审、谁可签）
- 与“标段是独立执行单元”一致，并将执行颗粒度下钻到“单表实例”

---

## 7. 技术底座：FormpegAPI 定义与对外接口层（正式定义）

### 7.1 FormpegAPI 正式定义

- 全称：`Formpeg Application Programming Interface`
- 定位：Formpeg 五层协议的标准化 `RESTful + WebSocket` 访问入口
- 职责：作为 labpeg 与外部系统的统一数据交换通道，服务移动 App、工地 PDA、试验机、第三方质监平台等

### 7.2 FormpegAPI 五层协议映射（与 Formpeg 一致）

| 协议层 | API 路径示例 | 主要功能 |
|---|---|---|
| 1. 地址层 | `GET /v1/formpeg/v://{address}` | 根据 `v://` 地址精确获取表单实例 |
| 2. 模板层 | `GET /v1/formpeg/templates?labType=中心实验室` | 获取 JTG 标准模板列表（按实验室标类型自动挂载） |
| 3. 实例层 | `POST /v1/formpeg/instances` | 创建/更新表单实例（支持离线提交） |
| 4. 判定层 | `POST /v1/formpeg/judgment` | 提交数据后触发智能判定（JTG 规则自动执行） |
| 5. 证据层 | `GET /v1/formpeg/proof/{instanceId}` | 获取完整 Proof 链（Final Proof + 电子签名 + 时间戳） |

### 7.2.1 单表实例 API 域（固化）

在 `labpeg` 中，每张 Formpeg 表格实例都是独立 API 域。  
网关 API（`/v1/formpeg/*`）与实例域 API 在语义上等价，网关只负责统一鉴权、路由与审计。

实例域根地址示例：

- `v://cn.highway/dajin/section/lab/CL-01/formpeg/instance/C-20260413-001`

实例域操作示例：

- `POST {instanceRoot}/submit`
- `POST {instanceRoot}/judgment`
- `GET {instanceRoot}/proof`
- `POST {instanceRoot}/sign`

规则：

1. 实例域之间完全隔离，互不影响
2. 权限可下钻到单表实例级（填报/复核/签发）
3. 每次实例域操作都必须携带 `TripRole + DTORole`
4. `DTORole` 必须由当前 `TripRole` 映射得到
5. 每次实例域操作都写入该实例自己的 Trip 与 Proof 轨迹

### 7.3 核心设计原则（严格按现有模型）

1. 一切皆 `v://`  
所有 API 调用必须携带或返回 `v://` 地址，做到“地址即身份”。

2. 标段驱动  
创建中心/工地实验室标并配置管辖关系后，系统按“中心实验室 <-> 施工标段 <-> 工地试验室”自动开放对应 FormpegAPI 权限，并完成目录、模板、Trip、Proof 的自动挂载。

3. Trip 驱动  
每次 API 调用（创建实例、提交数据、触发判定）都自动生成或关联 Trip 记录。

4. DTORole 必填  
每次 API 数据交换都必须携带 `DTORole`，并与当前 `TripRole` 映射一致。

5. TripRole 必填  
每次 API 数据交换都必须携带 `TripRole`，用于标记当前资源/产品操作角色。

6. Proof 闭环  
任何修改、判定、签名操作都必须生成 Proof 记录，Append-only，不可篡改。

7. 离线优先  
工地试验室场景支持本地缓存与增量同步，断网情况下仍可持续填写表单。

8. 地点双标识必填  
涉及标段执行的数据写入必须携带 Location 锚点：`chainageRange + GIS`（坐标点或边界多边形）。

### 7.4 典型 API 使用场景

场景 1：表单实例提交（混凝土抗压）

```http
POST /v1/formpeg/instances
{
  "vAddress": "v://cn.highway/dajin/section/lab/CL-01/formpeg/instance/C-20260413-001",
  "TripRole": "Tester",
  "DTORole": "Tester",
  "metrics": [
    {
      "item": "compressive_strength",
      "standardValue": "40 MPa",
      "measuredValue": "42.5 MPa",
      "deviation": "+2.5 MPa"
    },
    {
      "item": "representative_strength",
      "standardValue": ">= 40 MPa",
      "measuredValue": "41.8 MPa",
      "deviation": "+1.8 MPa"
    },
    {
      "item": "min_single_group",
      "standardValue": ">= 0.95 x 40",
      "measuredValue": "39.2 MPa",
      "deviation": "-0.8 MPa"
    }
  ],
  "locationAnchor": {
    "chainageRange": "全线共享",
    "gis": { "type": "Polygon", "coordinates": "..." }
  },
  "templateId": "JTG-E42-concrete",
  "data": { ... },
  "tripId": "TRIP-20260413-001"
}
```

场景 2：试验机自动采集

```http
POST /v1/formpeg/judgment
{
  "vAddress": "...",
  "TripRole": "Tester",
  "DTORole": "Tester",
  "rawData": { "pressure": 45.6, ... },
  "deviceId": "PRESS-001"
}
```

系统自动执行判定并生成 Proof。

场景 3：报告查询

```http
GET /v1/formpeg/proof/{instanceId}
```

返回完整 Final Proof（含电子签章与可视化报告）。

### 7.5 注册执行体 API（Trip Register，正式定义）

在 `labpeg` 中，“注册行为本身就是一个 Trip 执行体”。  
它不是“先注册，后执行”，而是 `注册 = 执行体的第一个 Trip`。  
该 Trip 被固化定义为 `Registration Trip`，并统一归类为 `Genesis Trip`（创世执行体）。

核心接口：

```http
POST /v1/formpeg/trip/register
```

注册中心实验室示例（Genesis Trip）：

```jsonc
{
  "vAddress": "v://cn.highway/dajin/section/lab/CL-01/",             // 注册目标目录
  "tripType": "LabGenesisTrip",                                           // 注册类 Genesis Trip
  "initialRole": "Lab Registrar",                                         // 初始 TripRole（Registrar）
  "templateId": "LAB-GENESIS-REGISTER",
  "data": {
    "labCode": "CL-01",
    "labKind": "CentralLab",
    "chainageRange": "全线共享",
    "gis": {
      "center": { "lng": 116.391, "lat": 39.907 },
      "servicePolygon": "..."
    },
    "registerTime": "2026-04-13 08:15:00"
  },
  "parentTripId": null                                                   // Genesis Trip 为空
}
```

调用成功后系统自动动作：

1. 在 `VRoot` 下创建新的 Genesis Trip 执行体（注册即启动）
2. 分配初始 `TripRole = Registrar`（按具体注册类型映射）
3. 生成对应 Formpeg 注册实例
4. 锚定零号资源（Time / Location / Directory）
5. 自动生成并绑定 `Directory Root + UTXORoot + VRoot`
6. 返回 `tripId`（后续流转统一使用）

注册类型对照（固化）：

| 注册类型 | Trip 类型 | 零号资源（目录） | 初始 TripRole | 输出结果 |
|---|---|---|---|---|
| 注册项目部 | `ProjectGenesisTrip` | `v://cn.highway/dajin/` | `Project Creator` | 项目根目录激活 + UTXO 根 |
| 注册施工标段 | `SectionGenesisTrip` | `v://.../section/bridge/DA-01/` | `Section Registrar` | 标段目录 + 自动挂载规范/工序链 |
| 注册中心实验室 | `LabGenesisTrip` | `v://.../section/lab/CL-01/` | `Lab Registrar` | 实验室标 + Formpeg 五层协议 |
| 注册工地试验室 | `LabSectionGenesisTrip` | `v://.../section/lab/SL-DA01/` | `LabSection Registrar` | 工地试验室标 + 现场专用 Trip 模板 |

关键规则：

1. 每一次“注册”都是一个 Trip 执行体的启动
2. 注册 Trip 的初始角色使用 `Registrar` 体系
3. 注册完成后系统自动生成对应 Root 并开通后续 Trip 权限

返回示例：

```json
{
  "tripId": "TRIP-20260413-001",
  "status": "registered",
  "tripType": "LabGenesisTrip",
  "currentRole": "Lab Registrar",
  "vAddress": "v://cn.highway/dajin/section/lab/CL-01/",
  "roots": {
    "directoryRoot": "v://cn.highway/dajin/section/lab/CL-01/",
    "utxoRoot": "utxo://cn.highway/dajin/section/lab/CL-01/",
    "vRoot": "v://cn.highway/dajin/section/lab/CL-01/"
  }
}
```

---

## 8. 结论

`labpeg LES` 本质上是高速公路实验室的业务执行系统，不是只做数据展示的技术平台。  
它以前台业务流程（委托、样品、试验、报告、台账）为主线，以 `v:// + Trip + Proof + 桩号+GIS` 为底座，形成“可执行、可验证、可审计、可结算”的闭环。



