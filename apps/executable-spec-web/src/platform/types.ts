export type FieldType = "number" | "string" | "boolean";
export type RuleOperator = ">=" | ">" | "<=" | "<" | "==" | "!=";
export type EntityType = "container" | "node";
export type ContainerLifecycleState = "DRAFT" | "RUNNING" | "VERIFIED" | "ARCHIVED";
export type ContainerOverallStatus = "PENDING" | "PASS" | "FAIL";
export type BindingStatus = "DRAFT" | "RUNNING" | "PASS" | "FAIL";
export type NodeStatus = "DRAFT" | "RUNNING" | "PASS" | "FAIL" | "SIGNING" | "FINAL_PASS" | "FINAL_FAIL";
export type SpuSourceType = "builtin" | "imported" | "compiled";
export type ExternalInputSourceType = "csv" | "device" | "api" | "manual_import";
export type SchedulerTaskStatus = "pending" | "blocked" | "running" | "completed" | "failed";
export type SpecExecutionStatus =
  | "blocked"
  | "ready"
  | "running"
  | "gate_pass"
  | "gate_fail"
  | "signing"
  | "pass"
  | "fail";

export interface SpaceContainerGeoReference {
  station: string;
  coordSystem: string;
  coords: {
    X: number;
    Y: number;
    Z: number;
  };
  gps: {
    lat: number;
    lng: number;
  };
  alignment: string;
}

export interface SpaceContainerApplicableSpec {
  spuId: string;
  status: SchedulerTaskStatus;
  attempts: number;
  latestNode: string | null;
  dependsOn: string[];
}

export interface SpaceContainerNormExecutionModel {
  applicableSpecs: SpaceContainerApplicableSpec[];
  currentState: string;
  gateStatus: string;
  executionOrder: string[];
}

export interface SpaceContainerRuntimeModel {
  activeSpec: string | null;
  activeForm: string;
  pendingActions: string[];
  pendingSignatures: string[];
  lastAction: string;
}

export interface SpaceContainerLifecycleModel {
  state: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

export interface SpaceContainerStandardModel {
  vAddress: string;
  containerType: "space";
  geoReference: SpaceContainerGeoReference;
  normExecution: SpaceContainerNormExecutionModel;
  runtime: SpaceContainerRuntimeModel;
  lifecycle: SpaceContainerLifecycleModel;
}

export interface SchedulerTaskConstraint {
  must_before: string[];
  must_after: string[];
}

export interface SchedulerTaskInput {
  spuId: string;
  status: SchedulerTaskStatus;
  duration_estimate: number;
  priority: number;
  constraints: SchedulerTaskConstraint;
}

export interface SchedulerResource {
  id: string;
  available: boolean;
  type?: string;
}

export interface SchedulerInput {
  containerId: string;
  location: {
    station: string;
    coords: {
      X: number;
      Y: number;
    };
  };
  tasks: SchedulerTaskInput[];
  resources: {
    lab: SchedulerResource[];
    equipment: SchedulerResource[];
  };
  time_constraints: {
    working_hours: string[];
    weather: string;
    season: string;
  };
  space_constraints: {
    neighbor_containers: Array<{
      containerId: string;
      active_task: string;
    }>;
  };
}

export interface SchedulerRecommendation {
  next_task: string | null;
  reason: string[];
}

export interface FormDefinition {
  formCode: string;
  role: string;
  required: boolean;
  title?: string;
}

export interface InputField {
  name: string;
  type: FieldType;
  label: string;
  unit?: string;
  required?: boolean;
  range?: {
    min?: number;
    max?: number;
  };
  acceptedUnits?: string[];
}

export interface OutputField {
  name: string;
  label?: string;
  unit?: string;
}

export interface PathStep {
  step: string;
  formula: string;
}

export interface RuleThresholdRef {
  inputRef?: string;
  outputRef?: string;
  value?: number | string | boolean;
}

export interface RuleDefinition {
  ruleId?: string;
  field: string;
  operator: RuleOperator;
  threshold?: number | string | boolean | RuleThresholdRef;
  value?: number | string | boolean;
  message: string;
}

export interface ProofDefinition {
  resultField: string;
  requiredSignatures: string[];
  schemaVersion?: string;
  extensions?: Record<string, unknown>;
}

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

export type SpecCompatibilityPolicy =
  | "major_breaking"
  | "minor_backward_compatible"
  | "patch_hotfix";
export type SpuClassification = "measurement" | "validation" | "compliance";

export interface SPUDefinition {
  spuId: string;
  meta: {
    name: string;
    norm: string;
    clause: string;
    version: string;
    classification?: SpuClassification;
    domain?: string;
    domainTags?: string[];
    semanticVersion?: SemanticVersion;
    compatibilityPolicy?: SpecCompatibilityPolicy;
    // Legacy fields kept for backward compatibility with existing engineering templates.
    category?: string;
    workItem?: string;
    measuredItem?: string;
    extensions?: Record<string, unknown>;
  };
  forms?: FormDefinition[];
  data: {
    inputs: InputField[];
    outputs: OutputField[];
  };
  path: PathStep[];
  rules: RuleDefinition[];
  proof: ProofDefinition;
  sourceType?: SpuSourceType;
}

export interface SpaceSlot {
  slotId: string;
  vAddress: string;
  slotType: "geo_reference";
  geo: {
    station: string;
    chainage: number;
    x: number;
    y: number;
    elevation: number;
    alignment?: string;
  };
  createdFrom: string;
  isStatic: true;
}

export interface ContainerSpecBinding {
  spuId: string;
  spuKey?: string;
  version?: string;
  semanticVersion?: SemanticVersion;
  status: BindingStatus;
  latestNodeId?: string;
  historyNodeIds: string[];
}

export interface SpaceContainer {
  containerId: string;
  projectId?: string | null;
  vAddress: string;
  vuri?: string;
  geoSlotRef: string;
  lifecycleState: ContainerLifecycleState;
  locked: boolean;
  runtime: {
    currentSpuId: string | null;
    currentNodeId: string | null;
    phase: "idle" | "running" | "signing" | "completed";
  };
  tripBinding: {
    inspector?: string;
    supervisor?: string;
  };
  specBindings: ContainerSpecBinding[];
  overallStatus: ContainerOverallStatus;
  standardModel?: SpaceContainerStandardModel;
}

export interface ProjectSpuVersionBinding {
  projectId: string;
  spuKey: string;
  activeSpuId: string;
  version: string;
  semanticVersion: SemanticVersion;
  compatibilityPolicy: SpecCompatibilityPolicy;
  boundAt: string;
  note?: string;
}

export interface ProjectContextOverrides {
  global: Record<string, unknown>;
  bySpuKey: Record<string, Record<string, unknown>>;
  bySpuId: Record<string, Record<string, unknown>>;
}

export interface ProjectContext {
  projectId: string;
  boundSpuVersions: ProjectSpuVersionBinding[];
  overrides: ProjectContextOverrides;
  activeContainers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectContextSummary {
  projectId: string;
  boundSpuVersionCount: number;
  activeContainerCount: number;
  updatedAt: string;
}

export interface ExternalInputMappingRule {
  sourceField: string;
  targetInput: string;
  typeHint?: FieldType | "auto";
  required?: boolean;
  defaultValue?: number | string | boolean | null;
}

export interface ExternalInputValidationStatus {
  status: "valid" | "warning" | "invalid";
  errors: string[];
  warnings: string[];
  validatedAt: string;
}

export interface ExternalInputSource {
  sourceId: string;
  sourceType: ExternalInputSourceType;
  mappingRules: ExternalInputMappingRule[];
  validationStatus: ExternalInputValidationStatus;
  records: Array<Record<string, unknown>>;
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MappingContainerRef {
  containerId: string;
  vAddress: string;
  vuri?: string;
  lifecycleState: ContainerLifecycleState;
  overallStatus: ContainerOverallStatus;
  runtimePhase: SpaceContainer["runtime"]["phase"];
  currentSpuId: string | null;
  currentNodeId: string | null;
}

export interface MappingNodeRef {
  nodeId: string;
  containerId: string | null;
  vuri?: string;
  spuId: string;
  status: NodeStatus;
  attemptIndex: number;
  updatedAt: string;
}

export interface MappingActiveSpec {
  spuId: string;
  spuKey: string | null;
  bindingStatus: BindingStatus;
  version: string | null;
  latestNodeId: string | null;
  latestNodeStatus: NodeStatus | null;
}

export interface MappingActiveProof {
  proofKind: "node_final" | "container_final";
  proofId: string | null;
  vuri?: string;
  executionId: string | null;
  containerId: string | null;
  nodeId: string | null;
  status: UnifiedProofStatus;
  hash: string | null;
  generatedAt: string | null;
}

export interface MappingStateSummary {
  lifecycleState: ContainerLifecycleState;
  overallStatus: ContainerOverallStatus;
  runtimePhase: SpaceContainer["runtime"]["phase"];
  currentSpuId: string | null;
  currentNodeId: string | null;
  latestNodeId: string | null;
  latestNodeStatus: NodeStatus | null;
  latestProofId: string | null;
  latestProofStatus: UnifiedProofStatus | null;
  updatedAt: string;
}

export interface MappingEntry {
  mappingId: string;
  projectId: string | null;
  stake: string | null;
  location: {
    geoSlotRef: string;
    station: string | null;
    chainage: number | null;
    x: number | null;
    y: number | null;
    elevation: number | null;
    alignment: string | null;
  };
  containerRefs: MappingContainerRef[];
  nodeRefs: MappingNodeRef[];
  activeSpecs: MappingActiveSpec[];
  activeProofs: MappingActiveProof[];
  currentStateSummary: MappingStateSummary;
}

export interface MappingMinimalContainerView {
  container: MappingContainerRef;
  spuExecutionStatuses: MappingActiveSpec[];
  proofSummary: {
    latestProofId: string | null;
    latestProofStatus: UnifiedProofStatus | null;
    totalProofs: number;
    items: MappingActiveProof[];
  };
  currentStateSummary: MappingStateSummary;
}

export interface MappingMinimalStakeSummary {
  containerCount: number;
  totalSpuCount: number;
  draftSpuCount: number;
  runningSpuCount: number;
  passSpuCount: number;
  failSpuCount: number;
  totalProofCount: number;
  lastUpdatedAt: string | null;
}

export interface MappingMinimalStakeView {
  stake: string;
  containers: MappingMinimalContainerView[];
  summary: MappingMinimalStakeSummary;
}

export interface CalculationTrace {
  step: string;
  formula: string;
  context: Record<string, unknown>;
  result: number | string | boolean;
  stepIndex?: number;
  inputSnapshot?: Record<string, unknown>;
  outputField?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RuleResult {
  ruleId: string;
  field: string;
  operator: RuleOperator;
  threshold: number | string | boolean;
  actual: number | string | boolean;
  passed: boolean;
  message: string;
}

export type GateDecision = "PASS" | "BLOCK" | "OVERRIDE";

export interface GateResult {
  passed: boolean;
  decision?: GateDecision;
  override?: {
    approvedBy: string;
    reason: string;
    at: string;
  } | null;
  results: RuleResult[];
}

export interface InputUnitConversion {
  field: string;
  fromUnit: string;
  toUnit: string;
  originalValue: number;
  normalizedValue: number;
}

export interface InputRangeCheck {
  field: string;
  min: number | null;
  max: number | null;
  value: number;
}

export interface InputValidationSnapshot {
  validatedAt: string;
  normalizedInputs: Record<string, unknown>;
  conversions: InputUnitConversion[];
  rangeChecks: InputRangeCheck[];
}

export type ProofKind = "proofFragment" | "finalProof";
export type UnifiedProofStatus = "PASS" | "FAIL" | "BLOCK" | "PENDING";
export type ProofArchiveStatus = "NOT_ARCHIVED" | "ARCHIVED";

export interface ProofRuleMatch {
  ruleId: string;
  condition?: string;
  passed: boolean;
  severity?: string;
  message?: string;
  actual?: unknown;
  expected?: unknown;
}

export interface ProofSignature {
  role: string;
  signer?: string | null;
  signature?: string | null;
  status: "PENDING" | "SIGNED";
  signedAt?: string | null;
}

export interface ProofTimestamps {
  createdAt: string;
  evaluatedAt?: string | null;
  finalizedAt?: string | null;
  archivedAt?: string | null;
}

export interface ProofAnchorReference {
  providerName: string;
  anchorRef: string;
  hash: string | null;
  anchoredAt: string | null;
  status: "ANCHORED" | "NOT_FOUND" | "MISMATCH";
}

export interface ProofChainDependencyRef {
  proofId: string;
  proofHash: string;
  source: "node" | "container";
  nodeId: string | null;
  containerId: string | null;
  timestamp: string;
}

export interface ProofChainLink {
  chainId: string;
  index: number;
  previousProofId: string | null;
  previousProofHash: string | null;
  linkedAt: string;
  dependencies: ProofChainDependencyRef[];
}

export interface UnifiedProofCore {
  kind: ProofKind;
  executionId: string | null;
  spuId: string;
  nodeId: string | null;
  containerId: string | null;
  inputSnapshot: Record<string, unknown>;
  resultSnapshot: Record<string, unknown>;
  matchedSpecVersion: string;
  matchedRules: ProofRuleMatch[];
  status: UnifiedProofStatus;
  signatures: ProofSignature[];
  timestamps: ProofTimestamps;
  archiveStatus: ProofArchiveStatus;
  technicalDetails?: Record<string, unknown>;
  proof_id?: string | null;
  execution_id?: string | null;
  rule_id?: string | null;
  rule_version?: string | null;
  normdoc_id?: string | null;
  package_id?: string | null;
  inputs?: Record<string, unknown>;
  inputs_hash?: string | null;
  result?: string | null;
  decision_trace?: Array<Record<string, unknown>>;
  executor_version?: string | null;
  timestamp?: string | null;
  operator_id?: string | null;
  bundle_hash?: string | null;
  component_id?: string | null;
  clause_id?: string | null;
  path_result?: Record<string, unknown> | null;
  gate_result?: string | null;
  state_before?: string | null;
  state_after?: string | null;
  operator?: string | null;
  evidence_chain?: {
    normdoc_id: string | null;
    bundle_hash: string | null;
    component_id: string | null;
    rule_id: string | null;
    clause_id: string | null;
    clause_content?: string | null;
  };
}

export interface ProofFragment extends UnifiedProofCore {
  kind: "proofFragment";
}

export interface FinalProof extends UnifiedProofCore {
  kind: "finalProof";
  proofId: string;
  vuri?: string;
  hash?: string;
  proofHash?: string;
  proofChain?: ProofChainLink;
  anchorReference?: ProofAnchorReference | null;
  schemaVersion: string;
  extensions?: Record<string, unknown>;
}

export type UnifiedProof = ProofFragment | FinalProof;

export interface NodeProof extends FinalProof {
  nodeId: string;
  containerId: string | null;
  status: "PASS" | "FAIL";
  archiveStatus: "NOT_ARCHIVED";
  resultField: string;
  resultValue: unknown;
  trace: CalculationTrace[];
  gate: GateResult;
  generatedAt: string;
}

export interface ExecutionNode {
  nodeId: string;
  spuId: string;
  containerRef?: string;
  vuri?: string;
  attemptIndex: number;
  status: NodeStatus;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  trace: CalculationTrace[];
  gate: GateResult;
  inputValidation?: InputValidationSnapshot;
  proof?: NodeProof;
  requiredSignatures: string[];
  signedBy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  eventId: string;
  entityType: EntityType;
  entityId: string;
  eventType: string;
  payload: object;
  timestamp: string;
  actor?: string;
}

export interface ContainerProof extends FinalProof {
  executionId: string;
  spuId: "container:aggregate";
  nodeId: null;
  containerId: string;
  status: "PASS" | "FAIL";
  timestamps: ProofTimestamps & {
    archivedAt: string;
  };
  archiveStatus: "ARCHIVED";
  // Compatibility fields used by existing page/export/document builder.
  geoSlotRef: string;
  overallStatus: "PASS" | "FAIL";
  specResults: {
    spuId: string;
    status: string;
    finalNodeId: string;
    attempts: number;
    value?: object;
  }[];
  legacySignatures?: string[];
  auditTrail: AuditEvent[];
  hash?: string;
  archivedAt: string;
  schemaVersion: string;
  extensions?: Record<string, unknown>;
}

export interface PlatformState {
  slots: Record<string, SpaceSlot>;
  containers: Record<string, SpaceContainer>;
  nodes: Record<string, ExecutionNode>;
  proofs: Record<string, ContainerProof>;
  externalInputSources: Record<string, ExternalInputSource>;
  mappingEntries: Record<string, MappingEntry>;
}
