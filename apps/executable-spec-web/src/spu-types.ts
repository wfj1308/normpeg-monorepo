import type {
  SpaceContainerLifecycleState,
  SpaceNodeResultStatus,
  SpacePendingAction,
  SpaceSpecBindingState,
} from "./space-context-contract.ts";

export interface SPU {
  spuId: string;
  meta: {
    name: string;
    norm: string;
    clause: string;
    version: string;
  };
  forms: Array<{
    formCode: string;
    role: string;
    required: boolean;
  }>;
  data: {
    inputs: InputField[];
    outputs: Array<{ name: string }>;
  };
  path: PathStep[];
  rules: Rule[];
  proof: ProofConfig;
}

export interface InputField {
  name: string;
  type: "number" | "string" | "boolean";
  label: string;
}

export interface PathStep {
  step: string;
  formula: string;
}

export interface Rule {
  ruleId: string;
  field: string;
  operator: ">=" | "<=" | ">" | "<" | "==" | "!=";
  value: number | string;
  message: string;
}

export interface ProofConfig {
  resultField: string;
  passMessage: string;
  failMessage: string;
  requiredSignatures: string[];
  schemaVersion?: string;
  extensions?: Record<string, unknown>;
}

export interface CalculationTrace {
  step: string;
  formula: string;
  inputs: Record<string, number>;
  output: number;
}

export interface GateResult {
  ruleId: string;
  field: string;
  value: number;
  threshold: number;
  operator: string;
  passed: boolean;
  message?: string;
}

export interface GateRuleResult {
  ruleId: string;
  passed: boolean;
  actual: number;
  expected: number;
  field: string;
  operator: string;
  message?: string;
}

export interface GateEvaluation {
  passed: boolean;
  results: GateRuleResult[];
}

export interface Proof {
  spuId: string;
  norm: string;
  clause: string;
  timestamp: string;
  result: {
    field: string;
    value: number;
    status: SpaceNodeResultStatus;
  };
  message: string;
  calculationTrace: CalculationTrace[];
  gateDecisions: GateResult[];
  requiredSignatures: string[];
  pendingSignatures: string[];
  signedBy?: string[];
  inputs?: Record<string, number>;
  outputs?: Record<string, number>;
  trace?: Array<{ step: string; formula: string; result: number }>;
  gate?: GateEvaluation;
  status?: "FINAL_PASS" | "FINAL_FAIL";
}

export interface ExecutionResult {
  spuId: string;
  status: SpaceNodeResultStatus;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  trace: CalculationTrace[];
  gateResults: GateResult[];
  proof: Proof;
}

export type NodeStatus =
  | "READY"
  | "LOCKED"
  | "UNLOCKED"
  | SpaceNodeResultStatus
  | "DRAFT"
  | "FILLED"
  | "COMPUTED"
  | "GATED"
  | "SIGNING"
  | "FINAL_PASS"
  | "FINAL_FAIL";

export interface SPUNode {
  node_id?: string;
  spuId: string;
  container_ref?: string;
  volume_ref?: string;
  attempt_index?: number;
  created_at?: string;
  dependsOn: string[];
  blockedByFailure: boolean;
  isAutoUnlocked: boolean;
  loadedForms: Array<{
    formCode: string;
    role: string;
    required: boolean;
  }>;
  loadedPath: PathStep[];
  loadedRules: Rule[];
  status: NodeStatus;
  execution_result?: Record<string, number>;
  gate_result?: GateEvaluation;
  proof?: Proof;
}

export interface SpaceSlot {
  slot_id?: string;
  v_address: string;
  slot_type: "geo_reference";
  geo: {
    station: string;
    chainage: number;
    coords: {
      x: number;
      y: number;
    };
    x?: number;
    y?: number;
    elevation: number;
    alignment: string;
  };
  created_from: string;
  is_static: true;
}

export interface SpaceContainerProof {
  container_id: string;
  geo_slot_ref: string;
  slot_ref: string;
  volume_ref?: string | null;
  overall_status: "PASS" | "FAIL";
  spec_results: Array<{
    spuId: string;
    status: "PASS" | "FAIL";
    final_node: string;
    attempts: number;
    value?: {
      field?: string;
      value?: number;
      status?: SpaceNodeResultStatus;
    } | null;
  }>;
  signatures: string[];
  timestamp: string;
  archived_at?: string;
  audit_trail: Array<{
    event: string;
    spuId?: string;
    node_id?: string;
    attempt?: number;
    status?: string;
    timestamp: string;
  }>;
}

export interface SpaceContainer {
  container_id?: string;
  v_address: string;
  container_type: "execution_instance";
  geo_slot_ref: string;
  slot_ref?: string;
  volume_ref?: string | null;
  lifecycle_state?: SpaceContainerLifecycleState;
  locked?: boolean;
  nodes?: string[];
  norm_execution: {
    specs_bound: string[];
    current_state: SpaceContainerLifecycleState;
    gate_open: boolean;
  };
  trip_binding: {
    inspector: string;
    supervisor: string;
  };
  runtime: {
    active_form: string;
    last_input: string;
    pending_action: SpacePendingAction;
  };
  lifecycle: string;
  is_dynamic: true;
  spec_bindings?: Array<{
    spuId: string;
    status: SpaceSpecBindingState;
    latest_node: string | null;
  }>;
  can_archive?: boolean;
  latest_node?: {
    node_id: string;
    spu_id: string;
    attempt_index: number;
    status: NodeStatus;
    created_at: string;
    completed_at?: string;
  } | null;
  latest_pass_node?: {
    node_id: string;
    spu_id: string;
    attempt_index: number;
    status: NodeStatus;
    created_at: string;
    completed_at?: string;
  } | null;
  node_history?: Array<{
    node_id: string;
    spu_id: string;
    container_ref: string;
    volume_ref?: string | null;
    attempt_index: number;
    created_at: string;
    completed_at?: string;
    status: NodeStatus;
    result_summary?: {
      field?: string;
      value?: number;
      status?: SpaceNodeResultStatus;
    } | null;
  }>;
  node_history_by_spu?: Record<
    string,
    Array<{
      node_id: string;
      spu_id: string;
      container_ref: string;
      volume_ref?: string | null;
      attempt_index: number;
      created_at: string;
      completed_at?: string;
      status: NodeStatus;
      result_summary?: {
        field?: string;
        value?: number;
        status?: SpaceNodeResultStatus;
      } | null;
    }>
  >;
  container_proof?: SpaceContainerProof | null;
  geo_slot?: SpaceSlot | null;
}

export interface NodeSnapshot {
  node_id?: string;
  spuId: string;
  container_ref?: string;
  volume_ref?: string;
  attempt_index?: number;
  created_at?: string;
  loadedForms: Array<{
    formCode: string;
    role: string;
    required: boolean;
  }>;
  loadedPath: PathStep[];
  loadedRules: Rule[];
  status: NodeStatus;
  submittedFormCode?: string;
  formData?: Record<string, number>;
  executionResult?: ExecutionResult;
  proof?: Proof;
  completedSignatures: string[];
}

export type WorkItemAggregateStatus = "READY" | "IN_PROGRESS" | SpaceNodeResultStatus;

export interface WorkItemSummary {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  pending: number;
}

export interface WorkItemNodeResult {
  spuId: string;
  status: NodeStatus;
  outputs?: Record<string, number>;
  gate?: GateEvaluation;
  proof?: Proof;
}

export interface WorkItemProof {
  workItemId: string;
  workItemName: string;
  norm: string;
  summary: WorkItemSummary;
  nodeResults: WorkItemNodeResult[];
  aggregateStatus: WorkItemAggregateStatus;
}

export interface WorkItemWorkflowStep {
  spuId: string;
  dependsOn: string[];
}

export interface WorkItemInstance {
  workItemId: string;
  workItemName: string;
  catalogName: string;
  norm: string;
  clauseGroup?: string;
  spuIds: string[];
  workflowEnabled: boolean;
  workflow: WorkItemWorkflowStep[];
  nodes: Record<string, SPUNode>;
  aggregateStatus: WorkItemAggregateStatus;
  summary: WorkItemSummary;
  proof: WorkItemProof | null;
}
