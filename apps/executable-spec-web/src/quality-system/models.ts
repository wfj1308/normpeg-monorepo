export type ContainerStatus = "DRAFT" | "RUNNING" | "VERIFIED" | "ARCHIVED";
export type OverallStatus = "PASS" | "FAIL" | "PENDING";
export type RuleOperator = ">=" | "<=" | ">";
export type SPUExecutionStatus =
  | "DRAFT"
  | "RUNNING"
  | "PASS"
  | "FAIL"
  | "SIGNING"
  | "FINAL_PASS"
  | "FINAL_FAIL";

export interface CalculationStep {
  step: string;
  formula: string;
  result: number;
}

export interface RuleResult {
  field: string;
  operator: RuleOperator;
  threshold: number;
  actual: number;
  passed: boolean;
  message: string;
}

export interface GateResult {
  passed: boolean;
  results: RuleResult[];
}

export interface SPUExecution {
  spuId: string;
  status: SPUExecutionStatus;
  attemptIndex: number;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  trace: CalculationStep[];
  gate: GateResult;
  requiredSignatures: string[];
  signedBy: string[];
  pendingSignatures: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditRecord {
  event: "createNode" | "submitForm" | "executePath" | "executeRules" | "sign" | "finalize" | "archive";
  containerId: string;
  spuId?: string;
  attemptIndex?: number;
  fromStatus?: string;
  toStatus?: string;
  actor?: string;
  detail?: string;
  timestamp: string;
}

export interface ProofSpecResult {
  spuId: string;
  finalStatus: "PASS" | "FAIL";
  attempts: number;
  latestAttemptIndex: number;
  latestOutputs: Record<string, number>;
  gate: GateResult;
}

export interface Proof {
  containerId: string;
  specResults: ProofSpecResult[];
  signatures: string[];
  auditTrail: AuditRecord[];
  timestamp: string;
}

export interface Container {
  id: string;
  slotRef: string;
  status: ContainerStatus;
  spus: SPUExecution[];
  overallStatus: OverallStatus;
  spuCatalog: string[];
  proof: Proof | null;
  auditTrail: AuditRecord[];
  context: {
    station: string;
    coordinateX: number;
    coordinateY: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CompactionInputs {
  massHoleSand: number;
  massSandCone: number;
  volumeSand: number;
  moistureContent: number;
  maxDryDensity: number;
}

export interface CompactionOutputs {
  wetDensity: number;
  dryDensity: number;
  compactionDegree: number;
}
