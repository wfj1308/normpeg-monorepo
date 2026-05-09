# 高速公路实验室平台开发需求文档（详细执行版 V1.1）

## 0. 阅读导航（先看）

1. 文档导航：`docs/product/labpeg-doc-reading-guide-v1.md`
2. 本文档：业务需求与验收基线（What）
3. 页面交互清单：`docs/product/labpeg-web-mobile-prototype-interaction-checklist-v1.md`
4. 前端任务拆分：`docs/product/labpeg-frontend-development-task-breakdown-v1.md`

## 1. 文档说明

- 文档名称：`高速公路实验室平台开发需求文档（详细执行版 V1.1）`
- 适用范围：高速公路项目实验室业务（中心试验室 + 工地试验室）
- 面向角色：产品经理、研发、测试、实施、运维、项目管理方
- 文档目标：输出可直接用于研发拆解、测试设计、上线验收的完整需求基线
- 版本日期：`2026-04-14`

### 1.1 文档使用原则

1. 本文档定义“做什么”和“做到什么程度”，不限制具体技术栈。
2. 所有流程必须满足“可执行、可追溯、可审计、可回放”。
3. 所有关键动作必须留下 Proof 事件，不允许仅状态变化无证据。
4. 所有功能需求必须映射到：页面行为、接口行为、数据字段、验收标准。

## 2. 项目目标与业务范围

### 2.1 业务目标

1. 打通“委托受理 -> 收样留样 -> 试验执行 -> 判定复核 -> 报告签发 -> 台账归档”闭环。
2. 实现 IQC/PQC/QQC/FQC 四阶段质量链闭环与 Gate 阻断机制。
3. 建立“TripRole + DTORole + v://”统一责任链，确保每条数据可追责。
4. 提供项目级运营驾驶舱，支持风险预警、质量趋势、审计取证。

### 2.2 业务范围（In Scope）

1. 项目与标段管理（施工标、中心试验室标 CL、工地试验室标 SL）。
2. 样品全生命周期管理（收样、制样、养护、检测、留样、处置）。
3. 检测任务与 Trip 流转管理（父 Trip/子 Trip）。
4. 检测判定与自动校验（三组值 + 标准规则）。
5. 复核、签发、Final Proof、电子签章。
6. 审计追溯、报表、可视化大屏、治理中心。

### 2.3 非范围（Out of Scope）

1. 财务结算系统核心账务逻辑（仅提供对接数据）。
2. 第三方 CA 平台内部实现（仅定义对接接口）。
3. 外部硬件驱动开发（仅定义接入协议与数据标准）。

## 3. 总体架构与边界

### 3.1 三层架构

| 层级 | 模块 | 职责 |
|---|---|---|
| 门户层 | Project Hub、Lab Section Hub、Trip Console、Proof Center、Governance Center、Visualization Studio | 提供业务操作入口和可视化 |
| 业务层 | 标段中心、样品中心、任务中心、检测中心、判定中心、报告中心、治理中心 | 负责业务闭环与规则执行 |
| 底座层 | `v://`、LayerPeg、Formpeg、Trip 引擎、Gate、Proof 链、状态机 | 提供寻址、执行、审计、验证能力 |

### 3.2 业务对象模型（核心对象）

1. `Project`：项目根对象。
2. `Section`：施工标对象。
3. `LabSection`：实验室标对象（`CL-xx` / `SL-xxx`）。
4. `Sample`：样品对象。
5. `FormpegTemplate`：模板对象。
6. `FormpegInstance`：表单实例对象。
7. `ParentTrip`：父流程对象。
8. `SubTrip`：步骤流程对象。
9. `GateCheck`：规则判定对象。
10. `ProofEvent`：证据事件对象。
11. `FinalProof`：最终报告对象。

### 3.3 统一地址规则（v://）

| 对象 | 示例地址 |
|---|---|
| 项目 | `v://cn.highway/G45-YADGS` |
| 施工标 | `v://cn.highway/G45-YADGS/section/bridge/DA-01` |
| 实验室标 | `v://cn.highway/G45-YADGS/section/lab/CL-01` |
| 样品 | `v://cn.highway/G45-YADGS/sample/2026/04/CL01-C30-0001` |
| 表单实例 | `v://cn.highway/G45-YADGS/form/instance/JTG-A-001@v1` |
| 父 Trip | `v://cn.highway/G45-YADGS/trip/PT-20260414-0001` |

约束：

1. 所有写操作必须带 `v_uri`。
2. 所有 Proof 事件必须可由 `v_uri` 反查。
3. 不允许出现无 `v_uri` 的业务主数据。

## 4. 角色与权限（RBAC + 责任链）

### 4.1 角色清单

- `Owner/PMO`
- `LabManager`
- `Sampler`
- `Transporter`
- `LabReceiver`
- `Preparer`
- `Tester`
- `Reviewer`
- `Signer`
- `Auditor`
- `SystemAdmin`

### 4.2 TripRole 与 DTORole 映射

| TripRole | DTORole | 典型动作 |
|---|---|---|
| `Sampler` | `Sampler` | 取样、收样登记 |
| `Transporter` | `Transporter` | 运输交接、温控记录 |
| `LabReceiver` | `LabReceiver` | 收样验收、入库确认 |
| `Preparer` | `Preparer` | 制样、养护记录 |
| `Tester` | `Tester` | 检测执行、结果录入 |
| `Reviewer` | `Reviewer` | 复核、退回、确认 |
| `Signer` | `Signer` | 报告签发 |
| `Auditor` | `Auditor` | 审计抽查、异常复盘 |

### 4.3 权限粒度要求

1. 项目级：是否可创建/关闭项目。
2. 标段级：是否可创建/修改实验室标与管辖映射。
3. 实例级：是否可填报、复核、签发、作废。
4. 子 Trip 级：是否可推进、阻断、跳转（仅系统保留）。
5. 字段级：关键字段（判定值、签章信息）必须权限隔离。

## 5. 端到端流程需求（逐步骤）

本章是研发与测试执行主依据，所有步骤都需可追溯、可回放。

### 5.1 流程 A：项目初始化与基础配置

| 步骤 | 操作人 | 输入 | 系统动作 | 校验规则 | 输出 |
|---|---|---|---|---|---|
| A-01 | Owner/PMO | 项目编码、项目名称、里程范围、开竣工日期 | 创建 `Project` 根对象与 `v://project` | 项目编码唯一 | 项目创建成功 |
| A-02 | SystemAdmin | 组织机构、用户、角色 | 初始化组织与账户关系 | 账户唯一、组织合法 | 组织初始化完成 |
| A-03 | LabManager | 创建 `CL-01` | 创建中心试验室标 | 标段编码唯一 | `LabSection(CL)` 生成 |
| A-04 | LabManager | 创建 `SL-xxx` | 创建工地试验室标 | 服务范围非空 | `LabSection(SL)` 生成 |
| A-05 | LabManager | CL/SL 与施工标映射 | 建立管辖关系 | 不允许空映射 | 映射关系生效 |
| A-06 | LabManager | GIS 区域、桩号范围 | 挂载空间坐标 | GIS 格式合法 | 空间坐标生效 |
| A-07 | LabManager | 项目日历、班次策略 | 写入时间坐标 | 日期范围合法 | 时间坐标生效 |
| A-08 | 系统自动 | 标段创建事件 | 自动挂载目录、模板、Trip 配置、权限策略 | 挂载任务必须幂等 | 挂载结果记录 |
| A-09 | 系统自动 | 规则版本信息 | 绑定 NormRef/JTG 规则版本 | 规则版本必须可用 | Gate 规则可执行 |
| A-10 | Owner/PMO | 启用命令 | 将项目状态置为 `ACTIVE` | 前置配置项完整 | 项目可运行 |

失败分支要求：

1. 任一步失败需回写失败原因和修复建议。
2. 失败任务必须可重试且不产生重复主数据。
3. 失败事件必须写入 `ProofEvent(type=INIT_FAIL)`。

### 5.2 流程 B：标段创建与自动挂载

| 步骤 | 操作人 | 操作细节 | 系统处理 | 验收点 |
|---|---|---|---|---|
| B-01 | LabManager | 在 Lab Section Hub 点击“新建实验室标” | 展示创建表单 | 表单字段完整显示 |
| B-02 | LabManager | 输入编码、名称、类型、服务标段、桩号、GIS | 前端字段级校验 | 非法输入即时拦截 |
| B-03 | LabManager | 提交创建 | 后端创建 `LabSection` 主记录 | 返回唯一 ID 与 `v_uri` |
| B-04 | 系统自动 | 投递挂载任务 | 异步创建 `/trip` `/proof` `/form` `/monitor` | 子目录全部创建 |
| B-05 | 系统自动 | 挂载模板集合 | 按专业组合绑定模板包 | 模板版本可查 |
| B-06 | 系统自动 | 初始化角色策略 | 下发标段级权限策略 | 权限策略可预览 |
| B-07 | LabManager | 查看挂载状态 | 页面展示任务明细 | 有失败项可重试 |
| B-08 | LabManager | 确认并启用 | 标段状态 `DRAFT -> ACTIVE` | 激活后可创建实例 |

### 5.3 流程 C：委托受理与收样入库

| 步骤 | 操作人 | 前置条件 | 操作细节 | 校验规则 | 输出 |
|---|---|---|---|---|---|
| C-01 | Sampler | 标段激活 | 创建委托单，选择检测项目 | 必填项齐全 | 委托单编号 |
| C-02 | Sampler | 委托单已建 | 扫码/录入样品信息 | 样品编码唯一 | 样品主档 |
| C-03 | Sampler | 样品已登记 | 拍照取证（外观、封样） | 图片时间/GPS 合法 | 取样证据 |
| C-04 | Sampler | 样品信息完整 | 录入三组值中的标准值 | 标准值必须来源规则库 | 初始判定上下文 |
| C-05 | Transporter | 样品待交接 | 填写运输条件（温湿度、时长） | 时效窗不超限 | 运输记录 |
| C-06 | LabReceiver | 样品到达试验室 | 扫码收样、称量、外观复核 | 重量偏差阈值校验 | 收样确认 |
| C-07 | 系统自动 | 收样完成 | 创建 `ParentTrip` 和 `SubTrip-01` | Trip 创建幂等 | Trip 链建立 |
| C-08 | 系统自动 | 收样提交 | 执行 IQC Gate 判定 | 不通过则阻断 | IQC 结果 |
| C-09 | Sampler/LabManager | IQC 失败时 | 补录或退回重新取样 | 补录必须留痕 | 失败闭环 |

### 5.4 流程 D：任务编排与派发

| 步骤 | 操作人 | 操作细节 | 系统处理 | 验收点 |
|---|---|---|---|---|
| D-01 | LabManager | 在任务中心选择“待试验样品” | 拉取可排程样品列表 | 列表分页/筛选可用 |
| D-02 | LabManager | 选择模板、试验机、班组、时间窗 | 生成试验任务草稿 | 设备可用性校验 |
| D-03 | LabManager | 点击派发 | 生成 `SubTrip-02`（Preparer） | 子 Trip 自动创建 |
| D-04 | 系统自动 | 推送待办给 Preparer/Tester | App/Web 待办同步 | 推送到达率可监控 |
| D-05 | 系统自动 | 检查设备检定状态 | 失效设备自动阻断 | 阻断原因清晰可见 |

### 5.5 流程 E：检测执行（以混凝土抗压为例）

| 步骤 | 操作人 | 操作细节 | 系统校验 | 系统输出 |
|---|---|---|---|---|
| E-01 | Preparer | 扫码领样、制样、标记试件 | 样品状态必须 `RECEIVED` | `SubTrip-02` 推进 |
| E-02 | Preparer | 录入制样参数（尺寸、龄期、环境） | 字段范围校验 | 制样记录 Proof |
| E-03 | Tester | 接收任务并绑定设备 | 设备检定有效期校验 | `SubTrip-03` 创建 |
| E-04 | Tester | 执行试验并采集原始数据 | 必须采集 measured 值 | 原始数据存档 |
| E-05 | 系统自动 | 计算 deviation | 公式与单位匹配校验 | 判定中间结果 |
| E-06 | 系统自动 | 调用 Gate 规则判定 | 引用 `normref_uri/version/rule_hash` | Pass/Warn/Block |
| E-07 | Tester | 对 Warn 项填写说明 | 说明字数与附件约束 | 预警说明 Proof |
| E-08 | 系统自动 | 不通过项阻断后续 | 状态 `BLOCKED`，发出告警 | 异常任务单 |
| E-09 | Tester | 提交完成 | 进入待复核队列 | 待复核状态 |

### 5.6 流程 F：复核、签发与 Final Proof

| 步骤 | 操作人 | 操作细节 | 校验 | 输出 |
|---|---|---|---|---|
| F-01 | Reviewer | 打开待复核任务 | 数据完整性校验 | 复核页面 |
| F-02 | Reviewer | 核对三组值与附件 | 三组值缺一不可 | 复核结论 |
| F-03 | Reviewer | 通过或退回 | 退回必须填写原因 | 复核 Proof |
| F-04 | Tester | 被退回后修正重提 | 修订版本号 +1 | 修订记录 |
| F-05 | Signer | 打开通过复核的报告草稿 | 签发权限校验 | 可签发状态 |
| F-06 | Signer | 执行电子签章 | CA 签章成功校验 | 已签章报告 |
| F-07 | 系统自动 | 汇总 Trip 链和证据链 | 生成 `FinalProof` 哈希 | FinalProof |
| F-08 | 系统自动 | 状态归档 `COMPLETED` | 全链路索引更新 | 可审计归档 |

### 5.7 流程 G：异常处理与纠偏

| 异常类型 | 触发条件 | 系统动作 | 人工动作 | 关闭条件 |
|---|---|---|---|---|
| 三组值缺失 | 标准值/检测值/差值任一缺失 | 阻断签发 | Tester 补录并重提 | 复核通过 |
| 设备过检定期 | 设备状态失效 | 阻断任务派发 | 设备管理员更新检定记录 | 设备状态恢复 |
| 人员资质过期 | 签发/检测人证书过期 | 禁止执行关键动作 | 管理员更新资质 | 资质状态有效 |
| 运输超时 | 样品超时入库 | 标记风险并可阻断 | Sampler 发起重采或偏差申请 | 审批通过或重采完成 |
| 规则变更冲突 | 旧实例使用旧规则 | 锁定旧规则版本 | 管理员选择是否迁移 | 迁移完成或保持旧版 |

### 5.8 流程 H：审计追溯

1. Auditor 输入任一检索条件：`v_uri`、样品编码、报告编号、Trip 编号、人员、时间窗。
2. 系统返回全链路轨迹：实例版本、Trip 轨迹、Gate 判定、Proof 事件、签章信息。
3. Auditor 可导出审计包（JSON + PDF + 附件索引 + 哈希清单）。
4. 系统记录“谁在什么时候导出了哪份审计包”。

## 6. 功能需求清单（FR）

### 6.1 项目与标段中心

- `FR-SEC-001`：支持创建施工标与实验室标，编码唯一。
- `FR-SEC-002`：支持维护 CL/SL 与施工标段管辖映射。
- `FR-SEC-003`：创建后自动挂载模板、Trip、权限、目录。
- `FR-SEC-004`：支持标段状态流转：`DRAFT -> ACTIVE -> SUSPENDED -> ARCHIVED`。
- `FR-SEC-005`：支持 GIS 与桩号双维度检索。

验收标准：

1. 创建标段后 30 秒内可查看挂载结果。
2. 管辖映射变更必须记录变更人、时间、原因。
3. ARCHIVED 状态禁止新建实例。

### 6.2 样品中心

- `FR-SMP-001`：支持样品登记、扫码、批量导入。
- `FR-SMP-002`：支持封样照片、交接照片、异常照片上传。
- `FR-SMP-003`：支持样品状态机管理。
- `FR-SMP-004`：支持留样规则（留样时长、处置策略）。

样品状态机：

`CREATED -> IN_TRANSIT -> RECEIVED -> PREPARING -> TESTING -> REVIEWING -> SIGNED -> ARCHIVED`

阻断状态：

`BLOCKED_QC`、`BLOCKED_TIMEOUT`、`BLOCKED_DEVICE`

### 6.3 任务与 Trip 中心

- `FR-TRIP-001`：支持父 Trip 自动创建。
- `FR-TRIP-002`：角色变化必须自动创建子 Trip。
- `FR-TRIP-003`：支持 Trip 可视化泳道图。
- `FR-TRIP-004`：支持任务派发、转派、回收。
- `FR-TRIP-005`：支持时效预警（黄色）与阻断（红色）。

验收标准：

1. 任一 Trip 至少可追溯到创建、推进、完成 3 类事件。
2. 子 Trip 缺失时父 Trip 不允许完成。

### 6.4 检测与判定中心

- `FR-JDG-001`：检测项必须支持三组值录入。
- `FR-JDG-002`：支持自动计算差值与判定。
- `FR-JDG-003`：支持规则版本锁定与引用。
- `FR-JDG-004`：支持阈值预警与阻断策略配置。
- `FR-JDG-005`：支持人工复核覆盖（需审批与留痕）。

字段级强约束：

1. `standard_value` 必填，来源必须可追溯规则条款。
2. `measured_value` 必填，支持多次采样值。
3. `deviation_value` 系统计算，不允许手工改写。
4. `judgement_result` 仅系统写入。

### 6.5 Proof 与报告中心

- `FR-PROOF-001`：关键动作自动生成 ProofEvent。
- `FR-PROOF-002`：支持 FinalProof 生成、签发、版本留存。
- `FR-PROOF-003`：支持按多条件检索证据链。
- `FR-PROOF-004`：支持审计包导出。

FinalProof 必含字段：

1. 报告基础信息。
2. Trip 轨迹摘要。
3. 三组值总表。
4. Gate 判定摘要。
5. 规则版本与哈希。
6. 签章信息与时间戳。

### 6.6 治理中心

- `FR-GOV-001`：人员资质管理（证书、有效期、授权范围）。
- `FR-GOV-002`：设备检定管理（检定计划、检定结果、失效告警）。
- `FR-GOV-003`：环境监测策略（温湿度阈值、告警级别、阻断策略）。
- `FR-GOV-004`：上线就绪度检查（规则、模板、权限、审计策略完整性）。

### 6.7 运营看板与可视化

- `FR-DASH-001`：项目级指标总览（任务量、阻断数、预警数、签发率）。
- `FR-DASH-002`：质量趋势分析（按标段、专业、检测项、时间）。
- `FR-DASH-003`：风险热力图（GIS 维度）。
- `FR-DASH-004`：指标可钻取到实例与 Proof 明细。

## 7. 页面与交互需求（关键页面）

### 7.1 Lab Section Hub

1. 列表页：支持筛选（状态、类型、服务标段、时间）。
2. 新建弹窗：实时校验编码/GIS/桩号格式。
3. 详情页：分 4 个标签（基本信息、挂载结果、管辖关系、审计日志）。
4. 批量操作：启用、停用、导出。

### 7.2 Trip Console

1. 任务泳道：按角色分泳道显示子 Trip。
2. 卡片信息：样品编号、当前节点、剩余时效、风险等级。
3. 节点操作：接单、提交、退回、转派。
4. 异常提示：阻断节点显示红色并要求填写处理动作。

### 7.3 Proof Center

1. 检索条件：`v_uri`、报告编号、样品编号、Trip 编号、角色、时间。
2. 轨迹页签：时间轴、操作日志、规则判定、签章信息。
3. 导出功能：审计包导出并记录下载日志。

## 8. 接口需求（API 基线）

### 8.1 通用请求头

所有写接口必须带：

- `X-Project-Uri`
- `X-Trip-Role`
- `X-DTO-Role`
- `X-Operator-Id`
- `X-Request-Id`

### 8.2 核心接口清单

| 模块 | 方法 | 路径 | 用途 |
|---|---|---|---|
| 标段 | `POST` | `/api/v1/lab-sections` | 创建实验室标 |
| 标段 | `POST` | `/api/v1/lab-sections/{id}/activate` | 激活实验室标 |
| 样品 | `POST` | `/api/v1/samples` | 新建样品 |
| 样品 | `POST` | `/api/v1/samples/{id}/receive` | 收样入库 |
| 任务 | `POST` | `/api/v1/tasks/dispatch` | 派发任务 |
| Trip | `POST` | `/api/v1/trips/{id}/steps` | 推进子 Trip |
| 判定 | `POST` | `/api/v1/judgement/evaluate` | 规则判定 |
| 复核 | `POST` | `/api/v1/reviews/{id}/submit` | 提交复核 |
| 签发 | `POST` | `/api/v1/final-proofs/{id}/sign` | 报告签发 |
| 证据 | `GET` | `/api/v1/proofs/query` | 证据检索 |
| 审计 | `POST` | `/api/v1/audit-packages/export` | 导出审计包 |

### 8.3 接口行为约束

1. 写接口必须幂等，幂等键：`X-Request-Id`。
2. 所有错误返回必须携带 `error_code`、`error_message`、`suggestion`。
3. 规则判定接口返回必须包含 `normref_uri`、`version`、`rule_hash`。

## 9. 数据模型与字段约束

### 9.1 样品表（sample）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `sample_id` | string | 是 | 样品唯一 ID |
| `sample_code` | string | 是 | 样品编码 |
| `project_uri` | string | 是 | 项目地址 |
| `section_id` | string | 是 | 所属标段 |
| `lab_section_id` | string | 是 | 所属实验室标 |
| `material_type` | string | 是 | 材料类型 |
| `sampling_time` | datetime | 是 | 取样时间 |
| `receive_time` | datetime | 否 | 收样时间 |
| `status` | string | 是 | 样品状态 |
| `created_by` | string | 是 | 创建人 |

### 9.2 检测结果表（test_result）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `result_id` | string | 是 | 结果 ID |
| `sample_id` | string | 是 | 样品 ID |
| `metric_code` | string | 是 | 指标编码 |
| `standard_value` | decimal | 是 | 标准值 |
| `measured_value` | decimal | 是 | 检测值 |
| `deviation_value` | decimal | 是 | 差值（系统计算） |
| `judgement_result` | string | 是 | 判定结果 |
| `rule_hash` | string | 是 | 规则哈希 |
| `tester_id` | string | 是 | 检测人 |
| `reviewer_id` | string | 否 | 复核人 |

### 9.3 Proof 事件表（proof_event）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `proof_id` | string | 是 | 证据 ID |
| `event_type` | string | 是 | 事件类型 |
| `biz_uri` | string | 是 | 业务地址 |
| `trip_id` | string | 否 | Trip ID |
| `sub_trip_id` | string | 否 | 子 Trip ID |
| `operator_id` | string | 是 | 操作人 |
| `trip_role` | string | 是 | 执行角色 |
| `dto_role` | string | 是 | 传输角色 |
| `payload_hash` | string | 是 | 负载哈希 |
| `event_time` | datetime | 是 | 事件时间 |

## 10. 状态机需求

### 10.1 子 Trip 状态机

`CREATED -> ASSIGNED -> IN_PROGRESS -> SUBMITTED -> PASSED -> COMPLETED`

异常分支：

- `IN_PROGRESS -> BLOCKED`
- `SUBMITTED -> RETURNED`
- `RETURNED -> IN_PROGRESS`

### 10.2 报告状态机

`DRAFT -> REVIEWING -> REVIEWED -> SIGNING -> SIGNED -> ARCHIVED`

异常分支：

- `REVIEWING -> RETURNED`
- `SIGNING -> SIGN_FAILED`

## 11. 非功能需求（NFR）

### 11.1 性能

1. 列表查询（100 万样品量级）P95 < 2 秒。
2. 关键写接口 P95 < 500ms（不含附件上传）。
3. 判定接口 P95 < 800ms。
4. 大屏刷新间隔支持 10 秒级。

### 11.2 可用性

1. 核心业务服务可用性 >= 99.9%。
2. 单点故障恢复时间（RTO）<= 30 分钟。
3. 数据恢复点目标（RPO）<= 5 分钟。

### 11.3 安全与合规

1. 全链路 TLS。
2. 关键字段（签章摘要、证件号）加密存储。
3. 关键操作二次确认（签发、作废、归档）。
4. 审计日志 append-only，不允许物理删除。

### 11.4 可观测性

1. 每个请求必须有 `trace_id`。
2. 日志分级：INFO/WARN/ERROR/AUDIT。
3. 指标监控：接口耗时、错误率、阻断率、积压任务数。
4. 告警通道：站内信 + 短信/企业 IM。

## 12. 集成需求

### 12.1 外部系统对接

1. CA 签章平台：签章、验签、证书状态。
2. IoT 平台：设备状态、环境数据。
3. 视频平台：摄像头流与回放地址。
4. 经营系统：报告结果与费用映射数据。

### 12.2 集成约束

1. 对接失败不得影响核心业务主流程（降级策略）。
2. 所有外部返回必须做签名校验与重放防护。
3. 对接字段字典必须版本化。

## 13. 研发拆解与迭代计划

### 13.1 里程碑

1. `M1（4 周）`：标段、样品、Trip、判定、签发最小闭环。
2. `M2（4 周）`：IQC/PQC/QQC/FQC 全链路 + 治理中心。
3. `M3（4 周）`：运营看板、审计包、可视化联动、性能优化。

### 13.2 建议任务包

1. 前端包：Section Hub、Trip Console、Proof Center、Dashboard。
2. 后端包：Section、Sample、Trip、Judgement、Proof、Review、Sign。
3. 平台包：权限、审计、日志、消息中心、配置中心。
4. 测试包：接口自动化、流程自动化、性能、容灾演练。

## 14. 测试与验收脚本（UAT）

### 14.1 UAT-01：样品完整闭环

1. 创建实验室标 `CL-01`，确认自动挂载完成。
2. 创建样品并上传取样照片。
3. 派发任务给 Tester，录入检测值。
4. 系统自动计算差值并给出判定。
5. Reviewer 复核通过。
6. Signer 签发 FinalProof。
7. Auditor 通过 `v_uri` 检索全链路并导出审计包。

通过标准：

1. 任一步骤均有 ProofEvent。
2. FinalProof 可追溯到三组值与规则版本。
3. 导出审计包可验证哈希一致。

### 14.2 UAT-02：阻断与纠偏

1. 录入超阈值检测值触发阻断。
2. 确认系统阻止签发并生成异常工单。
3. 补录/重测后重新提交。
4. 复核通过后恢复流程。

通过标准：

1. 阻断时后续按钮不可执行。
2. 异常原因可追溯。
3. 修复后流程可继续，历史记录不丢失。

### 14.3 UAT-03：资质与设备治理

1. 将 Tester 资质设为过期。
2. 触发任务执行并验证系统阻断。
3. 更新资质后重试。
4. 将设备检定设为过期并复测同样流程。

通过标准：

1. 资质和设备均能单独阻断流程。
2. 阻断解除后可正常推进。

## 15. 上线与运维要求

### 15.1 上线前检查清单

1. 规则版本基线已冻结。
2. 模板版本与灰度策略已确认。
3. 权限策略与组织账户已校验。
4. 签章联调通过。
5. 审计日志采集与归档策略生效。

### 15.2 运行期运维清单

1. 每日巡检：任务积压、阻断数量、接口错误率。
2. 每周巡检：设备检定到期、资质到期、规则变更影响。
3. 每月巡检：性能趋势、归档完整性、审计抽查。

## 16. 需求追踪矩阵（示例）

| 需求 ID | 页面 | API | 数据表 | 测试用例 |
|---|---|---|---|---|
| `FR-SEC-003` | Lab Section Hub | `POST /api/v1/lab-sections` + 挂载任务接口 | `lab_section` `mount_task` | `UAT-01` |
| `FR-JDG-001` | Trip Console | `POST /api/v1/judgement/evaluate` | `test_result` | `UAT-01` `UAT-02` |
| `FR-PROOF-002` | Proof Center | `POST /api/v1/final-proofs/{id}/sign` | `final_proof` `proof_event` | `UAT-01` |
| `FR-GOV-002` | Governance Center | `POST /api/v1/devices/{id}/calibration` | `device` `device_calibration` | `UAT-03` |

## 17. 结论（交付标准）

1. 平台必须支持“全流程闭环 + 全链路证据 + 全角色追责”。
2. 所有功能均需通过“步骤可执行、证据可回放、规则可验证”的验收标准。
3. 本文档作为研发、测试、实施、验收统一基线，任何变更必须走版本评审。

## 18. 附录（前端原型交互清单）

1. Web 与移动端页面原型级交互清单见：`docs/product/labpeg-web-mobile-prototype-interaction-checklist-v1.md`。
2. 前端研发、UI 评审、联调测试应以附录文档作为页面行为标准。
3. 前端开发任务拆分表见：`docs/product/labpeg-frontend-development-task-breakdown-v1.md`。


