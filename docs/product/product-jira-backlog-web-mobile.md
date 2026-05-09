# CoordOS / DocPeg Jira Backlog（Web + Mobile）

## 1. 使用说明
1. 本文档按 `Epic -> Story -> Task` 组织，可直接映射 Jira。
2. 估时单位默认“人日（PD）”。
3. `Owner` 字段写角色，不绑定具体人，便于排班。

---

## 2. 里程碑与 Epic 映射

| 里程碑 | Epic 编号 | Epic 名称 |
|---|---|---|
| P0 | EPIC-P0-AUTH | 权限与签名主链跑通 |
| P0 | EPIC-P0-MOBILE | 移动端 SDUI 最小闭环 |
| P0 | EPIC-P0-CHAIN | Trip 主链与可观测 |
| P1 | EPIC-P1-CONSERVATION | 守恒拦截与仲裁 |
| P1 | EPIC-P1-SPECIR | SpecIR Studio 与 Ref-Link |
| P1 | EPIC-P1-UTXO | IQC + UTXO 材料链 |
| P2 | EPIC-P2-SETTLEMENT | FormulaPeg + RailPact |
| P2 | EPIC-P2-DOCFINAL | DocFinal + CA + Public Verify |

---

## 3. P0 Backlog（2-3周）

## EPIC-P0-AUTH 权限与签名主链跑通

### STORY-P0-AUTH-01 统一角色鉴权
- TASK-P0-AUTH-01-01  
  Summary: 为关键 API 增加 `required_role/required_scope` 元数据  
  Owner: Backend  
  Estimate: 1.0 PD  
  Depends: 无  
  DoD: 关键接口（signpeg、executor、tools、mobile-trips）均有元数据注释

- TASK-P0-AUTH-01-02  
  Summary: 落地统一鉴权装饰器并接入路由  
  Owner: Backend  
  Estimate: 1.5 PD  
  Depends: TASK-P0-AUTH-01-01  
  DoD: 越权请求返回 403 + 标准错误码

- TASK-P0-AUTH-01-03  
  Summary: 前端权限矩阵页对齐后端角色能力  
  Owner: Web  
  Estimate: 1.0 PD  
  Depends: TASK-P0-AUTH-01-02  
  DoD: “角色-页面-按钮-接口”可视化可导出

- TASK-P0-AUTH-01-04  
  Summary: 角色禁用动作清单与阻断码字典统一化  
  Owner: Backend + Web + Mobile  
  Estimate: 1.5 PD  
  Depends: TASK-P0-AUTH-01-02  
  DoD: 越权/互斥/前置缺失等阻断均返回标准码，三端展示一致

### STORY-P0-AUTH-02 SignPeg 闭环
- TASK-P0-AUTH-02-01  
  Summary: 固化 SignPeg 错误码字典  
  Owner: Backend  
  Estimate: 0.8 PD  
  Depends: 无  
  DoD: 文档包含 `skill_mismatch/capacity_full/cert_expired/role_not_allowed`

- TASK-P0-AUTH-02-02  
  Summary: SignPeg 状态接口补充下一签署角色推荐  
  Owner: Backend  
  Estimate: 1.0 PD  
  Depends: TASK-P0-AUTH-02-01  
  DoD: status 返回 `next_required/next_executor`

- TASK-P0-AUTH-02-03  
  Summary: Web 签字区角色位禁用与原因展示  
  Owner: Web  
  Estimate: 1.0 PD  
  Depends: TASK-P0-AUTH-02-02  
  DoD: 非本角色、资质不足、已签状态均有明确 UI

- TASK-P0-AUTH-02-04  
  Summary: 配置施工资料/监理资料签署链模板（测量表/质量检查表/抽检表）  
  Owner: Backend  
  Estimate: 1.5 PD  
  Depends: TASK-P0-AUTH-02-02  
  DoD: 按序号下发签署链，支持施工资料 1-8 位与监理资料 1-7 位，且状态接口可返回 `current_slot/next_slot`

- TASK-P0-AUTH-02-05  
  Summary: Gate 串行签署与互斥校验（禁止跳签、禁止同单自审）  
  Owner: Backend  
  Estimate: 1.2 PD  
  Depends: TASK-P0-AUTH-02-04  
  DoD: 跳签返回标准阻断码，自审冲突返回 `mutex_conflict`

- TASK-P0-AUTH-02-06  
  Summary: 评定表来源位映射与自动回填（施工/监理）  
  Owner: Backend + Web + Mobile  
  Estimate: 1.5 PD  
  Depends: TASK-P0-AUTH-02-04  
  DoD: 支持评定表按来源位继承签署信息（人员/时间/签名摘要），并可穿透到来源 Trip

### STORY-P0-AUTH-03 组织主账号与子账号自治
- TASK-P0-AUTH-03-01  
  Summary: 组织主账号（Org Admin）开通与初始化流程  
  Owner: Backend  
  Estimate: 1.0 PD  
  Depends: TASK-P0-AUTH-01-02  
  DoD: 每个参建组织可创建唯一主账号并绑定 `org_uri`（施工/监理/业主/检测/分包/设计）

- TASK-P0-AUTH-03-02  
  Summary: 子账号管理 API（创建/禁用/重置/角色分配/项目分配）  
  Owner: Backend  
  Estimate: 2.0 PD  
  Depends: TASK-P0-AUTH-03-01  
  DoD: 支持组织内角色分配与项目作用域控制，禁止跨组织提权；支持多组织类型共用接口

- TASK-P0-AUTH-03-03  
  Summary: Web 组织账号管理页（主账号自助管理成员）  
  Owner: Web  
  Estimate: 2.0 PD  
  Depends: TASK-P0-AUTH-03-02  
  DoD: 支持成员增删改、角色配置、项目绑定、账号状态启停；可按组织类型切换角色模板

- TASK-P0-AUTH-03-04  
  Summary: 账号与执行体绑定机制（可切换当前执行体）  
  Owner: Backend + Web + Mobile  
  Estimate: 1.5 PD  
  Depends: TASK-P0-AUTH-03-02  
  DoD: 动作提交必须带当前执行体，签名链可追踪到 executor_uri

- TASK-P0-AUTH-03-05  
  Summary: 组织账号治理审计日志  
  Owner: Backend  
  Estimate: 1.0 PD  
  Depends: TASK-P0-AUTH-03-02  
  DoD: 记录创建/禁用/重置密码/角色变更/项目调入调出并支持检索

- TASK-P0-AUTH-03-06  
  Summary: 组织类型角色模板中心（施工/监理/业主/检测/分包/设计）  
  Owner: Backend + Web  
  Estimate: 1.5 PD  
  Depends: TASK-P0-AUTH-03-01  
  DoD: 支持按 `org_type` 配置可分配角色白名单，模板变更可灰度生效

## EPIC-P0-MOBILE 移动端 SDUI 最小闭环

### STORY-P0-MOBILE-01 SDUI 协议
- TASK-P0-MOBILE-01-01  
  Summary: 定义 SDUI 最小协议 JSON Schema  
  Owner: Backend + Mobile  
  Estimate: 1.0 PD  
  Depends: 无  
  DoD: schema 包含 `steps/actions/field_rules/blocking_reasons`

- TASK-P0-MOBILE-01-02  
  Summary: 后端下发协议接口  
  Owner: Backend  
  Estimate: 1.5 PD  
  Depends: TASK-P0-MOBILE-01-01  
  DoD: 按角色和工序状态动态返回协议

- TASK-P0-MOBILE-01-03  
  Summary: 移动端协议渲染器（不写死页面）  
  Owner: Mobile  
  Estimate: 2.0 PD  
  Depends: TASK-P0-MOBILE-01-01  
  DoD: 能渲染动态字段、动态按钮、禁用原因

- TASK-P0-MOBILE-01-04  
  Summary: 按执行体上下文动态下发角色指令集（菜单/按钮）  
  Owner: Backend + Mobile  
  Estimate: 1.5 PD  
  Depends: TASK-P0-MOBILE-01-02  
  DoD: 同一页面在 Constructor/Inspector 登录下按钮集不同，且均由后端协议驱动

- TASK-P0-MOBILE-01-05  
  Summary: SDUI 协议版本协商与客户端降级机制  
  Owner: Backend + Mobile  
  Estimate: 1.5 PD  
  Depends: TASK-P0-MOBILE-01-01  
  DoD: 新旧客户端可通过版本协商正常运行，不兼容时自动降级为安全最小指令集

- TASK-P0-MOBILE-01-06  
  Summary: 移动端签署链分段渲染（施工资料/监理资料）  
  Owner: Mobile  
  Estimate: 1.0 PD  
  Depends: TASK-P0-MOBILE-01-03, TASK-P0-AUTH-02-04  
  DoD: 同一表单可按签署链展示“已签/待签/禁用”状态，点击禁用项展示阻断原因

### STORY-P0-MOBILE-02 离线补传
- TASK-P0-MOBILE-02-01  
  Summary: 本地离线队列结构与状态机  
  Owner: Mobile  
  Estimate: 1.5 PD  
  Depends: 无  
  DoD: 队列支持 pending/synced/failed/retry

- TASK-P0-MOBILE-02-02  
  Summary: 联网自动重放与幂等处理  
  Owner: Mobile + Backend  
  Estimate: 2.0 PD  
  Depends: TASK-P0-MOBILE-02-01  
  DoD: 重放不产生重复 Trip

## EPIC-P0-CHAIN Trip 主链与可观测

### STORY-P0-CHAIN-01 Trip 台账与审计
- TASK-P0-CHAIN-01-01  
  Summary: Trip 事件统一落表与索引  
  Owner: Backend  
  Estimate: 1.0 PD  
  Depends: 无  
  DoD: 支持按 doc/component/executor/date 检索

- TASK-P0-CHAIN-01-02  
  Summary: 关键链路埋点与 SLO 仪表盘（P0）  
  Owner: Infra  
  Estimate: 1.5 PD  
  Depends: TASK-P0-CHAIN-01-01  
  DoD: 监控 `提交成功率/签名成功率/补传成功率`

- TASK-P0-CHAIN-01-03  
  Summary: QA 样板链路自动化（桥施7表）  
  Owner: QA  
  Estimate: 2.0 PD  
  Depends: TASK-P0-AUTH-02-03, TASK-P0-MOBILE-01-03  
  DoD: 在线 + 离线 + 越权 3 套用例通过

---

## 4. P1 Backlog（3-5周）

## EPIC-P1-CONSERVATION 守恒拦截与仲裁
- TASK-P1-CON-01  
  Summary: Conservation Gate 规则服务（偏差阈值可配置）  
  Owner: Backend  
  Estimate: 2.0 PD  
  Depends: P0 完成  
  DoD: 偏差超阈值自动返回拦截状态

- TASK-P1-CON-02  
  Summary: ClawPeg 告警与置信度衰减机制  
  Owner: Backend  
  Estimate: 2.0 PD  
  Depends: TASK-P1-CON-01  
  DoD: 触发告警并更新资产置信度

- TASK-P1-CON-03  
  Summary: Web 仲裁池页面（Owner 裁决）  
  Owner: Web  
  Estimate: 2.0 PD  
  Depends: TASK-P1-CON-02  
  DoD: 可查看冲突上下文、执行裁决并留痕

## EPIC-P1-SPECIR SpecIR Studio 与 Ref-Link
- TASK-P1-SPEC-01  
  Summary: SpecIR Studio 基础编辑器（Schema/QCGate/BOM）  
  Owner: Web + Backend  
  Estimate: 3.0 PD  
  Depends: P0 完成  
  DoD: 可创建/更新/版本化标准条目

- TASK-P1-SPEC-02  
  Summary: 项目 BOQ 影子挂载 Ref-Link 工作台  
  Owner: Web  
  Estimate: 2.0 PD  
  Depends: TASK-P1-SPEC-01  
  DoD: 支持映射、比对、回滚

## EPIC-P1-UTXO IQC + UTXO 材料链
- TASK-P1-UTXO-01  
  Summary: IQC 入场结果接入 Gate 前置校验  
  Owner: Backend  
  Estimate: 1.5 PD  
  Depends: P0 完成  
  DoD: IQC 未通过时工序不可推进

- TASK-P1-UTXO-02  
  Summary: 检验批 UTXO 拆分与余量扣减  
  Owner: Backend  
  Estimate: 2.0 PD  
  Depends: TASK-P1-UTXO-01  
  DoD: 支持同批次多构件分配与余额追踪

- TASK-P1-UTXO-03  
  Summary: Web 构件材料溯源视图  
  Owner: Web  
  Estimate: 1.5 PD  
  Depends: TASK-P1-UTXO-02  
  DoD: 可展示“批次来源 -> 使用去向 -> 成本”

- TASK-P1-UTXO-04  
  Summary: IQC 缺失时移动端工序按钮硬锁死（UTXO Gate）  
  Owner: Backend + Mobile  
  Estimate: 1.5 PD  
  Depends: TASK-P1-UTXO-01  
  DoD: 未录入关键材料进场时，“混凝土浇筑”等动作不可见或不可点击，且返回标准阻断原因

---

## 5. P2 Backlog（4-8周）

## EPIC-P2-SETTLEMENT FormulaPeg + RailPact
- TASK-P2-SET-01  
  Summary: FormulaPeg 计价规则引擎  
  Owner: Backend  
  Estimate: 3.0 PD  
  Depends: P1 完成  
  DoD: 支持材料/人工/机械/折旧计价规则

- TASK-P2-SET-02  
  Summary: RailPact 结算指令与争议剥离  
  Owner: Backend  
  Estimate: 2.5 PD  
  Depends: TASK-P2-SET-01  
  DoD: 守恒未通过不得生成支付指令

## EPIC-P2-DOCFINAL DocFinal + CA + Public Verify
- TASK-P2-DOC-01  
  Summary: DocFinal 编译正式档案包  
  Owner: Backend + Web  
  Estimate: 2.5 PD  
  Depends: P1 完成  
  DoD: 支持 PDF/元数据/链路摘要输出

- TASK-P2-DOC-02  
  Summary: CA 签章流程编排与状态回传  
  Owner: Backend  
  Estimate: 2.0 PD  
  Depends: TASK-P2-DOC-01  
  DoD: 归档关键节点必须 CA 成功

- TASK-P2-DOC-03  
  Summary: Public Verify 穿透验真页面  
  Owner: Web  
  Estimate: 1.5 PD  
  Depends: TASK-P2-DOC-01  
  DoD: 扫码可查看核心链路与验真结果

- TASK-P2-DOC-04  
  Summary: 结算数字穿透到移动端原始 Trip 证据  
  Owner: Web + Backend  
  Estimate: 2.0 PD  
  Depends: TASK-P2-DOC-03  
  DoD: 每条结算数值可点击穿透到对应 Trip，展示 GPS、时间戳、Hash 指纹与签名信息

- TASK-P2-DOC-05  
  Summary: 穿透审计链路性能SLO与可观测告警  
  Owner: Web + Backend + Infra  
  Estimate: 1.5 PD  
  Depends: TASK-P2-DOC-04  
  DoD: 穿透链路达成 P95/P99 目标并有超时退化与告警面板

---

## 6. 跨任务依赖总览
1. P0 是 P1/P2 前置，不跨阶段并行关键链路。
2. `SDUI schema` 是移动端渲染和后端协议下发共同前置。
3. `Trip 幂等与落表` 是离线补传与审计可观测的共同前置。
4. `Conservation Gate` 是结算触发前置。
5. `DocFinal` 是 CA 和 Public Verify 前置。
6. `阻断码字典` 是 Web/Mobile 权限反馈一致性的共同前置。
7. `SDUI 协议版本协商` 是移动端灰度发布与向后兼容前置。
8. `签署链模板配置` 是签字区渲染、Gate 串行校验、签署状态接口的一致前置。

## 7. Jira 字段建议
1. Issue Type: Epic / Story / Task / Bug
2. Priority: P0 = Highest, P1 = High, P2 = Medium
3. Labels:
   - `domain:signpeg`
   - `domain:specir`
   - `domain:utxo`
   - `client:web`
   - `client:mobile`
   - `team:backend`
   - `team:qa`
4. 自定义字段：
   - `required_role`
   - `risk_level`
   - `chain_impact`
   - `acceptance_case_id`

## 8. 建议本周直接创建的 Jira（10条）
1. TASK-P0-AUTH-01-02
2. TASK-P0-AUTH-02-01
3. TASK-P0-AUTH-02-03
4. TASK-P0-MOBILE-01-01
5. TASK-P0-MOBILE-01-02
6. TASK-P0-MOBILE-01-03
7. TASK-P0-MOBILE-02-01
8. TASK-P0-MOBILE-02-02
9. TASK-P0-CHAIN-01-01
10. TASK-P0-CHAIN-01-03

## 9. Sprint 看板模板（可直接照抄）

1. Backlog
   - 所有未排期 Task
2. Ready
   - 需求明确、依赖清晰、DoD 可验收
3. In Progress
   - 正在开发（限制 WIP）
4. Code Review
   - 已提交待评审
5. QA
   - 待测试/测试中
6. Done
   - 满足 DoD 且回归通过

WIP 建议：
1. 每位开发同时进行任务不超过 2 条。
2. 每个客户端（Web/Mobile）同时进行 Story 不超过 2 个。

## 10. 本轮新增治理与合规任务（10条）

- TASK-P1-GOV-01  
  Summary: SignPeg/CA 节点边界策略中心  
  Owner: Backend + Web  
  Estimate: 2.0 PD  
  Depends: TASK-P2-DOC-02  
  DoD: 按表单类型+签位可配置签章策略，并在 Gate 生效

- TASK-P1-GOV-02  
  Summary: 组织类型角色-签位-动作真值矩阵服务  
  Owner: Backend  
  Estimate: 2.0 PD  
  Depends: TASK-P0-AUTH-03-06  
  DoD: 六类组织矩阵可配置，接口返回唯一判定结果

- TASK-P1-GOV-03  
  Summary: 账号与执行体生命周期状态机  
  Owner: Backend  
  Estimate: 1.5 PD  
  Depends: TASK-P0-AUTH-03-02  
  DoD: 覆盖入职/转岗/离职/冻结/恢复/销户并全量留痕

- TASK-P1-GOV-04  
  Summary: 委托与替岗规则引擎（含 delegation_uri）  
  Owner: Backend  
  Estimate: 2.0 PD  
  Depends: TASK-P0-AUTH-02-02  
  DoD: 支持有效期、作用域、自动失效与禁止再委托配置

- TASK-P1-GOV-05  
  Summary: 离线冲突仲裁 SOP 与补偿 Trip 流程  
  Owner: Backend + Web  
  Estimate: 2.0 PD  
  Depends: TASK-P0-MOBILE-02-02  
  DoD: 冲突分级、裁决留痕、补偿 Trip 闭环可运行

- TASK-P1-GOV-06  
  Summary: SnapPeg 证据质量门槛校验  
  Owner: Mobile + Backend  
  Estimate: 1.5 PD  
  Depends: TASK-P0-MOBILE-01-03  
  DoD: 照片张数/EXIF/GPS/时间戳不达标时阻断或进入人工复核

- TASK-P2-GOV-01  
  Summary: Trip/SKU/SMU 到财务科目映射中心  
  Owner: Backend  
  Estimate: 2.0 PD  
  Depends: TASK-P2-SET-01  
  DoD: 支持映射版本化、Proof 反查与财务对账导出

- TASK-P2-GOV-02  
  Summary: 审计与监管导出标准化（PDF/JSON/验签指引）  
  Owner: Backend + Web  
  Estimate: 1.5 PD  
  Depends: TASK-P2-DOC-01  
  DoD: 导出包包含哈希、签名摘要、证据索引和校验说明

- TASK-P2-GOV-03  
  Summary: 告警分级中心（L1/L2/L3）与响应SLA  
  Owner: Infra + Backend  
  Estimate: 1.5 PD  
  Depends: TASK-P0-CHAIN-01-02  
  DoD: 告警分级、通知策略、恢复条件可配置并可观测

- TASK-P2-GOV-04  
  Summary: 发布治理与灰度回滚流程产品化  
  Owner: Infra + Backend + Web + Mobile  
  Estimate: 2.0 PD  
  Depends: TASK-P0-MOBILE-01-05  
  DoD: 支持灰度比例、回滚阈值、试点放量记录与发布审计
