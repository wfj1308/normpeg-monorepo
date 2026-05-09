# Fork / Split / Merge 最小正式模型（v0）

更新时间：2026-04-24  
范围：定义工程变更系统在协议层的最小对象模型与最小操作闭环。

## 1. 目标

将工程变更从“直接改原数据”升级为“可分支、可切分、可合并、可追溯”的状态操作：

- Fork：承载设计变更 / 试验变更 / 分支决策。
- Split：承载合同段 / 分包 / 里程切分。
- Merge：承载审批后的历史合并与追溯保留。

## 2. 通用审计元数据（所有操作必带）

```ts
type SourceRef = {
  ref_type: "project" | "container" | "branch" | "utxo" | "v_address" | "range";
  ref_id: string;
  v_address?: string;
};

type OperationAudit = {
  source_refs: SourceRef[]; // 来源引用
  reason: string;           // 变更原因
  operator: string;         // 操作人（建议 DID）
  created_at: string;       // 创建时间 ISO-8601
  updated_at: string;       // 更新时间 ISO-8601
};
```

约束：
- `source_refs` 至少 1 条。
- `reason/operator/created_at` 必填。
- 状态变化时必须刷新 `updated_at`。

## 3. 对象模型

### 3.1 Branch 对象

```ts
type Branch = {
  branch_id: string;
  parent_branch: string | null; // 默认 main
  project_id: string;
  scope: "project" | "container";
  status:
    | "ACTIVE"
    | "FORK_CREATED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "MERGED"
    | "ABANDONED";
  overrides: Record<string, unknown>;
  approvals: Array<{
    did: string;
    role: string;
    decision: "APPROVE" | "REJECT";
    comment?: string;
    timestamp: number;
  }>;
  workflow_history: Array<{
    from_status: string | null;
    to_status: string;
    action: string;
    operator: string;
    comment?: string;
    timestamp: number;
  }>;
  audit: OperationAudit;
};
```

### 3.2 Split 对象

```ts
type Split = {
  split_id: string;
  project_id: string;
  parent_container_ref: string; // 例如 containerId 或 stake range
  child_container_refs: string[];
  conservation_check: {
    parent_metric: number;   // 例如里程长度/工程量
    children_metric: number; // 子项总和
    passed: boolean;
  };
  audit: OperationAudit;
};
```

### 3.3 Merge 对象

```ts
type Merge = {
  merge_id: string;
  project_id: string;
  source_branch: string;
  target_branch: string; // 默认 main
  decision: "ACCEPTED" | "REJECTED";
  applied_overrides: Array<{
    target: string;
    old_value: unknown;
    new_value: unknown;
  }>;
  applied_outputs: Array<{
    source_output_id: string;
    target_output_id: string;
    source_v_address: string;
    target_v_address: string;
  }>;
  decision_proof_hash?: string; // 可选但推荐
  audit: OperationAudit;
};
```

## 4. 最小操作定义

### 4.1 Create Fork（from project/container）

输入最小集合：
- `project_id`
- `from_branch`（默认 `main`）
- `new_branch_id`
- `scope`（`project` 或 `container`）
- `source_refs`（至少包含 `project`，若是容器分叉需包含 `container`）
- `reason`
- `operator`

最小行为：
1. 校验父分支可分叉（`ACTIVE/FORK_CREATED/UNDER_REVIEW/APPROVED`）。
2. 创建 `Branch(status=FORK_CREATED)`。
3. 复制父分支可用输出作为新分支起点（容器范围 fork 时仅复制目标容器关联输出）。
4. 记录 `workflow_history` 与 `audit`。

最小结果：
- 主数据不被覆盖。
- 形成独立分支执行线，可继续 override/review/approve。

### 4.2 Split Container（1 -> N）

输入最小集合：
- `project_id`
- `parent_container_ref`
- `child_container_refs`（至少 2 个）
- `source_refs`
- `reason`
- `operator`

最小行为：
1. 校验父容器当前为可拆分活动状态，且存在未花费输出。
2. 做守恒校验（长度/工程量等）：`parent == sum(children)`。
3. 花费父容器 output，创建多个子容器 output。
4. 生成 `Split` 记录并写入历史。

最小结果：
- 父容器不再作为活跃输出继续推进。
- 子容器成为新的可执行/可结算边界。

### 4.3 Merge Approved Branch Back

输入最小集合：
- `project_id`
- `source_branch`
- `target_branch`（默认 `main`）
- `decision`（最小上线只需 `ACCEPTED`，保留 `REJECTED` 兼容）
- `source_refs`
- `reason`
- `operator`

最小行为：
1. `ACCEPTED` 必须先满足 `source_branch.status == APPROVED`。
2. 将 source 覆盖项合并到 target（保留 old/new diff）。
3. 将 source 的有效输出映射为 target 输出并保留来源映射关系。
4. source 分支置为 `MERGED`，写入 `Merge` 记录与 `decision_proof_hash`（如启用）。

最小结果：
- 合并后 target 可直接执行最新变更。
- source 历史保留，且可追溯到具体输出映射。

## 5. 持久化落点（最小）

在 `ProjectUTXO` 中最少保留：

- `branches: Record<string, Branch>`
- `split_history: Split[]`
- `merge_history: Merge[]`

兼容现状（当前仓库）：
- `Branch` 已有基础字段与工作流状态。
- `Split` 已有 `split_history` 基础记录。
- `Merge` 当前以 `branches[source].merge_info + decision_proof` 表示，可先作为 `merge_history` 的派生视图。

## 6. 与当前 API 的最小映射

- Fork：`POST /api/v1/branch/fork`
- Split：`POST /api/v1/utxo/split`
- Merge：`POST /api/v1/branch/merge`

建议最小增强：
- `branch/fork` 与 `utxo/split` 请求体增加 `source_refs/reason/operator` 显式字段（当前已有 `reason` 的接口继续兼容）。

## 7. 验收对照

1. 设计变更不再只能改原数据：通过 `Fork -> 审批 -> Merge` 闭环，主线与分支分离。  
2. 分支和合并可以追溯：`source_refs + reason + operator + timestamps + decision_proof` 全链路可回放。

