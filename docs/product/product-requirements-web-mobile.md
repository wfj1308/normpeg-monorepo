# CoordOS / DocPeg 产品需求总纲（Web + Mobile）

## 1. 产品愿景与定位（Vision & Positioning）

## 1.1 核心痛点与终极目标
传统工程管理软件停留在“表单信息化”和“OA 审批流”，导致业财物脱节、资料造假成本低、规范落地依赖人治。  
CoordOS 的终极目标是构建一个**“基于物理物质守恒的数字主权账本”**：
把工程现场“谁、何时、对何对象、做了何动作、是否合规、花了多少钱”变成不可篡改、可穿透审计的数学事实，打造“造假成本无限大的死锁”。

## 1.2 平台定位
1. 系统性质：工业级数字主权操作系统（非传统 SaaS/ERP）。
2. Web 端（管理与决策中枢）：
   - 全局标准库（SpecIR）配置
   - 项目创世与全局算力调度
   - 复杂业财对账与穿透式审计
3. 移动端（主权网络传感器）：
   - 现场算力终端
   - 采用协议驱动 UI（SDUI）
   - 负责物理事实采集、比对与数字签认（SignPeg）

## 1.3 功能生成机制（新增）
1. 在 CoordOS 中，功能不再是死板菜单，而是根据执行体容器（Executor Container）上下文动态生成的指令集。
2. Web 端偏向：
   - SpecIR（标准库）配置
   - RepoIR（项目账本）全局审计
   - 业财对账
   - FinalProof 归档
3. 移动端偏向：
   - Trip（执行轨迹）实时铸造
   - SnapPeg（现场取证）
   - 现场碎片的实测实量

---

## 2. 核心底层逻辑与数据契约（Core Architecture）

## 2.1 主权数字寻址协议（v:// URI）
1. 系统内业务对象以 `v://` 解引用为主，不依赖业务 JOIN 进行主关联。
2. 语法规范：`v://[主权域]/[名称空间]/[资源路径]@[版本号]`
3. 核心价值：人、规范、清单、动作等对象具备唯一跨网段路由能力。

## 2.2 逻辑与实例解耦（SpecIR vs RepoIR）
1. SpecIR（公共标准库）：
   - 系统基因库
   - 存放国家/行业规范、SPU、QCGate、定额算子等“常量”
2. RepoIR（项目实例账本）：
   - 项目物理切片
   - 仅存储 `v://` 指针（Ref-Link）与项目变量（部位、合同量、单价等）

## 2.3 NormRef 规则注入机制（新增）
1. 正确关系不是“简单 API 调用”，而是“规则注入”：
   - NormRef 是规则库；
   - LayerPeg 是执行容器；
   - 由 `LayerPeg runtime`（SpecIR/映射引擎）主动拉取规则并注入 Gate/Body。
2. 规则注入时机：
   - 创建文档：拉取最新规则，初始化 Gate；
   - 修改 Body：重新校验并刷新 Gate 结果；
   - 执行 TripRole：必须通过当前 Gate；
   - 生成 Proof：固化规则引用与版本指纹。
3. 版本与审计约束：
   - 执行时必须钉住 `normref_uri + version + rule_hash`；
   - Proof 默认存规则指纹（引用+哈希），必要时可附规则快照；
   - 历史记录必须可复验，禁止因规则升级导致历史判定漂移。

## 2.4 NormRef API 版本控制要求（新增）
1. 版本原则：
   - 每条规则独立版本，不采用整库统一版本覆盖。
   - 支持 `version=latest` 与 `version=具体版本` 两种调用。
2. 推荐接口：
   - `GET /api/normref/rules/{rule_id}?version={version}`
   - `GET /api/normref/rules?category={category}&version={version}`
   - `POST /api/normref/validate`
3. 版本格式：
   - 语义化：`v1.2.3`
   - 日期化：`2026-04`（规范规则推荐）
   - 完整引用：`v://normref.com/rule/{path}@{version}`
4. LayerPeg 落地要求：
   - Header 必须保存 `normref_version` 与 `rule_snapshots`（规则哈希）。
   - Gate 必须记录 `version_used`。
   - Proof 必须记录 `normref_snapshot_hash`。
5. 兼容与迁移：
   - 历史文档禁止自动切换新规则版本。
   - 新规则上线后，旧文档仅在“显式迁移”时重校验。

---

## 3. 确权与算力调度体系（Authorization & Routing）

## 3.1 执行体容器化模型（Executor Container）
执行体（人/机构/设备/AI）统一为五维算力容器：
1. 身份（Identity）：全局唯一 `v://` 地址
2. 资质（Skills）：证书、有效期、执业范围
3. 容量（Capacity）：并发承载上限与熔断依据
4. 能耗（Energy）：运行计费基准
5. 记录（Proof）：不可变执行履历

## 3.2 确权三位一体（Authorization Trinity）
每一次合规操作必须绑定三元组并坍缩为 Trip：

`Executor + DTORole + TripRole`

## 3.3 绝对互斥防伪原则（Mutex Principle）
同一物理节点禁止“既当运动员又当裁判员”。  
若 Executor A 对节点执行了发起类动作（如 `constructor.submit`），Gate 必须在 UI 渲染层硬屏蔽其验收类动作（如 `inspector.verify`），即使其具备双资质。

## 3.4 组织主账号自治（新增）
1. 平台默认为每个参建组织开通一个“组织主账号（Org Admin）”。
2. 适用组织包括但不限于：施工单位、监理单位、业主单位、检测单位、分包单位、设计单位。
3. 组织主账号可在本组织内自助创建子账号并分配角色，角色集合由组织类型模板约束：
   - 施工组织模板：施工员、质检员、记录员、复核员、材料员、设备管理员、项目经理
   - 监理组织模板：测量监理工程师、专业监理工程师、总监理工程师、监理资料员
   - 业主组织模板：业主代表、合同管理员、支付审核员
   - 检测组织模板：检测员、复核员、检测负责人
4. 子账号创建必须绑定组织作用域（`org_uri`）与项目作用域（`project_uri`），禁止跨组织提权。
5. 任一组织主账号不可授予平台级超管权限；跨组织关键权限仅可由平台级治理流程授予。
6. 子账号与执行体绑定规则：
   - 用户账号用于登录与操作界面；
   - 执行体（Executor URI）用于签名、资质校验和责任追踪；
   - 一个账号可绑定多个执行体，但每次动作必须明确当前执行体。
7. 组织账号治理动作必须全量留痕（创建/禁用/重置密码/角色变更/项目调入调出）。

---

## 4. 业财物守恒引擎（The 4 Conservation Engines）

| 引擎模块 | 核心组件 | 输入法门 | 动作与输出 |
|---|---|---|---|
| 1. 正向创世 | GenesisPeg | 项目 BOQ（Excel） | 解析树结构，语义匹配，影子挂载 Ref-Link 到 SpecIR，铸造初始 UTXO |
| 2. 计划展开 | PlanEngine | BOQ 实例 + SPU 算子 | 定额算子展开，生成全生命周期物料需求天花板（BOM Baseline） |
| 3. 逆向核算 | NormPeg + ClawPeg | 实际物料消耗 Proof | 反推理论完成量并比对提报进度，偏差超限触发置信度下降与告警 |
| 4. 财务坍缩 | FormulaPeg + RailPact | 守恒通过的 Proof | 按 BOQ 单价计价，剥离争议，生成应收与结算指令 |

补充硬约束（Conservation Gate）：
1. 在“成品验收”与“RailPact 支付”之间必须插入守恒校验。
2. 偏差阈值建议默认 5%-8% 可配置。
3. 超阈值自动熔断支付，进入人工审计池。

---

## 5. 端侧功能需求定义（Client-Side Requirements）

## 5.1 移动端：状态机协议终端（Mobile）
1. 协议驱动 UI（SDUI）：
   - 不写死表单页与流程按钮
   - 后端按 `[登录者资质] + [DTORole] + [前置状态]` 下发 JSON 协议
2. 现场取证与防伪（SnapPeg）：
   - 强制提取 EXIF/GPS/时间戳
   - 生成防篡改 Hash 锚定
3. 工序因果律锁：
   - 前置未满足（IQC 未过、检验批未过）则后续动作按钮绝对隐身
4. 离线时空合拢（GitPeg）：
   - 断网可作业
   - 恢复网络用 Vector Clock 合并因果链
   - 出现物理冲突进入仲裁池，不允许简单覆盖
5. 规则执行一致性：
   - 客户端仅渲染服务端下发结果，不本地重写规则；
   - 每次提交携带 `rule_hash`，服务端按同版本规则复核。

## 5.2 Web 端：主权管理中枢（Web）
1. 标准制图工坊（SpecIR Studio）：
   - 可视化编排 SPU、Schema、QCGate、BOM/计价算子
2. 全息主权工作台：
   - 左侧物理结构树（单位/分部/分项）
   - 右侧按 `ref_spu_uri` 动态挂载表单 + UTXO 余额
3. SignPeg 与确权台账：
   - 签名状态、Trip 链、执行体能耗台账
4. 归档与审计（DocFinal）：
   - 自动编译正式 PDF
   - 带不可篡改二维码
   - 接入 CA 合规签章流转
5. 规则版本治理：
   - 显示每次执行对应的 `normref_uri/version/rule_hash`；
   - 支持按规则版本回放 Gate 判定与审计追溯。

## 5.3 角色与功能详细映射表（新增）

| 角色（DTORole） | 移动端功能（执行与采集） | Web端功能（管理与审计） |
|---|---|---|
| 施工员（Constructor） | 任务认领、现场填报、SnapPeg拍照取证、材料领用核销、提交报验 | 查看所属项目进度、个人执行 Proof 统计 |
| 质检员（Inspector） | 实测实量数据录入、NormPeg偏差比对、合格判定、发起整改 | 质检记录汇总、质量分布热力图、缺陷库管理 |
| 记录员（Recorder） | 当班施工日志、人员/机械台班录入、表单链路汇总 | 自动生成 LogPeg 周报/月报、文档中心管理 |
| 监理（Supervisor） | 关键工序现场签认、OrdoSign 数字签名、审批/驳回 | 监理月报审核、平行检验数据对比、FinalProof 终审 |
| 业主/管理（Owner） | 核心看板（进度/造价/异常）、一键签认重要节点日志 | 项目创世配置（BOM/BOQ）、RailPact结算审批、全链路审计 |
| 材料员（IQC） | 进场检验、检验批拆分、扫码入库、UTXO分配 | 材料供应商评价、大宗材料资金需求曲线、余量预警 |
| 复核员（Reviewer） | 数据一致性复核、附件完整性检查 | 报表交叉比对、审计包导出、证据指纹核验 |
| 设备管理员（Equipment） | 机械证书上传、维保记录、设备台班实时监控 | 机械能耗分析、寿命预警、资产折旧模型 |

## 5.3.1 施工资料与监理资料签署链模板（新增）
1. 施工资料签署链：
   - 测量表：`测量 -> 记录 -> 复核`
   - 质量检查表：`检查 -> 记录 -> 复核`
   - 表单汇总签署：`检验负责人 -> 项目经理`
   - 评定表：`检验负责人 -> 检测 -> 记录 -> 复核`
     - 评定表#1（检验负责人）= 汇总签署#7（检验负责人）
     - 评定表#2（检测）= 质量检查表#4（检查）
     - 评定表#3（记录）= 质量检查表#5（记录）
     - 评定表#4（复核）= 质量检查表#6（复核）
2. 监理资料签署链：
   - 测量表：`测量 -> 复核 -> 测量监理工程师`
   - 抽检表：`检查 -> 复核 -> 专业监理工程师`
   - 表单汇总签署：`总监理工程师`
   - 评定表：`检验负责人 -> 记录 -> 复核`
     - 评定表#1（检验负责人）= 抽检表#6（专业监理工程师）
     - 评定表#2（记录）= 抽检表#4（检查）
     - 评定表#3（复核）= 抽检表#5（复核）
3. 签署链执行规则：
   - 必须按序号串行签署，不允许跳签。
   - 上一签位未完成，下一签位在移动端与 Web 端均不可见或不可点击。
   - 同一份表单的“提交类动作”和“复核/审批类动作”必须遵循互斥原则。
   - 评定表允许“来源位继承”（来源位已签时可自动回填签署人/时间/签名摘要），但必须保留可追溯来源引用。

## 5.3.2 签署链字段映射（新增）
| 资料域 | 表单 | 序号 | 业务职责 | 来源序号映射 | DTORole 建议 | TripRole 建议 |
|---|---|---|---|---|---|---|
| 施工资料 | 测量表 | 1 | 测量 | - | constructor.measure | constructor.measure.submit |
| 施工资料 | 测量表 | 2 | 记录 | - | recorder.record | recorder.record.submit |
| 施工资料 | 测量表 | 3 | 复核 | - | reviewer.review | reviewer.review.approve |
| 施工资料 | 质量检查表 | 4 | 检查 | - | inspector.inspect | inspector.inspect.submit |
| 施工资料 | 质量检查表 | 5 | 记录 | - | recorder.record | recorder.record.submit |
| 施工资料 | 质量检查表 | 6 | 复核 | - | reviewer.review | reviewer.review.approve |
| 施工资料 | 汇总签署 | 7 | 检验负责人 | - | qc.lead | qc.lead.approve |
| 施工资料 | 汇总签署 | 8 | 项目经理 | - | owner.pm | owner.pm.approve |
| 施工资料 | 评定表 | 1 | 检验负责人 | 汇总签署#7 | qc.lead | qc.lead.approve |
| 施工资料 | 评定表 | 2 | 检测 | 质量检查表#4 | inspector.inspect | inspector.inspect.submit |
| 施工资料 | 评定表 | 3 | 记录 | 质量检查表#5 | recorder.record | recorder.record.submit |
| 施工资料 | 评定表 | 4 | 复核 | 质量检查表#6 | reviewer.review | reviewer.review.approve |
| 监理资料 | 测量表 | 1 | 测量 | - | supervisor.measure | supervisor.measure.submit |
| 监理资料 | 测量表 | 2 | 复核 | - | supervisor.reviewer | supervisor.reviewer.approve |
| 监理资料 | 测量表 | 3 | 测量监理工程师 | - | supervisor.measure.engineer | supervisor.measure.engineer.sign |
| 监理资料 | 抽检表 | 4 | 检查 | - | supervisor.sample.inspect | supervisor.sample.inspect.submit |
| 监理资料 | 抽检表 | 5 | 复核 | - | supervisor.sample.reviewer | supervisor.sample.reviewer.approve |
| 监理资料 | 抽检表 | 6 | 专业监理工程师 | - | supervisor.professional | supervisor.professional.sign |
| 监理资料 | 汇总签署 | 7 | 总监理工程师 | - | supervisor.chief | supervisor.chief.approve |
| 监理资料 | 评定表 | 1 | 检验负责人 | 抽检表#6 | supervisor.professional | supervisor.professional.sign |
| 监理资料 | 评定表 | 2 | 记录 | 抽检表#4 | supervisor.sample.inspect | supervisor.sample.inspect.submit |
| 监理资料 | 评定表 | 3 | 复核 | 抽检表#5 | supervisor.sample.reviewer | supervisor.sample.reviewer.approve |

## 5.3.3 DTORole?Data Transfer Object Role???????????????

DTORole = ???????

?? TripRole ??????????????

?????

- TripRole????????????????? -> ??? -> ??? -> ??? -> ?????????? Trip ???????
- DTORole?????????????? API?Formpeg ???Proof ??????????????????????????

DTORole ???????????????????????????????

### 5.3.3.1 DTORole ? labpeg ?????

1. ????????API ????????Proof ???????? `DTORole`?
2. `DTORole` ??? `TripRole` ??????????
3. ?????`DTORole = TripRole`????????????
4. ?????? `TripRole` ? `LabManager` ? `Owner` ????????`DTORole` ????? `LabManager` ? `Owner`?

### 5.3.3.2 ?? DTORole ?????????

- `Sampler`?????
- `Transporter`?????
- `Preparer`?????
- `Tester`?????
- `Reviewer`?????
- `Signer`???????
- `Auditor`???/????
- `Owner`???/??????

### 5.3.3.3 ???FormpegAPI?

```json
POST /v1/formpeg/instances
{
  "vAddress": "v://cn.highway/dajin/lab/CL-01/formpeg/instance/C-20260413-001",
  "DTORole": "Tester",
  "data": {},
  "tripId": "TRIP-20260413-001"
}
```

## 5.4 核心业务规则补充（新增）
1. 动态菜单规则：
   - 同一个 App 中，施工员看到“报验”，质检员看到“实测”。
   - 由后端 Gate 引擎下发协议驱动，前端不写死页面。
2. 强制守恒规则：
   - 若材料员未录入关键材料进场（IQC），施工员移动端对应工序按钮（如“混凝土浇筑”）必须不可点击（UTXO 锁死）。
3. 主权溯源规则：
   - Web 端每个结算数字支持穿透追踪，直接跳转到移动端历史 Trip（含 GPS 与哈希指纹）进行核验。

## 5.5 角色禁用动作清单与阻断码（新增）
1. 平台必须维护“角色可执行动作白名单 + 禁用动作清单”，由后端统一下发。
2. 前端禁止自行推断权限，所有按钮可见/可点状态以 Gate 返回为准。
3. 被阻断动作必须返回标准阻断码与可读原因，至少包含：
   - `role_action_denied`
   - `mutex_conflict`
   - `precondition_missing`
   - `skill_mismatch`
   - `cert_expired`
   - `capacity_full`
   - `tool_unavailable`
   - `conservation_blocked`
4. 阻断事件必须入审计日志，支持 Web 端按“角色/动作/阻断码”检索。

## 5.6 SDUI 协议版本与兼容策略（新增）
1. SDUI 协议采用 `schema_version`（SemVer），并提供能力协商字段：
   - `client_supported_versions[]`
   - `server_selected_version`
2. 向后兼容原则：
   - 小版本仅允许增量字段（Additive）
   - 大版本升级必须保留至少 2 个历史版本兼容窗口
3. 客户端降级策略：
   - 若版本不兼容，自动降级到“安全最小指令集”（只读 + 关键阻断提示）
   - 不允许在未知协议下执行写操作
4. 协议样例与错误码字典必须随版本发布同步更新。

---

## 6. 版本演进路线（Roadmap）

## Phase 1（P0）：物理主权跑通（断绝纸质依赖）
交付内容：
1. 执行体五维模型
2. v:// 寻址底座
3. Genesis 创世导入
4. 移动端 SDUI 引擎
5. SignPeg 签名链

目标：
1. 现场实现扫码接单、拍照取证、合规签认
2. 形成完整 Trip 账本

## Phase 2（P1）：物质守恒拦截（算清底账与拦截造假）
交付内容：
1. SpecIR 规则工坊
2. BOM 正向展开
3. IQC 进场检验
4. 逆向核算引擎（ClawPeg 熔断）

目标：
1. 物料消耗与进度提报强制对账
2. 异常节点无法流转到下一步

## Phase 3（P2）：商业闭环（业财结算与穿透审计）
交付内容：
1. FormulaPeg 计价合约
2. RailPact 结算底层
3. DocFinal 合规归档（CA 集成）
4. Public Verify 对外验真通道

目标：
1. 自动生成低争议支付报表
2. 监管/资方扫码可穿透到每一车混凝土来源与去向

---

## 7. 你这版基础上建议再补的关键点

## 7.1 合规边界白名单
1. 明确“必须 CA”的节点白名单（验收、归档、结算关键签章）。
2. 明确“可 SignPeg”的过程节点白名单。

## 7.2 权限收敛模型
1. 形成统一的 `RBAC + ABAC` 规则表（角色 + 上下文条件）。
2. 每个 API 标注 `required_role`、`required_scope`、`required_condition`。

## 7.3 可观测与SLO
1. 核心指标：
   - Trip 提交成功率
   - 离线补传成功率与延迟
   - Gate 拦截率
   - 签名失败率（SignPeg/CA 分开）
2. 明确告警阈值和升级路径（L1/L2/L3）。

## 7.4 数据生命周期与审计策略
1. 状态机：草稿 -> 已签 -> 归档 -> 冻结 -> 作废（仅追加，不删除）。
2. 仲裁池处理 SLA：冲突创建后多久必须裁决。

## 7.5 主数据治理
1. 统一字典：角色、工序、材料、设备、证书类型。
2. 版本管理：谁能改、如何审批、如何回滚。

## 7.6 穿透审计性能与可用性SLO（新增）
1. 结算数字穿透到 Trip 证据链路：
   - 查询成功率 >= 99.9%
   - P95 响应时间 <= 2s（同城）/ <= 4s（跨域）
   - P99 响应时间 <= 5s
2. 证据详情页（GPS/时间戳/Hash/签名）首屏渲染：
   - P95 <= 3s
3. 超时退化：
   - 超时时返回“可追踪任务单号”，后台异步补齐，不允许返回空结果且无解释。

## 7.7 SignPeg 与 CA 强制边界清单（新增）
1. 必须 CA：
   - 分部分项验收结论
   - 成品验收报告
   - 归档封存页与竣工关键签章
   - 结算触发前的法定签章节点
2. 可 SignPeg：
   - 现场过程记录（报验、实测、日志、整改流转）
   - 内部审批与协同确认
3. 平台必须提供“节点签章策略”配置，按表单类型 + 签位 + 项目类型决策。

## 7.8 组织类型角色-签位-动作真值矩阵（新增）
1. 对施工、监理、业主、检测、分包、设计六类组织分别定义：
   - 可见签位
   - 可执行动作
   - 必要资质（skill/certificate）
2. 真值矩阵作为 Gate 判定唯一事实来源，不允许前端本地覆盖。

## 7.9 账号与执行体生命周期（新增）
1. 生命周期状态：`pending -> active -> suspended -> revoked -> archived`。
2. 必须覆盖入职、转岗、离职、账号冻结、恢复、销户。
3. 任一状态变化必须记录操作者、时间、原因、影响范围（项目/角色/执行体）。

## 7.10 委托与替岗规则（新增）
1. 委托必须包含：委托方、受托方、作用域、有效期、依据文件。
2. 默认禁止再委托（可配置）；超期自动失效。
3. 受托动作必须在 Trip 中附带 `delegation_uri`，支持全链路追溯。

## 7.11 离线冲突仲裁 SOP（新增）
1. 冲突分级：`critical/high/medium/low`。
2. 每级定义责任人、处置时限、升级路径。
3. 裁决结果必须产生补偿 Trip，不允许直接改写历史事件。

## 7.12 SnapPeg 证据质量门槛（新增）
1. 现场证据最低要求：
   - 最少照片张数
   - 时间戳完整性
   - GPS 精度阈值
   - EXIF 可用性
2. 不达标时必须阻断提交或进入“人工复核通道”并留痕。

## 7.13 成本科目映射标准（新增）
1. 建立 `Trip/SKU/SMU -> 财务科目` 一一映射字典。
2. 计价结果需标注来源 Proof，支持财务系统对账与反查。

## 7.14 审计与监管导出口径（新增）
1. 统一导出格式：PDF/JSON/签名摘要/证据索引。
2. 导出包需包含校验指引（如何验 Hash、验签名、验来源）。
3. 按监管角色控制导出字段最小可见范围。

## 7.15 可观测与告警分级（新增）
1. 核心告警分级：L1/L2/L3。
2. 每级定义触发条件、通知对象、响应时限、恢复条件。
3. 关键链路（签名、守恒、结算、归档）必须有独立面板与日报。

## 7.16 发布治理与灰度策略（新增）
1. 发布必须有灰度比例、回滚条件、影响评估。
2. 协议/规则变更必须先在试点项目验证，再全量启用。
3. 上线必须附培训包（角色手册 + 常见错误 + 排障流程）。

## 7.17 NormRef 版本治理与SLO（新增）
1. 可用性：
   - NormRef 校验接口可用性目标 >= 99.9%。
2. 性能：
   - `POST /api/normref/validate` P95 <= 500ms，P99 <= 1s（同城）。
3. 失败退化：
   - 当 NormRef 不可用时，禁止写操作直通；可进入“只读 + 待补校验”受控模式。
4. 追溯性：
   - 每条 Gate 判定必须可追溯到 `rule_id + version + rule_hash`。
