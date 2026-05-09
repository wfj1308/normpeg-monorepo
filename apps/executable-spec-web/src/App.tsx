import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  addOutput,
  buildVAddress,
  createProjectUTXO,
  getUnspentOutputs,
  type Branch,
  type ProjectUTXO,
  type UTXOOutput,
  type UTXOState,
} from "./layerpeg/project-utxo";
import {
  buildMerkleTree,
  createProofRecord,
  generateProofPath,
  getRoot,
  hash,
  verifyProof,
  type MerklePathItem,
  type ProofRecord,
} from "./layerpeg/proof-merkle";

type RuleResult = {
  rule_id: string;
  condition: string;
  severity: string;
  passed: boolean;
  actual_value?: string | number | boolean | null;
  expected_value?: string | number | boolean | null;
  message?: string;
};

type ExecutionResult = {
  execution_id: string;
  component_id: string;
  version: string;
  project_id: string;
  branch_id?: string;
  effective_overrides?: Record<string, unknown>;
  resolved_context?: Record<string, unknown>;
  v_address: string;
  input: Record<string, unknown>;
  normalized_input: Record<string, unknown>;
  path_outputs: Record<string, unknown>;
  path_trace: Array<Record<string, unknown>>;
  gate: {
    rule_results: RuleResult[];
    summary_status: string;
    failed_rule_ids?: string[];
  };
  gate_trace: Array<Record<string, unknown>>;
  state_trace: Array<Record<string, unknown>>;
  proof: Record<string, unknown>;
  final_status: string;
  lifecycle_status: string;
  clause_refs: string[];
  explanation_seed: Record<string, unknown>;
};

type Layer3Response = {
  answer_mode?: "single" | "dual";
  answer: string;
  main_result?: ExecutionResult;
  branch_results?: Record<string, ExecutionResult>;
  parse_trace: Record<string, unknown>;
  execution_request: Record<string, unknown>;
  execution_result: ExecutionResult;
};

type ComponentItem = {
  component_id: string;
  component_name: string;
  source_type?: "builtin" | "specir" | string;
  source_file?: string;
  spec_id?: string | null;
};

type CatalogSummary = {
  catalog_id: string;
  catalog_name: string;
  standard_id: string;
  standard_version: string;
  version: string;
  status: string;
};

type CatalogDetail = Record<string, unknown>;
type CatalogComponent = {
  component_id?: string;
  component_name?: string;
  source_type?: "builtin" | "specir" | string;
  source_file?: string;
  spec_id?: string | null;
  [key: string]: unknown;
};

type CatalogMeasuredItemNode = {
  measured_item_id: string;
  measured_item_name: string;
  spec_id: string;
  test_methods?: string[];
};

type CatalogWorkItemNode = {
  work_item_id: string;
  work_item_name: string;
  measured_items: CatalogMeasuredItemNode[];
};

type CatalogCategoryNode = {
  category_id: string;
  category_name: string;
  work_items: CatalogWorkItemNode[];
};

type CatalogTree = {
  catalog_id: string;
  catalog_name: string;
  categories: CatalogCategoryNode[];
};
type WorkbenchTabKey =
  | "content"
  | "analysis"
  | "indicator"
  | "forms"
  | "mapping"
  | "calc"
  | "reference"

type CatalogExecuteResponse = ExecutionResult & {
  catalog_context?: {
    category?: string;
    work_item?: string;
    measured_item?: string;
  };
};

type ProjectResolvedMeasuredItem = {
  measured_item_id: string;
  measured_item_name: string;
  spec_id: string;
  work_item_id: string;
  category_id: string;
};

type ProjectResolvedScope = {
  catalog_id: string;
  selection_source?: string;
  scope_filters?: Record<string, unknown>;
  selected_spec_ids?: string[];
  category_ids: string[];
  category_names?: string[];
  work_item_ids: string[];
  work_item_names?: string[];
  measured_items: ProjectResolvedMeasuredItem[];
  unresolved_spec_ids?: string[];
  counts?: {
    categories: number;
    work_items: number;
    measured_items: number;
    specs: number;
  };
};

type ProjectInfo = {
  project_id: string;
  catalog_id: string;
  selected_specs: string[];
  overrides: Record<string, unknown>;
  overrides_by_branch?: Record<string, Record<string, unknown>>;
  role_bindings?: Array<Record<string, unknown>>;
  instrument_bindings?: Array<Record<string, unknown>>;
  selection_source?: string;
  scope_filters?: Record<string, unknown>;
  resolved_scope?: ProjectResolvedScope;
  created_at: string;
};

type ProjectExecuteResponse = CatalogExecuteResponse & {
  project_context?: {
    project_id?: string;
    catalog_id?: string;
    branch_id?: string;
    selected_spec?: string;
    resolved_measured_item_id?: string;
    auto_located?: boolean;
    override_applied?: boolean;
    override_source?: string | null;
    resolved_scope?: ProjectResolvedScope;
  };
};

type PatchAnalyzeResponse = {
  change_type?: string;
  update_target: string;
  old_value: unknown;
  new_value: unknown;
  effective_date: string;
  affected_records: Array<Record<string, unknown>>;
  unaffected_records: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  requires_ack: boolean;
};

type CompositeExecutionResult = {
  composite_execution_id: string;
  catalog_id: string;
  work_item_id: string;
  project_id: string;
  overall_status: string;
  gate: Record<string, unknown>;
  component_results: Record<string, ExecutionResult>;
  clause_refs: string[];
  summary: Record<string, unknown>;
};

type CompareBranchesResponse = {
  component_id: string;
  project_id: string;
  comparisons: Record<string, ExecutionResult>;
  diff: Record<string, unknown>;
};

type BranchOverviewResponse = {
  project_id: string;
  current_branch: string;
  active_forks: string[];
  branches: Record<string, Branch>;
};

type AnchorRecord = {
  anchor_id: string;
  proof_hash: string;
  anchor_type: string;
  target_system: string;
  anchored_at: string;
  status: string;
  external_ref: string | null;
};

type ExecutionProofNode = {
  execution_id: string;
  component_id: string;
  proof: ProofRecord;
  merkle_path: MerklePathItem[];
  verified: boolean;
};

const API_PREFIX = "";
const PROJECT_UTXO_ID = "P1";
const DEFAULT_PROJECT_SPECS = ["4.2.1.compaction", "4.2.2.deflection", "4.2.3.thickness"];
const DEFAULT_PROJECT_SCOPE = {
  include_categories: ["subgrade", "pavement", "bridge"],
  include_work_items: [],
  exclude_categories: ["tunnel"],
  exclude_work_items: [],
};
const DEFAULT_PROJECT_ROLE_BINDINGS = [
  {
    did: "did:test:authorized",
    measured_item_ids: ["compaction"],
    actions: ["execute"],
  },
];
const DEFAULT_PROJECT_INSTRUMENT_BINDINGS = [
  {
    instrument_id: "SB_001",
    measured_item_ids: ["compaction"],
    start_stake: "K15+000",
    end_stake: "K20+000",
    valid_from: "2026-01-01T00:00:00Z",
    valid_to: "2026-12-31T23:59:59Z",
  },
];
const DEFAULT_PROJECT_OVERRIDE = {
  standard_by_zone: {
    Z96: 97,
  },
};

const COMPACTION_RESOLVED_SAMPLE = {
  stake: "K15+200",
  layer_depth: "0-0.8m",
  project_id: "P1",
  compaction_degree: 96.2,
  representative_value: 96.0,
  actor_did: "did:ex:zhangsan",
  actor_name: "张三",
  inspected_at: "2026-04-16T10:00:00Z",
  override_requested: false,
};

const COMPACTION_RAW_DATA_SAMPLE = {
  stake: "K15+200",
  layer_depth: "0-0.8m",
  project_id: "P1",
  actor_did: "did:ex:zhangsan",
  actor_name: "张三",
  inspected_at: "2026-04-16T10:00:00Z",
  raw_data: {
    sand_density: { value: 1.45, unit: "g/cm3" },
    mass_hole_sand: { value: 5700.0, unit: "g" },
    volume_ring: { value: 2000.0, unit: "cm3" },
    moisture_content: { value: 4.5, unit: "%" },
    max_dry_density: { value: 1.95, unit: "g/cm3" },
  },
  override_requested: false,
};

const COMPACTION_REJECTED_SAMPLE = {
  ...COMPACTION_RESOLVED_SAMPLE,
  compaction_degree: 94.0,
  representative_value: 93.5,
};

const COMPACTION_OVERRIDDEN_SAMPLE = {
  ...COMPACTION_REJECTED_SAMPLE,
  override_requested: true,
  override_evidence: {
    chief_engineer_did: "did:ex:chief001",
    evidence_id: "proof-ovr-001",
    reason: "Special site condition approved by chief engineer.",
  },
};

const COMPACTION_ARCHIVED_SAMPLE = {
  ...COMPACTION_RESOLVED_SAMPLE,
  archive_requested: true,
};

const INPUT_SAMPLES: Record<string, Record<string, unknown>> = {
  "JTG_F80_1_2017.4.2.1.compaction": COMPACTION_RESOLVED_SAMPLE,
  "JTG_F80_1_2017.4.2.1.flatness": {
    stake: "K20+100",
    project_id: "P1",
    surface_type: "asphalt",
    flatness_measured: 8.5,
    actor_did: "did:ex:lisi",
    inspected_at: "2026-04-16T12:00:00Z",
  },
  "JTG_F80_1_2017.4.2.2.deflection": {
    stake: "K20+100",
    project_id: "P1",
    road_class: "default",
    deflection: 170,
    actor_did: "did:ex:wangwu",
    inspected_at: "2026-04-16T14:00:00Z",
  },
  "JTG_F80_1_2017.4.2.3.thickness": {
    stake: "K20+100",
    project_id: "P1",
    layer_zone: "surface",
    thickness: 206,
    design_thickness: 200,
    actor_did: "did:ex:zhaoliu",
    inspected_at: "2026-04-16T15:00:00Z",
  },
  "JTG_F80_1_2017.4.2.1.compaction_segment_assessment": {
    project_id: "P1",
    segment_id: "SEG-K15+200-K15+260",
    segment_zone: "Z96",
    layer_depth: "0-0.8m",
    min_pass_rate: 1.0,
    actor_did: "did:ex:zhangsan",
    actor_name: "张三",
    inspected_at: "2026-04-16T13:00:00Z",
    points: [
      { stake: "K15+200", compaction_degree: 97.2, representative_value: 97.2 },
      { stake: "K15+220", compaction_degree: 97.0, representative_value: 97.0 },
      { stake: "K15+240", compaction_degree: 97.6, representative_value: 97.6 },
    ],
  },
};

const PATCH_SAMPLE = {
  patch_id: "patch-2026-04-16-z96-threshold",
  component_id: "JTG_F80_1_2017.4.2.1.compaction",
  target: "path.lookup_tables.standard_by_zone.Z96",
  operation: "replace",
  old_value: 95,
  new_value: 96,
  effective_date: "2026-04-16",
  reason: "Standard update raises Z96 minimum threshold.",
  author: "did:ex:quality-admin",
};

const OVERRIDE_SAMPLE = {
  override_id: "override-p1-z96-97",
  component_id: "JTG_F80_1_2017.4.2.1.compaction",
  project_id: "P1",
  target: "path.lookup_tables.standard_by_zone.Z96",
  value: 97,
  approved_by: "did:ex:chief-engineer",
  evidence: {
    doc_id: "ovr-doc-001",
    reason: "项目特批提高标准",
  },
  effective_date: "2026-04-16",
};

const SAMPLE_RECORDS = [
  {
    record_id: "R001",
    component_id: "JTG_F80_1_2017.4.2.1.compaction",
    project_id: "P1",
    inspected_at: "2026-04-15T10:00:00Z",
    path_outputs: { zone_type: "Z96", standard_value: 95, compaction_degree_resolved: 95.5 },
  },
  {
    record_id: "R002",
    component_id: "JTG_F80_1_2017.4.2.1.compaction",
    project_id: "P1",
    inspected_at: "2026-04-15T11:00:00Z",
    path_outputs: { zone_type: "Z96", standard_value: 95, compaction_degree_resolved: 95.0 },
  },
  {
    record_id: "R003",
    component_id: "JTG_F80_1_2017.4.2.1.compaction",
    project_id: "P1",
    inspected_at: "2026-04-15T12:00:00Z",
    path_outputs: { zone_type: "Z96", standard_value: 95, compaction_degree_resolved: 94.3 },
  },
];

const WORK_ITEM_SAMPLE = {
  catalog_id: "JTG_F80_1_2017",
  work_item_id: "earthwork_subgrade_specir_family",
  project_id: "P1",
  component_inputs: {
    "JTG_F80_1_2017.4.2.1.compaction": INPUT_SAMPLES["JTG_F80_1_2017.4.2.1.compaction"],
    "JTG_F80_1_2017.4.2.2.deflection": INPUT_SAMPLES["JTG_F80_1_2017.4.2.2.deflection"],
    "JTG_F80_1_2017.4.2.3.thickness": INPUT_SAMPLES["JTG_F80_1_2017.4.2.3.thickness"],
  },
};

const ANCHOR_CREATE_SAMPLE = {
  proof_hash: "replace_with_proof_hash",
  anchor_type: "mock_anchor",
  target_system: "local_mock_anchor_service",
  external_ref: "mock://anchor/local/demo-001",
};

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(`${API_PREFIX}${url}`);
  if (!resp.ok) throw new Error(await readErrorMessage(resp));
  return (await resp.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(`${API_PREFIX}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await readErrorMessage(resp));
  return (await resp.json()) as T;
}

async function readErrorMessage(resp: Response): Promise<string> {
  const text = (await resp.text()).trim();
  if (text.length === 0) {
    return `${resp.status} ${resp.statusText}`.trim();
  }
  try {
    const payload = JSON.parse(text) as { detail?: unknown; message?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim().length > 0) return payload.detail.trim();
    if (typeof payload.message === "string" && payload.message.trim().length > 0) return payload.message.trim();
  } catch {
    // Keep raw text for non-JSON responses.
  }
  return text;
}

function resolveProjectId(input: Record<string, unknown>): string {
  const projectId = input.project_id;
  if (typeof projectId === "string" && projectId.trim().length > 0) return projectId.trim();
  return PROJECT_UTXO_ID;
}

function normalizeBranchList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("branches 必须是 JSON 数组，例如 [\"main\",\"fork-design-change-001\"]");
  }
  const deduped = Array.from(new Set(value.map((item) => String(item).trim()).filter((item) => item.length > 0)));
  if (deduped.length < 2) {
    throw new Error("branches 至少需要 2 个不重复分支，例如 [\"main\",\"fork-design-change-001\"]");
  }
  return deduped;
}

function getExecutionProofHash(execution: ExecutionResult): string {
  const proofHash = execution.proof?.proof_hash;
  return typeof proofHash === "string" ? proofHash.trim() : "";
}

function buildProofPayload(execution: ExecutionResult, input: Record<string, unknown>): Record<string, unknown> {
  return {
    execution_id: execution.execution_id,
    component_id: execution.component_id,
    project_id: execution.project_id,
    version: execution.version,
    input,
    normalized_input: execution.normalized_input,
    path_outputs: execution.path_outputs,
    final_status: execution.final_status,
    lifecycle_status: execution.lifecycle_status,
  };
}

function toUTXOState(execution: ExecutionResult): UTXOState {
  const lifecycle = execution.lifecycle_status.toUpperCase();
  if (lifecycle === "QUALIFIED") return "QUALIFIED";
  if (lifecycle === "REJECTED") return "REJECTED";
  if (lifecycle === "VALIDATED") return "VALIDATED";
  if (lifecycle === "COMPUTED") return "COMPUTED";
  if (lifecycle === "OVERRIDDEN") return "QUALIFIED";
  return execution.final_status.toUpperCase() === "PASS" ? "QUALIFIED" : "REJECTED";
}

function extractCompactionDegree(execution: ExecutionResult, input: Record<string, unknown>): number | undefined {
  const pathValue = execution.path_outputs.compaction_degree;
  if (typeof pathValue === "number") return pathValue;

  const normalizedValue = execution.normalized_input.compaction_degree;
  if (typeof normalizedValue === "number") return normalizedValue;

  const inputValue = input.compaction_degree;
  if (typeof inputValue === "number") return inputValue;

  return undefined;
}

function buildComponentExecutionOutput(
  execution: ExecutionResult,
  input: Record<string, unknown>,
  projectUTXO: ProjectUTXO,
  proof?: ProofRecord,
): UTXOOutput {
  const stake = typeof input.stake === "string" && input.stake.trim().length > 0 ? input.stake.trim() : execution.component_id;
  const compactionDegree = extractCompactionDegree(execution, input);
  const proofHash = proof?.proof_hash || getExecutionProofHash(execution);
  const layer =
    typeof execution.normalized_input.layer_depth === "string"
      ? execution.normalized_input.layer_depth
      : typeof execution.normalized_input.surface_type === "string"
        ? execution.normalized_input.surface_type
        : undefined;
  const timestamp = (() => {
    const inspectedAt =
      typeof execution.normalized_input.inspected_at === "string"
        ? execution.normalized_input.inspected_at
        : typeof input.inspected_at === "string"
          ? input.inspected_at
          : "";
    const parsed = Date.parse(inspectedAt);
    return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
  })();

  const outputVAddress =
    typeof execution.v_address === "string" && execution.v_address.trim().length > 0
      ? execution.v_address
      : buildVAddress({
          projectId: execution.project_id || projectUTXO.id,
          stake,
          layer,
          timestamp,
        });

  const payload: Record<string, unknown> = {
    result: execution.final_status,
    execution_id: execution.execution_id,
    component_id: execution.component_id,
    version: proofHash || execution.version,
    proof_hash: proofHash || null,
  };
  if (proof) {
    payload.parent_hash = proof.parent_hash;
    payload.merkle_root = proof.merkle_root;
    payload.timestamp = proof.timestamp;
    payload.payload_hash = proof.payload_hash;
  }
  if (typeof compactionDegree === "number") {
    payload.compaction_degree = compactionDegree;
  }

  return {
    utxo_id: `utxo_${execution.execution_id}`,
    v_address: outputVAddress,
    type: "ComponentExecution",
    state: toUTXOState(execution),
    payload,
    created_at: new Date().toISOString(),
    consumed: false,
  };
}
function JsonBlock(_: { title: string; data: unknown }) {
  return null;
}

export default function App() {
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [componentId, setComponentId] = useState("JTG_F80_1_2017.4.2.1.compaction");
  const [branchId, setBranchId] = useState("main");
  const [selectedProjectId, setSelectedProjectId] = useState(PROJECT_UTXO_ID);
  const [projectSpecsText, setProjectSpecsText] = useState(JSON.stringify(DEFAULT_PROJECT_SPECS, null, 2));
  const [projectScopeText, setProjectScopeText] = useState(JSON.stringify(DEFAULT_PROJECT_SCOPE, null, 2));
  const [projectRoleBindingsText, setProjectRoleBindingsText] = useState(
    JSON.stringify(DEFAULT_PROJECT_ROLE_BINDINGS, null, 2),
  );
  const [projectInstrumentBindingsText, setProjectInstrumentBindingsText] = useState(
    JSON.stringify(DEFAULT_PROJECT_INSTRUMENT_BINDINGS, null, 2),
  );
  const [useAutoLocateMeasuredItem, setUseAutoLocateMeasuredItem] = useState(true);
  const [projectOverrideSpecId, setProjectOverrideSpecId] = useState("4.2.1.compaction");
  const [projectOverrideBranchId, setProjectOverrideBranchId] = useState("main");
  const [projectOverrideText, setProjectOverrideText] = useState(JSON.stringify(DEFAULT_PROJECT_OVERRIDE, null, 2));
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [compareBranchesText, setCompareBranchesText] = useState('["main"]');
  const [inputText, setInputText] = useState(
    JSON.stringify(INPUT_SAMPLES["JTG_F80_1_2017.4.2.1.compaction"], null, 2),
  );
  const [executeResult, setExecuteResult] = useState<ExecutionResult | null>(null);
  const [compareResult, setCompareResult] = useState<CompareBranchesResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [branchOverview, setBranchOverview] = useState<BranchOverviewResponse | null>(null);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [projectUTXO, setProjectUTXO] = useState<ProjectUTXO>(() => createProjectUTXO(PROJECT_UTXO_ID));
  const [projectUTXOError, setProjectUTXOError] = useState("");
  const [proofChain, setProofChain] = useState<ExecutionProofNode[]>([]);
  const [merkleRoot, setMerkleRoot] = useState("");
  const [latestProofHash, setLatestProofHash] = useState("");

  const [catalogs, setCatalogs] = useState<CatalogSummary[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState("JTG_F80_1_2017");
  const [catalogDetail, setCatalogDetail] = useState<CatalogDetail | null>(null);
  const [catalogComponents, setCatalogComponents] = useState<CatalogComponent[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogTree, setCatalogTree] = useState<CatalogTree | null>(null);
  const [catalogTreeLoading, setCatalogTreeLoading] = useState(false);
  const [catalogTreeError, setCatalogTreeError] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedClauseId, setSelectedClauseId] = useState("");
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTabKey>("content");
  const [expandedChapterIds, setExpandedChapterIds] = useState<string[]>([]);
  const [expandedSectionIds, setExpandedSectionIds] = useState<string[]>([]);

  const [question, setQuestion] = useState("K15+200 压实度 94% 合格吗？");
  const [nlResult, setNlResult] = useState<Layer3Response | null>(null);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState("");

  const [patchText, setPatchText] = useState(JSON.stringify(PATCH_SAMPLE, null, 2));
  const [overrideText, setOverrideText] = useState(JSON.stringify(OVERRIDE_SAMPLE, null, 2));
  const [recordsText, setRecordsText] = useState(JSON.stringify(SAMPLE_RECORDS, null, 2));
  const [patchResult, setPatchResult] = useState<PatchAnalyzeResponse | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchError, setPatchError] = useState("");

  const [workItemText, setWorkItemText] = useState(JSON.stringify(WORK_ITEM_SAMPLE, null, 2));
  const [workItemResult, setWorkItemResult] = useState<CompositeExecutionResult | null>(null);
  const [workItemLoading, setWorkItemLoading] = useState(false);
  const [workItemError, setWorkItemError] = useState("");
  const [segmentText, setSegmentText] = useState(
    JSON.stringify(INPUT_SAMPLES["JTG_F80_1_2017.4.2.1.compaction_segment_assessment"], null, 2),
  );
  const [segmentResult, setSegmentResult] = useState<ExecutionResult | null>(null);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentError, setSegmentError] = useState("");
  const [stateDemoResult, setStateDemoResult] = useState<ExecutionResult | null>(null);
  const [stateDemoLoading, setStateDemoLoading] = useState(false);
  const [stateDemoError, setStateDemoError] = useState("");
  const [transitionText, setTransitionText] = useState(
    JSON.stringify(
      {
        component_id: "JTG_F80_1_2017.4.2.1.compaction",
        current_state: "VALIDATED",
        trigger: "all_rules_pass",
        meta: { note: "manual state transition demo" },
      },
      null,
      2,
    ),
  );
  const [transitionResult, setTransitionResult] = useState<Record<string, unknown> | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [transitionError, setTransitionError] = useState("");
  const [anchorText, setAnchorText] = useState(JSON.stringify(ANCHOR_CREATE_SAMPLE, null, 2));
  const [anchorQueryHash, setAnchorQueryHash] = useState("");
  const [anchorCreateResult, setAnchorCreateResult] = useState<AnchorRecord | null>(null);
  const [anchorListResult, setAnchorListResult] = useState<AnchorRecord[]>([]);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [anchorError, setAnchorError] = useState("");
  const [normrefPdfFile, setNormrefPdfFile] = useState<File | null>(null);
  const [normrefStandardCode, setNormrefStandardCode] = useState("JTG F80/1-2017");
  const [normrefPdfOptionsText, setNormrefPdfOptionsText] = useState(
    JSON.stringify(
      {
        extractTables: true,
        extractFormulas: true,
      },
      null,
      2,
    ),
  );
  const [normrefSpuPayloadText, setNormrefSpuPayloadText] = useState(
    JSON.stringify(
      {
        parseId: "",
        clauseId: "4.2.1",
        standardCode: "JTG F80/1-2017",
        options: { includeForm: true, includePath: true, includeGate: true },
      },
      null,
      2,
    ),
  );
  const [normrefGatePayloadText, setNormrefGatePayloadText] = useState(
    JSON.stringify(
      {
        spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
        inputs: {
          massHoleSand: 2850.5,
          volumeSand: 2000,
          moistureContent: 8.5,
          maxDryDensity: 2.35,
        },
        context: {
          projectId: "dajin-2024",
          layerZone: "96区",
          vuri: "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
        },
      },
      null,
      2,
    ),
  );
  const [normrefPathPayloadText, setNormrefPathPayloadText] = useState(
    JSON.stringify(
      {
        spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
        inputs: {
          massHoleSand: 2850.5,
          volumeSand: 2000,
          moistureContent: 8.5,
          maxDryDensity: 2.35,
        },
        context: {
          projectId: "dajin-2024",
          layerZone: "96区",
        },
      },
      null,
      2,
    ),
  );
  const [normrefStatePayloadText, setNormrefStatePayloadText] = useState(
    JSON.stringify(
      {
        vuri: "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
        spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
        fromState: "COMPUTED",
        toState: "VALIDATED",
        triggeredBy: "did:peg:ins_001",
        signatures: { lab: "0xsign123" },
      },
      null,
      2,
    ),
  );
  const [normrefProofPayloadText, setNormrefProofPayloadText] = useState(
    JSON.stringify(
      {
        proofId: "",
        proofHash: "",
        verifyOptions: {
          includeTrace: true,
          verifySignatures: true,
          checkAnchor: true,
        },
      },
      null,
      2,
    ),
  );
  const [normrefMappingPayloadText, setNormrefMappingPayloadText] = useState(
    JSON.stringify(
      {
        vuri: "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
        context: {
          layer: "96区",
          time: "2026-04-17T10:00:00Z",
        },
      },
      null,
      2,
    ),
  );
  const [normrefImagePayloadText, setNormrefImagePayloadText] = useState(
    JSON.stringify(
      {
        imageUrl: "https://example.com/site.jpg",
        options: { ocrText: "K15+200 compaction 95.0%" },
      },
      null,
      2,
    ),
  );
  const [normrefVoicePayloadText, setNormrefVoicePayloadText] = useState(
    JSON.stringify(
      {
        audioText: "K15+200 compaction 95.0",
      },
      null,
      2,
    ),
  );
  const [normrefSpecPayloadText, setNormrefSpecPayloadText] = useState(
    JSON.stringify(
      {
        spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
      },
      null,
      2,
    ),
  );
  const [normrefFormPayloadText, setNormrefFormPayloadText] = useState(
    JSON.stringify(
      {
        spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
        context: { layer: "96区" },
        values: {},
      },
      null,
      2,
    ),
  );
  const [normrefReportPayloadText, setNormrefReportPayloadText] = useState(
    JSON.stringify(
      {
        reportType: "quality_assessment",
        projectId: "dajin-2024",
        scope: { startStake: "K15+000", endStake: "K16+000" },
        data: { passCount: 10, failCount: 1 },
      },
      null,
      2,
    ),
  );
  const [normrefResponseMap, setNormrefResponseMap] = useState<Record<string, unknown>>({});
  const [normrefLoading, setNormrefLoading] = useState(false);
  const [normrefError, setNormrefError] = useState("");

  useEffect(() => {
    const loadComponents = async () => {
      try {
        const data = await getJson<{ items: ComponentItem[] }>("/api/v1/components");
        if (Array.isArray(data.items) && data.items.length > 0) setComponents(data.items);
      } catch {
        setComponents([
          { component_id: "JTG_F80_1_2017.4.2.1.compaction", component_name: "压实度", source_type: "builtin" },
          { component_id: "JTG_F80_1_2017.4.2.1.flatness", component_name: "平整度", source_type: "builtin" },
          {
            component_id: "JTG_F80_1_2017.4.2.1.compaction_segment_assessment",
            component_name: "压实度段落评定",
            source_type: "builtin",
          },
        ]);
      }
    };
    void loadComponents();
  }, []);

  useEffect(() => {
    const loadCatalogs = async () => {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const data = await getJson<{ items: CatalogSummary[] }>("/api/v1/catalogs");
        if (Array.isArray(data.items)) {
          setCatalogs(data.items);
          if (data.items.length > 0 && !selectedCatalogId) {
            setSelectedCatalogId(data.items[0].catalog_id);
          }
        }
      } catch (err) {
        setCatalogError(String(err));
      } finally {
        setCatalogLoading(false);
      }
    };
    void loadCatalogs();
  }, [selectedCatalogId]);

  useEffect(() => {
    const loadCatalogTree = async () => {
      setCatalogTreeLoading(true);
      setCatalogTreeError("");
      try {
        const data = await getJson<CatalogTree>("/api/v1/catalog");
        setCatalogTree(data);
      } catch (err) {
        setCatalogTreeError(String(err));
      } finally {
        setCatalogTreeLoading(false);
      }
    };
    void loadCatalogTree();
  }, []);

  useEffect(() => {
    if (!selectedCatalogId) return;
    const loadCatalogDetail = async () => {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const [detail, componentsResp] = await Promise.all([
          getJson<CatalogDetail>(`/api/v1/catalogs/${selectedCatalogId}`),
          getJson<{ items: CatalogComponent[] }>(`/api/v1/catalogs/${selectedCatalogId}/components`),
        ]);
        setCatalogDetail(detail);
        setCatalogComponents(Array.isArray(componentsResp.items) ? componentsResp.items : []);
      } catch (err) {
        setCatalogError(String(err));
      } finally {
        setCatalogLoading(false);
      }
    };
    void loadCatalogDetail();
  }, [selectedCatalogId]);

  useEffect(() => {
    const executionProofHash = executeResult ? getExecutionProofHash(executeResult) : "";
    const proofHash = executionProofHash || latestProofHash;
    if (proofHash.length === 0) return;

    setAnchorQueryHash(proofHash);
    setAnchorText((prev) => {
      try {
        const parsed = JSON.parse(prev) as Record<string, unknown>;
        return JSON.stringify({ ...parsed, proof_hash: proofHash }, null, 2);
      } catch {
        return JSON.stringify({ ...ANCHOR_CREATE_SAMPLE, proof_hash: proofHash }, null, 2);
      }
    });
  }, [executeResult, latestProofHash]);

  const componentOptions = useMemo<ComponentItem[]>(() => {
    const fromCatalog = catalogComponents
      .map<ComponentItem | null>((item) => {
        const component_id = typeof item.component_id === "string" ? item.component_id : "";
        const component_name =
          typeof item.component_name === "string" && item.component_name.trim().length > 0
            ? item.component_name
            : component_id;
        if (!component_id) return null;
        return {
          component_id,
          component_name,
          source_type: typeof item.source_type === "string" ? item.source_type : undefined,
          source_file: typeof item.source_file === "string" ? item.source_file : undefined,
          spec_id: typeof item.spec_id === "string" ? item.spec_id : null,
        };
      })
      .filter((item): item is ComponentItem => item !== null);

    const merged = new Map<string, ComponentItem>();
    for (const item of components) {
      merged.set(item.component_id, item);
    }
    for (const item of fromCatalog) {
      const prev = merged.get(item.component_id);
      merged.set(item.component_id, {
        ...prev,
        ...item,
        component_name: item.component_name || prev?.component_name || item.component_id,
      });
    }
    return Array.from(merged.values()).sort((a, b) => a.component_id.localeCompare(b.component_id));
  }, [catalogComponents, components]);

  const selectedComponentOption = useMemo(
    () => componentOptions.find((item) => item.component_id === componentId) || null,
    [componentId, componentOptions],
  );

  const measuredItemBySpecId = useMemo(() => {
    const mapping = new Map<string, string>();
    if (!catalogTree) return mapping;
    for (const category of catalogTree.categories) {
      for (const workItem of category.work_items) {
        for (const measuredItem of workItem.measured_items) {
          const key = measuredItem.spec_id.trim();
          if (key.length > 0) {
            mapping.set(key, measuredItem.measured_item_id);
          }
        }
      }
    }
    return mapping;
  }, [catalogTree]);

  useEffect(() => {
    if (componentOptions.length === 0) return;
    const exists = componentOptions.some((item) => item.component_id === componentId);
    if (!exists) {
      const next = componentOptions[0].component_id;
      setComponentId(next);
      const sample = INPUT_SAMPLES[next] || { project_id: selectedProjectId || "P1" };
      setInputText(JSON.stringify(ensureInputHasProjectId(sample), null, 2));
    }
  }, [componentId, componentOptions, selectedProjectId]);

  const statusClass = useMemo(() => {
    const status = (executeResult?.final_status || "").toUpperCase();
    if (status === "PASS") return "status pass";
    if (status === "WARNING") return "status warning";
    return "status fail";
  }, [executeResult?.final_status]);

  const projectUTXOUnspentOutputs = useMemo(() => getUnspentOutputs(projectUTXO), [projectUTXO]);

  const ensureInputHasProjectId = (input: Record<string, unknown>): Record<string, unknown> => {
    const normalizedProjectId = selectedProjectId.trim() || resolveProjectId(input);
    return { ...input, project_id: normalizedProjectId };
  };

  const changeComponent = (nextId: string) => {
    setComponentId(nextId);
    const sample = INPUT_SAMPLES[nextId] || { project_id: selectedProjectId || "P1" };
    setInputText(JSON.stringify(ensureInputHasProjectId(sample), null, 2));
  };

  const availableBranchIds = useMemo(() => Object.keys(branchOverview?.branches || {}), [branchOverview]);
  const availableBranchSummary = useMemo(
    () =>
      availableBranchIds
        .map((item) => {
          const status = branchOverview?.branches?.[item]?.status || "UNKNOWN";
          return `${item} (${status})`;
        })
        .join(", "),
    [availableBranchIds, branchOverview],
  );

  const loadBranchOverview = async (projectId: string): Promise<BranchOverviewResponse> => {
    const normalizedProjectId = projectId.trim() || PROJECT_UTXO_ID;
    setBranchLoading(true);
    setBranchError("");
    try {
      const data = await getJson<BranchOverviewResponse>(
        `/api/v1/project/${encodeURIComponent(normalizedProjectId)}/branches`,
      );
      setBranchOverview(data);
      return data;
    } catch (err) {
      const message = String(err);
      setBranchError(message);
      throw err;
    } finally {
      setBranchLoading(false);
    }
  };

  const parseProjectIdFromInputText = (): string => {
    const selected = selectedProjectId.trim();
    if (selected.length > 0) return selected;
    try {
      const input = JSON.parse(inputText) as Record<string, unknown>;
      return resolveProjectId(input);
    } catch {
      return PROJECT_UTXO_ID;
    }
  };

  const refreshBranchOverview = async () => {
    try {
      await loadBranchOverview(parseProjectIdFromInputText());
    } catch {
      // Error message is already stored in branchError state.
    }
  };

  const fillCompareBranchesFromActiveForks = () => {
    const candidates = ["main", ...(branchOverview?.active_forks || [])];
    const deduped = Array.from(new Set(candidates.filter((item) => item.trim().length > 0)));
    setCompareBranchesText(JSON.stringify(deduped, null, 0));
    if (deduped.length < 2) {
      setCompareError("当前项目暂无 ACTIVE fork，请先创建分支后再执行对比。");
      return;
    }
    setCompareError("");
  };

  const loadProject = async () => {
    const projectId = selectedProjectId.trim();
    if (projectId.length === 0) {
      setProjectError("project_id 不能为空");
      return;
    }
    setProjectLoading(true);
    setProjectError("");
    try {
      const data = await getJson<ProjectInfo>(`/api/v1/project/${encodeURIComponent(projectId)}`);
      setProjectInfo(data);
      if (data.overrides_by_branch?.main) {
        const specIds = Object.keys(data.overrides_by_branch.main);
        if (specIds.length > 0) {
          setProjectOverrideSpecId(specIds[0]);
        }
      }
    } catch (err) {
      setProjectError(String(err));
      setProjectInfo(null);
    } finally {
      setProjectLoading(false);
    }
  };

  const createProject = async () => {
    const projectId = selectedProjectId.trim();
    if (projectId.length === 0) {
      setProjectError("project_id 不能为空");
      return;
    }
    setProjectLoading(true);
    setProjectError("");
    try {
      const selectedSpecsRaw = JSON.parse(projectSpecsText) as unknown;
      if (!Array.isArray(selectedSpecsRaw)) {
        throw new Error("selected_specs 必须是 JSON 数组");
      }
      const selectedSpecs = selectedSpecsRaw.map((item) => String(item).trim()).filter((item) => item.length > 0);
      const scope = parseObjectText(projectScopeText, "project.scope_filters");
      const includeCategories = Array.isArray(scope.include_categories)
        ? scope.include_categories.map((item) => String(item).trim()).filter((item) => item.length > 0)
        : [];
      const includeWorkItems = Array.isArray(scope.include_work_items)
        ? scope.include_work_items.map((item) => String(item).trim()).filter((item) => item.length > 0)
        : [];
      const excludeCategories = Array.isArray(scope.exclude_categories)
        ? scope.exclude_categories.map((item) => String(item).trim()).filter((item) => item.length > 0)
        : [];
      const excludeWorkItems = Array.isArray(scope.exclude_work_items)
        ? scope.exclude_work_items.map((item) => String(item).trim()).filter((item) => item.length > 0)
        : [];
      const data = await postJson<ProjectInfo>("/api/v1/project/create", {
        project_id: projectId,
        catalog_id: catalogTree?.catalog_id || selectedCatalogId || "JTG_F80_1_2017",
        selected_specs: selectedSpecs,
        include_categories: includeCategories,
        include_work_items: includeWorkItems,
        exclude_categories: excludeCategories,
        exclude_work_items: excludeWorkItems,
      });
      setProjectInfo(data);
      await refreshBranchOverview();
      setInputText((prev) => {
        try {
          const parsed = JSON.parse(prev) as Record<string, unknown>;
          return JSON.stringify(ensureInputHasProjectId(parsed), null, 2);
        } catch {
          return JSON.stringify({ project_id: projectId }, null, 2);
        }
      });
    } catch (err) {
      setProjectError(String(err));
    } finally {
      setProjectLoading(false);
    }
  };

  const saveProjectRoleBindings = async () => {
    const projectId = selectedProjectId.trim();
    if (projectId.length === 0) {
      setProjectError("project_id 不能为空");
      return;
    }
    setProjectLoading(true);
    setProjectError("");
    try {
      const bindingsRaw = JSON.parse(projectRoleBindingsText) as unknown;
      if (!Array.isArray(bindingsRaw)) {
        throw new Error("role_bindings 必须是 JSON 数组");
      }
      await postJson<Record<string, unknown>>("/api/v1/project/role-bindings", {
        project_id: projectId,
        bindings: bindingsRaw,
      });
      await loadProject();
    } catch (err) {
      setProjectError(String(err));
    } finally {
      setProjectLoading(false);
    }
  };

  const saveProjectInstrumentBindings = async () => {
    const projectId = selectedProjectId.trim();
    if (projectId.length === 0) {
      setProjectError("project_id 不能为空");
      return;
    }
    setProjectLoading(true);
    setProjectError("");
    try {
      const bindingsRaw = JSON.parse(projectInstrumentBindingsText) as unknown;
      if (!Array.isArray(bindingsRaw)) {
        throw new Error("instrument_bindings 必须是 JSON 数组");
      }
      await postJson<Record<string, unknown>>("/api/v1/project/instrument-bindings", {
        project_id: projectId,
        bindings: bindingsRaw,
      });
      await loadProject();
    } catch (err) {
      setProjectError(String(err));
    } finally {
      setProjectLoading(false);
    }
  };

  const saveProjectOverride = async () => {
    const projectId = selectedProjectId.trim();
    if (projectId.length === 0) {
      setProjectError("project_id 不能为空");
      return;
    }
    setProjectLoading(true);
    setProjectError("");
    try {
      const override = JSON.parse(projectOverrideText) as Record<string, unknown>;
      await postJson<Record<string, unknown>>("/api/v1/project/override", {
        project_id: projectId,
        spec_id: projectOverrideSpecId,
        branch_id: projectOverrideBranchId.trim() || "main",
        override,
      });
      await loadProject();
    } catch (err) {
      setProjectError(String(err));
    } finally {
      setProjectLoading(false);
    }
  };

  useEffect(() => {
    void refreshBranchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProjectId.trim()) return;
    void refreshBranchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const appendExecutionBatch = async (batch: Array<{ execution: ExecutionResult; input: Record<string, unknown> }>) => {
    if (batch.length === 0) return;
    setProjectUTXOError("");

    try {
      const previousProofs = proofChain.map((item) => item.proof);
      let parentHash = previousProofs.length > 0 ? previousProofs[previousProofs.length - 1].proof_hash : "";
      const freshProofs: ProofRecord[] = [];

      for (const item of batch) {
        const payload = buildProofPayload(item.execution, item.input);
        const payloadHash = await hash(payload);
        const externalProofHash = getExecutionProofHash(item.execution);

        if (externalProofHash) {
          freshProofs.push({
            proof_hash: externalProofHash,
            parent_hash: parentHash,
            merkle_root: "",
            timestamp: new Date().toISOString(),
            payload_hash: payloadHash,
          });
        } else {
          freshProofs.push(await createProofRecord(payload, parentHash));
        }

        parentHash = freshProofs[freshProofs.length - 1].proof_hash;
      }

      const allProofs = [...previousProofs, ...freshProofs];
      const tree = await buildMerkleTree(allProofs);
      const root = getRoot(tree);
      const proofsWithRoot = allProofs.map((proof) => ({ ...proof, merkle_root: root }));

      const nextProofChain: ExecutionProofNode[] = [];
      for (let index = 0; index < proofsWithRoot.length; index += 1) {
        const proof = proofsWithRoot[index];
        const path = generateProofPath(tree, proof.proof_hash);
        const verified = await verifyProof(proof.proof_hash, path, root);

        if (index < proofChain.length) {
          const existing = proofChain[index];
          nextProofChain.push({
            ...existing,
            proof,
            merkle_path: path,
            verified,
          });
        } else {
          const batchIndex = index - proofChain.length;
          const item = batch[batchIndex];
          nextProofChain.push({
            execution_id: item.execution.execution_id,
            component_id: item.execution.component_id,
            proof,
            merkle_path: path,
            verified,
          });
        }
      }

      let nextProjectUTXO = projectUTXO;
      const freshProofsWithRoot = proofsWithRoot.slice(previousProofs.length);
      for (let index = 0; index < batch.length; index += 1) {
        const item = batch[index];
        const nextOutput = buildComponentExecutionOutput(
          item.execution,
          item.input,
          nextProjectUTXO,
          freshProofsWithRoot[index],
        );
        if (nextProjectUTXO.unspent_outputs[nextOutput.utxo_id]) {
          setProjectUTXOError(`UTXO already exists: ${nextOutput.utxo_id}`);
          return;
        }
        nextProjectUTXO = addOutput(nextProjectUTXO, nextOutput);
      }

      setProjectUTXO(nextProjectUTXO);
      setProofChain(nextProofChain);
      setMerkleRoot(root);
      const latestProof = freshProofsWithRoot[freshProofsWithRoot.length - 1];
      if (latestProof) {
        setLatestProofHash(latestProof.proof_hash);
      }
    } catch (err) {
      setProjectUTXOError(String(err));
    }
  };

  const appendExecutionOutput = async (execution: ExecutionResult, input: Record<string, unknown>) => {
    await appendExecutionBatch([{ execution, input }]);
  };

  const execute = async () => {
    setLoading(true);
    setError("");
    setExecuteResult(null);
    try {
      const parsedInput = JSON.parse(inputText) as Record<string, unknown>;
      const input = ensureInputHasProjectId(parsedInput);
      const projectId = resolveProjectId(input);
      const selectedBranch = branchId.trim() || "main";
      const overview = await loadBranchOverview(projectId);
      const selectedBranchMeta = overview.branches[selectedBranch];
      if (!selectedBranchMeta) {
        const available = Object.keys(overview.branches);
        throw new Error(`branch 不存在: ${selectedBranch}。当前可用分支: ${available.join(", ")}`);
      }
      if (selectedBranchMeta.status !== "ACTIVE") {
        throw new Error(`branch 不是 ACTIVE 状态: ${selectedBranch} (${selectedBranchMeta.status})`);
      }
      const selected = componentOptions.find((item) => item.component_id === componentId) || null;
      const sourceType = typeof selected?.source_type === "string" ? selected.source_type.toLowerCase() : "";
      const specId =
        (typeof selected?.spec_id === "string" && selected.spec_id.trim().length > 0
          ? selected.spec_id.trim()
          : componentId.trim()) || componentId.trim();
      const measuredItemId = measuredItemBySpecId.get(specId);

      const data =
        sourceType === "specir"
          ? measuredItemId && !useAutoLocateMeasuredItem
            ? await postJson<ProjectExecuteResponse>("/api/v1/project/execute", {
                project_id: projectId,
                measured_item_id: measuredItemId,
                input,
                branch_id: selectedBranch,
              })
            : await postJson<ExecutionResult>(`/api/v1/specir/execute/${encodeURIComponent(specId)}`, {
                input,
                branch_id: selectedBranch,
              })
          : await postJson<ExecutionResult>("/api/v1/execute/component", {
              component_id: componentId,
              input,
              branch_id: selectedBranch,
            });
      setExecuteResult(data);
      await appendExecutionOutput(data, input);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const runCatalogMeasuredItem = async (
    category: CatalogCategoryNode,
    workItem: CatalogWorkItemNode,
    measuredItem: CatalogMeasuredItemNode,
  ) => {
    setLoading(true);
    setError("");
    setExecuteResult(null);
    const catalogHint = `${category.category_name}/${workItem.work_item_name}/${measuredItem.measured_item_name}`;
    try {
      const sampleInput = INPUT_SAMPLES[measuredItem.spec_id] || { project_id: "P1" };
      const input = ensureInputHasProjectId(JSON.parse(JSON.stringify(sampleInput)) as Record<string, unknown>);
      setComponentId(measuredItem.spec_id);
      setInputText(JSON.stringify(input, null, 2));

      const projectId = resolveProjectId(input);
      const selectedBranch = branchId.trim() || "main";
      const overview = await loadBranchOverview(projectId);
      const selectedBranchMeta = overview.branches[selectedBranch];
      if (!selectedBranchMeta) {
        const available = Object.keys(overview.branches);
        throw new Error(`branch 不存在: ${selectedBranch}。当前可用分支: ${available.join(", ")}`);
      }
      if (selectedBranchMeta.status !== "ACTIVE") {
        throw new Error(`branch 不是 ACTIVE 状态: ${selectedBranch} (${selectedBranchMeta.status})`);
      }

      const data = await postJson<ProjectExecuteResponse>("/api/v1/project/execute", {
        project_id: projectId,
        measured_item_id: measuredItem.measured_item_id,
        input,
        branch_id: selectedBranch,
      });
      setExecuteResult(data);
      await appendExecutionOutput(data, input);
    } catch (err) {
      setError(`${catalogHint}: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const compareBranches = async () => {
    setCompareLoading(true);
    setCompareError("");
    setCompareResult(null);
    try {
      const input = JSON.parse(inputText) as Record<string, unknown>;
      const projectId = resolveProjectId(input);
      const overview = await loadBranchOverview(projectId);
      const normalizedBranches = normalizeBranchList(JSON.parse(compareBranchesText) as unknown);
      if (overview.active_forks.length === 0) {
        throw new Error("当前项目没有 ACTIVE fork。请先 fork 分支后再执行 compare-branches。");
      }
      const missingBranches = normalizedBranches.filter((item) => !overview.branches[item]);
      if (missingBranches.length > 0) {
        const available = Object.keys(overview.branches);
        throw new Error(
          `分支不存在: ${missingBranches.join(", ")}。当前可用分支: ${available.join(", ") || "main"}`,
        );
      }
      const inactiveBranches = normalizedBranches.filter((item) => overview.branches[item]?.status !== "ACTIVE");
      if (inactiveBranches.length > 0) {
        throw new Error(
          `仅支持 ACTIVE 分支对比，以下分支不可用: ${inactiveBranches
            .map((item) => `${item} (${overview.branches[item]?.status || "UNKNOWN"})`)
            .join(", ")}`,
        );
      }
      const data = await postJson<CompareBranchesResponse>("/api/v1/execute/component/compare-branches", {
        component_id: componentId,
        input,
        branches: normalizedBranches,
      });
      setCompareResult(data);
    } catch (err) {
      setCompareError(String(err));
    } finally {
      setCompareLoading(false);
    }
  };

  const fillCompactionResolvedSample = () => {
    setComponentId("JTG_F80_1_2017.4.2.1.compaction");
    setInputText(JSON.stringify(ensureInputHasProjectId(COMPACTION_RESOLVED_SAMPLE), null, 2));
  };

  const fillCompactionRawDataSample = () => {
    setComponentId("JTG_F80_1_2017.4.2.1.compaction");
    setInputText(JSON.stringify(ensureInputHasProjectId(COMPACTION_RAW_DATA_SAMPLE), null, 2));
  };

  const askNl = async () => {
    setNlLoading(true);
    setNlError("");
    setNlResult(null);
    try {
      const data = await postJson<Layer3Response>("/api/v1/layer3/query", {
        message: question,
        project_id: selectedProjectId.trim() || "P1",
      });
      setNlResult(data);
      await appendExecutionOutput(data.execution_result, data.execution_result.normalized_input);
    } catch (err) {
      setNlError(String(err));
    } finally {
      setNlLoading(false);
    }
  };

  const runPatchDemo = async () => {
    setPatchLoading(true);
    setPatchError("");
    setPatchResult(null);
    try {
      const patch = JSON.parse(patchText) as Record<string, unknown>;
      const records = JSON.parse(recordsText) as Array<Record<string, unknown>>;
      const data = await postJson<PatchAnalyzeResponse>("/api/v1/patch/analyze", { patch, records });
      setPatchResult(data);
    } catch (err) {
      setPatchError(String(err));
    } finally {
      setPatchLoading(false);
    }
  };

  const runOverrideDemo = async () => {
    setPatchLoading(true);
    setPatchError("");
    setPatchResult(null);
    try {
      const overridePayload = JSON.parse(overrideText) as Record<string, unknown>;
      const records = JSON.parse(recordsText) as Array<Record<string, unknown>>;
      const data = await postJson<PatchAnalyzeResponse>("/api/v1/patch/analyze", { patch: overridePayload, records });
      setPatchResult(data);
    } catch (err) {
      setPatchError(String(err));
    } finally {
      setPatchLoading(false);
    }
  };

  const runWorkItem = async () => {
    setWorkItemLoading(true);
    setWorkItemError("");
    setWorkItemResult(null);
    try {
      const payload = JSON.parse(workItemText) as Record<string, unknown>;
      const data = await postJson<CompositeExecutionResult>("/api/v1/execute/work-item", payload);
      setWorkItemResult(data);
      const batchItems = Object.values(data.component_results).map((result) => ({
        execution: result,
        input: result.normalized_input,
      }));
      await appendExecutionBatch(batchItems);
    } catch (err) {
      setWorkItemError(String(err));
    } finally {
      setWorkItemLoading(false);
    }
  };

  const runSegmentDemo = async () => {
    setSegmentLoading(true);
    setSegmentError("");
    setSegmentResult(null);
    try {
      const input = JSON.parse(segmentText) as Record<string, unknown>;
      const data = await postJson<ExecutionResult>("/api/v1/execute/component", {
        component_id: "JTG_F80_1_2017.4.2.1.compaction_segment_assessment",
        input,
      });
      setSegmentResult(data);
      await appendExecutionOutput(data, input);
    } catch (err) {
      setSegmentError(String(err));
    } finally {
      setSegmentLoading(false);
    }
  };

  const runLifecycleScenario = async (input: Record<string, unknown>) => {
    setStateDemoLoading(true);
    setStateDemoError("");
    setStateDemoResult(null);
    try {
      const data = await postJson<ExecutionResult>("/api/v1/execute/component", {
        component_id: "JTG_F80_1_2017.4.2.1.compaction",
        input,
      });
      setStateDemoResult(data);
      await appendExecutionOutput(data, input);
    } catch (err) {
      setStateDemoError(String(err));
    } finally {
      setStateDemoLoading(false);
    }
  };

  const runStateTransition = async () => {
    setTransitionLoading(true);
    setTransitionError("");
    setTransitionResult(null);
    try {
      const payload = JSON.parse(transitionText) as Record<string, unknown>;
      const data = await postJson<Record<string, unknown>>("/api/v1/state/transition", payload);
      setTransitionResult(data);
    } catch (err) {
      setTransitionError(String(err));
    } finally {
      setTransitionLoading(false);
    }
  };

  const createAnchor = async () => {
    setAnchorLoading(true);
    setAnchorError("");
    setAnchorCreateResult(null);
    try {
      const payload = JSON.parse(anchorText) as Record<string, unknown>;
      const data = await postJson<{ item: AnchorRecord }>("/api/v1/proof/anchor", payload);
      setAnchorCreateResult(data.item);
      if (typeof data.item?.proof_hash === "string" && data.item.proof_hash.length > 0) {
        setAnchorQueryHash(data.item.proof_hash);
      }
    } catch (err) {
      setAnchorError(String(err));
    } finally {
      setAnchorLoading(false);
    }
  };

  const queryAnchors = async () => {
    setAnchorLoading(true);
    setAnchorError("");
    setAnchorListResult([]);
    try {
      const proofHash = anchorQueryHash.trim();
      const data = await getJson<{ proof_hash: string; items: AnchorRecord[] }>(
        `/api/v1/proof/${encodeURIComponent(proofHash)}/anchors`,
      );
      setAnchorListResult(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setAnchorError(String(err));
    } finally {
      setAnchorLoading(false);
    }
  };

  const parseObjectText = (text: string, fieldName: string): Record<string, unknown> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${fieldName} 不是合法 JSON`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${fieldName} 必须是 JSON 对象`);
    }
    return parsed as Record<string, unknown>;
  };

  const asObject = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  };

  const setNormrefPayloadText = (
    setter: (value: string | ((prev: string) => string)) => void,
    update: (payload: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    setter((prev) => {
      let base: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(prev) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          base = parsed as Record<string, unknown>;
        }
      } catch {
        base = {};
      }
      return JSON.stringify(update(base), null, 2);
    });
  };

  const saveNormrefResponse = (key: string, payload: unknown) => {
    setNormrefResponseMap((prev) => ({ ...prev, [key]: payload }));
  };

  const buildDemoPdfFile = () => {
    const demoPdf = [
      "%PDF-1.4",
      "1 0 obj",
      "<< /Type /Catalog /Pages 2 0 R >>",
      "endobj",
      "2 0 obj",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "endobj",
      "3 0 obj",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>",
      "endobj",
      "4 0 obj",
      "<< /Length 55 >>",
      "stream",
      "BT /F1 12 Tf 10 10 Td (4.2.1 Compaction Demo) Tj ET",
      "endstream",
      "endobj",
      "xref",
      "0 5",
      "0000000000 65535 f ",
      "0000000010 00000 n ",
      "0000000060 00000 n ",
      "0000000117 00000 n ",
      "0000000208 00000 n ",
      "trailer",
      "<< /Root 1 0 R /Size 5 >>",
      "startxref",
      "320",
      "%%EOF",
    ].join("\n");
    setNormrefPdfFile(new File([demoPdf], "JTG_F80_1_2017.pdf", { type: "application/pdf" }));
  };

  const callNormrefJsonEndpoint = async (key: string, url: string, payloadText: string): Promise<unknown> => {
    const payload = parseObjectText(payloadText, key);
    const data = await postJson<unknown>(url, payload);
    saveNormrefResponse(key, data);
    return data;
  };

  const requestNormrefPdfParse = async (): Promise<Record<string, unknown>> => {
    if (!normrefPdfFile) {
      throw new Error("请先选择 PDF 文件，或点击“加载演示 PDF”");
    }
    const options = parseObjectText(normrefPdfOptionsText, "pdf.options");
    const formData = new FormData();
    formData.append("file", normrefPdfFile, normrefPdfFile.name);
    formData.append("standardCode", normrefStandardCode);
    formData.append("options", JSON.stringify(options));
    const resp = await fetch("/api/v1/pdf/parse", {
      method: "POST",
      body: formData,
    });
    if (!resp.ok) {
      throw new Error(await readErrorMessage(resp));
    }
    const data = (await resp.json()) as Record<string, unknown>;
    saveNormrefResponse("pdf_parse", data);

    const parseId = typeof data.parseId === "string" ? data.parseId : "";
    if (parseId) {
      setNormrefPayloadText(setNormrefSpuPayloadText, (prev) => ({
        ...prev,
        parseId,
        standardCode: normrefStandardCode,
      }));
    }
    return data;
  };

  const requestNormrefSpuGenerate = async (): Promise<Record<string, unknown>> => {
    const data = (await callNormrefJsonEndpoint("spu_generate", "/api/v1/spu/generate", normrefSpuPayloadText)) as Record<
      string,
      unknown
    >;
    const spuId = typeof data.spuId === "string" ? data.spuId : "";
    if (spuId) {
      setNormrefPayloadText(setNormrefGatePayloadText, (prev) => ({ ...prev, spuId }));
      setNormrefPayloadText(setNormrefPathPayloadText, (prev) => ({ ...prev, spuId }));
      setNormrefPayloadText(setNormrefStatePayloadText, (prev) => ({ ...prev, spuId }));
      setNormrefPayloadText(setNormrefSpecPayloadText, (prev) => ({ ...prev, spuId }));
      setNormrefPayloadText(setNormrefFormPayloadText, (prev) => ({ ...prev, spuId }));
    }
    return data;
  };

  const requestNormrefGateEvaluate = async (): Promise<Record<string, unknown>> => {
    const data = (await callNormrefJsonEndpoint("gate_evaluate", "/api/v1/gate/evaluate", normrefGatePayloadText)) as Record<
      string,
      unknown
    >;
    const proof = asObject(data.proof);
    const proofId = typeof proof?.proofId === "string" ? proof.proofId : "";
    const proofHash = typeof proof?.hash === "string" ? proof.hash : "";
    if (proofId || proofHash) {
      setNormrefPayloadText(setNormrefProofPayloadText, (prev) => ({
        ...prev,
        proofId: proofId || prev.proofId || "",
        proofHash: proofHash || prev.proofHash || "",
      }));
    }
    const gatePayload = parseObjectText(normrefGatePayloadText, "gate.payload");
    const gateContext = asObject(gatePayload.context);
    const vuri = typeof gateContext?.vuri === "string" ? gateContext.vuri : "";
    if (vuri) {
      setNormrefPayloadText(setNormrefStatePayloadText, (prev) => ({ ...prev, vuri }));
      setNormrefPayloadText(setNormrefMappingPayloadText, (prev) => ({ ...prev, vuri }));
    }
    return data;
  };

  const requestNormrefPathExecute = async (): Promise<unknown> =>
    callNormrefJsonEndpoint("path_execute", "/api/v1/path/execute", normrefPathPayloadText);

  const requestNormrefStateTransition = async (): Promise<unknown> =>
    callNormrefJsonEndpoint("state_transition", "/api/v1/state/transition", normrefStatePayloadText);

  const requestNormrefProofVerify = async (): Promise<unknown> =>
    callNormrefJsonEndpoint("proof_verify", "/api/v1/proof/verify", normrefProofPayloadText);

  const requestNormrefMappingResolve = async (): Promise<unknown> =>
    callNormrefJsonEndpoint("mapping_resolve", "/api/v1/mapping/resolve", normrefMappingPayloadText);

  const requestNormrefImageRecognize = async (): Promise<unknown> =>
    callNormrefJsonEndpoint("image_recognize", "/api/v1/image/recognize", normrefImagePayloadText);

  const requestNormrefVoiceTranscribe = async (): Promise<unknown> =>
    callNormrefJsonEndpoint("voice_transcribe", "/api/v1/voice/transcribe", normrefVoicePayloadText);

  const requestNormrefSpecValidate = async (): Promise<unknown> =>
    callNormrefJsonEndpoint("spec_validate", "/api/v1/spec/validate", normrefSpecPayloadText);

  const requestNormrefFormRender = async (): Promise<unknown> =>
    callNormrefJsonEndpoint("form_render", "/api/v1/form/render", normrefFormPayloadText);

  const requestNormrefReportGenerate = async (): Promise<unknown> =>
    callNormrefJsonEndpoint("report_generate", "/api/v1/report/generate", normrefReportPayloadText);

  const runNormrefAction = async (action: () => Promise<unknown>) => {
    setNormrefLoading(true);
    setNormrefError("");
    try {
      await action();
    } catch (err) {
      setNormrefError(String(err));
    } finally {
      setNormrefLoading(false);
    }
  };

  const runNormrefDemoChain = async () => {
    await runNormrefAction(async () => {
      const parsePayload = await requestNormrefPdfParse();
      const parseId = typeof parsePayload.parseId === "string" ? parsePayload.parseId : "";

      const spuPayload = parseObjectText(normrefSpuPayloadText, "spu.payload");
      const spuInput = parseId ? { ...spuPayload, parseId, standardCode: normrefStandardCode } : spuPayload;
      const spuResult = (await postJson<unknown>("/api/v1/spu/generate", spuInput)) as Record<string, unknown>;
      saveNormrefResponse("spu_generate", spuResult);
      const spuId = typeof spuResult.spuId === "string" ? spuResult.spuId : "";
      if (spuId) {
        setNormrefPayloadText(setNormrefGatePayloadText, (prev) => ({ ...prev, spuId }));
        setNormrefPayloadText(setNormrefPathPayloadText, (prev) => ({ ...prev, spuId }));
        setNormrefPayloadText(setNormrefStatePayloadText, (prev) => ({ ...prev, spuId }));
        setNormrefPayloadText(setNormrefSpecPayloadText, (prev) => ({ ...prev, spuId }));
        setNormrefPayloadText(setNormrefFormPayloadText, (prev) => ({ ...prev, spuId }));
      }

      const gatePayload = parseObjectText(normrefGatePayloadText, "gate.payload");
      const gateInput = spuId ? { ...gatePayload, spuId } : gatePayload;
      const gateResult = (await postJson<unknown>("/api/v1/gate/evaluate", gateInput)) as Record<string, unknown>;
      saveNormrefResponse("gate_evaluate", gateResult);
      const proof = asObject(gateResult.proof);
      const proofId = typeof proof?.proofId === "string" ? proof.proofId : "";
      const proofHash = typeof proof?.hash === "string" ? proof.hash : "";
      if (proofId || proofHash) {
        setNormrefPayloadText(setNormrefProofPayloadText, (prev) => ({
          ...prev,
          proofId: proofId || prev.proofId || "",
          proofHash: proofHash || prev.proofHash || "",
        }));
      }
      const gateContext = asObject(gateInput.context);
      const vuri = typeof gateContext?.vuri === "string" ? gateContext.vuri : "";
      if (vuri) {
        setNormrefPayloadText(setNormrefStatePayloadText, (prev) => ({ ...prev, vuri }));
        setNormrefPayloadText(setNormrefMappingPayloadText, (prev) => ({ ...prev, vuri }));
      }

      const statePayload = parseObjectText(normrefStatePayloadText, "state.payload");
      const stateInput = {
        ...statePayload,
        ...(spuId ? { spuId } : {}),
        ...(vuri ? { vuri } : {}),
      };
      const stateResult = await postJson<unknown>("/api/v1/state/transition", stateInput);
      saveNormrefResponse("state_transition", stateResult);

      const verifyPayload = parseObjectText(normrefProofPayloadText, "proof.payload");
      const verifyInput = {
        ...verifyPayload,
        ...(proofId ? { proofId } : {}),
        ...(proofHash ? { proofHash } : {}),
      };
      const verifyResult = await postJson<unknown>("/api/v1/proof/verify", verifyInput);
      saveNormrefResponse("proof_verify", verifyResult);

      const mappingPayload = parseObjectText(normrefMappingPayloadText, "mapping.payload");
      const mappingInput = {
        ...mappingPayload,
        ...(vuri ? { vuri } : {}),
      };
      const mappingResult = await postJson<unknown>("/api/v1/mapping/resolve", mappingInput);
      saveNormrefResponse("mapping_resolve", mappingResult);
    });
  };

  const businessTree = useMemo(() => {
    if (!catalogTree) return [];
    return (catalogTree.categories || []).map((chapter) => ({
      id: chapter.category_id,
      name: chapter.category_name,
      sections: (chapter.work_items || []).map((section) => ({
        id: section.work_item_id,
        name: section.work_item_name,
        clauses: (section.measured_items || []).map((clause) => ({
          id: clause.measured_item_id,
          name: clause.measured_item_name,
          specId: clause.spec_id,
          testMethods: clause.test_methods || [],
        })),
      })),
    }));
  }, [catalogTree]);

  useEffect(() => {
    if (businessTree.length === 0) return;
    const chapter = businessTree.find((c) => c.id === selectedChapterId) || businessTree[0];
    if (!chapter) return;
    if (chapter.id !== selectedChapterId) setSelectedChapterId(chapter.id);
    const section = chapter.sections.find((s) => s.id === selectedSectionId) || chapter.sections[0];
    if (!section) return;
    if (section.id !== selectedSectionId) setSelectedSectionId(section.id);
    const clause = section.clauses.find((c) => c.id === selectedClauseId) || section.clauses[0];
    if (!clause) return;
    if (clause.id !== selectedClauseId) setSelectedClauseId(clause.id);
    if (!expandedChapterIds.includes(chapter.id)) {
      setExpandedChapterIds((prev) => [...prev, chapter.id]);
    }
    const sectionKey = `${chapter.id}::${section.id}`;
    if (!expandedSectionIds.includes(sectionKey)) {
      setExpandedSectionIds((prev) => [...prev, sectionKey]);
    }
  }, [businessTree, expandedChapterIds, expandedSectionIds, selectedChapterId, selectedSectionId, selectedClauseId]);

  const selectedChapter = useMemo(
    () => businessTree.find((c) => c.id === selectedChapterId) || null,
    [businessTree, selectedChapterId],
  );
  const selectedSection = useMemo(
    () => selectedChapter?.sections.find((s) => s.id === selectedSectionId) || null,
    [selectedChapter, selectedSectionId],
  );
  const selectedClause = useMemo(
    () => selectedSection?.clauses.find((c) => c.id === selectedClauseId) || null,
    [selectedSection, selectedClauseId],
  );
  const controlIndicators = useMemo(() => {
    const rows = executeResult?.gate?.rule_results || [];
    return rows.map((row) => ({
      name: row.rule_id,
      controlValue: String(row.expected_value ?? "见条文"),
      unit: /%|mm|m|MPa/.exec(String(row.expected_value ?? ""))?.[0] || "—",
      tolerance: row.passed ? "符合要求" : "超限/不满足",
      mandatory: row.severity === "critical" || row.severity === "high",
      method: row.condition || "按规范检测",
      basis: row.message || "",
    }));
  }, [executeResult]);
  const mappedForms = useMemo(() => {
    const sid = String(selectedClause?.specId || "").trim();
    return catalogComponents
      .filter((c) => !sid || String(c.spec_id || "").trim() === sid)
      .slice(0, 6)
      .map((c) => ({
        form: String(c.component_name || c.component_id || "关联表单"),
        field: String(c.component_id || "字段映射"),
      }));
  }, [catalogComponents, selectedClause?.specId]);
  const formulaCards = useMemo(() => {
    const outputs = executeResult?.path_outputs || {};
    const entries = Object.entries(outputs).slice(0, 4);
    if (entries.length === 0) {
      return [{ formula: "压实度 = 现场干密度 / 最大干密度 × 100%", input: "现场干密度, 最大干密度", output: "压实度(%)" }];
    }
    return entries.map(([k, v]) => ({
      formula: `${k} = f(来源字段)`,
      input: "来源字段见执行输入",
      output: `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
    }));
  }, [executeResult]);
  const workbenchMode = true;
  if (workbenchMode) {
    const C = {
      bg: "#031033",
      card: "#0a1d4d",
      primary: "#7fb5ff",
      border: "#1d376f",
      hover: "#112a63",
      activeNode: "#173b83",
      text: "#e7eeff",
      sub: "#9caecf",
      danger: "#d9534f",
      success: "#2e8b57",
    };
    const formatChapterLabel = (id: string, name: string) => {
      const m = String(id || "").match(/(\d+)/);
      const no = m ? m[1] : String(id || "");
      return `第${no}章 ${name || ""}`.trim();
    };
    const formatSectionLabel = (id: string, name: string) => {
      const m = String(id || "").match(/(\d+(?:\.\d+)?)/);
      const no = m ? m[1] : String(id || "");
      return `${no} 节 ${name || ""}`.trim();
    };
    const formatClauseLabel = (id: string, name: string) => `${id} ${name || ""}`.trim();
    const breadcrumb = [
      selectedCatalogId || "规范",
      selectedChapter ? formatChapterLabel(selectedChapter.id, selectedChapter.name) : "章",
      selectedSection ? formatSectionLabel(selectedSection.id, selectedSection.name) : "节",
      selectedClause ? formatClauseLabel(selectedClause.id, selectedClause.name) : "条",
    ].filter(Boolean).join(" > ");
    const clauseText = selectedClause
      ? formatClauseLabel(selectedClause.id, selectedClause.name)
      : "请选择左侧条文";
    const cardStyle: CSSProperties = {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 14,
      marginTop: 12,
      color: C.text,
    };
    const highlightRed: CSSProperties = { color: C.danger, fontWeight: 700 };
    const highlightBlue: CSSProperties = { color: C.primary, fontWeight: 700 };
    return (
      <main
        className="page"
        style={{
          position: "fixed",
          inset: 0,
          padding: 15,
          background: C.bg,
          color: C.text,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <header className="hero" style={{ background: C.card, border: `1px solid ${C.border}`, margin: 0 }}>
          <h1 style={{ color: C.primary }}>工程规范业务工作台</h1>
          <p style={{ color: C.sub }}>工程规范平台 · 施工标准化系统 · 质检规范工作台</p>
        </header>
        <section className="panel" style={{ background: C.bg, border: "none", boxShadow: "none", padding: 0, margin: 0, flex: 1, overflow: "hidden" }}>
          <div className="form-grid">
            <label>
              选择规范
              <select value={selectedCatalogId} onChange={(e) => setSelectedCatalogId(e.target.value)}>
                {catalogs.map((item) => (
                  <option key={item.catalog_id} value={item.catalog_id}>
                    {item.catalog_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {catalogLoading || catalogTreeLoading ? <p>规范加载中...</p> : null}
          {catalogError || catalogTreeError ? <pre className="error">{catalogError || catalogTreeError}</pre> : null}
          <div style={{ display: "grid", gridTemplateColumns: "26% 74%", gap: 12, marginTop: 12, height: "100%" }}>
            <aside className="summary" style={{ height: "100%", overflow: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <h3 style={{ color: C.primary, fontSize: 18 }}>规范目录</h3>
              {businessTree.map((chapter) => {
                const chapterOpen = expandedChapterIds.includes(chapter.id);
                return (
                  <div key={chapter.id} style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChapterId(chapter.id);
                        setExpandedChapterIds((prev) => (prev.includes(chapter.id) ? prev.filter((x) => x !== chapter.id) : [...prev, chapter.id]));
                      }}
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: C.text, fontWeight: 700, padding: "4px 2px" }}
                    >
                      {chapterOpen ? "▼ " : "▶ "} {formatChapterLabel(chapter.id, chapter.name)}
                    </button>
                    {chapterOpen ? (
                      <div style={{ marginLeft: 16, background: C.card }}>
                        {chapter.sections.map((section) => {
                          const sectionKey = `${chapter.id}::${section.id}`;
                          const sectionOpen = expandedSectionIds.includes(sectionKey);
                          return (
                            <div key={sectionKey} style={{ marginBottom: 6 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedChapterId(chapter.id);
                                  setSelectedSectionId(section.id);
                                  setExpandedSectionIds((prev) => (prev.includes(sectionKey) ? prev.filter((x) => x !== sectionKey) : [...prev, sectionKey]));
                                }}
                                style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: C.text, fontWeight: 400, padding: "3px 2px" }}
                              >
                                {sectionOpen ? "▼ " : "▶ "} {formatSectionLabel(section.id, section.name)}
                              </button>
                              {sectionOpen ? (
                                <div style={{ marginLeft: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                                  {section.clauses.map((clause) => (
                                    <button
                                      key={`${section.id}-${clause.id}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedChapterId(chapter.id);
                                        setSelectedSectionId(section.id);
                                        setSelectedClauseId(clause.id);
                                      }}
                                      style={{
                                        textAlign: "left",
                                        background: selectedClauseId === clause.id ? C.activeNode : C.card,
                                        color: selectedClauseId === clause.id ? C.primary : C.sub,
                                        border: `1px solid ${C.border}`,
                                        borderRadius: 6,
                                        padding: "6px 8px",
                                      }}
                                      onMouseEnter={(e) => {
                                        if (selectedClauseId !== clause.id) e.currentTarget.style.background = C.hover;
                                      }}
                                      onMouseLeave={(e) => {
                                        if (selectedClauseId !== clause.id) e.currentTarget.style.background = C.card;
                                      }}
                                    >
                                      {formatClauseLabel(clause.id, clause.name)}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </aside>
            <section className="summary" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, height: "100%", overflow: "auto" }}>
              <div style={{ color: C.sub }}><strong>当前位置：</strong>{breadcrumb}</div>
              <div className="actions" style={{ justifyContent: "flex-start", marginTop: 8 }}>
                {[
                  ["content", "条文内容"],
                  ["analysis", "条文解析"],
                  ["indicator", "控制指标"],
                  ["forms", "关联表单"],
                  ["mapping", "字段映射"],
                  ["calc", "计算公式"],
                  ["reference", "引用规范"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setWorkbenchTab(key as WorkbenchTabKey)}
                    style={{
                      background: workbenchTab === key ? C.primary : C.card,
                      color: workbenchTab === key ? "#ffffff" : C.sub,
                      border: `1px solid ${C.border}`,
                    }}
                    onMouseEnter={(e) => {
                      if (workbenchTab !== key) e.currentTarget.style.background = C.hover;
                    }}
                    onMouseLeave={(e) => {
                      if (workbenchTab !== key) e.currentTarget.style.background = C.card;
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {workbenchTab === "content" ? (
                <div style={cardStyle}>
                  <h3 style={{ marginBottom: 10, color: C.primary, fontSize: 17 }}>条文内容</h3>
                  <p style={{ fontSize: 22, lineHeight: 1.5, marginBottom: 8 }}>{clauseText}</p>
                  <p style={{ marginTop: 8 }}>
                    重点控制值示例：<span style={highlightRed}>200mm</span>、<span style={highlightBlue}>2~4m</span>、<span style={highlightBlue}>≤1%</span>
                  </p>
                </div>
              ) : null}
                            {workbenchTab === "analysis" ? (
                <div style={cardStyle}>
                  <h3 style={{ color: C.primary, fontSize: 17 }}>条文解析</h3>
                  <p><strong>条文标题：</strong>{selectedClause?.name || "—"}</p>
                  <p><strong>条文内容：</strong>{clauseText}</p>
                  <p><strong>条文解释：</strong>用于指导施工过程质量控制与验收判定，确保工序满足规范要求。</p>
                  <p><strong>适用场景：</strong>{selectedSection?.name || "施工过程控制"}</p>
                  <p><strong>所属工序：</strong>{selectedSection?.name || "现场施工"}</p>
                  <p><strong>适用角色：</strong>施工员、质检员、试验员、监理工程师</p>
                  <p><strong>风险等级：</strong>{controlIndicators.some((x) => x.mandatory) ? "高" : "中"}</p>
                  <p><strong>检查阶段：</strong>施工中检查 / 工序验收</p>
                  <p><strong>是否强制：</strong>{controlIndicators.some((x) => x.mandatory) ? "是" : "否"}</p>
                </div>
              ) : null}
              {workbenchTab === "indicator" ? (
                <div style={cardStyle}>
                  <h3 style={{ color: C.primary, fontSize: 17 }}>控制指标</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${C.border}` }}>
                    <thead>
                      <tr><th>控制项</th><th>指标值</th><th>单位</th><th>允许偏差</th><th>检查方法</th><th>检查频率</th></tr>
                    </thead>
                    <tbody>
                      {controlIndicators.map((r, i) => (
                        <tr key={`${r.name}-${i}`}>
                          <td>{r.name}</td>
                          <td style={{ color: C.danger, fontWeight: 700 }}>{r.controlValue}</td>
                          <td>{r.unit}</td>
                          <td>{r.tolerance || "按条文执行"}</td>
                          <td>{r.method}</td>
                          <td>按工序抽检/关键点全检</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {workbenchTab === "forms" ? (
                <div style={cardStyle}>
                  <h3 style={{ color: C.primary, fontSize: 17 }}>关联表单</h3>
                  {mappedForms.length === 0 ? <p>暂无关联表单</p> : mappedForms.map((f, i) => (
                    <div key={`${f.form}-${i}`} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, marginBottom: 10, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ background: "#0f2a64", height: 72, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, fontSize: 12 }}>桥施表缩略图</div>
                      <div>
                        <p><strong>表单名称：</strong>{f.form}</p>
                        <p><strong>关联字段：</strong>{f.field}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {workbenchTab === "mapping" ? (
                <div style={cardStyle}>
                  <h3 style={{ color: C.primary, fontSize: 17 }}>字段映射</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${C.border}` }}>
                    <thead>
                      <tr><th>表单字段</th><th>对应控制项</th></tr>
                    </thead>
                    <tbody>
                      {mappedForms.map((f, i) => (
                        <tr key={`map-${i}`}>
                          <td>{f.field}</td>
                          <td>{f.form}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {workbenchTab === "calc" ? (
                <div style={cardStyle}>
                  <h3 style={{ color: C.primary, fontSize: 17 }}>计算公式</h3>
                  {formulaCards.map((f, i) => (
                    <div key={`formula-${i}`} style={{ background: "#0d2f38", border: "1px solid #2c7a68", borderRadius: 8, padding: 12, marginBottom: 10 }}>
                      <p><strong>公式：</strong>{f.formula}</p>
                      <p><strong>来源字段：</strong>{f.input}</p>
                      <p><strong>输出字段：</strong>{f.output}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {workbenchTab === "reference" ? (
                <div style={cardStyle}>
                  <h3 style={{ color: C.primary, fontSize: 17 }}>引用规范</h3>
                  <ul>
                    <li>JTG F80/1-2017</li>
                    <li>GB/T 50448-2015</li>
                    <li>{selectedCatalogId}</li>
                  </ul>
                  <p><strong>被引用章节：</strong>{selectedChapter?.name || "—"} / {selectedSection?.name || "—"} / {selectedClause?.name || "—"}</p>
                </div>
              ) : null}
            </section>
          </div>
        </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>构件驱动执行台</h1>
        <p>执行接口：builtin 走 /api/v1/execute/component；SpecIR 走 /api/v1/specir/execute/{'{spec_id}'}</p>
      </header>

      <section className="panel">
        <h2>NormRef API 矩阵联调</h2>
        <p>本区直接联调现有后端接口：/api/v1/pdf|spu|gate|path|state|proof|mapping|image|voice|spec|form|report</p>

        <div className="actions">
          <button type="button" onClick={buildDemoPdfFile} disabled={normrefLoading}>
            加载演示 PDF
          </button>
          <button type="button" onClick={() => void runNormrefDemoChain()} disabled={normrefLoading}>
            {normrefLoading ? "串联中..." : "一键串联 6 步（PDF→SPU→Gate→State→Proof→Mapping）"}
          </button>
        </div>

        <div className="form-grid">
          <label>
            standardCode
            <input value={normrefStandardCode} onChange={(e) => setNormrefStandardCode(e.target.value)} />
          </label>
          <label>
            PDF 文件
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setNormrefPdfFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <label className="textarea-label">
          /api/v1/pdf/parse options（JSON）
          <textarea value={normrefPdfOptionsText} onChange={(e) => setNormrefPdfOptionsText(e.target.value)} rows={5} />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void runNormrefAction(requestNormrefPdfParse)} disabled={normrefLoading}>
            {normrefLoading ? "请求中..." : "POST /api/v1/pdf/parse"}
          </button>
        </div>

        <label className="textarea-label">
          /api/v1/spu/generate payload（JSON）
          <textarea value={normrefSpuPayloadText} onChange={(e) => setNormrefSpuPayloadText(e.target.value)} rows={8} />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void runNormrefAction(requestNormrefSpuGenerate)} disabled={normrefLoading}>
            {normrefLoading ? "请求中..." : "POST /api/v1/spu/generate"}
          </button>
        </div>

        <label className="textarea-label">
          /api/v1/gate/evaluate payload（JSON）
          <textarea value={normrefGatePayloadText} onChange={(e) => setNormrefGatePayloadText(e.target.value)} rows={12} />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void runNormrefAction(requestNormrefGateEvaluate)} disabled={normrefLoading}>
            {normrefLoading ? "请求中..." : "POST /api/v1/gate/evaluate"}
          </button>
        </div>

        <label className="textarea-label">
          /api/v1/path/execute payload（JSON）
          <textarea value={normrefPathPayloadText} onChange={(e) => setNormrefPathPayloadText(e.target.value)} rows={10} />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void runNormrefAction(requestNormrefPathExecute)} disabled={normrefLoading}>
            {normrefLoading ? "请求中..." : "POST /api/v1/path/execute"}
          </button>
        </div>

        <label className="textarea-label">
          /api/v1/state/transition payload（JSON）
          <textarea value={normrefStatePayloadText} onChange={(e) => setNormrefStatePayloadText(e.target.value)} rows={10} />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void runNormrefAction(requestNormrefStateTransition)} disabled={normrefLoading}>
            {normrefLoading ? "请求中..." : "POST /api/v1/state/transition"}
          </button>
        </div>

        <label className="textarea-label">
          /api/v1/proof/verify payload（JSON）
          <textarea value={normrefProofPayloadText} onChange={(e) => setNormrefProofPayloadText(e.target.value)} rows={10} />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void runNormrefAction(requestNormrefProofVerify)} disabled={normrefLoading}>
            {normrefLoading ? "请求中..." : "POST /api/v1/proof/verify"}
          </button>
        </div>

        <label className="textarea-label">
          /api/v1/mapping/resolve payload（JSON）
          <textarea
            value={normrefMappingPayloadText}
            onChange={(e) => setNormrefMappingPayloadText(e.target.value)}
            rows={8}
          />
        </label>
        <div className="actions">
          <button type="button" onClick={() => void runNormrefAction(requestNormrefMappingResolve)} disabled={normrefLoading}>
            {normrefLoading ? "请求中..." : "POST /api/v1/mapping/resolve"}
          </button>
        </div>

        <details>
          <summary>输入层/输出层补充联调（image、voice、spec、form、report）</summary>
          <label className="textarea-label">
            /api/v1/image/recognize payload（JSON）
            <textarea
              value={normrefImagePayloadText}
              onChange={(e) => setNormrefImagePayloadText(e.target.value)}
              rows={6}
            />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void runNormrefAction(requestNormrefImageRecognize)} disabled={normrefLoading}>
              {normrefLoading ? "请求中..." : "POST /api/v1/image/recognize"}
            </button>
          </div>

          <label className="textarea-label">
            /api/v1/voice/transcribe payload（JSON）
            <textarea
              value={normrefVoicePayloadText}
              onChange={(e) => setNormrefVoicePayloadText(e.target.value)}
              rows={5}
            />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void runNormrefAction(requestNormrefVoiceTranscribe)} disabled={normrefLoading}>
              {normrefLoading ? "请求中..." : "POST /api/v1/voice/transcribe"}
            </button>
          </div>

          <label className="textarea-label">
            /api/v1/spec/validate payload（JSON）
            <textarea value={normrefSpecPayloadText} onChange={(e) => setNormrefSpecPayloadText(e.target.value)} rows={5} />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void runNormrefAction(requestNormrefSpecValidate)} disabled={normrefLoading}>
              {normrefLoading ? "请求中..." : "POST /api/v1/spec/validate"}
            </button>
          </div>

          <label className="textarea-label">
            /api/v1/form/render payload（JSON）
            <textarea value={normrefFormPayloadText} onChange={(e) => setNormrefFormPayloadText(e.target.value)} rows={6} />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void runNormrefAction(requestNormrefFormRender)} disabled={normrefLoading}>
              {normrefLoading ? "请求中..." : "POST /api/v1/form/render"}
            </button>
          </div>

          <label className="textarea-label">
            /api/v1/report/generate payload（JSON）
            <textarea
              value={normrefReportPayloadText}
              onChange={(e) => setNormrefReportPayloadText(e.target.value)}
              rows={8}
            />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void runNormrefAction(requestNormrefReportGenerate)} disabled={normrefLoading}>
              {normrefLoading ? "请求中..." : "POST /api/v1/report/generate"}
            </button>
          </div>
        </details>

        {normrefError ? <pre className="error">{normrefError}</pre> : null}
        {Object.entries(normrefResponseMap).length > 0 ? (
          <div className="summary">
            {Object.entries(normrefResponseMap).map(([key, payload]) => (
              <details key={key}>
                <summary>{key}</summary>
                <pre>{JSON.stringify(payload, null, 2)}</pre>
              </details>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>0. Project 上下文</h2>
        <div className="form-grid">
          <label>
            project_id
            <input value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} />
          </label>
          <label>
            override spec_id
            <input value={projectOverrideSpecId} onChange={(e) => setProjectOverrideSpecId(e.target.value)} />
          </label>
          <label>
            override branch_id
            <input value={projectOverrideBranchId} onChange={(e) => setProjectOverrideBranchId(e.target.value)} />
          </label>
        </div>
        <label className="textarea-label">
          selected_specs（JSON 数组）
          <textarea value={projectSpecsText} onChange={(e) => setProjectSpecsText(e.target.value)} rows={4} />
        </label>
        <label className="textarea-label">
          scope_filters（JSON）
          <textarea value={projectScopeText} onChange={(e) => setProjectScopeText(e.target.value)} rows={6} />
        </label>
        <label className="textarea-label">
          role_bindings（JSON 数组）
          <textarea value={projectRoleBindingsText} onChange={(e) => setProjectRoleBindingsText(e.target.value)} rows={6} />
        </label>
        <label className="textarea-label">
          instrument_bindings（JSON 数组）
          <textarea
            value={projectInstrumentBindingsText}
            onChange={(e) => setProjectInstrumentBindingsText(e.target.value)}
            rows={8}
          />
        </label>
        <label className="textarea-label">
          override（JSON）
          <textarea value={projectOverrideText} onChange={(e) => setProjectOverrideText(e.target.value)} rows={6} />
        </label>
        <div className="actions">
          <button type="button" onClick={createProject} disabled={projectLoading}>
            {projectLoading ? "提交中..." : "创建/更新项目"}
          </button>
          <button type="button" onClick={loadProject} disabled={projectLoading}>
            {projectLoading ? "加载中..." : "加载项目"}
          </button>
          <button type="button" onClick={saveProjectOverride} disabled={projectLoading}>
            {projectLoading ? "保存中..." : "保存 Override"}
          </button>
          <button type="button" onClick={saveProjectRoleBindings} disabled={projectLoading}>
            {projectLoading ? "保存中..." : "保存 Role Bindings"}
          </button>
          <button type="button" onClick={saveProjectInstrumentBindings} disabled={projectLoading}>
            {projectLoading ? "保存中..." : "保存 Instrument Bindings"}
          </button>
        </div>
        {projectError ? <pre className="error">{projectError}</pre> : null}
        {projectInfo ? (
          <div className="summary">
            <div><strong>project_id：</strong>{projectInfo.project_id}</div>
            <div><strong>catalog_id：</strong>{projectInfo.catalog_id}</div>
            <div><strong>selected_specs：</strong>{projectInfo.selected_specs.join(", ")}</div>
            <div><strong>selection_source：</strong>{projectInfo.selection_source || "unknown"}</div>
            <div>
              <strong>resolved_scope.categories：</strong>
              {projectInfo.resolved_scope?.category_ids?.join(", ") || "（无）"}
            </div>
            <div>
              <strong>resolved_scope.work_items：</strong>
              {projectInfo.resolved_scope?.work_item_ids?.join(", ") || "（无）"}
            </div>
            <div>
              <strong>resolved_scope.counts：</strong>
              {projectInfo.resolved_scope?.counts
                ? `categories=${projectInfo.resolved_scope.counts.categories}, work_items=${projectInfo.resolved_scope.counts.work_items}, measured_items=${projectInfo.resolved_scope.counts.measured_items}, specs=${projectInfo.resolved_scope.counts.specs}`
                : "（无）"}
            </div>
            <div>
              <strong>role_bindings：</strong>
              {Array.isArray(projectInfo.role_bindings) ? projectInfo.role_bindings.length : 0}
            </div>
            <div>
              <strong>instrument_bindings：</strong>
              {Array.isArray(projectInfo.instrument_bindings) ? projectInfo.instrument_bindings.length : 0}
            </div>
            <div><strong>created_at：</strong>{projectInfo.created_at}</div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>1. Catalog 信息展示区</h2>
        <div className="form-grid">
          <label>
            选择 Catalog
            <select value={selectedCatalogId} onChange={(e) => setSelectedCatalogId(e.target.value)}>
              {catalogs.map((item) => (
                <option key={item.catalog_id} value={item.catalog_id}>
                  {item.catalog_name}（{item.catalog_id}）
                </option>
              ))}
            </select>
          </label>
        </div>
        {catalogLoading ? <p>Catalog 加载中...</p> : null}
        {catalogError ? <pre className="error">{catalogError}</pre> : null}
        {catalogTreeLoading ? <p>Catalog 树加载中...</p> : null}
        {catalogTreeError ? <pre className="error">{catalogTreeError}</pre> : null}
        {catalogTree ? (
          <div className="summary">
            <div>
              <strong>catalog：</strong>
              {catalogTree.catalog_name}（{catalogTree.catalog_id}）
            </div>
            {catalogTree.categories.map((category) => (
              <details key={category.category_id}>
                <summary>
                  {category.category_name}（{category.category_id}）
                </summary>
                {category.work_items.map((workItem) => (
                  <details key={`${category.category_id}-${workItem.work_item_id}`}>
                    <summary>
                      {workItem.work_item_name}（{workItem.work_item_id}）
                    </summary>
                    <div className="actions">
                      {workItem.measured_items.map((item) => (
                        <button
                          key={`${workItem.work_item_id}-${item.measured_item_id}`}
                          type="button"
                          onClick={() => void runCatalogMeasuredItem(category, workItem, item)}
                          disabled={loading}
                        >
                          {loading ? "执行中..." : `执行 ${item.measured_item_name} (${item.spec_id})`}
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </details>
            ))}
          </div>
        ) : null}
        {catalogDetail ? <JsonBlock title="catalog_detail" data={catalogDetail} /> : null}
        <JsonBlock title="catalog_components" data={catalogComponents} />
      </section>

      <section className="panel">
        <h2>1. 构件执行</h2>
        <div className="form-grid">
          <label>
            选择构件
            <select value={componentId} onChange={(e) => changeComponent(e.target.value)}>
              {componentOptions.map((item) => (
                <option key={item.component_id} value={item.component_id}>
                  [{item.source_type === "specir" ? "SpecIR" : "内置"}] {item.component_name}（{item.component_id}）
                </option>
              ))}
            </select>
          </label>
          <label>
            component_id（可手动修改）
            <input value={componentId} onChange={(e) => setComponentId(e.target.value)} />
          </label>
          <label>
            branch_id
            <input value={branchId} onChange={(e) => setBranchId(e.target.value)} />
          </label>
          <label>
            measured_item 路由
            <input
              type="checkbox"
              checked={useAutoLocateMeasuredItem}
              onChange={(e) => setUseAutoLocateMeasuredItem(e.target.checked)}
            />
            自动定位（不显式传 measured_item_id）
          </label>
        </div>
        {selectedComponentOption ? (
          <div className="summary">
            <div>
              <strong>source_type：</strong>
              {selectedComponentOption.source_type === "specir" ? "specir" : "builtin"}
            </div>
            <div>
              <strong>spec_id：</strong>
              {selectedComponentOption.spec_id || "（无）"}
            </div>
            <div>
              <strong>source_file：</strong>
              {selectedComponentOption.source_file || "（无）"}
            </div>
          </div>
        ) : null}

        <label className="textarea-label">
          input（JSON）
          <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={12} />
        </label>
        <label className="textarea-label">
          compare branches（JSON 数组）
          <textarea value={compareBranchesText} onChange={(e) => setCompareBranchesText(e.target.value)} rows={2} />
        </label>

        <div className="actions">
          <button onClick={refreshBranchOverview} disabled={branchLoading} type="button">
            {branchLoading ? "刷新分支中..." : "刷新分支列表"}
          </button>
          <button onClick={fillCompareBranchesFromActiveForks} disabled={branchLoading} type="button">
            填入 main + ACTIVE fork
          </button>
        </div>
        {branchOverview ? (
          <div className="summary">
            <div><strong>project_id：</strong>{branchOverview.project_id}</div>
            <div><strong>current_branch：</strong>{branchOverview.current_branch}</div>
            <div><strong>active_forks：</strong>{branchOverview.active_forks.join(", ") || "（无）"}</div>
            <div><strong>available_branches：</strong>{availableBranchSummary || "main (ACTIVE)"}</div>
          </div>
        ) : null}

        <div className="actions">
          <button onClick={execute} disabled={loading}>
            {loading ? "执行中..." : "执行构件"}
          </button>
          <button onClick={compareBranches} disabled={compareLoading}>
            {compareLoading ? "对比中..." : "对比分支执行"}
          </button>
          <button onClick={fillCompactionResolvedSample} type="button">
            填入 resolved value 示例
          </button>
          <button onClick={fillCompactionRawDataSample} type="button">
            填入 raw_data 示例
          </button>
        </div>
        {branchError ? <pre className="error">{branchError}</pre> : null}
        {error ? <pre className="error">{error}</pre> : null}
        {compareError ? <pre className="error">{compareError}</pre> : null}
      </section>

      {compareResult ? (
        <section className="panel">
          <h2>分支对比结果</h2>
          <JsonBlock title="compare_branches_result" data={compareResult} />
        </section>
      ) : null}

      {executeResult ? (
        <section className="panel">
          <h2>统一执行结果</h2>
          <div className="summary">
            <div><strong>execution_id：</strong>{executeResult.execution_id}</div>
            <div><strong>component_id：</strong>{executeResult.component_id}</div>
            <div><strong>version：</strong>{executeResult.version}</div>
            <div><strong>project_id：</strong>{executeResult.project_id}</div>
            <div><strong>branch_id：</strong>{executeResult.branch_id || "main"}</div>
            <div className={statusClass}><strong>final_status：</strong>{executeResult.final_status}</div>
            <div><strong>lifecycle_status：</strong>{executeResult.lifecycle_status}</div>
            {(executeResult as CatalogExecuteResponse).catalog_context ? (
              <div>
                <strong>catalog_context：</strong>
                {(executeResult as CatalogExecuteResponse).catalog_context?.category || ""} /
                {(executeResult as CatalogExecuteResponse).catalog_context?.work_item || ""} /
                {(executeResult as CatalogExecuteResponse).catalog_context?.measured_item || ""}
              </div>
            ) : null}
            {(executeResult as ProjectExecuteResponse).project_context ? (
              <div>
                <strong>project_context：</strong>
                {(executeResult as ProjectExecuteResponse).project_context?.project_id || ""} /
                {(executeResult as ProjectExecuteResponse).project_context?.branch_id || ""} /
                {String((executeResult as ProjectExecuteResponse).project_context?.override_applied ?? false)} /
                {(executeResult as ProjectExecuteResponse).project_context?.resolved_measured_item_id || ""} /
                {String((executeResult as ProjectExecuteResponse).project_context?.auto_located ?? false)}
              </div>
            ) : null}
            {(executeResult as ProjectExecuteResponse).project_context?.resolved_scope ? (
              <div>
                <strong>project_scope：</strong>
                {(executeResult as ProjectExecuteResponse).project_context?.resolved_scope?.selection_source || "unknown"} /
                {((executeResult as ProjectExecuteResponse).project_context?.resolved_scope?.category_ids || []).join(", ")}
              </div>
            ) : null}
          </div>

          <JsonBlock title="normalized_input" data={executeResult.normalized_input} />
          <JsonBlock title="path_outputs" data={executeResult.path_outputs} />
          <JsonBlock title="path_trace" data={executeResult.path_trace} />
          <JsonBlock title="gate" data={executeResult.gate} />
          <JsonBlock title="gate_trace" data={executeResult.gate_trace} />
          <JsonBlock title="state_trace" data={executeResult.state_trace} />
          <JsonBlock title="proof" data={executeResult.proof} />
          <JsonBlock title="effective_overrides" data={executeResult.effective_overrides || {}} />
          <JsonBlock title="resolved_context" data={executeResult.resolved_context || {}} />
          <JsonBlock title="clause_refs" data={executeResult.clause_refs} />
          <JsonBlock title="explanation_seed" data={executeResult.explanation_seed} />
        </section>
      ) : null}

      <section className="panel">
        <h2>1.1 LayerPeg ProjectUTXO</h2>
        {projectUTXOError ? <pre className="error">{projectUTXOError}</pre> : null}
        <JsonBlock title="proof_chain_merkle_root" data={merkleRoot} />
        <JsonBlock title="proof_chain" data={proofChain} />
        <JsonBlock title="project_utxo" data={projectUTXO} />
        <JsonBlock title="project_utxo_unspent_outputs" data={projectUTXOUnspentOutputs} />
      </section>

      <section className="panel">
        <h2>2. 自然语言问答（受执行结果约束）</h2>
        <label className="textarea-label">
          问题
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} />
        </label>
        <div className="actions">
          <button onClick={askNl} disabled={nlLoading}>
            {nlLoading ? "解析中..." : "执行问答"}
          </button>
        </div>
        {nlError ? <pre className="error">{nlError}</pre> : null}
        {nlResult ? (
          <>
            <JsonBlock title="answer_mode" data={nlResult.answer_mode || "single"} />
            <JsonBlock title="answer" data={nlResult.answer} />
            <JsonBlock title="main_result" data={nlResult.main_result || null} />
            <JsonBlock title="branch_results" data={nlResult.branch_results || {}} />
            <JsonBlock title="parse_trace" data={nlResult.parse_trace} />
            <JsonBlock title="execution_request" data={nlResult.execution_request} />
            <JsonBlock title="execution_result" data={nlResult.execution_result} />
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>3. 规则更新影响分析（Patch）</h2>
        <label className="textarea-label">
          patch（JSON）
          <textarea value={patchText} onChange={(e) => setPatchText(e.target.value)} rows={8} />
        </label>
        <label className="textarea-label">
          override（JSON）
          <textarea value={overrideText} onChange={(e) => setOverrideText(e.target.value)} rows={8} />
        </label>
        <label className="textarea-label">
          records（JSON）
          <textarea value={recordsText} onChange={(e) => setRecordsText(e.target.value)} rows={10} />
        </label>
        <div className="actions">
          <button onClick={runPatchDemo} disabled={patchLoading}>
            {patchLoading ? "分析中..." : "执行影响分析"}
          </button>
          <button onClick={runOverrideDemo} disabled={patchLoading}>
            {patchLoading ? "分析中..." : "执行 Override 分析"}
          </button>
        </div>
        {patchError ? <pre className="error">{patchError}</pre> : null}
        {patchResult ? <JsonBlock title="patch_analysis_result" data={patchResult} /> : null}
      </section>

      <section className="panel">
        <h2>4. WorkItem 组合执行（Catalog）</h2>
        <label className="textarea-label">
          请求体（JSON）
          <textarea value={workItemText} onChange={(e) => setWorkItemText(e.target.value)} rows={12} />
        </label>
        <div className="actions">
          <button onClick={runWorkItem} disabled={workItemLoading}>
            {workItemLoading ? "执行中..." : "执行 WorkItem"}
          </button>
        </div>
        {workItemError ? <pre className="error">{workItemError}</pre> : null}
        {workItemResult ? <JsonBlock title="work_item_execution_result" data={workItemResult} /> : null}
      </section>

      <section className="panel">
        <h2>5. 组合构件演示（compaction_segment_assessment）</h2>
        <label className="textarea-label">
          多测点输入（JSON）
          <textarea value={segmentText} onChange={(e) => setSegmentText(e.target.value)} rows={14} />
        </label>
        <div className="actions">
          <button onClick={runSegmentDemo} disabled={segmentLoading}>
            {segmentLoading ? "执行中..." : "执行组合构件"}
          </button>
        </div>
        {segmentError ? <pre className="error">{segmentError}</pre> : null}
        {segmentResult ? (
          <>
            <JsonBlock title="segment_final_status" data={segmentResult.final_status} />
            <JsonBlock title="segment_child_execution_results" data={segmentResult.path_outputs["child_execution_results"]} />
            <JsonBlock title="segment_child_aggregates" data={segmentResult.path_outputs["child_aggregates"]} />
            <JsonBlock title="segment_full_execution_result" data={segmentResult} />
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>6. 状态流转演示区</h2>
        <div className="actions">
          <button onClick={() => void runLifecycleScenario(COMPACTION_RESOLVED_SAMPLE)} disabled={stateDemoLoading}>
            QUALIFIED 场景（全部通过）
          </button>
          <button onClick={() => void runLifecycleScenario(COMPACTION_REJECTED_SAMPLE)} disabled={stateDemoLoading}>
            REJECTED 场景（规则失败）
          </button>
          <button onClick={() => void runLifecycleScenario(COMPACTION_OVERRIDDEN_SAMPLE)} disabled={stateDemoLoading}>
            OVERRIDDEN 场景（特批通过）
          </button>
          <button onClick={() => void runLifecycleScenario(COMPACTION_ARCHIVED_SAMPLE)} disabled={stateDemoLoading}>
            ARCHIVED 场景（归档）
          </button>
        </div>
        {stateDemoError ? <pre className="error">{stateDemoError}</pre> : null}
        {stateDemoResult ? (
          <>
            <JsonBlock
              title="lifecycle_summary"
              data={{
                final_status: stateDemoResult.final_status,
                lifecycle_status: stateDemoResult.lifecycle_status,
              }}
            />
            <JsonBlock title="state_trace" data={stateDemoResult.state_trace} />
          </>
        ) : null}

        <label className="textarea-label">
          手动迁移请求（JSON）
          <textarea value={transitionText} onChange={(e) => setTransitionText(e.target.value)} rows={8} />
        </label>
        <div className="actions">
          <button onClick={runStateTransition} disabled={transitionLoading}>
            {transitionLoading ? "迁移中..." : "调用 /api/v1/state/transition"}
          </button>
        </div>
        {transitionError ? <pre className="error">{transitionError}</pre> : null}
        {transitionResult ? <JsonBlock title="transition_result" data={transitionResult} /> : null}
      </section>

      <section className="panel">
        <h2>7. Anchor 预留演示区</h2>
        <label className="textarea-label">
          锚定请求（JSON）
          <textarea value={anchorText} onChange={(e) => setAnchorText(e.target.value)} rows={8} />
        </label>
        <div className="form-grid">
          <label>
            查询 proof_hash
            <input value={anchorQueryHash} onChange={(e) => setAnchorQueryHash(e.target.value)} />
          </label>
        </div>
        <div className="actions">
          <button onClick={createAnchor} disabled={anchorLoading}>
            {anchorLoading ? "提交中..." : "调用 /api/v1/proof/anchor"}
          </button>
          <button onClick={queryAnchors} disabled={anchorLoading || anchorQueryHash.trim().length === 0}>
            {anchorLoading ? "查询中..." : "调用 /api/v1/proof/{proof_hash}/anchors"}
          </button>
        </div>
        {anchorError ? <pre className="error">{anchorError}</pre> : null}
        {anchorCreateResult ? <JsonBlock title="anchor_create_result" data={anchorCreateResult} /> : null}
        <JsonBlock title="anchor_list_result" data={anchorListResult} />
      </section>
    </main>
  );
}




























