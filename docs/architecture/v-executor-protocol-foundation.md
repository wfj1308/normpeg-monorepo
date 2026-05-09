# v:// 执行体注册与调度底层逻辑（SAN / GitPeg / TripRole）

## 1. 文档目的

本文件统一定义系统底层逻辑：

- `v://` 的本质不是普通地址系统，而是**执行体主权注册系统**。
- 系统的核心对象是“可承担责任并可被调度的执行体容器”。
- `Executor / DTORole / TripRole / Proof / RailPact` 构成可验证执行闭环。

---

## 2. 一句话定义

`v:// 是物理世界执行体的注册与寻址系统。`

凡是能执行动作、能承担责任、能产生结果的主体（人、机构、AI、项目、规范协议），都可以注册为执行体，获得 `v://` 主权地址，进入 SAN 网络。

---

## 3. 关键术语与角色

## 3.1 执行体（Executor）

表示“谁在执行、是否有资格执行、是否有能力承接执行”。

示例：

- `v://cn.中北/`（机构执行体）
- `v://cn.中北/executor/zhang-san`（人员执行体）
- `v://cn.中北/executor/bridge-ai`（AI 执行体）
- `v://normref.com/`（规范协议执行体）
- `v://cn.大锦/DJGS/`（项目执行体）

## 3.2 DTORole（文档授权角色）

表示“执行体在某份文档中的法定/流程职责”。

示例：

- `doc_id = NINST-90219204`
- `dto_role = supervisor`
- `assigned_at = 2026-04-04`

## 3.3 TripRole（动作角色）

表示“执行体在某次动作中的操作身份与语义”。

示例：

- `trip_role = supervisor.approve`
- `action = approve`
- `signed_at = 2026-04-04T10:23:00`

---

## 4. 三者关系：Executor / DTORole / TripRole

执行事实必须三者同时存在：

1. `Executor`：证明“是谁做的、有没有资格做”
2. `DTORole`：证明“在该文档里是否被授权做”
3. `TripRole`：证明“具体做了什么动作、何时做”

缺一不可：

- 无 Executor：无法确认主体与资质
- 无 DTORole：无法确认文档职责合法性
- 无 TripRole：无法确认动作事实

---

## 5. 执行体不是静态身份，而是可调度容器

执行体是带状态的容器，不是“只登记一次的身份证”。

容器四要素（WHO / CAN / COST / DID）：

- `WHO`：我是谁（identity）
- `CAN`：我能做什么（skills + capacity）
- `COST`：我消耗什么（energy）
- `DID`：我做过什么（proof chain）

---

## 6. 执行体容器模型（建议）

```python
class Executor(BaseModel):
    # WHO
    executor_uri: str              # v://cn.中北/executor/zhang-san
    name: str
    org_uri: str                   # v://cn.中北/
    status: Literal["active", "inactive", "suspended"]
    registered_at: datetime

    # CAN - Skills
    skills: list[Skill]            # 证书、等级、有效期、能力范围

    # CAN - Capacity
    capacity: CapacityProfile      # max_concurrent/current_load/available

    # COST - Energy
    energy: EnergyProfile          # fee_rate/credit_limit/consumed/remaining

    # DID - Proof
    trip_count: int
    proof_count: int
    last_active: datetime
```

### 6.1 Skill（能力证书）

```python
class Skill(BaseModel):
    skill_uri: str                 # v://normref.com/skill/bridge-inspection@v1
    cert_no: str
    issued_by: str
    valid_until: date
    scope: list[str]               # 桥梁/隧道/混凝土等
    level: str
```

### 6.2 Capacity（容量）

```python
class CapacityProfile(BaseModel):
    max_concurrent: int
    current_load: int
    available: int
    overload_policy: Literal["reject", "queue", "handoff"]
```

### 6.3 Energy（能耗）

```python
class EnergyProfile(BaseModel):
    time_cost_unit: str            # 小时/次
    fee_rate: float                # 元/小时
    credit_limit: float
    consumed: float
    credit_remaining: float
```

---

## 7. 协议栈定义（v:// Protocol Stack）

| 层级 | 组件 | 作用 |
|---|---|---|
| 应用层 | `qcspec` / `docfinal` | 质检、归档等业务执行 |
| 安全层 | `SignPeg` / `CA` | 签名、身份验证、抗抵赖 |
| 证书层 | `Skills` | 执行体资质与能力验证 |
| 寻址层 | `v://` + `GitPeg` | 执行体主权注册与寻址 |
| 调度层 | `ExecutorScheduler` | 任务到执行体分配 |
| 结算层 | `RailPact` | 能耗记账与结算 |

### 一一对应关系

- `GitPeg`：执行体注册中心
- `v://`：执行体主权地址
- `Skills`：能力证书体系
- `DTORole`：文档授权
- `TripRole`：动作语义
- `Proof`：责任锚点
- `Executor`：执行主体容器
- `ExecutorScheduler`：调度内核
- `RailPact`：能耗结算

---

## 8. 调度模型（ExecutorScheduler）

调度目标：在“合法 + 可执行 + 成本可承受”约束下自动分配任务。

```python
class ExecutorScheduler:
    def assign(self, task) -> Executor:
        # 1) 能力匹配
        candidates = filter(
            lambda e: e.has_skill(task.required_skill) and e.cert_valid(task.date),
            executors,
        )

        # 2) 容量过滤
        candidates = filter(lambda e: e.capacity.available > 0, candidates)

        # 3) 能耗预算
        candidates = filter(
            lambda e: e.energy.credit_remaining > task.energy_cost,
            candidates,
        )

        # 4) 最优分配（负载均衡）
        return min(candidates, key=lambda e: e.capacity.current_load)
```

四个调度维度：

1. `Skill Match`：资质匹配
2. `Capacity Check`：容量检查
3. `Energy Budget`：能耗预算
4. `Load Balance`：负载均衡

---

## 9. 三层调度范围

1. 项目级调度：哪个执行体负责项目/标段
2. 文档级调度：哪位执行体负责某份文档审批
3. 动作级调度：某次 `approve/reject/sign/submit` 由谁执行

---

## 10. 执行闭环（从注册到结算）

`注册 -> 验证 -> 授权 -> 执行 -> 存证 -> 结算`

1. 注册：执行体在 GitPeg/SAN 注册，获得 `v://executor_uri`
2. 验证：通过 Skills 证书与有效期校验
3. 授权：绑定文档级 `DTORole`
4. 执行：发起 `TripRole` 动作
5. 存证：生成 `Proof`（hash/signature/time/lineage）
6. 结算：按能耗写入 RailPact 账本

---

## 11. Trip 记录作为可验证执行事实

```python
class Trip(BaseModel):
    # Executor
    executor_uri: str
    executor_name: str
    executor_cert: str

    # DTORole
    dto_role: str
    doc_id: str
    doc_type: str

    # TripRole
    trip_role: str
    action: str
    signed_at: datetime
    sig_data: str
    body_hash: str

    # Ledger Address
    trip_uri: str
```

Trip 台账示意：

```text
v://cn.大锦/DJGS/trip/2026/0404/TRIP-001
  executor: zhang-san
  dto_role: supervisor
  trip_role: supervisor.approve
  action: approve
  doc: NINST-90219204
  sig: signpeg:v1:a3f9...
  verified: true
```

---

## 12. 强约束（必须在系统中强制）

1. `v://` 代表执行体主键，不等同于普通资源 URL。
2. 未注册执行体不得执行 Trip 动作。
3. 每次 Trip 必须绑定 `executor_uri + dto_role + trip_role + proof_hash`。
4. 调度前必须通过 `skills + capacity + energy` 三重过滤。
5. 所有执行结果必须可追溯到 Proof 链与签名链。

---

## 13. 与当前代码主干的映射（现状）

以下是当前代码中已存在的关键承载点：

- TripRole 执行请求与离线回放：
  - `services/api/domain/proof/schema_models/execution_models.py`
  - `services/api/domain/execution/offline/triprole_offline.py`
- 动作执行与结果输出：
  - `services/api/domain/execution/actions/triprole_action_context.py`
  - `services/api/domain/execution/actions/triprole_action_output.py`
- DID/证书 gate：
  - `services/api/domain/execution/runtime/did_gate.py`
- DTORole 视图与鉴权：
  - `services/api/core/docpeg/view/service.py`
  - `services/api/core/security/service.py`
  - `services/api/dependencies.py`
- 文档治理中的 dtorole 上下文：
  - `services/api/domain/documents/runtime/governance.py`

---

## 14. 当前能力边界（架构层面）

### 已有

- TripRole 动作执行主链
- DID Gate 基础证书验证（含 skills/tags/abilities token）
- DTORole 视图投影与接口守卫
- Proof 交易与 lineage 可追溯

### 待补齐（按本文件目标）

1. 统一 `Executor` 容器注册模型（WHO/CAN/COST/DID）
2. 调度器一等公民实现（项目级/文档级/动作级）
3. `capacity` 和 `energy` 的实时约束与扣减
4. `doc_id + dto_role + assigned_at` 的强绑定授权记录
5. 统一 `trip_uri` 账本化规范

---

## 15. 落地原则

1. 先注册再执行：`register-before-execute`
2. 先授权再签名：`authorize-before-sign`
3. 先校验后分配：`verify-before-assign`
4. 先存证后结算：`proof-before-settlement`

---

## 16. 结语

本体系的底层逻辑不是“文档系统”，而是“执行体网络系统”：

- `v://` 定义主权执行体
- `SAN` 负责注册与调度
- `TripRole` 负责执行动作
- `Proof` 负责责任锚定
- `RailPact` 负责能耗结算

最终目标：把每一次现实世界执行行为，转化为可验证、可追责、可结算的数字执行事实。

---

## 17. 成品验收闭环（桥施64表）实现映射

成品验收是工序链终点，也是付款与归档触发点：

`桥施2 -> 桥施7 -> 桥施11 -> 桥施9 -> 桥施13 -> 桥施64(成品验收) -> FinalProof -> RailPact -> docfinal`

### 17.1 运行时能力

- 前置工序校验：所有 `pre_doc_ids` 必须 `lifecycle_stage=approved` 且 `all_signed=true`
- 三种验收结论：
  - `qualified`（合格）
  - `rejected`（不合格）
  - `conditional`（有条件合格）
- Trip 留痕：`acceptance.approve / acceptance.reject / acceptance.conditional_approve`
- 条件签认：`acceptance.condition.sign`，全部条件签完自动转 `qualified`

### 17.2 合格触发动作（on_approved）

- 生成 `final_proof_uri`
- 更新 BOQ 状态到 `PROOF_VERIFIED`
- 写入 RailPact 结算
- 归档 docfinal
- 锁定 `component_uri`

### 17.3 不合格策略

- 不删除历史 Trip，永久留痕
- 生成整改通知
- 前序工序状态可回落 `draft`
- 支持 `pre_rejection_trip_uri` 关联复验通过记录

### 17.4 代码位置

- 模型：`services/api/domain/signpeg/models.py`
- 引擎：`services/api/domain/signpeg/runtime/acceptance.py`
- 路由：`services/api/routers/signpeg.py`
- 迁移：`infra/supabase/023_acceptance_docfinal.sql`
- 集成测试：`services/api/tests/test_acceptance_integration.py`

---

## 18. 七层落地状态看板（Roadmap）

| Layer | 名称 | 载体 | 状态 | 备注 |
|---|---|---|---|---|
| 1 | normref.com 规范协议注册 | `normref.com` | `LIVE` | 规范协议注册能力在线 |
| 2 | IQC 来料检验 | `qcspec` | `BUILDING` | 来料检验流程建设中 |
| 3 | IPQC 过程质检 | `qcspec` | `LIVE` | 核心层，当前大锦项目重点 |
| 4 | 分部分项验收 | `qcspec + railpact` | `BUILDING` | 验收与结算联动持续完善 |
| 5 | 第三方独立检测 | `SAN 执行体注册` | `NEXT PHASE` | 后续阶段引入第三方执行体 |
| 6 | 竣工归档 | `docfinal` | `PLANNED` | 归档链路按计划推进 |
| 7 | `v://` 终身质量追溯 | 协议层 | `READY` | 协议已就绪，持续扩展应用面 |

### 18.1 当前执行优先级

1. Layer 3 稳定运营与项目复制（IPQC）。
2. Layer 4 打通验收->结算->锁定->归档闭环。
3. Layer 5 引入第三方独立检测执行体。

---

## 19. SignPeg 与 CA 的边界（大锦项目）

核心原则：`SignPeg 不能替代 CA`。

- 现场过程记录：`SignPeg`（速度优先）
- 正式归档表格：`法大大 CA`（合规强制）

### 19.1 必须 CA（归档签署）

- 质检表格最终签认（监理工程师签字）
- 施工单位负责人确认
- 分部分项验收结论
- 成品验收报告
- 竣工资料全部签字

### 19.2 可用 SignPeg（过程签认）

- 现场工序报验申请
- 施工日志日常记录
- 内部审批流转
- AI 执行体动作记录

### 19.3 规则落地（代码）

- `SignPegRequest.signature_mode`：
  - `process`：允许纯 SignPeg
  - `archive`：强制 `ca_provider + ca_signature_id`
- 成品验收接口（`/api/v1/acceptance/*`）强制 CA 证明
- Trip 台账 `metadata` 同时记录：
  - `signature_mode`
  - `ca_provider`
  - `ca_signature_id`
  - （可选）`ca_signed_payload_hash`

结论：`CA 证明“是谁”`，执行体与 Gate 证明“是否有资格签这份文档”，两者组合才构成完整可验证执行事实。
