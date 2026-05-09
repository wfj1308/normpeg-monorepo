export type LayerPegDocType =
  | "spec"
  | "proof"
  | "report"
  | "form"
  | "sku"
  | "execution"
  | "container"
  | "other";

export type LayerPegGateDecision = "pass" | "block" | "override" | "pending";

export type LayerPegStateStatus =
  | "DRAFT"
  | "COMPUTED"
  | "VALIDATED"
  | "QUALIFIED"
  | "REJECTED"
  | "ARCHIVED"
  | "RUNNING"
  | "SIGNING";

export interface LayerPegNormRef {
  normRefId?: string;
  norm?: string;
  clause?: string;
  version?: string;
}

export interface LayerPegHeaderLayer {
  usi: string;
  docType: LayerPegDocType;
  version: string;
  ownerDid?: string | null;
  createdAt: string;
  rootRef?: string | null;
  projectRef?: string | null;
  normRef?: LayerPegNormRef | null;
}

export interface LayerPegDependencyNode {
  nodeId: string;
  dependsOn: string[];
}

export interface LayerPegExecutionPathStep {
  step: string;
  expression?: string;
  result?: unknown;
}

export interface LayerPegGateLayer {
  decision: LayerPegGateDecision;
  decisionReason: string;
  policyRef?: string | null;
  entryConditions: string[];
  executionPath: LayerPegExecutionPathStep[];
  dependencyGraph: LayerPegDependencyNode[];
  evaluation: {
    ruleTotal: number;
    passed: number;
    failed: number;
  };
}

export interface LayerPegBodyLayer {
  payloadType: string;
  inputDto: Record<string, unknown>;
  outputDto: Record<string, unknown>;
  data: Record<string, unknown>;
  tables: Array<Record<string, unknown>>;
  formulas: string[];
}

export interface LayerPegSignature {
  signer: string;
  signedAt?: string;
  source?: "human" | "device" | "system";
}

export interface LayerPegAnchorRef {
  anchorId?: string;
  target: string;
  ref: string;
  anchoredAt?: string;
}

export interface LayerPegProofLayer {
  proofHash?: string | null;
  payloadHash?: string | null;
  merkleRoot?: string | null;
  signatures: LayerPegSignature[];
  anchors: LayerPegAnchorRef[];
  evidence: Array<Record<string, unknown>>;
}

export interface LayerPegTransitionRecord {
  from?: LayerPegStateStatus | string;
  to: LayerPegStateStatus | string;
  at: string;
  by?: string;
  reason?: string;
}

export interface LayerPegStateLayer {
  current: LayerPegStateStatus | string;
  stateMachine: string;
  pendingActions: string[];
  transitionRules: string[];
  history: LayerPegTransitionRecord[];
}

export interface LayerPegDocument {
  header: LayerPegHeaderLayer;
  gate: LayerPegGateLayer;
  body: LayerPegBodyLayer;
  proof: LayerPegProofLayer;
  state: LayerPegStateLayer;
}

