# ProjectUTXO 最小正式模型（v0）

更新时间：2026-04-24  
范围：把架构概念落成最小可执行模型，不改变现有业务 API 语义。

## 1. 定位

`ProjectUTXO` 是**项目级状态机根**，不是普通数据库记录。

- 项目以 `project_root` 作为主权根（`v://{projectId}`）。
- 项目状态推进通过 `output` 的产生与花费表达。
- 任意关键状态变更都必须能映射为 `unspent_outputs` / `spent_outputs_history` 的更新。

## 2. 最小结构

```ts
type ProjectUTXO = {
  project_root: {
    project_id: string;      // 例如 GXX-2024-XXX
    root_v_address: string;  // 例如 v://GXX-2024-XXX
    genesis_at: string;      // ISO-8601
  };
  current_state: {
    status: string;          // 例如 DRAFT/RUNNING/QUALIFIED/ARCHIVED/FINALIZED
    branch_id: string;       // 默认 main
    latest_output_id: string | null;
    latest_v_address: string | null;
    updated_at: string;      // ISO-8601
  };
  unspent_outputs: Record<string, ProjectOutput>;
  spent_outputs_history: SpentOutputRecord[];
};
```

### 2.1 Output 结构

```ts
type OutputObjectType = "container" | "contract_unit" | "execution_package";

type ProjectOutput = {
  output_id: string;               // 全局唯一（如 utxo_xxx）
  object_type: OutputObjectType;   // 可被 UTXO 管理的对象类型
  object_ref: {
    id: string;                    // 业务对象 id
    v_address?: string;            // 可选，推荐填写
  };
  state: string;                   // 输出状态
  payload: Record<string, unknown>;
  created_at: string;              // ISO-8601
  consumed: boolean;               // 是否已花费
};

type SpentOutputRecord = {
  output_id: string;
  spent_at: string;                // ISO-8601
  spent_by_output_id: string | null; // 被哪个新 output 花费；终结态可为空
  reason: "superseded" | "archived" | "finalized";
  snapshot: ProjectOutput;         // 花费时快照，保证可审计
};
```

## 3. 哪些对象可以成为 Output

最小允许集合固定为以下三类：

1. `container`：空间执行容器（如 `v://.../container/...`）。
2. `contract_unit`：合同/计量单元（可结算边界单元）。
3. `execution_package`：一次执行产物包（结果 + proof + 上下文）。

约束：
- 一个 output 必须且只能对应一个 `object_type`。
- `object_ref.id` 必填；有 `v_address` 时优先用 `v_address` 做追溯。

## 4. 最小转换规则

### 4.1 规则 A：`execution_complete -> output update`

触发：一次执行完成（含 PASS/FAIL/QUALIFIED 等最终执行结果）。

状态更新：
1. 生成新 output `O_new`（`consumed=false`），写入 `unspent_outputs`。
2. 若存在被替代 output `O_prev`，则将其标记为 `consumed=true`，并追加 `spent_outputs_history` 记录：
   - `reason = "superseded"`
   - `spent_by_output_id = O_new.output_id`
3. 更新 `current_state`：
   - `latest_output_id = O_new.output_id`
   - `latest_v_address = O_new.object_ref.v_address (if any)`
   - `status = O_new.state`

### 4.2 规则 B：`archive -> spent or finalized`

触发：容器/项目执行进入归档。

两种最小合法模式：
1. `archive_as_new_output`（推荐）：
   - 生成归档 output `O_arch`（常见为 `execution_package`，状态 `ARCHIVED`/`FINALIZED`）。
   - 被归档的活动 output 全部标记 `consumed=true`，并写入 `spent_outputs_history`：
     - `reason = "archived"`
     - `spent_by_output_id = O_arch.output_id`
2. `archive_finalize_direct`（终态封存）：
   - 不再生成后继 output。
   - 目标 output 标记 `consumed=true`，写入 `spent_outputs_history`：
     - `reason = "finalized"`
     - `spent_by_output_id = null`
   - `current_state.status = "FINALIZED"`（或系统定义的终态）

## 5. 与现有实现映射（当前仓库）

当前后端已有最小基础：`current_state + unspent_outputs + output.consumed/spent_at/spent_by`。

- `project_root` 对应现有 `id + project_id + genesis_time`。
- `current_state` 可直接复用现有 `current_state`。
- `unspent_outputs` 可直接复用现有 `unspent_outputs`（注意其中包含 `consumed=true` 项）。
- `spent_outputs_history` 在 v0 可按两种方式实现：
  1. 显式落表（推荐）。
  2. 由 `unspent_outputs` 中 `consumed=true` 且含 `spent_at/spent_by` 的记录派生视图。

## 6. 验收对照

1. 项目不是普通记录：`ProjectUTXO` 明确以 `project_root + current_state` 定义项目为状态机根。  
2. 关键状态可映射 output 更新：`execution_complete` 与 `archive` 两条规则都要求同步更新 `unspent_outputs` 与 `spent_outputs_history`。
