# Asset Layer Minimal（执行强相关子集）最小正式模型（v0）

更新时间：2026-04-24  
范围：仅落地资产层中与执行系统直接相关的最小闭环，覆盖 `boq + contract`；`price` 暂不纳入。

## 1. 目标与边界

目标：

1. 让执行结果（execution/proof）能进入最小结算语义。
2. 让合同规则能对“是否可支付”做最小判定。
3. 保持与现有执行主链兼容：`Mapping -> Container/Node -> Proof -> Archive/Export`。

明确不做（v0）：

1. 不做复杂单价库、调价、税费、清单计价引擎。
2. 不做财务台账与支付系统对接细节。
3. 不做完整合同生命周期管理（仅保留执行强相关规则）。

## 2. 最小 BOQItem 定义

```ts
type QuantityStatus =
  | "UNMEASURED"               // 尚未形成可计量结果
  | "MEASURED_PENDING_PROOF"   // 有计量结果，待 proof
  | "PROOFED_PENDING_ACCEPT"   // proof 已生成，待合同验收条件通过
  | "READY_FOR_PAYMENT"        // 进入最小可支付状态
  | "BLOCKED";                 // 失败/冲突/条件不满足

type BOQProofRef = {
  proofId: string | null;
  proofHash: string | null;
  proofKind: "node_final" | "container_final";
  status: "PASS" | "FAIL" | "BLOCK" | "PENDING";
  containerId: string | null;
  nodeId: string | null;
  generatedAt: string | null;
};

type BOQItemMinimal = {
  boqItemId: string;                      // 例: boq-K19+070-zone96
  projectId: string;
  branchId?: string | null;

  // 1) linked volume container（必填）
  linkedVolumeContainerRef: {
    volumeRef: string;                    // 例: v://space/volume/K19+070-zone96
    containerRef: string | null;          // 对应 SpaceContainer.v_address
    slotRef: string | null;               // 对应 SpaceSlot.v_address
  };

  // 2) linked proof refs（必填，可为空数组）
  linkedProofRefs: BOQProofRef[];

  // 3) quantity status（必填）
  quantity: {
    designed: number | null;
    measured: number | null;
    unit: string;                         // 默认 m3
    quantityStatus: QuantityStatus;
    lastUpdatedAt: string;
  };

  contractBinding: {
    contractRuleId: string | null;
    payableEligible: boolean;
    payableReason: string | null;
  };
};
```

最小约束（MUST）：

1. 每个 `BOQItemMinimal` 必须绑定一个 `linkedVolumeContainerRef.volumeRef`。
2. `linkedProofRefs` 可为空，但一旦写入必须可追溯 `proofId/proofHash`。
3. `quantity.quantityStatus` 必须由执行/proof 事件驱动更新，不允许纯手工任意改态。

## 3. 最小 ContractRule 定义

```ts
type PaymentTrigger =
  | "ON_PROOF_PASS"            // proof PASS 即触发可支付评估
  | "ON_CONTAINER_ARCHIVED"    // 容器归档时触发可支付评估
  | "MANUAL_RELEASE";          // 人工放行（需保留审计）

type AcceptanceConditionMinimal = {
  requiredProofStatus: "PASS";             // v0 固定要求 PASS
  requireArchivedProof?: boolean;          // 是否要求 container_final
  requireAllLinkedSpecsPass?: boolean;     // 聚合 proof 的 specResults 全 PASS
  requiredSignRoles?: Array<"inspector" | "supervisor" | "expert" | "admin">;
};

type ContractRuleMinimal = {
  contractRuleId: string;
  projectId: string;
  paymentTrigger: PaymentTrigger;          // 必填
  acceptanceCondition: AcceptanceConditionMinimal; // 必填
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
};
```

最小语义：

1. `paymentTrigger` 决定何时评估“可支付”。
2. `acceptanceCondition` 决定“是否满足支付前置条件”。
3. 合同规则只输出结论摘要（`payableEligible/payableReason`），不负责金额计算。

## 4. 执行/Proof 驱动更新（最小实现）

### 4.1 execution completed -> 更新 BOQ 摘要

触发：节点执行完成（对应 `NODE_FINALIZED` 语义）。  
输入最小集：`projectId/containerId/nodeId/status/stake|vuri`。

更新规则：

1. 通过 `container -> volumeRef` 关联命中 `BOQItemMinimal`。
2. 回写 `quantity.measured`（若执行输出包含工程量字段；无则保持原值）。
3. 更新 `quantity.quantityStatus`：
   - 执行 `PASS` 且有 `measured`：`MEASURED_PENDING_PROOF`
   - 执行 `FAIL/BLOCK`：`BLOCKED`
4. 更新 `contractBinding.payableEligible=false`，`payableReason="proof not generated"`（若尚无 proof）。

### 4.2 proof generated -> 更新 BOQ/Contract 摘要

触发：生成 `node_final` 或 `container_final` proof。  
输入最小集：`proofId/proofHash/status/containerId/nodeId/generatedAt`。

更新规则：

1. 将 proof 追加到 `linkedProofRefs`（按 `proofId/proofHash` 去重）。
2. proof 状态为 `PASS` 时，`quantityStatus` 至少推进到 `PROOFED_PENDING_ACCEPT`。
3. 根据 `ContractRuleMinimal` 评估 `acceptanceCondition`：
   - 满足：`quantityStatus=READY_FOR_PAYMENT`，`payableEligible=true`
   - 不满足：保持 `PROOFED_PENDING_ACCEPT` 或置 `BLOCKED`，并写 `payableReason`
4. proof 状态为 `FAIL/BLOCK`：`quantityStatus=BLOCKED`，`payableEligible=false`。

### 4.3 最小汇总对象（项目级）

```ts
type AssetSettlementSummaryMinimal = {
  projectId: string;
  totalBoqItems: number;
  readyForPaymentCount: number;
  blockedCount: number;
  pendingProofCount: number;
  lastProofGeneratedAt: string | null;
  updatedAt: string;
};
```

项目侧只需维护该摘要用于“是否可发起最小结算动作”判断。

## 5. 与现有仓库落点映射（当前）

已可复用：

1. 执行完成事件来源：`platform-service` 中 `NODE_FINALIZED` 审计事件。
2. proof 生成来源：节点 final proof 与 `archiveContainer` 生成 container final proof。
3. proof 导出能力：`/api/proof/export`、`/api/proof/archive-export`（含 acceptance 证据字段）。

本次最小新增建议：

1. 资产回写入口：`POST /api/v1/asset/sync/execution`
2. 资产回写入口：`POST /api/v1/asset/sync/proof`
3. 资产查询入口：`GET /api/v1/asset/boq/by-volume?volumeRef=...`
4. 项目摘要入口：`GET /api/v1/asset/summary?projectId=...`

说明：以上为资产层最小内核接口，不等同于完整结算系统 API。

## 6. 与 UTXO / 空间模型的关系（最小约束）

1. `BOQItemMinimal` 建议映射为 `ProjectUTXO` 中 `contract_unit` 类型 output。
2. `linkedVolumeContainerRef.volumeRef` 必须来自 `Volume Container`（见 `spatial-model.md`）。
3. `linkedProofRefs` 必须可反查到 `Proof` 或导出包引用，保证审计追溯。

## 7. 验收对照

1. 执行系统结果可以进入最小结算/合同语义：  
`execution completed` 与 `proof generated` 已有明确回写规则，能把执行结果推进到 `READY_FOR_PAYMENT/BLOCKED` 等最小状态。
2. 不做复杂造价系统：  
本模型只定义 `BOQItem + ContractRule + 摘要回写`，不包含单价引擎、税费、财务总账等复杂能力。
