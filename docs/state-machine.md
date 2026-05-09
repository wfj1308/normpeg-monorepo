# State Machine (Frozen)

更新时间：2026-04-23  
范围：统一状态语义，不新增业务功能，不重写现有流程。

## 1. 目标与边界

本次只做“状态语言统一层”，将现有分散状态统一映射到以下最小状态机：

- `INIT`
- `READY`
- `RUNNING`
- `BLOCKED`
- `PASSED`
- `FAILED`
- `SIGNING`
- `ARCHIVED`

不变更现有接口的业务含义，不要求一次性替换历史字段（如 `DRAFT`、`VALIDATED`、`REJECTED`、`VERIFIED` 等），通过映射层兼容。

## 2. 上下文缺失信息（仅做兼容处理）

当前代码中存在以下未完全统一的信息：

1. 后端容器主状态使用 `DRAFT/RUNNING/VALIDATED/REJECTED/ARCHIVED`，前端与演示链路同时出现 `VERIFIED/QUALIFIED`。
2. `SIGNING` 已用于前端 Node 流程，但后端容器归档流程尚未形成完整签字状态机。
3. `BLOCKED` 出现在 Gate/调度语义中，但容器持久化主状态未统一为 `BLOCKED`。

处理方式：

- 保留旧状态存储与返回。
- 新增统一状态机模块，提供标准化和合法跳转校验。
- 旧状态通过映射函数进入统一状态机。

## 3. 状态语义

### 3.1 Node（单次执行状态）

- `INIT`：节点已创建但尚未进入执行。
- `READY`：依赖满足，可执行。
- `RUNNING`：执行中。
- `BLOCKED`：依赖/前置条件未满足或被阻断。
- `PASSED`：本次执行判定通过。
- `FAILED`：本次执行判定失败。
- `SIGNING`：等待签字或签字中。
- `ARCHIVED`：节点进入归档上下文，不可继续推进。

### 3.2 Container（聚合状态）

- `INIT`：容器初始化完成。
- `READY`：容器可进入执行。
- `RUNNING`：存在执行中的节点，或聚合流程进行中。
- `BLOCKED`：容器因依赖/流程条件阻断。
- `PASSED`：聚合判定通过（可归档）。
- `FAILED`：聚合判定失败（待复核/重试）。
- `SIGNING`：容器处于签字阶段。
- `ARCHIVED`：容器已归档（终态）。

## 4. 合法跳转表

说明：以下为统一状态机允许的跳转；其余跳转均视为非法。

### 4.1 Node 合法跳转

| From | To |
|---|---|
| `INIT` | `READY`, `RUNNING`, `BLOCKED` |
| `READY` | `RUNNING`, `BLOCKED`, `ARCHIVED` |
| `RUNNING` | `PASSED`, `FAILED`, `BLOCKED`, `SIGNING` |
| `BLOCKED` | `READY`, `RUNNING`, `FAILED` |
| `PASSED` | `SIGNING`, `ARCHIVED` |
| `FAILED` | `READY`, `RUNNING`, `SIGNING`, `ARCHIVED` |
| `SIGNING` | `PASSED`, `FAILED`, `ARCHIVED` |
| `ARCHIVED` | *(none)* |

### 4.2 Container 合法跳转

| From | To |
|---|---|
| `INIT` | `READY`, `RUNNING`, `BLOCKED` |
| `READY` | `RUNNING`, `BLOCKED`, `ARCHIVED` |
| `RUNNING` | `READY`, `BLOCKED`, `PASSED`, `FAILED`, `SIGNING` |
| `BLOCKED` | `READY`, `RUNNING`, `FAILED` |
| `PASSED` | `SIGNING`, `ARCHIVED` |
| `FAILED` | `READY`, `RUNNING`, `SIGNING`, `ARCHIVED` |
| `SIGNING` | `PASSED`, `FAILED`, `ARCHIVED` |
| `ARCHIVED` | *(none)* |

## 5. 非法跳转错误码定义

- `SM_STATE_UNKNOWN_SCOPE`
  - 含义：状态机作用域未知（必须为 `NODE` 或 `CONTAINER`）。
- `SM_STATE_UNKNOWN_STATUS`
  - 含义：状态值无法识别（既不是统一状态，也无法映射旧状态）。
- `SM_STATE_ILLEGAL_TRANSITION`
  - 含义：目标状态不在当前状态允许跳转集合内。

错误返回建议字段：

- `code`
- `message`
- `scope`
- `current`
- `target`
- `allowed`

## 6. 旧状态到统一状态映射

### 6.1 运行时旧状态映射

| 旧状态 | 统一状态 |
|---|---|
| `DRAFT` | `INIT` |
| `READY` | `READY` |
| `RUNNING`, `IN_PROGRESS`, `COMPUTED`, `GATED` | `RUNNING` |
| `BLOCKED` | `BLOCKED` |
| `PASS`, `FINAL_PASS`, `QUALIFIED`, `VALIDATED`, `VERIFIED`, `SUCCESS`, `OVERRIDDEN` | `PASSED` |
| `FAIL`, `FINAL_FAIL`, `REJECTED`, `CRITICAL`, `ERROR` | `FAILED` |
| `SIGNING` | `SIGNING` |
| `ARCHIVED` | `ARCHIVED` |
| `UNLOCKED` | `READY` |
| `LOCKED` | `BLOCKED` |
| `PENDING` | `INIT` |

### 6.2 页面文案映射表（现有中文文案 -> 统一状态）

| 页面文案 | 统一状态 |
|---|---|
| `草稿` | `INIT` |
| `就绪`, `可执行` | `READY` |
| `执行中`, `进行中` | `RUNNING` |
| `阻塞`, `受阻`, `已阻断` | `BLOCKED` |
| `通过`, `已完成`, `已验证`, `合格` | `PASSED` |
| `不通过`, `未通过`, `已驳回` | `FAILED` |
| `签名中` | `SIGNING` |
| `已归档` | `ARCHIVED` |

## 7. 最小迁移建议

1. 后端状态判断统一先调用 `normalize_state(...)`，再做分支。
2. 状态变更统一通过 `transition(...)`/`assert_transition(...)`，禁止手写任意跳转。
3. 旧接口字段保持不变；必要时在响应中同时携带统一状态字段（或内部使用统一状态）。
4. 前端显示文案通过统一映射表归一，避免页面文案与接口状态脱节。

## 8. 本次落地产物

- 文档：`docs/state-machine.md`
- 代码（后端）：`backend/app/state_machine/*`
- 代码（前端平台）：`apps/executable-spec-web/src/platform/state_machine/transitions.ts`
- 接入（前端运行时）：`apps/executable-spec-web/src/platform/runtime/runtime-scheduler.ts`、`apps/executable-spec-web/src/platform/runtime/execution-engine.ts`
- 测试（后端）：`backend/tests/test_state_machine.py`
- 测试（前端平台）：`apps/executable-spec-web/src/platform/state_machine/transitions.test.ts`

## 9. 前端统一模块（可复用 API）

前端平台新增统一状态机模块，供调度区、执行区、归档区共用：

- `normalizeState(value, scope?)`
- `normalizePageStatusText(value)`
- `allowedTargets(scope, currentState)`
- `canTransition(scope, currentState, targetState)`
- `assertTransition(scope, currentState, targetState)`
- `transition(scope, currentState, targetState)`
- `toSchedulerTaskStatus(state)`

说明：

1. 旧状态（`DRAFT/PASS/FINAL_PASS/VERIFIED` 等）统一先归一到 8 状态。
2. 运行时调度输入由统一状态映射生成，避免页面和接口侧各自解释状态。
3. 执行引擎在节点状态变更时调用 `transition(...)`，非法跳转直接抛错并附带错误码。
