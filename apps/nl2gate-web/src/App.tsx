import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComponentVirtualList from "./ComponentVirtualList";
import SpecIRReviewPage from "./SpecIRReviewPage";

type JobAIPreprocess = {
  enabled?: boolean;
  used?: boolean;
  model?: string;
  duration_ms?: number;
  warnings?: string[];
  ai_candidate_count?: number;
  ai_clause_node_count?: number;
  http_status?: number;
  error?: string;
};

type ClauseTreeStats = {
  node_count?: number;
  root_count?: number;
  max_depth?: number;
  orphan_count?: number;
};

type ClauseTreeNode = {
  clause_id?: string;
  title?: string;
  depth?: number;
  parent_id?: string | null;
  page_no?: number;
  line_no?: number;
  node_type?: string;
  executable?: boolean;
  children?: ClauseTreeNode[];
};

type ClauseTree = {
  roots?: ClauseTreeNode[];
  nodes?: ClauseTreeNode[];
  stats?: ClauseTreeStats;
};

type RuleCandidate = {
  candidate_id?: string;
  rule_id?: string;
  category?: string;
  field_key?: string;
  operator?: string;
  threshold_value?: string;
  unit?: string;
  severity?: string;
  norm_ref?: string;
  clause_no?: string;
  clause_id?: string;
  clause_title?: string;
  clause_content?: string;
  clause_preview?: string;
  clause_score?: number;
  binding_status?: "bound" | "pending" | string;
  review_required?: boolean;
  source_line?: string;
  confidence?: number;
  status?: string;
  review?: {
    reviewed_by?: string;
    reviewer_name?: string;
    reviewed_at?: string;
    comment?: string;
  };
};

type IngestJob = {
  job_id?: string;
  status?: string;
  parser?: string;
  warnings?: string[];
  candidate_count?: number;
  status_summary?: Record<string, number>;
  table_count?: number;
  table_structured_count?: number;
  formula_count?: number;
  term_count?: number;
  clause_tree?: ClauseTree;
  clause_tree_stats?: ClauseTreeStats;
  ai_preprocess?: JobAIPreprocess;
  candidates?: RuleCandidate[];
};

type IngestResponse = {
  status: string;
  run_id?: string;
  progress?: number;
  stage?: string;
  message?: string;
  uploaded_file?: string;
  std_code?: string;
  title?: string;
  spec_type?: string;
  level?: string;
  identity_check?: {
    provided?: {
      std_code?: string;
      level?: string;
    };
    detected?: {
      std_code?: string;
      year?: string;
      level?: string;
      source?: string;
    };
    matched?: {
      std_code?: boolean | null;
      level?: boolean | null;
    };
    warnings?: string[];
  };
  review_job_ids?: string[];
  ingest?: {
    run_id?: string;
    return_code?: number;
    report_path?: string;
    stdout?: string;
    stderr?: string;
    report?: {
      ok?: boolean;
      generated_at?: string;
      input_count?: number;
      publish_enabled?: boolean;
      ai_preprocess_enabled?: boolean;
      ai_model?: string;
      jobs?: Array<{
        input_file?: string;
        approved_count?: number;
        job?: IngestJob;
      }>;
    };
  };
};

type IngestRunStatus = {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  progress?: number;
  stage?: string;
  message?: string;
  review_job_ids?: string[];
  result?: IngestResponse | null;
  error?: string;
};

type InspectPrefill = {
  detected?: {
    std_code?: string;
    year?: string;
    level?: string;
    title?: string;
    source?: string;
  };
  suggested?: {
    std_code?: string;
    level?: string;
    title?: string;
  };
  warnings?: string[];
};

type InspectResponse = {
  ok?: boolean;
  file_name?: string;
  preview_chars?: number;
  prefill?: InspectPrefill;
};

type ReviewPackage = {
  job_id: string;
  std_code?: string;
  standard_version?: string;
  source_doc_hash?: string;
  title?: string;
  spec_type?: string;
  level?: string;
  status?: string;
  review_status?: string;
  review_summary?: Record<string, number>;
  clause_binding_summary?: {
    total?: number;
    bound?: number;
    pending?: number;
    review_required?: number;
  };
  candidate_count?: number;
  clause_tree?: ClauseTree;
  clause_tree_stats?: ClauseTreeStats;
  candidates?: RuleCandidate[];
  expert_signatures?: Array<{
    expert_id?: string;
    expert_name?: string;
    signed_at?: string;
    signature_hash?: string;
    comment?: string;
  }>;
  generated_normdocs?: Array<{
    path?: string;
    generated_at?: string;
    form_type?: string;
    approved_count?: number;
    signature_count?: number;
  }>;
  source_artifacts?: {
    source_doc_hash?: string;
  };
};

type HitlSimilarCase = {
  clause_text?: string;
  mapped_slotKey?: string;
  reviewer?: string;
  confidence?: number;
  similarity?: number;
};

type HitlQueueItem = {
  candidate_id?: string;
  rule_id?: string;
  status?: string;
  original_text?: string;
  recommended_slot?: string;
  recommended_gate?: Record<string, unknown>;
  recommended_formula?: Record<string, unknown>;
  ai_confidence?: number;
  review_required?: boolean;
  historical_similar_cases?: HitlSimilarCase[];
};

type HitlQueueResponse = {
  status?: string;
  job_id?: string;
  queue_count?: number;
  queue?: HitlQueueItem[];
};

type ArtifactIndex = {
  job_id?: string;
  std_code?: string;
  spec_code?: string;
  spec_version?: string;
  source_doc_hash?: string;
  title?: string;
  spec_type?: string;
  version?: string;
  generated_at?: string;
  valid?: boolean;
  files?: Record<string, string>;
  validations?: Record<string, { valid?: boolean; schema_valid?: boolean; business_valid?: boolean; errors?: string[] }>;
  artifact_summaries?: Record<string, { generated?: boolean; valid?: boolean; count?: number; status?: string }>;
};
type PipelineStageRow = {
  key?: string;
  name?: string;
  status?: string;
  artifacts?: string[];
  blockers?: string[];
};
type PipelineStatusResponse = {
  status?: string;
  job_id?: string;
  pipeline?: PipelineStageRow[];
  current_stage?: string;
  current_blocker?: string;
  next_action?: string;
  traceability?: Record<string, unknown>;
};
type StatusAggregationResponse = {
  status?: string;
  job_id?: string;
  readiness?: {
    semantic_ready?: boolean;
    execution_ready?: boolean;
    publish_ready?: boolean;
  };
  current?: {
    stage?: string;
    blocker?: string;
    next_action?: string;
  };
  root_cause_summary?: {
    schema_version?: string;
    items?: Array<{ code?: string; count?: number; message?: string }>;
    total_blockers?: number;
  };
  counts?: Record<string, number>;
};
type AssetIntegrityReport = {
  schema_version?: string;
  generated_at?: string;
  job_id?: string;
  publish_status?: "ready" | "blocked" | string;
  integrity_report_path?: string;
  summary?: {
    dangling_specir_refs?: number;
    dangling_rule_refs?: number;
    dangling_gate_refs?: number;
    dangling_slot_refs?: number;
    unused_components?: number;
    duplicate_rules?: number;
    duplicate_gates?: number;
    failed_rulepacks?: number;
    checked_rulepacks?: number;
  };
  items?: Array<Record<string, unknown>>;
  blockers?: string[];
};
type SpecIRGraphNode = { id?: string; type?: string; label?: string };
type SpecIRGraphEdge = { source?: string; target?: string; relation?: string };
type SpecIRGraphData = { nodes?: SpecIRGraphNode[]; edges?: SpecIRGraphEdge[]; node_count?: number; edge_count?: number };
type SpecIRGraphResponse = { status?: string; job_id?: string; graph?: SpecIRGraphData; graph_path?: string };
type SpecIRImpactResponse = {
  status?: string;
  job_id?: string;
  seed_nodes?: string[];
  affected_nodes?: SpecIRGraphNode[];
  affected_edges?: SpecIRGraphEdge[];
  summary?: {
    node_count?: number;
    edge_count?: number;
    by_type?: Record<string, number>;
    affected_forms?: string[];
    affected_rules?: string[];
    affected_gates?: string[];
    affected_rulepacks?: string[];
    affected_normdocs?: string[];
  };
  query?: { normRef?: string; slotKey?: string; specir_id?: string };
};
type SpecIRCrossNormResponse = {
  status?: string;
  job_id?: string;
  current_norm_version?: string;
  relations?: Array<{ target_rulepack?: string; target_norm_version?: string; shared_normref_count?: number; shared_normrefs?: string[] }>;
  summary?: { total?: number };
};
type FormImpactPropagationResponse = {
  status?: string;
  job_id?: string;
  seed_nodes?: string[];
  affected_forms?: Array<{
    form_code?: string;
    confidence?: number;
    score_breakdown?: Record<string, number>;
  }>;
  count?: number;
};
type FormImpactDiffResponse = {
  status?: string;
  left_rulepack?: string;
  right_rulepack?: string;
  summary?: {
    added_node_count?: number;
    removed_node_count?: number;
    added_edge_count?: number;
    removed_edge_count?: number;
  };
  added_nodes?: string[];
  removed_nodes?: string[];
  added_edges?: string[];
  removed_edges?: string[];
};
type ProductionReleaseStep = { name?: string; status?: string; logs?: string[]; artifacts?: string[] };
type ProductionReleaseReport = {
  schema_version?: string;
  job_id?: string;
  status?: string;
  publish_state?: "draft" | "review_required" | "blocked" | "publish_ready" | "published" | "rollbacked" | string;
  stopped_at?: string;
  publish_report?: Record<string, unknown>;
  blocked_reason?: string[];
  impacted_forms?: string[];
  missing_dependencies?: string[];
  dry_run_report?: {
    publish_report?: Record<string, unknown>;
    blocked_reason?: string[];
    impacted_forms?: string[];
    missing_dependencies?: string[];
  };
  steps?: ProductionReleaseStep[];
  generated_at?: string;
};
type ProductionAuditEvent = {
  event_id?: string;
  time?: string;
  event_type?: string;
  action?: string;
  actor?: string;
  target?: string;
  event_hash?: string;
  prev_hash?: string;
};
type ProductionAuditTimelineResponse = {
  status?: string;
  immutable?: boolean;
  chain_valid?: boolean;
  chain?: { valid?: boolean; checked?: number; issues?: string[]; head_hash?: string };
  items?: ProductionAuditEvent[];
};
type ProductionAuditDiffResponse = {
  status?: string;
  event_id?: string;
  event_type?: string;
  actor?: string;
  time?: string;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  event_hash?: string;
  prev_hash?: string;
};
type ArtifactRegistryVersion = {
  artifact_id?: string;
  version?: string;
  created_at?: string;
  created_by?: string;
  hash?: string;
  path?: string;
};
type ArtifactRegistryResponse = {
  status?: string;
  job_id?: string;
  artifacts?: Record<string, ArtifactRegistryVersion[]>;
};
type ParsedSpecLibraryItem = {
  jobId: string;
  stdCode: string;
  title: string;
  version: string;
  specType: string;
  catalogNodeCount: number;
  updatedAt: string;
};
type ParsedCatalogNodeSnapshot = {
  id: string;
  title: string;
  type: string;
  page: number;
  parentId: string | null;
};
type GoldenSample = {
  form_code?: string;
  field_name?: string;
  expected_specir?: string;
  expected_rule?: string;
  expected_gate?: string;
  expected_threshold?: unknown;
  expected_operator?: string;
  expected_unit?: string;
  normRef?: string;
  source_clause?: string;
  source_text?: string;
  version?: string;
};
type GoldenSetResponse = {
  status?: string;
  form_code?: string;
  version?: string;
  total?: number;
  normref_bound?: number;
  normref_missing?: number;
  items?: GoldenSample[];
};
type GoldenHistoryResponse = {
  status?: string;
  form_code?: string;
  current_version?: string;
  history_count?: number;
  history?: Array<{
    version?: string;
    from_version?: string;
    updated_at?: string;
    updated_by?: string;
    comment?: string;
    diff?: {
      old_sample_count?: number;
      new_sample_count?: number;
      old_hash?: string;
      new_hash?: string;
    };
  }>;
};
type NormVersionRow = {
  norm_id?: string;
  norm_name?: string;
  version?: string;
  effective_date?: string;
  source_hash?: string;
  source_file_hash?: string;
  parent_version?: string;
  status?: string;
  updated_at?: string;
};
type NormVersionHistoryResponse = {
  status?: string;
  norm_id?: string;
  history?: NormVersionRow[];
};
type ReleaseHistoryItem = {
  action?: string;
  version?: string;
  from_version?: string;
  to_version?: string;
  operator?: string;
  time?: string;
  rollback_reason?: string;
};
type ReleaseCurrentResponse = {
  status?: string;
  form_code?: string;
  current?: {
    active_version?: string;
    history?: ReleaseHistoryItem[];
    updated_at?: string;
    updated_by?: string;
  };
  active_version?: string;
  history?: ReleaseHistoryItem[];
};
type QualityDashboardResponse = {
  status?: string;
  dashboard?: {
    today_build?: { build_count?: number; success_count?: number; failed_count?: number };
    rule_quality?: { rule_count?: number; gate_count?: number; missing_gate_count?: number; unresolved_count?: number };
    publish_quality?: { publish_success_rate?: number; rollback_count?: number; gray_release_count?: number };
    form_quality?: { form_coverage_rate?: number; auto_gate_rate?: number; manual_review_rate?: number };
    top_issues?: {
      top_unresolved?: Array<{ reason?: string; count?: number }>;
      top_missing_gate?: Array<{ field?: string; count?: number }>;
      top_regression_failures?: Array<{ target?: string; count?: number }>;
    };
  };
};
type QualityTrendPoint = {
  bucket?: string;
  rule_count?: number;
  gate_coverage?: number;
  unresolved_count?: number;
  publish_success_rate?: number;
  rollback_count?: number;
};
type QualityTrendResponse = {
  status?: string;
  analytics?: {
    quality_report_path?: string;
    filters?: {
      form_code?: string;
      norm_version?: string;
      compare_norm_version?: string;
      date_from?: string;
      date_to?: string;
      granularity?: "day" | "week" | "month" | string;
    };
    trends?: QualityTrendPoint[];
    compare_trends?: QualityTrendPoint[];
  };
};
type WorkflowState = "completed" | "pending" | "partial" | "failed" | "generated_unpublishable";
type PipelineStageStatus = "not_started" | "running" | "success" | "failed" | "blocked";
type PipelineStageKey = "pdf" | "documentIR" | "catalog" | "normRef" | "specIR" | "rule" | "gate" | "rulepack" | "normDoc" | "publish";
type SemanticStatus = "parsed" | "understood" | "ambiguous" | "conflicted" | "rejected";
type ExecutionStatus = "executable" | "partial_executable" | "not_executable" | "needs_slot" | "needs_formula" | "needs_runtime";
type PipelineStageView = {
  status: PipelineStageStatus;
  output_count: number;
  error?: string;
  blocked_by?: PipelineStageKey;
};
type ConfidenceLevel = "high" | "medium" | "low";
type ArtifactDocument = Record<string, unknown>;
type ArtifactRule = Record<string, unknown>;
type ArtifactComponent = Record<string, unknown>;
type ArtifactGate = Record<string, unknown>;
type ArtifactClauseClassification = Record<string, unknown>;
type ArtifactClauseNode = Record<string, unknown>;
type ArtifactNormDoc = Record<string, unknown>;
type SpecIRRule = {
  field?: string | null;
  op?: string | null;
  value?: string | number | null;
  min?: string | number | null;
  max?: string | number | null;
  unit?: string | null;
};
type SpecIRGate = {
  need_gate?: boolean;
  logic?: string;
  fail_level?: string | null;
};
type SpecIREvidence = {
  original_text?: string;
  source_clause_id?: string;
  catalog_path?: string;
};
type SpecIRItem = {
  specir_id?: string;
  normRef?: string;
  slotKey?: string;
  semantic_status?: SemanticStatus | string;
  execution_status?: ExecutionStatus | string;
  runtime_requirements?: string[];
  runtime_mode?: "automatic" | "semi_automatic" | "manual_confirmed" | "non_executable" | string;
  component_id?: string;
  summary?: string;
  explanation?: string;
  rule?: SpecIRRule;
  gate?: SpecIRGate;
  executable?: boolean;
  issues?: string[];
  evidence?: SpecIREvidence;
};
type SpecIRDocument = {
  job_id?: string;
  std_code?: string;
  title?: string;
  generated_at?: string;
  count?: number;
  items?: SpecIRItem[];
};
type SpecIRTraceResponse = {
  status?: string;
  job_id?: string;
  specir_id?: string;
  source_clause?: {
    normRef?: string;
    source_clause_id?: string;
    catalog_path?: string;
    original_text?: string;
  };
  derived_rules?: Array<Record<string, unknown>>;
  derived_gates?: Array<Record<string, unknown>>;
  form_codes?: string[];
  used_forms?: string[];
  published_rulepacks?: string[];
};
type TraceabilityRecord = {
  type?: string;
  id?: string;
  at?: string;
  data?: Record<string, unknown>;
};
type TraceabilityResponse = {
  schema_version?: string;
  generated_at?: string;
  job_id?: string;
  form_code?: string;
  rulepack_name?: string;
  traceability_path?: string;
  timeline?: TraceabilityRecord[];
};

type BuildNormDocResponse = {
  job_id: string;
  output_path: string;
  form_type: string;
  approved_count: number;
  signature_count: number;
  candidate_digest: string;
};

type RuleStorePublishResponse = {
  version?: string;
  status?: string;
  source?: string;
  data?: {
    item?: {
      normdoc?: {
        normdoc_id?: string;
        version?: string;
        status?: string;
      };
      rule_package?: {
        package_id?: string;
        version?: string;
        status?: string;
      };
    };
  };
};

type SpecBundleBuildResponse = {
  status?: string;
  source_mode?: string;
  source_job_id?: string;
  bundle_name?: string;
  bundle_path?: string;
  download_url?: string;
  bundle_hash?: string;
};

type SpecBundleVerifyResponse = {
  status?: string;
  bundle_name?: string;
  bundle_path?: string;
  valid?: boolean;
  source_job_id?: string;
  checks?: {
    md_hash_match?: boolean;
    json_hash_match?: boolean;
    specir_hash_match?: boolean;
    bundle_hash_match?: boolean;
  };
  expected?: Record<string, string>;
  actual?: Record<string, string>;
};

type RulePackBuildResponse = {
  status?: string;
  rulepack_name?: string;
  rulepack_path?: string;
  download_url?: string;
  meta?: {
    form_code?: string;
    spec_code?: string;
    spec_version?: string;
    job_id?: string;
    source_doc_hash?: string;
  };
  counts?: {
    components?: number;
    rules?: number;
    gates?: number;
    proof_templates?: number;
    traceability?: number;
  };
  whitelist_filtering?: {
    before_count?: Record<string, number>;
    after_count?: Record<string, number>;
    removed_noise_count?: number;
    removed_reason?: Record<string, number>;
  };
  rulepack_manifest?: {
    specir_count?: number;
    rule_count?: number;
    gate_count?: number;
    slot_count?: number;
    removed_noise_count?: number;
    path?: string;
  };
};

type RulePackMeta = {
  form_code?: string;
  spec_code?: string;
  spec_version?: string;
  norm_version?: string;
  job_id?: string;
  source_doc_hash?: string;
};

type RegistrySpuItem = {
  spuId?: string;
};

type RegistrySpuResponse = {
  items?: RegistrySpuItem[];
};

type ChatResponse = {
  status?: string;
  intent: string;
  form_type: string;
  api_params: Record<string, unknown>;
  gate_result?: Record<string, unknown> | null;
  natural_reply: string;
  session_id?: string;
  session_state?: {
    session_id?: string;
    intent?: string;
    missing_fields?: string[];
    collected_params?: Record<string, unknown>;
    current_step?: string;
  };
  answer?: string;
  answer_mode?: string;
  execution_result?: Record<string, unknown> | null;
  rule_version?: string | null;
  proof?: {
    execution_id?: string;
    timestamp?: string;
    rule_id?: string;
    rule_version?: string;
    inputs?: Record<string, unknown>;
    result?: Record<string, unknown>;
    decision_path?: Array<Record<string, unknown>>;
  } | null;
  extracted?: Record<string, unknown>;
  needs_clarification?: boolean;
  missing_fields?: string[];
  question?: string;
  clarification_questions?: string[];
  clarification_reasons?: string[];
  ui_hint?: string;
};

type CandidateDraft = {
  enabled: boolean;
  thresholdValue: string;
  needsExpertConfirm: boolean;
};

type NormDocPublishSummary = {
  normDocName: string;
  standardId: string;
  version: string;
  ruleCount: number;
  componentCount: number;
  bundleHash: string;
  signer: string;
  publishedAt: string;
  normdocId: string;
  packageId: string;
  status: string;
};
type AssetReviewRow = {
  assetType: "component" | "rule" | "gate" | "specir";
  assetId: string;
  title: string;
  checks: string;
  changedFields: string[];
  unclosed: boolean;
  unclosedReason: string;
  confidence?: number;
  confidenceLevel?: ConfidenceLevel;
};
type AssetReviewLatestItem = {
  job_id: string;
  object_type: "component" | "rule" | "gate" | "specir";
  object_id: string;
  decision: string;
  reviewer_id?: string;
  reviewer_name?: string;
  comment?: string;
  reviewed_at?: string;
};
type AssetReviewSummary = {
  total: number;
  approved: number;
  needs_edit: number;
  rejected: number;
};
type SemanticConflictType =
  | "threshold_conflict"
  | "unit_conflict"
  | "scope_conflict"
  | "version_conflict"
  | "duplicate_rule"
  | "stricter_rule_override";
type SemanticConflictRow = {
  conflict_id: string;
  slotKey: string;
  condition: string;
  conflict_type: SemanticConflictType;
  left_specir_id: string;
  right_specir_id: string;
  left_normRef: string;
  right_normRef: string;
  left_operator: string;
  right_operator: string;
  left_threshold: string;
  right_threshold: string;
  left_unit: string;
  right_unit: string;
  left_version: string;
  right_version: string;
  override_required: boolean;
};
type PublishStatus = "blocked" | "ready";

function patchTemplateForAsset(assetType: "component" | "rule" | "gate" | "specir"): string {
  if (assetType === "specir") {
    return '{"slotKey":"bridge.grouting.pressure","constraint":{"operator":">=","value":0.5,"unit":"MPa","formula":""},"gate":{"logic":"AND","decision":"pass","on_fail":"block_submit"}}';
  }
  if (assetType === "rule") {
    return '{"slot_key":"bridge.compaction.degree","condition":{"operator":">=","value":95,"unit":"%"},"semantic_status":"understood","execution_status":"executable"}';
  }
  if (assetType === "gate") {
    return '{"logic":"AND","decision":"pass","rule_ids":["rule.xxx"]}';
  }
  return '{"name":"修正后的组件名称","reason":"修正说明","executable":true}';
}

type NormDocMeta = {
  formType: string;
  standardId: string;
  version: string;
  name: string;
  status: string;
  normdocId: string;
  bundleHash: string;
  outputPath: string;
  publishable: boolean;
  reason: string;
  rulesCount: number;
  gatesCount: number;
};

type PublishWorkflowResponse = {
  status?: string;
  package_id?: string;
  bundle_hash?: string;
  normdoc?: {
    normdoc_id?: string;
    standard_code?: string;
    standard_name?: string;
    version?: string;
    status?: "draft" | "published" | "deprecated" | string;
    bundle_hash?: string;
    published_by?: string;
    published_at?: string;
    rule_count?: number;
    component_count?: number;
  };
};

function monthTag(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeStdCodeForMatch(value: string): string {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function resolveNormDocMeta(payload?: ArtifactNormDoc): NormDocMeta {
  if (!payload || typeof payload !== "object") {
    return { formType: "", standardId: "", version: "", name: "", status: "", normdocId: "", bundleHash: "", outputPath: "", publishable: false, reason: "", rulesCount: 0, gatesCount: 0 };
  }
  const body = (payload as { body?: Record<string, unknown> }).body;
  const metadata = (payload as { metadata?: Record<string, unknown> }).metadata;
  const standard = (metadata as { standard?: Record<string, unknown> } | undefined)?.standard;
  const layerpeg = (payload as { layerpeg?: Record<string, unknown> }).layerpeg;
  const layerpegHeader = (layerpeg as { header?: Record<string, unknown> } | undefined)?.header;
  const layerpegNormRef = (layerpegHeader as { normRef?: Record<string, unknown> } | undefined)?.normRef;
  return {
    formType:
      normalizeText((payload as { form_type?: unknown }).form_type)
      || normalizeText(body?.form_type)
      || normalizeText((payload as { normdoc_name?: unknown }).normdoc_name),
    standardId:
      normalizeText(layerpegNormRef?.norm)
      || normalizeText((payload as { spec_code?: unknown }).spec_code)
      || normalizeText((payload as { standard_id?: unknown }).standard_id)
      || normalizeText(standard?.id)
      || normalizeText((payload as { std_code?: unknown }).std_code),
    version:
      normalizeText(layerpegHeader?.version)
      || normalizeText((payload as { version?: unknown }).version)
      || normalizeText((payload as { standard_version?: unknown }).standard_version)
      || normalizeText(standard?.version),
    name:
      normalizeText((payload as { name?: unknown }).name)
      || normalizeText((payload as { spec_name?: unknown }).spec_name),
    status: normalizeText((payload as { status?: unknown }).status),
    normdocId: normalizeText((payload as { normdoc_id?: unknown }).normdoc_id),
    bundleHash: normalizeText((payload as { bundle_hash?: unknown }).bundle_hash),
    outputPath:
      normalizeText((payload as { output_path?: unknown }).output_path),
    publishable: Boolean((payload as { publishable?: unknown }).publishable),
    reason: normalizeText((payload as { reason?: unknown }).reason),
    rulesCount: Number((payload as { validations?: { rules_count?: unknown } }).validations?.rules_count ?? 0),
    gatesCount: Number((payload as { validations?: { gates_count?: unknown } }).validations?.gates_count ?? 0),
  };
}

function resolveArtifactUiStatus(
  statusRaw: string,
  schemaValid: boolean,
  businessValid: boolean,
  count: number,
): { text: string; className: string } {
  const status = String(statusRaw || "").trim().toLowerCase();
  if (status === "failed") {
    return {
      text: "❌ 生成失败",
      className: "rounded-full bg-rose-500/20 px-2 py-0.5 text-rose-200",
    };
  }
  if (!businessValid) {
    return {
      text: "❌ 业务错误",
      className: "rounded-full bg-rose-500/20 px-2 py-0.5 text-rose-200",
    };
  }
  if (schemaValid && count === 0) {
    return {
      text: "⚠ 空数据",
      className: "rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200",
    };
  }
  if (schemaValid && businessValid && count > 0) {
    return {
      text: "✔ 正常",
      className: "rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-200",
    };
  }
  return {
    text: "pending",
    className: "rounded-full bg-slate-700/60 px-2 py-0.5 text-slate-200",
  };
}

function inferSpecType(stdCode: string, specName: string): string {
  const normalized = normalizeStdCodeForMatch(stdCode);
  const title = String(specName || "").trim();
  if (normalized === "JTGT36502020" || title.includes("施工技术规范")) {
    return "施工技术规范";
  }
  return "工程规范";
}

function normalizeStdCodeToken(raw: string): string {
  const text = raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[／]/g, "/")
    .replace(/[—–－]/g, "-");
  if (!text) {
    return "";
  }
  if (text.includes("/") || text.includes("-")) {
    return text.replace(/\//g, "-");
  }
  const alphaNumericSplit = text.match(/^([A-Z]+)(\d{2})(\d)$/);
  if (alphaNumericSplit) {
    return `${alphaNumericSplit[1]}${alphaNumericSplit[2]}-${alphaNumericSplit[3]}`;
  }
  const numericSplit = text.match(/^(\d{2})(\d)$/);
  if (numericSplit) {
    return `${numericSplit[1]}-${numericSplit[2]}`;
  }
  return text;
}

function detectStdCodeFromFilename(filename: string): string {
  if (!filename) {
    return "";
  }
  const base = filename.replace(/\.pdf$/i, "");
  const normalized = base
    .replace(/[—–－]/g, "-")
    .replace(/[_\s]+/g, " ")
    .trim();
  const match = normalized.match(/(JTG(?:\s*\/\s*T)?)\s*([A-Z]?\d+(?:\s*\/\s*\d+)?)\s*[-\s]\s*(\d{4})/i);
  if (!match) {
    return "";
  }
  const prefixRaw = match[1].toUpperCase().replace(/\s+/g, "");
  const codeRaw = normalizeStdCodeToken(match[2]);
  const year = match[3];
  return `${prefixRaw.replace("/", "-")}-${codeRaw}-${year}`;
}

function candidateKey(candidate: RuleCandidate, index: number): string {
  return String(candidate.candidate_id || "").trim() || `${String(candidate.rule_id || "candidate").trim() || "candidate"}-${index}`;
}

function extractClauseNo(value: string): string {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const cnMatch = text.match(/第\s*(\d+\.\d+\.\d+(?:\.\d+){0,2})\s*条/);
  if (cnMatch?.[1]) {
    return cnMatch[1];
  }
  const dotMatch = text.match(/(\d+\.\d+\.\d+(?:\.\d+){0,2})/);
  return dotMatch?.[1] || "";
}

function resolveClauseNo(candidate: RuleCandidate): string {
  const directClauseNo = String(candidate.clause_no || "").trim();
  if (directClauseNo) {
    return directClauseNo;
  }
  const clauseId = String(candidate.clause_id || "").trim();
  if (clauseId) {
    return clauseId;
  }
  const normRef = String(candidate.norm_ref || "").trim();
  const extractedFromRef = extractClauseNo(normRef);
  if (extractedFromRef) {
    return extractedFromRef;
  }
  const sourceLine = String(candidate.source_line || "").trim();
  const extractedFromSource = extractClauseNo(sourceLine);
  if (extractedFromSource) {
    return extractedFromSource;
  }
  if (!normRef) {
    return "—";
  }
  return normRef;
}

function resolveClausePreview(candidate: RuleCandidate): string {
  const preview = String(candidate.clause_preview || "").trim();
  if (preview) {
    return preview;
  }
  const content = String(candidate.clause_content || "").trim();
  if (content) {
    return content.length > 140 ? `${content.slice(0, 140)}...` : content;
  }
  return "暂无条款原文";
}

function resolveBindingStatus(candidate: RuleCandidate): "bound" | "pending" {
  if (candidate.review_required) {
    return "pending";
  }
  const state = String(candidate.binding_status || "").trim().toLowerCase();
  if (state === "bound") {
    return "bound";
  }
  const clauseId = String(candidate.clause_id || "").trim();
  const clauseNo = resolveClauseNo(candidate);
  const hasClauseNo = clauseNo.length > 0 && clauseNo !== "—";
  if ((clauseId || hasClauseNo) && !candidate.review_required) {
    return "bound";
  }
  return "pending";
}

function resolveBindingStatusLabel(candidate: RuleCandidate): string {
  return resolveBindingStatus(candidate) === "bound" ? "已绑定" : "待确认";
}

function inferCandidateMetric(candidate: RuleCandidate): "compaction" | "thickness" | "deflection" | null {
  const text = [
    String(candidate.rule_id || ""),
    String(candidate.field_key || ""),
    String(candidate.category || ""),
    String(candidate.source_line || ""),
  ].join(" ").toLowerCase();
  if (text.includes("compaction") || text.includes("压实")) {
    return "compaction";
  }
  if (text.includes("thickness") || text.includes("厚度")) {
    return "thickness";
  }
  if (text.includes("deflection") || text.includes("roughness") || text.includes("弯沉") || text.includes("平整")) {
    return "deflection";
  }
  return null;
}

function resolveDetectionItem(candidate: RuleCandidate): string {
  const field = String(candidate.field_key || "").trim();
  const category = String(candidate.category || "").trim();
  if (field && category) {
    return `${field}（${category}）`;
  }
  return field || category || "—";
}

function resolveConditionText(operator?: string, threshold?: string, unit?: string): string {
  const op = String(operator || "").trim() || "—";
  const value = String(threshold || "").trim() || "—";
  const unitText = String(unit || "").trim();
  return `${op} ${value}${unitText ? ` ${unitText}` : ""}`;
}

function resolveInputParams(candidate: RuleCandidate): string {
  const field = String(candidate.field_key || "").trim();
  if (field) {
    return field;
  }
  const source = String(candidate.source_line || "").trim();
  if (!source) {
    return "—";
  }
  const tokens = source
    .replace(/[，,;；]/g, " ")
    .split(/\s+/)
    .filter((item) => item.length > 1)
    .slice(0, 3);
  return tokens.length > 0 ? tokens.join(" / ") : source;
}

function statusLabel(status?: string): string {
  const value = (status || "").toLowerCase();
  if (value === "completed") return "已完成";
  if (value === "review_required") return "待复核";
  if (value === "pending_review") return "待人工校验";
  if (value === "review_in_progress") return "人工校验中";
  if (value === "review_completed") return "人工校验完成";
  if (value === "failed") return "失败";
  if (value === "approved") return "已通过";
  if (value === "rejected") return "已驳回";
  if (value === "approve") return "已通过";
  if (value === "reject") return "已驳回";
  if (value === "needs_edit") return "需修改";
  if (value === "pending") return "待处理";
  if (value === "pass") return "通过";
  if (value === "warning") return "告警";
  if (value === "blocked") return "阻断";
  return status || "-";
}

function boolLabel(value: boolean | undefined): string {
  return value ? "是" : "否";
}

function normalizeClauseTree(tree?: ClauseTree): ClauseTreeNode[] {
  if (!tree || typeof tree !== "object") {
    return [];
  }
  const roots = Array.isArray(tree.roots) ? tree.roots.filter((item): item is ClauseTreeNode => typeof item === "object" && item !== null) : [];
  if (roots.length > 0) {
    return roots;
  }

  const flat = Array.isArray(tree.nodes) ? tree.nodes.filter((item): item is ClauseTreeNode => typeof item === "object" && item !== null) : [];
  if (flat.length === 0) {
    return [];
  }

  const nodesById: Record<string, ClauseTreeNode> = {};
  const orderedIds: string[] = [];
  for (let i = 0; i < flat.length; i += 1) {
    const row = flat[i];
    const clauseId = String(row.clause_id || "").trim() || `auto-${i + 1}`;
    if (nodesById[clauseId]) {
      continue;
    }
    nodesById[clauseId] = {
      clause_id: clauseId,
      title: String(row.title || "").trim(),
      depth: typeof row.depth === "number" ? row.depth : 1,
      parent_id: row.parent_id || null,
      page_no: typeof row.page_no === "number" ? row.page_no : 0,
      line_no: typeof row.line_no === "number" ? row.line_no : 0,
      node_type: String((row as { node_type?: unknown }).node_type || "").trim(),
      executable: Boolean((row as { executable?: unknown }).executable),
      children: [],
    };
    orderedIds.push(clauseId);
  }

  const builtRoots: ClauseTreeNode[] = [];
  for (let i = 0; i < orderedIds.length; i += 1) {
    const clauseId = orderedIds[i];
    const node = nodesById[clauseId];
    const parentId = String(node.parent_id || "").trim();
    if (parentId && nodesById[parentId]) {
      if (!Array.isArray(nodesById[parentId].children)) {
        nodesById[parentId].children = [];
      }
      nodesById[parentId].children?.push(node);
    } else {
      builtRoots.push(node);
    }
  }
  return builtRoots;
}

function flattenClauseTreeNodes(roots: ClauseTreeNode[]): ClauseTreeNode[] {
  const queue = [...roots];
  const flattened: ClauseTreeNode[] = [];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      continue;
    }
    flattened.push(node);
    const children = Array.isArray(node.children)
      ? node.children.filter((item): item is ClauseTreeNode => typeof item === "object" && item !== null)
      : [];
    queue.push(...children);
  }
  return flattened;
}

function filterClauseTreeMetadata(nodes: ClauseTreeNode[], showMetadata: boolean): ClauseTreeNode[] {
  if (showMetadata) return nodes;
  const next: ClauseTreeNode[] = [];
  for (const node of nodes) {
    const isMetadata = String(node.node_type || "").toLowerCase() === "metadata";
    if (isMetadata) continue;
    const children = Array.isArray(node.children) ? filterClauseTreeMetadata(node.children, showMetadata) : [];
    next.push({ ...node, children });
  }
  return next;
}

function flattenArtifactClauseTree(nodes: ArtifactClauseNode[]): ArtifactClauseNode[] {
  const result: ArtifactClauseNode[] = [];
  const queue = [...nodes];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    result.push(current);
    const children = current.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === "object") queue.push(child as ArtifactClauseNode);
      }
    }
  }
  return result;
}

function findClauseIdByMetric(roots: ClauseTreeNode[], metric: "compaction" | "thickness" | "deflection"): string {
  if (roots.length === 0) {
    return "";
  }
  const nodes = flattenClauseTreeNodes(roots);
  const keywords = metric === "compaction"
    ? ["压实", "compaction"]
    : metric === "thickness"
      ? ["厚度", "thickness"]
      : ["弯沉", "deflection", "平整"];
  for (const node of nodes) {
    const title = String(node.title || "").toLowerCase();
    if (!title) {
      continue;
    }
    if (keywords.some((keyword) => title.includes(keyword.toLowerCase()))) {
      const clauseId = String(node.clause_id || "").trim();
      if (clauseId) {
        return clauseId;
      }
    }
  }
  return "";
}

function ClauseTreeItem({ node, level }: { node: ClauseTreeNode; level: number }) {
  const children = Array.isArray(node.children) ? node.children : [];
  const hasChildren = children.length > 0;
  const clauseId = node.clause_id || "-";
  const title = node.title || "";
  const pageNo = typeof node.page_no === "number" && node.page_no > 0 ? node.page_no : 0;
  const lineNo = typeof node.line_no === "number" && node.line_no > 0 ? node.line_no : 0;
  const location = pageNo > 0 ? `P${pageNo}${lineNo > 0 ? ` L${lineNo}` : ""}` : "";

  if (!hasChildren) {
    return (
      <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-xs">
        <p className="font-medium text-slate-100">{clauseId}</p>
        <p className="text-slate-300">{title || "（无标题）"}</p>
        {location ? <p className="mt-1 text-[11px] text-slate-400">{location}</p> : null}
      </div>
    );
  }

  return (
    <details className="rounded-lg border border-slate-700/70 bg-slate-900/60" open={level < 2}>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs">
        <span className="font-medium text-slate-100">{clauseId}</span>
        <span className="ml-2 text-slate-300">{title || "（无标题）"}</span>
        {location ? <span className="ml-2 text-[11px] text-slate-500">{location}</span> : null}
      </summary>
      <div className="space-y-2 border-t border-slate-700/70 px-3 py-2">
        {children.map((child, idx) => (
          <ClauseTreeItem
            key={`${child.clause_id || "node"}-${idx}`}
            node={child}
            level={level + 1}
          />
        ))}
      </div>
    </details>
  );
}

function ClauseTreePanel({ title, roots, showMetadata }: { title: string; roots: ClauseTreeNode[]; showMetadata: boolean }) {
  const filteredRoots = useMemo(() => filterClauseTreeMetadata(roots, showMetadata), [roots, showMetadata]);
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {filteredRoots.length === 0 ? (
        <p className="text-xs text-slate-400">暂无可展示的条款树节点。</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {filteredRoots.map((root, idx) => (
            <ClauseTreeItem
              key={`${root.clause_id || "root"}-${idx}`}
              node={root}
              level={1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

async function readJsonResponse<T>(response: Response): Promise<T | { detail?: unknown }> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return { detail: text };
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const errorText = (payload as { error?: unknown }).error;
  if (typeof errorText === "string" && errorText.trim()) {
    return errorText;
  }
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (detail && typeof detail === "object") {
    return JSON.stringify(detail, null, 2);
  }
  const fallbackText = String(fallback || "").trim();
  if (fallbackText.includes("spu not found")) {
    return "发布失败：候选规则尚未映射为执行器可识别的 SPU。请优先选择可执行规则（如路基三件套）后再发布。";
  }
  return fallback;
}

function toUserFacingError(err: unknown, options?: { baseUrl?: string; serviceName?: string }): string {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = String(message || "").trim();
  if (!normalized) {
    return "请求失败，请稍后重试。";
  }
  const isNetworkFailure = normalized === "Failed to fetch"
    || /NetworkError|Load failed|fetch failed|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ECONNREFUSED/i.test(normalized);
  if (!isNetworkFailure) {
    return normalized;
  }
  const serviceName = String(options?.serviceName || "API").trim() || "API";
  const baseUrl = String(options?.baseUrl || "").trim();
  return baseUrl
    ? `无法连接${serviceName}（${baseUrl}），请确认服务已启动且地址可访问。`
    : `无法连接${serviceName}，请确认服务已启动且地址可访问。`;
}

export default function App() {
  if (typeof window !== "undefined") {
    const mode = new URLSearchParams(window.location.search).get("view");
    if (mode === "specir-review") {
      return <SpecIRReviewPage />;
    }
  }

  const [apiBase, setApiBase] = useState("/api");
  const [apiProbeBusy, setApiProbeBusy] = useState(false);
  const [apiProbeMessage, setApiProbeMessage] = useState("");
  const [ruleStoreApiBase, setRuleStoreApiBase] = useState("http://127.0.0.1:8790");
  const [stdCode, setStdCode] = useState("");
  const [stdCodeTouched, setStdCodeTouched] = useState(false);
  const [autoDetectedStdCode, setAutoDetectedStdCode] = useState("");
  const [level, setLevel] = useState("industry");
  const [levelTouched, setLevelTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [publish, setPublish] = useState(false);
  const [writeToDocs, setWriteToDocs] = useState(false);
  const [versionTag, setVersionTag] = useState(monthTag());
  const [approveThreshold, setApproveThreshold] = useState("0.75");
  const [ocrMaxPages, setOcrMaxPages] = useState("0");
  const [aiPreprocess, setAiPreprocess] = useState(true);
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [inputSource, setInputSource] = useState<"pdf" | "normref">("pdf");
  const [inputNormRef, setInputNormRef] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [ingestRunId, setIngestRunId] = useState("");
  const [ingestProgress, setIngestProgress] = useState(0);
  const [ingestStageText, setIngestStageText] = useState("");
  const [ingestRunning, setIngestRunning] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectResult, setInspectResult] = useState<InspectResponse | null>(null);
  const [inspectError, setInspectError] = useState("");

  const [selectedJobId, setSelectedJobId] = useState("");
  const [reviewPackage, setReviewPackage] = useState<ReviewPackage | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatusResponse | null>(null);
  const [statusAggregation, setStatusAggregation] = useState<StatusAggregationResponse | null>(null);
  const [assetIntegrityReport, setAssetIntegrityReport] = useState<AssetIntegrityReport | null>(null);
  const [goldenSet, setGoldenSet] = useState<GoldenSetResponse | null>(null);
  const [goldenHistory, setGoldenHistory] = useState<GoldenHistoryResponse | null>(null);
  const [normVersionHistory, setNormVersionHistory] = useState<NormVersionHistoryResponse | null>(null);
  const [releaseHistory, setReleaseHistory] = useState<ReleaseCurrentResponse | null>(null);
  const [qualityDashboard, setQualityDashboard] = useState<QualityDashboardResponse | null>(null);
  const [qualityTrend, setQualityTrend] = useState<QualityTrendResponse | null>(null);
  const [trendGranularity, setTrendGranularity] = useState<"day" | "week" | "month">("day");
  const [trendCompareNormVersion, setTrendCompareNormVersion] = useState("");
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("manual rollback");
  const [artifactIndex, setArtifactIndex] = useState<ArtifactIndex | null>(null);
  const [artifactRegistry, setArtifactRegistry] = useState<ArtifactRegistryResponse | null>(null);
  const [artifactRegistryDiff, setArtifactRegistryDiff] = useState<string[]>([]);
  const [specirGraph, setSpecirGraph] = useState<SpecIRGraphResponse | null>(null);
  const [specirImpact, setSpecirImpact] = useState<SpecIRImpactResponse | null>(null);
  const [specirPublishImpactReport, setSpecirPublishImpactReport] = useState<Record<string, unknown> | null>(null);
  const [specirCrossNorm, setSpecirCrossNorm] = useState<SpecIRCrossNormResponse | null>(null);
  const [formImpactPropagation, setFormImpactPropagation] = useState<FormImpactPropagationResponse | null>(null);
  const [formImpactDiff, setFormImpactDiff] = useState<FormImpactDiffResponse | null>(null);
  const [productionReleaseReport, setProductionReleaseReport] = useState<ProductionReleaseReport | null>(null);
  const [productionReleaseRunning, setProductionReleaseRunning] = useState(false);
  const [productionReleaseDryRun, setProductionReleaseDryRun] = useState(false);
  const [productionAuditTimeline, setProductionAuditTimeline] = useState<ProductionAuditTimelineResponse | null>(null);
  const [productionAuditDiff, setProductionAuditDiff] = useState<ProductionAuditDiffResponse | null>(null);
  const [productionAuditEventId, setProductionAuditEventId] = useState("");
  const [productionAuditBusy, setProductionAuditBusy] = useState(false);
  const [specirGraphQuery, setSpecirGraphQuery] = useState("");
  const [specirGraphNodeType, setSpecirGraphNodeType] = useState("");
  const [specirGraphNodeId, setSpecirGraphNodeId] = useState("");
  const [specirImpactNormRef, setSpecirImpactNormRef] = useState("");
  const [specirImpactSlotKey, setSpecirImpactSlotKey] = useState("");
  const [specirImpactSpecirId, setSpecirImpactSpecirId] = useState("");
  const [artifactDocs, setArtifactDocs] = useState<Record<string, ArtifactDocument>>({});
  const [specirDoc, setSpecirDoc] = useState<SpecIRDocument | null>(null);
  const [specirTrace, setSpecirTrace] = useState<SpecIRTraceResponse | null>(null);
  const [specirTraceLoading, setSpecirTraceLoading] = useState(false);
  const [traceabilityDoc, setTraceabilityDoc] = useState<TraceabilityResponse | null>(null);
  const [traceabilityLoading, setTraceabilityLoading] = useState(false);
  const [selectedSpecirId, setSelectedSpecirId] = useState("");
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactError, setArtifactError] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewSuccess, setReviewSuccess] = useState("");
  const [hitlQueue, setHitlQueue] = useState<HitlQueueItem[]>([]);
  const [hitlBusyById, setHitlBusyById] = useState<Record<string, boolean>>({});
  const [hitlModifyById, setHitlModifyById] = useState<Record<string, string>>({});
  const [actionCandidateId, setActionCandidateId] = useState("");
  const [confirmingCandidateId, setConfirmingCandidateId] = useState("");
  const [confirmResultByKey, setConfirmResultByKey] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [candidateDrafts, setCandidateDrafts] = useState<Record<string, CandidateDraft>>({});
  const [reviewerId, setReviewerId] = useState("expert.001");
  const [reviewerName, setReviewerName] = useState("领域专家");
  const [reviewComment, setReviewComment] = useState("");
  const [showMetadataNodes, setShowMetadataNodes] = useState(false);
  const [assetReviewBusy, setAssetReviewBusy] = useState<Record<string, boolean>>({});
  const [assetReviewLatestByKeyFromApi, setAssetReviewLatestByKeyFromApi] = useState<Record<string, string>>({});
  const [assetReviewSummaryFromApi, setAssetReviewSummaryFromApi] = useState<AssetReviewSummary | null>(null);
  const [assetPatchByKey, setAssetPatchByKey] = useState<Record<string, string>>({});
  const [assetPatchExpandedByKey, setAssetPatchExpandedByKey] = useState<Record<string, boolean>>({});
  const [assetPatchFormByKey, setAssetPatchFormByKey] = useState<Record<string, Record<string, string>>>({});
  const [conflictOverrideById, setConflictOverrideById] = useState<Record<string, boolean>>({});
  const [conflictOverrideCommentById, setConflictOverrideCommentById] = useState<Record<string, string>>({});
  const [assetReviewDecisionFilter, setAssetReviewDecisionFilter] = useState<"all" | "unsubmitted" | "approved" | "needs_edit" | "rejected">("all");
  const [assetBatchBusy, setAssetBatchBusy] = useState(false);
  const [onlyUnclosedAssets, setOnlyUnclosedAssets] = useState(false);
  const [enforceManualReviewBeforePublish, setEnforceManualReviewBeforePublish] = useState(false);
  const [componentTypeFilter, setComponentTypeFilter] = useState("all");
  const [componentExecutableFilter, setComponentExecutableFilter] = useState("true");
  const [componentReviewFilter, setComponentReviewFilter] = useState("all");
  const [componentClauseFilter, setComponentClauseFilter] = useState("");
  const [componentDetailId, setComponentDetailId] = useState("");
  const [componentReviewStatusById, setComponentReviewStatusById] = useState<Record<string, "unreviewed" | "reviewed" | "issue">>({});
  const [componentReviewNote, setComponentReviewNote] = useState("");
  const [componentReviewChecklist, setComponentReviewChecklist] = useState<{
    rule_correct: boolean;
    gate_complete: boolean;
    evidence_consistent: boolean;
  }>({
    rule_correct: true,
    gate_complete: true,
    evidence_consistent: true,
  });
  const [componentReviewRecordsById, setComponentReviewRecordsById] = useState<Record<string, Array<{
    reviewer_id: string;
    reviewer_name: string;
    reviewed_at: string;
    action: "reviewed" | "issue" | "reset";
    checklist: {
      rule_correct: boolean;
      gate_complete: boolean;
      evidence_consistent: boolean;
    };
    suggestion: string;
    note: string;
  }>>>({});
  const [ruleListFilter, setRuleListFilter] = useState<"all" | "ready" | "partial" | "pending" | "blocked" | "rejected">("all");
  const [ruleDetailId, setRuleDetailId] = useState("");
  const [ruleListScrollTop, setRuleListScrollTop] = useState(0);
  const [showDtoList, setShowDtoList] = useState(false);
  const [showProofList, setShowProofList] = useState(false);
  const [selectedCatalogNodeKey, setSelectedCatalogNodeKey] = useState("");
  const [catalogL3Only, setCatalogL3Only] = useState(false);
  const [catalogStrictThreeLevels, setCatalogStrictThreeLevels] = useState(true);
  const [catalogCoverageFilter, setCatalogCoverageFilter] = useState<"all" | "unmapped" | "no_text" | "no_detail">("all");
  const [normWorkbenchTab, setNormWorkbenchTab] = useState<
    "content" | "analysis" | "indicator" | "forms" | "mapping" | "formula" | "refs" | "spec_table" | "eng_rules" | "constraints" | "process" | "scope" | "body" | "specir" | "gate" | "proof" | "qa_map"
  >("content");
  const [workspaceMode, setWorkspaceMode] = useState<"test" | "expert">("test");
  const [favoriteNodeKeys, setFavoriteNodeKeys] = useState<Record<string, boolean>>({});
  const [executionTraceFocusId, setExecutionTraceFocusId] = useState("");

  const [expertId, setExpertId] = useState("expert.001");
  const [expertName, setExpertName] = useState("领域专家");
  const [expertComment, setExpertComment] = useState("");
  const [signMessage, setSignMessage] = useState("");
  const [latestSignatureHash, setLatestSignatureHash] = useState("");

  const [buildFormType, setBuildFormType] = useState("");
  const [buildStandardId, setBuildStandardId] = useState("");
  const [buildStandardVersion, setBuildStandardVersion] = useState("");
  const [buildOutputPath, setBuildOutputPath] = useState("");
  const [buildResult, setBuildResult] = useState<BuildNormDocResponse | null>(null);
  const [publishFlowLoading, setPublishFlowLoading] = useState(false);
  const [publishFlowMessage, setPublishFlowMessage] = useState("");
  const [publishExecutablePackage, setPublishExecutablePackage] = useState(false);
  const [publishSummary, setPublishSummary] = useState<NormDocPublishSummary | null>(null);
  const [specBundleLoading, setSpecBundleLoading] = useState(false);
  const [specBundleMessage, setSpecBundleMessage] = useState("");
  const [specBundleName, setSpecBundleName] = useState("");
  const [rulePackLoading, setRulePackLoading] = useState(false);
  const [rulePackMessage, setRulePackMessage] = useState("");
  const [rulePackName, setRulePackName] = useState("");
  const [rulePackMeta, setRulePackMeta] = useState<RulePackMeta | null>(null);
  const [rulePackFormCode, setRulePackFormCode] = useState("bridge_shi_13");
  const [specBundleVerifyLoading, setSpecBundleVerifyLoading] = useState(false);
  const [specBundleVerifyReport, setSpecBundleVerifyReport] = useState<SpecBundleVerifyResponse | null>(null);

  // 测试用 sandbox 参数：仅用于单条规则验证入口。
  const [chatProjectId, setChatProjectId] = useState("GXX_2024_XXX");
  const [chatUserId, setChatUserId] = useState("inspector_001");
  const [chatMessage, setChatMessage] = useState("K15+200压实度94.5%可以吗？");
  const [chatSessionId, setChatSessionId] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null);
  const [showInputTechDetails, setShowInputTechDetails] = useState(false);
  const [parsedSpecLibrary, setParsedSpecLibrary] = useState<ParsedSpecLibraryItem[]>([]);
  const [activeSpecJobId, setActiveSpecJobId] = useState("");
  const [parsedSpecCatalogCache, setParsedSpecCatalogCache] = useState<Record<string, ParsedCatalogNodeSnapshot[]>>({});
  const [catalogSearchKeyword, setCatalogSearchKeyword] = useState("");
  const [pendingCatalogNodeKey, setPendingCatalogNodeKey] = useState("");
  const [expandedSpecTreeKeys, setExpandedSpecTreeKeys] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputSectionRef = useRef<HTMLFormElement | null>(null);
  const reviewSectionRef = useRef<HTMLElement | null>(null);
  const normWorkbenchPrintRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setParsedSpecLibrary([]);
    setParsedSpecCatalogCache({});
  }, []);

  useEffect(() => {
    const current = String(selectedJobId || "").trim();
    const active = String(activeSpecJobId || "").trim();
    if (current || !active) return;
    setSelectedJobId(active);
    void loadReviewJob(active);
  }, [activeSpecJobId, selectedJobId]);

  useEffect(() => {
    const jobId = String(selectedJobId || "").trim();
    if (!jobId) return;
    setActiveSpecJobId(jobId);
  }, [selectedJobId]);
  const loadReviewSeqRef = useRef(0);
  const endpointBase = useMemo(() => apiBase.replace(/\/$/, ""), [apiBase]);
  const ruleStoreEndpointBase = useMemo(() => ruleStoreApiBase.replace(/\/$/, ""), [ruleStoreApiBase]);
  const firstJobRow = result?.ingest?.report?.jobs?.[0];
  const firstJob = firstJobRow?.job;
  const aiInfo = firstJob?.ai_preprocess;
  const currentJobId = selectedJobId.trim();
  const currentJobSpec = useMemo(() => {
    const specDoc = artifactDocs["01_spec.json"];
    const specCode = specDoc && typeof specDoc === "object"
      ? String((specDoc as { spec_code?: unknown; standard_code?: unknown }).spec_code || (specDoc as { standard_code?: unknown }).standard_code || "").trim()
      : "";
    const std = String(
      specCode
      || "",
    ).trim();
    const name = String(
      reviewPackage?.title
      || artifactIndex?.title
      || "",
    ).trim();
    const type = String(
      reviewPackage?.spec_type
      || artifactIndex?.spec_type
      || inferSpecType(std, name),
    ).trim();
    return {
      stdCode: std,
      name,
      type: type || inferSpecType(std, name),
    };
  }, [
    artifactDocs,
    artifactIndex?.spec_type,
    artifactIndex?.std_code,
    artifactIndex?.title,
    reviewPackage?.spec_type,
    reviewPackage?.std_code,
    reviewPackage?.title,
  ]);
  const step1ClauseTreeRoots = useMemo(() => normalizeClauseTree(firstJob?.clause_tree), [firstJob?.clause_tree]);
  const step2ClauseTreeRoots = useMemo(() => normalizeClauseTree(reviewPackage?.clause_tree), [reviewPackage?.clause_tree]);
  const isConstructionSpec = currentJobSpec.type.includes("施工技术规范");
  const isQualityEvalSpec = currentJobSpec.type.includes("质量检验评定标准");
  const specFocusLabels = isConstructionSpec
    ? ["施工过程规则", "施工准备", "材料要求", "方法要求", "工艺控制"]
    : isQualityEvalSpec
      ? ["实测项目", "合格率", "检验评定"]
      : ["条款节点", "资产候选", "可执行规则", "待解析项"];

  const probeApiEndpoint = useCallback(async (silent = false) => {
    if (!silent) {
      setApiProbeBusy(true);
      setApiProbeMessage("正在探测 API 地址...");
    }
    const normalize = (x: string) => x.replace(/\/+$/, "");
    const protocol = typeof window !== "undefined" ? (window.location.protocol || "http:") : "http:";
    const host = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const candidates = Array.from(new Set([
      normalize(apiBase),
      "/api",
      `${protocol}//${host}:8081`,
      origin,
      "http://127.0.0.1:8081",
      "http://localhost:8081",
      "https://127.0.0.1:8081",
      "https://localhost:8081",
      `https://${host}:8081`,
    ]));
    try {
      for (const base of candidates) {
        try {
          const resp = await fetch(`${base}/docs`, { method: "GET" });
          if (resp.ok) {
            setApiBase(base);
            if (!silent) setApiProbeMessage(`已连接：${base}`);
            return;
          }
        } catch {
          // try next
        }
      }
      if (!silent) setApiProbeMessage("未探测到可用 API，请确认 8081 服务已启动。");
    } finally {
      if (!silent) setApiProbeBusy(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void probeApiEndpoint(true);
  }, [probeApiEndpoint]);

  const resolveClausePreviewWithTree = (candidate: RuleCandidate): string => {
    const direct = resolveClausePreview(candidate);
    if (direct !== "暂无条款原文") {
      return direct;
    }
    const metric = inferCandidateMetric(candidate);
    if (!metric) {
      return direct;
    }
    const clauseId = findClauseIdByMetric(step2ClauseTreeRoots, metric);
    if (!clauseId) {
      return direct;
    }
    const nodes = flattenClauseTreeNodes(step2ClauseTreeRoots);
    const matched = nodes.find((node) => String(node.clause_id || "").trim() === clauseId);
    const title = String(matched?.title || "").trim();
    if (!title) {
      return `条款已匹配：${clauseId}`;
    }
    return `条款已匹配：${clauseId} ${title}`;
  };

  const hasResolvableClauseBinding = (candidate: RuleCandidate): boolean => {
    if (candidate.review_required) {
      return false;
    }
    if (resolveBindingStatus(candidate) === "bound") {
      return true;
    }
    const clauseNo = resolveClauseNo(candidate);
    if (clauseNo && clauseNo !== "—") {
      return true;
    }
    const metric = inferCandidateMetric(candidate);
    if (!metric) {
      return false;
    }
    return Boolean(findClauseIdByMetric(step2ClauseTreeRoots, metric));
  };
  const reviewCandidates = reviewPackage?.candidates ?? [];
  const artifactComponents = useMemo<ArtifactComponent[]>(() => {
    const payload = artifactDocs["05_components.json"];
    if (!payload || typeof payload !== "object") return [];
    const rows = (payload as { components?: unknown }).components;
    if (Array.isArray(rows)) {
      return rows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    }
    // legacy compatibility: some historical payloads may use "items"
    const legacyRows = (payload as { items?: unknown }).items;
    return Array.isArray(legacyRows) ? legacyRows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
  }, [artifactDocs]);
  const artifactDtos = useMemo<ArtifactDocument[]>(() => {
    const payload = artifactDocs["06_dto_schema.json"];
    if (!payload || typeof payload !== "object") return [];
    const rows = (payload as { dto_schemas?: unknown }).dto_schemas;
    if (Array.isArray(rows)) return rows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    const legacyRows = (payload as { dto_schema?: unknown }).dto_schema;
    return Array.isArray(legacyRows) ? legacyRows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
  }, [artifactDocs]);
  const artifactRules = useMemo<ArtifactRule[]>(() => {
    const payload = artifactDocs["07_rules.json"];
    if (!payload || typeof payload !== "object") return [];
    const rows = (payload as { rules?: unknown }).rules;
    return Array.isArray(rows) ? rows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
  }, [artifactDocs]);
  const artifactGates = useMemo<ArtifactGate[]>(() => {
    const payload = artifactDocs["08_gates.json"];
    if (!payload || typeof payload !== "object") return [];
    const rows = (payload as { gates?: unknown }).gates;
    return Array.isArray(rows) ? rows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
  }, [artifactDocs]);
  const artifactProofTemplates = useMemo<ArtifactDocument[]>(() => {
    const payload = artifactDocs["10_proof_templates.json"];
    if (!payload || typeof payload !== "object") return [];
    const rows = (payload as { proof_templates?: unknown }).proof_templates;
    if (Array.isArray(rows)) return rows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    const legacyRows = (payload as { templates?: unknown }).templates;
    return Array.isArray(legacyRows) ? legacyRows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
  }, [artifactDocs]);
  const artifactClauseTreeNodes = useMemo<ArtifactClauseNode[]>(() => {
    const payload = artifactDocs["03_clause_tree.json"];
    if (!payload || typeof payload !== "object") return [];
    const roots = (payload as { clause_tree?: unknown }).clause_tree;
    if (Array.isArray(roots)) {
      const normalized = roots.filter((item): item is ArtifactClauseNode => !!item && typeof item === "object");
      return flattenArtifactClauseTree(normalized);
    }
    const legacyNodes = (payload as { nodes?: unknown }).nodes;
    if (Array.isArray(legacyNodes)) {
      return legacyNodes.filter((item): item is ArtifactClauseNode => !!item && typeof item === "object");
    }
    return [];
  }, [artifactDocs]);
  const artifactCatalogNodes = useMemo<ArtifactDocument[]>(() => {
    const payload = artifactDocs["02_catalog.json"];
    if (!payload || typeof payload !== "object") return [];
    const rows = (payload as { catalog?: unknown }).catalog;
    if (Array.isArray(rows)) {
      return rows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    }
    // Legacy compatibility: old payload may mistakenly use "clause_tree" for catalog rows.
    const legacyRows = (payload as { clause_tree?: unknown }).clause_tree;
    return Array.isArray(legacyRows) ? legacyRows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
  }, [artifactDocs]);
  useEffect(() => {
    const jobId = String(selectedJobId || "").trim();
    if (!jobId || artifactCatalogNodes.length === 0) return;
    const snapshots: ParsedCatalogNodeSnapshot[] = artifactCatalogNodes
      .map((node) => {
        const n = node as Record<string, unknown>;
        const id = String(n.id || n.node_id || "").trim();
        const type = String(n.type || "").trim().toLowerCase();
        if (!id || !type) return null;
        return {
          id,
          title: String(n.title || n.name || id).trim() || id,
          type,
          page: Number(n.page ?? n.source_page ?? 0) || 0,
          parentId: String(n.parent_id || "").trim() || null,
        } satisfies ParsedCatalogNodeSnapshot;
      })
      .filter((x): x is ParsedCatalogNodeSnapshot => Boolean(x));
    if (snapshots.length === 0) return;
    setParsedSpecCatalogCache((prev) => ({ ...prev, [jobId]: snapshots }));
  }, [artifactCatalogNodes, selectedJobId]);
  useEffect(() => {
    const jobId = String(selectedJobId || "").trim();
    if (!jobId || artifactCatalogNodes.length === 0) return;
    const stdCodeResolved = String(currentJobSpec.stdCode || artifactIndex?.std_code || reviewPackage?.std_code || "").trim();
    const titleResolved = String(currentJobSpec.name || artifactIndex?.title || reviewPackage?.title || "").trim();
    const versionResolved = String(artifactIndex?.spec_version || artifactIndex?.version || reviewPackage?.standard_version || "").trim();
    const specTypeResolved = String(currentJobSpec.type || artifactIndex?.spec_type || reviewPackage?.spec_type || "").trim();
    const updatedAt = new Date().toISOString();
    setParsedSpecLibrary((prev) => {
      const nextRow: ParsedSpecLibraryItem = {
        jobId,
        stdCode: stdCodeResolved,
        title: titleResolved || stdCodeResolved || jobId,
        version: versionResolved,
        specType: specTypeResolved,
        catalogNodeCount: artifactCatalogNodes.length,
        updatedAt,
      };
      const without = prev.filter((x) => x.jobId !== jobId);
      return [nextRow, ...without].slice(0, 80);
    });
  }, [
    artifactCatalogNodes.length,
    artifactIndex?.spec_type,
    artifactIndex?.spec_version,
    artifactIndex?.std_code,
    artifactIndex?.title,
    artifactIndex?.version,
    currentJobSpec.name,
    currentJobSpec.stdCode,
    currentJobSpec.type,
    reviewPackage?.spec_type,
    reviewPackage?.standard_version,
    reviewPackage?.std_code,
    reviewPackage?.title,
    selectedJobId,
  ]);
  const artifactClassifications = useMemo<ArtifactClauseClassification[]>(() => {
    const payload = artifactDocs["04_clause_classification.json"];
    if (!payload || typeof payload !== "object") return [];
    const rows = (payload as { classifications?: unknown }).classifications;
    return Array.isArray(rows) ? rows.filter((item): item is ArtifactClauseClassification => !!item && typeof item === "object") : [];
  }, [artifactDocs]);
  const artifactNormDoc = useMemo<ArtifactNormDoc | null>(() => {
    const payload = artifactDocs["11_normdoc.json"];
    return payload && typeof payload === "object" ? (payload as ArtifactNormDoc) : null;
  }, [artifactDocs]);
  const artifactPipelineAudit = useMemo<ArtifactDocument | null>(() => {
    const payload = artifactDocs["12_pipeline_audit.json"];
    return payload && typeof payload === "object" ? (payload as ArtifactDocument) : null;
  }, [artifactDocs]);
  const normDocMeta = useMemo(() => resolveNormDocMeta(artifactNormDoc || undefined), [artifactNormDoc]);
  const runtimeDerivedStats = useMemo(() => {
    const layers = (artifactNormDoc as unknown as { asset_layers?: { runtime_derived?: Record<string, unknown> } } | null)?.asset_layers?.runtime_derived;
    return {
      executorSpecCount: Number((layers as { executor_spec_count?: unknown } | undefined)?.executor_spec_count ?? 0),
    };
  }, [artifactNormDoc]);

  const chatCurlPreview = useMemo(() => {
    const safeMessage = chatMessage.replace(/"/g, '\\"');
    const sessionPart = chatSessionId.trim() ? `,\\\"session_id\\\":\\\"${chatSessionId.trim()}\\\"` : "";
    const userPart = chatUserId.trim() ? `,\\\"user_id\\\":\\\"${chatUserId.trim()}\\\"` : "";
    return [
      `curl -X POST "${endpointBase}/api/v1/layer3/query" \\`,
      '  -H "Content-Type: application/json" \\',
      `  -d "{\"message\":\"${safeMessage}\",\"project_id\":\"${chatProjectId || "GXX_2024_XXX"}\"${userPart}${sessionPart}}"`,
    ].join("\n");
  }, [chatMessage, chatProjectId, chatSessionId, chatUserId, endpointBase]);

  useEffect(() => {
    if (!reviewPackage) {
      setCandidateDrafts({});
      return;
    }
    const candidates = Array.isArray(reviewPackage.candidates) ? reviewPackage.candidates : [];
    setCandidateDrafts((prev) => {
      const next: Record<string, CandidateDraft> = {};
      candidates.forEach((candidate, index) => {
        const key = candidateKey(candidate, index);
        const previous = prev[key];
        const status = String(candidate.status || "").toLowerCase();
        next[key] = previous ?? {
          enabled: status !== "rejected",
          thresholdValue: String(candidate.threshold_value || "").trim(),
          needsExpertConfirm: false,
        };
      });
      return next;
    });
  }, [reviewPackage]);

  useEffect(() => {
    const jobId = String(artifactIndex?.job_id || "").trim();
    if (!jobId) {
      setArtifactDocs({});
      setArtifactLoading(false);
      return;
    }
    const names = ["01_spec.json", "02_catalog.json", "03_clause_tree.json", "04_clause_classification.json", "05_components.json", "06_dto_schema.json", "07_rules.json", "08_gates.json", "10_proof_templates.json", "11_normdoc.json", "12_pipeline_audit.json", "norm_ref_index.json"];
    void (async () => {
      setArtifactLoading(true);
      const next: Record<string, ArtifactDocument> = {};
      for (const name of names) {
        try {
          const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(name)}`);
          const payload = await readJsonResponse<ArtifactDocument>(resp);
          if (resp.ok && payload && typeof payload === "object") {
            const wrapper = payload as { payload?: unknown };
            const unwrapped = (wrapper.payload && typeof wrapper.payload === "object")
              ? (wrapper.payload as ArtifactDocument)
              : payload;
            next[name] = unwrapped;
          }
        } catch {
          // ignore single artifact load failures to keep page resilient
        }
      }
      setArtifactDocs(next);
      setArtifactLoading(false);
    })();
  }, [artifactIndex?.job_id, endpointBase]);

  useEffect(() => {
    const jobId = currentJobId;
    if (!jobId) {
      setSpecirDoc(null);
      return;
    }
    void (async () => {
      try {
        const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/specir`);
        const payload = await readJsonResponse<SpecIRDocument | { payload?: unknown }>(resp);
        if (!resp.ok) {
          setSpecirDoc(null);
          return;
        }
        const wrapped = (payload && typeof payload === "object") ? payload as { payload?: unknown } : null;
        const unwrapped = (wrapped?.payload && typeof wrapped.payload === "object")
          ? wrapped.payload as SpecIRDocument
          : payload;
        setSpecirDoc((unwrapped && typeof unwrapped === "object") ? unwrapped as SpecIRDocument : null);
      } catch {
        setSpecirDoc(null);
      }
    })();
  }, [currentJobId, endpointBase]);

  useEffect(() => {
    if (buildFormType !== normDocMeta.formType) {
      setBuildFormType(normDocMeta.formType);
    }
    if (buildStandardId !== normDocMeta.standardId) {
      setBuildStandardId(normDocMeta.standardId);
    }
    if (buildStandardVersion !== normDocMeta.version) {
      setBuildStandardVersion(normDocMeta.version);
    }
  }, [buildFormType, buildStandardId, buildStandardVersion, normDocMeta.formType, normDocMeta.standardId, normDocMeta.version]);

  async function onChatSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setChatError("");
    setChatResult(null);

    const message = chatMessage.trim();
    const projectId = chatProjectId.trim();
    if (!message) {
      setChatError("请输入自然语言问题。");
      return;
    }
    if (!projectId) {
      setChatError("project_id 不能为空。");
      return;
    }

    setChatLoading(true);
    try {
      const response = await fetch(`${endpointBase}/api/v1/layer3/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          project_id: projectId,
          user_id: chatUserId.trim() || undefined,
          session_id: chatSessionId.trim() || undefined,
        }),
      });
      const payload = await readJsonResponse<ChatResponse>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `NL2Gate 调用失败（HTTP ${response.status}）`));
      }
      const normalized = payload as ChatResponse;
      setChatResult(normalized);
      if (typeof normalized.session_id === "string" && normalized.session_id.trim()) {
        setChatSessionId(normalized.session_id.trim());
      }
    } catch (err) {
      setChatError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "NL2Gate API" }));
    } finally {
      setChatLoading(false);
    }
  }

  async function onFileChange(next: File | null): Promise<void> {
    setFile(next);
    setInspectError("");
    setInspectResult(null);
    if (!next) {
      setAutoDetectedStdCode("");
      return;
    }
    const detected = detectStdCodeFromFilename(next.name);
    setAutoDetectedStdCode(detected);
    if (detected && !stdCodeTouched && !stdCode.trim()) {
      setStdCode(detected);
    }

    setInspectLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", next);
      const response = await fetch(`${endpointBase}/normref/ingest/inspect`, { method: "POST", body: formData });
      const payload = await readJsonResponse<InspectResponse>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `文件预解析失败（HTTP ${response.status}）`));
      }
      const typed = payload as InspectResponse;
      setInspectResult(typed);

      const suggested = typed.prefill?.suggested;
      if (suggested?.std_code && !stdCodeTouched && !stdCode.trim()) {
        setStdCode(suggested.std_code);
      }
      if (suggested?.level && !levelTouched) {
        setLevel(suggested.level);
      }
      if (suggested?.title) {
        setTitle(suggested.title);
      }
    } catch (err) {
      setInspectError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setInspectLoading(false);
    }
  }

  async function loadReviewJob(jobIdInput?: string): Promise<void> {
    const seq = ++loadReviewSeqRef.current;
    const jobId = (jobIdInput ?? selectedJobId).trim();
    if (!jobId) {
      setReviewError("请先输入 job_id。");
      return;
    }
    setReviewLoading(true);
    setReviewError("");
    setArtifactError("");
    setReviewPackage(null);
    setPipelineStatus(null);
    setStatusAggregation(null);
    setAssetIntegrityReport(null);
    setGoldenSet(null);
    setGoldenHistory(null);
    setNormVersionHistory(null);
    setReleaseHistory(null);
    setQualityDashboard(null);
    setQualityTrend(null);
    setArtifactIndex(null);
    setArtifactDocs({});
    setSpecirDoc(null);
    setTraceabilityDoc(null);
    setProductionAuditTimeline(null);
    setProductionAuditDiff(null);
    setAssetReviewLatestByKeyFromApi({});
    setAssetReviewSummaryFromApi(null);
    setHitlQueue([]);
    setHitlBusyById({});
    try {
      const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}`);
      const payload = await readJsonResponse<ReviewPackage>(resp);
      if (seq !== loadReviewSeqRef.current) return;
      if (!resp.ok) {
        if (resp.status === 404) {
          setSelectedJobId("");
          setReviewPackage(null);
          setArtifactIndex(null);
          setStatusAggregation(null);
          setAssetIntegrityReport(null);
          setReviewError(`任务 ${jobId} 不存在或已过期，请重新“上传并解析”生成新的 job_id。`);
          return;
        }
        throw new Error(getErrorMessage(payload, `加载任务失败（HTTP ${resp.status}）`));
      }
      setSelectedJobId(jobId);
      setReviewPackage(payload as ReviewPackage);
      void loadTraceabilityTimeline(jobId);
      try {
        const qResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/hitl-queue`);
        const qPayload = await readJsonResponse<HitlQueueResponse>(qResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (qResp.ok) {
          const rows = Array.isArray((qPayload as HitlQueueResponse)?.queue) ? (qPayload as HitlQueueResponse).queue as HitlQueueItem[] : [];
          setHitlQueue(rows);
        } else {
          setHitlQueue([]);
        }
      } catch {
        setHitlQueue([]);
      }
      try {
        const latestResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/asset-reviews/latest`);
        const latestPayload = await readJsonResponse<{ items?: AssetReviewLatestItem[] }>(latestResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (latestResp.ok) {
          const map: Record<string, string> = {};
          const itemsRaw = (latestPayload && typeof latestPayload === "object" && "items" in latestPayload)
            ? (latestPayload as { items?: unknown }).items
            : [];
          const items = Array.isArray(itemsRaw) ? itemsRaw as AssetReviewLatestItem[] : [];
          items.forEach((item: AssetReviewLatestItem) => {
            const objectType = String(item.object_type || "").toLowerCase();
            const objectId = String(item.object_id || "").trim();
            const decision = String(item.decision || "").toLowerCase();
            if (objectType && objectId && decision) {
              map[`${objectType}:${objectId}`] = decision;
            }
          });
          setAssetReviewLatestByKeyFromApi(map);
        }
      } catch {
        // optional PG endpoint; ignore when unavailable
      }
      try {
        const summaryResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/asset-reviews/summary`);
        const summaryPayload = await readJsonResponse<{ summary?: AssetReviewSummary }>(summaryResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (summaryResp.ok && summaryPayload && typeof summaryPayload === "object" && "summary" in summaryPayload) {
          const raw = (summaryPayload as { summary?: unknown }).summary;
          if (raw && typeof raw === "object") {
            const row = raw as Record<string, unknown>;
            setAssetReviewSummaryFromApi({
              total: Number(row.total || 0),
              approved: Number(row.approved || 0),
              needs_edit: Number(row.needs_edit || 0),
              rejected: Number(row.rejected || 0),
            });
          }
        }
      } catch {
        // optional PG endpoint; ignore when unavailable
      }
      try {
        setArtifactLoading(true);
        const artifactResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/artifacts`);
        const artifactPayload = await readJsonResponse<ArtifactIndex>(artifactResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (artifactResp.ok) {
          setArtifactIndex(artifactPayload as ArtifactIndex);
        } else {
          setArtifactIndex(null);
          setArtifactError(getErrorMessage(artifactPayload, `加载 artifacts 失败（HTTP ${artifactResp.status}）`));
        }
      } catch (artifactErr) {
        setArtifactIndex(null);
        setArtifactError(toUserFacingError(artifactErr, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
      } finally {
        setArtifactLoading(false);
      }
      try {
        const regResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/artifact-registry`);
        const regPayload = await readJsonResponse<ArtifactRegistryResponse>(regResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (regResp.ok) {
          setArtifactRegistry(regPayload as ArtifactRegistryResponse);
        } else {
          setArtifactRegistry(null);
        }
      } catch {
        setArtifactRegistry(null);
      }
      try {
        const pipeResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/pipeline-status`);
        const pipePayload = await readJsonResponse<PipelineStatusResponse>(pipeResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (pipeResp.ok) {
          setPipelineStatus(pipePayload as PipelineStatusResponse);
        } else {
          setPipelineStatus(null);
        }
      } catch {
        setPipelineStatus(null);
      }
      try {
        const stResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/status-aggregation`);
        const stPayload = await readJsonResponse<StatusAggregationResponse>(stResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (stResp.ok) {
          setStatusAggregation(stPayload as StatusAggregationResponse);
        } else {
          setStatusAggregation(null);
        }
      } catch {
        setStatusAggregation(null);
      }
      try {
        const iResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/asset-integrity`);
        const iPayload = await readJsonResponse<AssetIntegrityReport>(iResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (iResp.ok) {
          setAssetIntegrityReport(iPayload as AssetIntegrityReport);
        } else {
          setAssetIntegrityReport(null);
        }
      } catch {
        setAssetIntegrityReport(null);
      }
      try {
        const qs = new URLSearchParams();
        if (specirGraphQuery.trim()) qs.set("q", specirGraphQuery.trim());
        if (specirGraphNodeType.trim()) qs.set("node_type", specirGraphNodeType.trim());
        if (specirGraphNodeId.trim()) qs.set("node_id", specirGraphNodeId.trim());
        qs.set("max_depth", "2");
        const gResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/specir-graph?${qs.toString()}`);
        const gPayload = await readJsonResponse<SpecIRGraphResponse>(gResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (gResp.ok) {
          setSpecirGraph(gPayload as SpecIRGraphResponse);
        } else {
          setSpecirGraph(null);
        }
      } catch {
        setSpecirGraph(null);
      }
      try {
        const cResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/specir-graph/cross-norm`);
        const cPayload = await readJsonResponse<SpecIRCrossNormResponse>(cResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (cResp.ok) {
          setSpecirCrossNorm(cPayload as SpecIRCrossNormResponse);
        } else {
          setSpecirCrossNorm(null);
        }
      } catch {
        setSpecirCrossNorm(null);
      }
      try {
        const prResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/production-release-pipeline`);
        const prPayload = await readJsonResponse<{ report?: ProductionReleaseReport }>(prResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (prResp.ok) {
          setProductionReleaseReport((prPayload as { report?: ProductionReleaseReport }).report || null);
        } else {
          setProductionReleaseReport(null);
        }
      } catch {
        setProductionReleaseReport(null);
      }
      await loadProductionAuditCenter();
      try {
        const resolvedFormCode = String(rulePackMeta?.form_code || rulePackFormCode || "bridge_shi_13").trim();
        const gResp = await fetch(`${endpointBase}/normref/golden-set?form_code=${encodeURIComponent(resolvedFormCode)}`);
        const gPayload = await readJsonResponse<GoldenSetResponse>(gResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (gResp.ok) {
          setGoldenSet(gPayload as GoldenSetResponse);
        } else {
          setGoldenSet(null);
        }
      } catch {
        setGoldenSet(null);
      }
      try {
        const resolvedFormCode = String(rulePackMeta?.form_code || rulePackFormCode || "bridge_shi_13").trim();
        const hResp = await fetch(`${endpointBase}/normref/golden-set/history?form_code=${encodeURIComponent(resolvedFormCode)}`);
        const hPayload = await readJsonResponse<GoldenHistoryResponse>(hResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (hResp.ok) {
          setGoldenHistory(hPayload as GoldenHistoryResponse);
        } else {
          setGoldenHistory(null);
        }
      } catch {
        setGoldenHistory(null);
      }
      try {
        const normId = String((payload as ReviewPackage)?.std_code || "").trim();
        if (!normId) {
          setNormVersionHistory(null);
        } else {
          const nResp = await fetch(`${endpointBase}/normref/norm-versions/history?norm_id=${encodeURIComponent(normId)}`);
          const nPayload = await readJsonResponse<NormVersionHistoryResponse>(nResp);
          if (seq !== loadReviewSeqRef.current) return;
          if (nResp.ok) {
            setNormVersionHistory(nPayload as NormVersionHistoryResponse);
          } else {
            setNormVersionHistory(null);
          }
        }
      } catch {
        setNormVersionHistory(null);
      }
      try {
        const resolvedFormCode = String(rulePackMeta?.form_code || rulePackFormCode || "").trim();
        if (resolvedFormCode) {
          const rResp = await fetch(`${endpointBase}/normref/rulepack/release/history?form_code=${encodeURIComponent(resolvedFormCode)}`);
          const rPayload = await readJsonResponse<ReleaseCurrentResponse>(rResp);
          if (seq !== loadReviewSeqRef.current) return;
          if (rResp.ok) {
            setReleaseHistory(rPayload as ReleaseCurrentResponse);
          } else {
            setReleaseHistory(null);
          }
        } else {
          setReleaseHistory(null);
        }
      } catch {
        setReleaseHistory(null);
      }
      try {
        const resolvedFormCode = String(rulePackMeta?.form_code || rulePackFormCode || "").trim();
        const resolvedNormVersion = String(rulePackMeta?.norm_version || rulePackMeta?.spec_version || "").trim();
        const today = new Date();
        const toDate = today.toISOString().slice(0, 10);
        const fromDateObj = new Date(today.getTime() - 13 * 24 * 3600 * 1000);
        const fromDate = fromDateObj.toISOString().slice(0, 10);
        const qs = new URLSearchParams();
        if (resolvedFormCode) qs.set("form_code", resolvedFormCode);
        if (resolvedNormVersion) qs.set("norm_version", resolvedNormVersion);
        qs.set("date_from", fromDate);
        qs.set("date_to", toDate);
        const qResp = await fetch(`${endpointBase}/normref/quality/dashboard?${qs.toString()}`);
        const qPayload = await readJsonResponse<QualityDashboardResponse>(qResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (qResp.ok) {
          setQualityDashboard(qPayload as QualityDashboardResponse);
        } else {
          setQualityDashboard(null);
        }
      } catch {
        setQualityDashboard(null);
      }
      try {
        const resolvedFormCode = String(rulePackMeta?.form_code || rulePackFormCode || "").trim();
        const resolvedNormVersion = String(rulePackMeta?.norm_version || rulePackMeta?.spec_version || "").trim();
        const today = new Date();
        const toDate = today.toISOString().slice(0, 10);
        const fromDateObj = new Date(today.getTime() - 29 * 24 * 3600 * 1000);
        const fromDate = fromDateObj.toISOString().slice(0, 10);
        const qs = new URLSearchParams();
        if (resolvedFormCode) qs.set("form_code", resolvedFormCode);
        if (resolvedNormVersion) qs.set("norm_version", resolvedNormVersion);
        if (trendCompareNormVersion.trim()) qs.set("compare_norm_version", trendCompareNormVersion.trim());
        qs.set("date_from", fromDate);
        qs.set("date_to", toDate);
        qs.set("granularity", trendGranularity);
        const tResp = await fetch(`${endpointBase}/normref/quality/trends?${qs.toString()}`);
        const tPayload = await readJsonResponse<QualityTrendResponse>(tResp);
        if (seq !== loadReviewSeqRef.current) return;
        if (tResp.ok) {
          setQualityTrend(tPayload as QualityTrendResponse);
        } else {
          setQualityTrend(null);
        }
      } catch {
        setQualityTrend(null);
      }
    } catch (err) {
      if (seq !== loadReviewSeqRef.current) return;
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
      setReviewPackage(null);
      setPipelineStatus(null);
      setGoldenSet(null);
      setGoldenHistory(null);
      setNormVersionHistory(null);
      setReleaseHistory(null);
      setQualityDashboard(null);
      setQualityTrend(null);
      setArtifactIndex(null);
      setArtifactRegistry(null);
      setSpecirGraph(null);
      setSpecirImpact(null);
      setSpecirCrossNorm(null);
      setProductionReleaseReport(null);
      setProductionAuditTimeline(null);
      setProductionAuditDiff(null);
      setArtifactDocs({});
      setSpecirDoc(null);
    } finally {
      if (seq !== loadReviewSeqRef.current) return;
      setReviewLoading(false);
    }
  }

  async function triggerRollback(dryRun: boolean, forceRollback: boolean): Promise<void> {
    const resolvedFormCode = String(rulePackMeta?.form_code || rulePackFormCode || "").trim();
    if (!resolvedFormCode) {
      setReviewError("缺少 form_code，无法回滚。");
      return;
    }
    setRollbackBusy(true);
    setReviewError("");
    setReviewSuccess("");
    try {
      const response = await fetch(`${endpointBase}/normref/rulepack/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "form_code",
          form_code: resolvedFormCode,
          operator: reviewerId || "expert.001",
          rollback_reason: rollbackReason || "manual rollback",
          dry_run: dryRun,
          force_rollback: forceRollback,
        }),
      });
      const payload = await readJsonResponse<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `回滚失败（HTTP ${response.status}）`));
      }
      const report = (payload && typeof payload === "object" && "report" in payload) ? (payload as { report?: Record<string, unknown> }).report : undefined;
      setReviewSuccess(`回滚${dryRun ? "预演" : "执行"}完成：${resolvedFormCode}，报告：${String((report?.report_path as string) || "-")}`);
      try {
        const rResp = await fetch(`${endpointBase}/normref/rulepack/release/history?form_code=${encodeURIComponent(resolvedFormCode)}`);
        const rPayload = await readJsonResponse<ReleaseCurrentResponse>(rResp);
        if (rResp.ok) setReleaseHistory(rPayload as ReleaseCurrentResponse);
      } catch {
        // ignore refresh failure
      }
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setRollbackBusy(false);
    }
  }

  async function refreshArtifactRegistry(jobId: string): Promise<void> {
    const clean = String(jobId || "").trim();
    if (!clean) return;
    const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(clean)}/artifact-registry`);
    const payload = await readJsonResponse<ArtifactRegistryResponse>(resp);
    if (!resp.ok) {
      throw new Error(getErrorMessage(payload, `加载 artifact registry 失败（HTTP ${resp.status}）`));
    }
    setArtifactRegistry(payload as ArtifactRegistryResponse);
  }

  async function downloadArtifactVersion(jobId: string, artifactId: string): Promise<void> {
    const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/artifact-registry/download/${encodeURIComponent(artifactId)}`);
    if (!resp.ok) {
      const payload = await readJsonResponse<Record<string, unknown>>(resp);
      throw new Error(getErrorMessage(payload, `下载失败（HTTP ${resp.status}）`));
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${artifactId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function rollbackArtifactVersion(jobId: string, artifactName: string, artifactId: string): Promise<void> {
    const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/artifact-registry/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact_name: artifactName, artifact_id: artifactId, created_by: reviewerId || "expert.001" }),
    });
    const payload = await readJsonResponse<Record<string, unknown>>(resp);
    if (!resp.ok) {
      throw new Error(getErrorMessage(payload, `回滚失败（HTTP ${resp.status}）`));
    }
    setReviewSuccess(`artifact 回滚成功：${artifactName}`);
    await refreshArtifactRegistry(jobId);
  }

  async function diffArtifactLatestTwo(jobId: string, artifactName: string, versions: ArtifactRegistryVersion[]): Promise<void> {
    if (!Array.isArray(versions) || versions.length < 2) return;
    const sorted = [...versions].filter((x) => x && x.artifact_id).sort((a, b) => Number(String(b.version || "v0").replace("v", "")) - Number(String(a.version || "v0").replace("v", "")));
    const a = String(sorted[1]?.artifact_id || "").trim();
    const b = String(sorted[0]?.artifact_id || "").trim();
    if (!a || !b) return;
    const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/artifact-registry/diff?artifact_name=${encodeURIComponent(artifactName)}&artifact_id_a=${encodeURIComponent(a)}&artifact_id_b=${encodeURIComponent(b)}`);
    const payload = await readJsonResponse<Record<string, unknown>>(resp);
    if (!resp.ok) {
      throw new Error(getErrorMessage(payload, `diff 失败（HTTP ${resp.status}）`));
    }
    const rawDiff = (payload as { diff?: unknown }).diff;
    setArtifactRegistryDiff(Array.isArray(rawDiff) ? rawDiff.map((x) => String(x)).slice(0, 200) : []);
  }

  async function runSpecIRGraphImpact(jobId: string): Promise<void> {
    const clean = String(jobId || "").trim();
    if (!clean) return;
    const seed = specirGraphNodeId.trim() || String((specirGraph?.graph?.nodes || [])[0]?.id || "").trim();
    if (!seed) {
      setReviewError("请先输入 node_id 或先加载图谱。");
      return;
    }
    const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(clean)}/specir-graph/impact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node_ids: [seed], max_depth: 2 }),
    });
    const payload = await readJsonResponse<SpecIRImpactResponse>(resp);
    if (!resp.ok) {
      throw new Error(getErrorMessage(payload as unknown as Record<string, unknown>, `影响分析失败（HTTP ${resp.status}）`));
    }
    setSpecirImpact(payload as SpecIRImpactResponse);
  }

  async function runSpecIRImpactQuery(jobId: string): Promise<void> {
    const clean = String(jobId || "").trim();
    if (!clean) return;
    const payloadBody = {
      normRef: specirImpactNormRef.trim(),
      slotKey: specirImpactSlotKey.trim(),
      specir_id: specirImpactSpecirId.trim(),
      max_depth: 2,
    };
    if (!payloadBody.normRef && !payloadBody.slotKey && !payloadBody.specir_id) {
      setReviewError("请至少输入 normRef、slotKey、specir_id 之一。");
      return;
    }
    const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(clean)}/specir-graph/impact-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadBody),
    });
    const payload = await readJsonResponse<SpecIRImpactResponse>(resp);
    if (!resp.ok) {
      throw new Error(getErrorMessage(payload as unknown as Record<string, unknown>, `影响查询失败（HTTP ${resp.status}）`));
    }
    setSpecirImpact(payload as SpecIRImpactResponse);
  }

  async function runSpecIRPublishImpactReport(jobId: string): Promise<void> {
    const clean = String(jobId || "").trim();
    if (!clean) return;
    const payloadBody = {
      normRef: specirImpactNormRef.trim(),
      slotKey: specirImpactSlotKey.trim(),
      specir_id: specirImpactSpecirId.trim(),
      max_depth: 2,
    };
    if (!payloadBody.normRef && !payloadBody.slotKey && !payloadBody.specir_id) {
      setReviewError("发布前影响报告需要 normRef/slotKey/specir_id 至少一个输入。");
      return;
    }
    const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(clean)}/specir-graph/publish-impact-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadBody),
    });
    const payload = await readJsonResponse<Record<string, unknown>>(resp);
    if (!resp.ok) {
      throw new Error(getErrorMessage(payload, `生成发布前影响报告失败（HTTP ${resp.status}）`));
    }
    setSpecirPublishImpactReport(payload as Record<string, unknown>);
  }

  async function loadSpecIRTrace(jobId: string, specirId: string): Promise<void> {
    const cleanJob = String(jobId || "").trim();
    const cleanSpecir = String(specirId || "").trim();
    if (!cleanJob || !cleanSpecir) return;
    setSpecirTraceLoading(true);
    try {
      const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(cleanJob)}/specir/${encodeURIComponent(cleanSpecir)}/trace`);
      const payload = await readJsonResponse<SpecIRTraceResponse>(resp);
      if (!resp.ok) {
        throw new Error(getErrorMessage(payload as unknown as Record<string, unknown>, `SpecIR 追溯失败（HTTP ${resp.status}）`));
      }
      setSpecirTrace((payload && typeof payload === "object") ? payload as SpecIRTraceResponse : null);
      setSelectedSpecirId(cleanSpecir);
    } finally {
      setSpecirTraceLoading(false);
    }
  }

  async function loadTraceabilityTimeline(jobId: string): Promise<void> {
    const cleanJob = String(jobId || "").trim();
    if (!cleanJob) return;
    setTraceabilityLoading(true);
    try {
      const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(cleanJob)}/traceability`);
      const payload = await readJsonResponse<TraceabilityResponse>(resp);
      if (!resp.ok) {
        setTraceabilityDoc(null);
        return;
      }
      setTraceabilityDoc((payload && typeof payload === "object") ? payload as TraceabilityResponse : null);
    } finally {
      setTraceabilityLoading(false);
    }
  }

  async function runFormImpactPropagation(jobId: string): Promise<void> {
    const clean = String(jobId || "").trim();
    if (!clean) return;
    const seed = specirGraphNodeId.trim() || String((specirGraph?.graph?.nodes || [])[0]?.id || "").trim();
    if (!seed) {
      setReviewError("请先输入 node_id 或先加载图谱。");
      return;
    }
    const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(clean)}/form-impact-graph/propagate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed_node_ids: [seed], max_depth: 2, min_confidence: 0.35 }),
    });
    const payload = await readJsonResponse<FormImpactPropagationResponse>(resp);
    if (!resp.ok) {
      throw new Error(getErrorMessage(payload as unknown as Record<string, unknown>, `自动传播失败（HTTP ${resp.status}）`));
    }
    setFormImpactPropagation(payload as FormImpactPropagationResponse);
  }

  async function runFormImpactDiff(jobId: string): Promise<void> {
    const clean = String(jobId || "").trim();
    if (!clean) return;
    const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(clean)}/form-impact-graph/diff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const payload = await readJsonResponse<FormImpactDiffResponse>(resp);
    if (!resp.ok) {
      throw new Error(getErrorMessage(payload as unknown as Record<string, unknown>, `版本 Diff 失败（HTTP ${resp.status}）`));
    }
    setFormImpactDiff(payload as FormImpactDiffResponse);
  }

  async function runProductionReleasePipeline(jobId: string): Promise<void> {
    const clean = String(jobId || "").trim();
    if (!clean) return;
    setProductionReleaseRunning(true);
    setReviewError("");
    try {
      const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(clean)}/production-release-pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          published_by: reviewerId || "expert.001",
          signature: "pipeline_signature",
          gray_ratio: 0.1,
          dry_run: productionReleaseDryRun,
          publish_executable_package: publishExecutablePackage,
        }),
      });
      const payload = await readJsonResponse<{ report?: ProductionReleaseReport }>(resp);
      if (!resp.ok) {
        throw new Error(getErrorMessage(payload as unknown as Record<string, unknown>, `生产发布流水线执行失败（HTTP ${resp.status}）`));
      }
      setProductionReleaseReport((payload as { report?: ProductionReleaseReport }).report || null);
      await loadProductionAuditCenter();
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setProductionReleaseRunning(false);
    }
  }

  async function loadProductionAuditCenter(): Promise<void> {
    setProductionAuditBusy(true);
    try {
      const tlResp = await fetch(`${endpointBase}/normref/audit/production/timeline?limit=200`);
      const tlPayload = await readJsonResponse<ProductionAuditTimelineResponse>(tlResp);
      if (tlResp.ok) {
        setProductionAuditTimeline(tlPayload as ProductionAuditTimelineResponse);
      } else {
        setProductionAuditTimeline(null);
      }
      const eid = productionAuditEventId.trim();
      if (!eid) {
        setProductionAuditDiff(null);
        return;
      }
      const dResp = await fetch(`${endpointBase}/normref/audit/production/diff?event_id=${encodeURIComponent(eid)}`);
      const dPayload = await readJsonResponse<ProductionAuditDiffResponse>(dResp);
      if (dResp.ok) {
        setProductionAuditDiff(dPayload as ProductionAuditDiffResponse);
      } else {
        setProductionAuditDiff(null);
      }
    } catch {
      setProductionAuditTimeline(null);
      setProductionAuditDiff(null);
    } finally {
      setProductionAuditBusy(false);
    }
  }

  async function exportProductionAuditReport(): Promise<void> {
    const resp = await fetch(`${endpointBase}/normref/audit/production/export`);
    const payload = await readJsonResponse<{ report_path?: string; count?: number }>(resp);
    if (!resp.ok) {
      throw new Error(getErrorMessage(payload, `导出审计报告失败（HTTP ${resp.status}）`));
    }
    await loadProductionAuditCenter();
    const okPayload = payload as { report_path?: string; count?: number };
    setReviewSuccess(`审计报告已导出：${String(okPayload.report_path || "-")}（${Number(okPayload.count || 0)} 条）`);
  }

  async function refreshAssetReviewApiState(jobId: string): Promise<void> {
    const cleanJobId = String(jobId || "").trim();
    if (!cleanJobId) return;
    try {
      const latestResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(cleanJobId)}/asset-reviews/latest`);
      const latestPayload = await readJsonResponse<{ items?: AssetReviewLatestItem[] }>(latestResp);
      if (latestResp.ok) {
        const map: Record<string, string> = {};
        const itemsRaw = (latestPayload && typeof latestPayload === "object" && "items" in latestPayload)
          ? (latestPayload as { items?: unknown }).items
          : [];
        const items = Array.isArray(itemsRaw) ? itemsRaw as AssetReviewLatestItem[] : [];
        items.forEach((item: AssetReviewLatestItem) => {
          const objectType = String(item.object_type || "").toLowerCase();
          const objectId = String(item.object_id || "").trim();
          const decision = String(item.decision || "").toLowerCase();
          if (objectType && objectId && decision) {
            map[`${objectType}:${objectId}`] = decision;
          }
        });
        setAssetReviewLatestByKeyFromApi(map);
      }
    } catch {
      // optional PG endpoint; ignore when unavailable
    }
    try {
      const summaryResp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(cleanJobId)}/asset-reviews/summary`);
      const summaryPayload = await readJsonResponse<{ summary?: AssetReviewSummary }>(summaryResp);
      if (summaryResp.ok && summaryPayload && typeof summaryPayload === "object" && "summary" in summaryPayload) {
        const raw = (summaryPayload as { summary?: unknown }).summary;
        if (raw && typeof raw === "object") {
          const row = raw as Record<string, unknown>;
          setAssetReviewSummaryFromApi({
            total: Number(row.total || 0),
            approved: Number(row.approved || 0),
            needs_edit: Number(row.needs_edit || 0),
            rejected: Number(row.rejected || 0),
          });
        }
      }
    } catch {
      // optional PG endpoint; ignore when unavailable
    }
  }

  async function pollIngestRun(runId: string): Promise<void> {
    const maxRounds = 800; // ~20 minutes @1.5s, align with backend ingest timeout (default 15m)
    for (let round = 0; round < maxRounds; round += 1) {
      const resp = await fetch(`${endpointBase}/normref/ingest/runs/${encodeURIComponent(runId)}`);
      const payload = await readJsonResponse<IngestRunStatus>(resp);
      if (!resp.ok) {
        throw new Error(getErrorMessage(payload, `加载运行状态失败（HTTP ${resp.status}）`));
      }
      const row = payload as IngestRunStatus;
      setIngestProgress(Number(row.progress ?? 0) || 0);
      setIngestStageText(String(row.message || row.stage || "").trim());
      if (row.status === "completed") {
        const finalResult = (row.result && typeof row.result === "object") ? (row.result as IngestResponse) : null;
        if (finalResult) {
          setResult(finalResult);
        }
        const artifactRuns = Array.isArray((finalResult as { artifact_runs?: unknown } | null)?.artifact_runs)
          ? (((finalResult as { artifact_runs?: unknown[] }).artifact_runs || []).filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>)
          : [];
        const preferredJob = artifactRuns.find((x) => x.ok === true && String(x.job_id || "").trim())?.job_id;
        const reviewJobs = finalResult?.review_job_ids ?? row.review_job_ids ?? [];
        const targetJobId = String(preferredJob || reviewJobs[0] || "").trim();
        if (targetJobId) {
          const firstId = targetJobId;
          setSelectedJobId(firstId);
          await loadReviewJob(firstId);
        }
        return;
      }
      if (row.status === "failed") {
        const ingestObj = row.result && typeof row.result === "object"
          ? ((row.result as Record<string, unknown>).ingest as Record<string, unknown> | undefined)
          : undefined;
        const stderr = String(ingestObj?.stderr || "").trim();
        const stdout = String(ingestObj?.stdout || "").trim();
        const err = String(row.error || stderr || stdout || row.message || "上传解析失败").trim();
        throw new Error(err || "上传解析失败");
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error("处理超时：后台任务仍未完成。");
  }

  async function submitUploadFlow(): Promise<void> {
    setError("");
    setResult(null);
    setBuildResult(null);
    setSignMessage("");
    // Atomic run switch: clear previous job state before starting a new upload
    // to avoid mixing stale artifacts with current in-flight upload status.
    setSelectedJobId("");
    setReviewPackage(null);
    setArtifactIndex(null);
    setArtifactDocs({});
    setArtifactError("");
    setReviewError("");

    if (inputSource === "normref") {
      if (!inputNormRef.trim()) {
        setError("请选择 normRef 来源并输入规范地址。");
        return;
      }
      setError("normRef 直连入口已就绪（语义层），执行接口将在下一阶段接入。当前可先使用 PDF 解析生成 normRef。");
      return;
    }

    if (!file) {
      setError("请先选择 PDF 文件。");
      return;
    }

    const threshold = Number(approveThreshold);
    if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
      setError("自动通过阈值必须在 0 到 1 之间。");
      return;
    }

    const maxPages = Number(ocrMaxPages);
    if (Number.isNaN(maxPages) || maxPages < 0) {
      setError("OCR 最大页数必须是大于等于 0 的整数。");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("std_code", stdCode.trim());
    formData.append("level", level.trim());
    formData.append("title", title.trim());
    formData.append("publish", String(publish));
    formData.append("write_to_docs", String(writeToDocs));
    formData.append("version_tag", versionTag.trim());
    formData.append("approve_threshold", String(threshold));
    formData.append("ocr_max_pages", String(maxPages));
    formData.append("ai_preprocess", String(aiPreprocess));
    formData.append("ai_model", aiModel.trim());

    setLoading(true);
    setIngestRunning(true);
    setIngestProgress(0);
    setIngestStageText("任务提交中...");
    setIngestRunId("");
    try {
      const response = await fetch(`${endpointBase}/normref/ingest/upload`, { method: "POST", body: formData });
      const payload = await readJsonResponse<IngestResponse>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `上传失败（HTTP ${response.status}）`));
      }
      const typed = payload as IngestResponse;
      setResult(typed);
      const runId = String(typed.run_id || "").trim();
      if (runId) {
        setIngestRunId(runId);
        setIngestStageText(String(typed.message || "后台处理中...").trim());
        setIngestProgress(Number(typed.progress ?? 0) || 0);
        setLoading(false);
        await pollIngestRun(runId);
      } else {
        const reviewJobs = typed.review_job_ids ?? [];
        if (reviewJobs.length > 0) {
          const firstId = reviewJobs[0];
          setSelectedJobId(firstId);
          await loadReviewJob(firstId);
        } else {
          setReviewPackage(null);
        }
      }
    } catch (err) {
      setError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
      setIngestStageText("处理失败");
    } finally {
      setLoading(false);
      setIngestRunning(false);
    }
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await submitUploadFlow();
  }

  async function decideCandidate(candidateId: string, decision: "approve" | "reject", decisionComment?: string): Promise<void> {
    const jobId = selectedJobId.trim();
    if (!jobId) {
      setReviewError("缺少 job_id，无法审批。");
      return;
    }
    setActionCandidateId(candidateId);
    setReviewError("");
    try {
      const url = `${endpointBase}/normref/ingest/rule-candidates/${encodeURIComponent(candidateId)}/${decision}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          reviewer_id: reviewerId.trim(),
          reviewer_name: reviewerName.trim(),
          comment: [reviewComment.trim(), String(decisionComment || "").trim()].filter(Boolean).join(" | "),
        }),
      });
      const payload = await readJsonResponse<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `审批失败（HTTP ${response.status}）`));
      }
      await loadReviewJob(jobId);
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setActionCandidateId("");
    }
  }

  function updateCandidateDraft(
    key: string,
    updater: (prev: CandidateDraft | undefined) => CandidateDraft,
  ): void {
    setCandidateDrafts((prev) => ({
      ...prev,
      [key]: updater(prev[key]),
    }));
  }

  async function confirmCandidate(candidate: RuleCandidate, index: number): Promise<void> {
    const candidateId = String(candidate.candidate_id || "").trim();
    if (!candidateId) {
      setReviewError("候选规则缺少 candidate_id，无法提交确认。");
      return;
    }
    const key = candidateKey(candidate, index);
    const draft = candidateDrafts[key] ?? {
      enabled: true,
      thresholdValue: String(candidate.threshold_value || "").trim(),
      needsExpertConfirm: false,
    };
    const decision: "approve" | "reject" = draft.enabled ? "approve" : "reject";
    const originalThreshold = String(candidate.threshold_value || "").trim();
    const normalizedThreshold = draft.thresholdValue.trim();
    const decisionHints: string[] = [];
    if (normalizedThreshold && normalizedThreshold !== originalThreshold) {
      decisionHints.push(`阈值调整 ${originalThreshold || "-"} -> ${normalizedThreshold}`);
    }
    if (draft.needsExpertConfirm) {
      decisionHints.push("需要专家确认（规则发布）");
    }
    if (resolveBindingStatus(candidate) !== "bound") {
      decisionHints.push("条款绑定待确认（review_required=true）");
    }

    setConfirmingCandidateId(key);
    setConfirmResultByKey((prev) => ({
      ...prev,
      [key]: { ok: true, message: "提交中..." },
    }));
    try {
      await decideCandidate(candidateId, decision, decisionHints.join("；"));
      setConfirmResultByKey((prev) => ({
        ...prev,
        [key]: { ok: true, message: "已提交并刷新候选状态" },
      }));
    } catch (err) {
      setConfirmResultByKey((prev) => ({
        ...prev,
        [key]: { ok: false, message: toUserFacingError(err) },
      }));
      throw err;
    } finally {
      setConfirmingCandidateId("");
    }
  }

  async function signCurrentJob(): Promise<string> {
    const jobId = selectedJobId.trim();
    if (!jobId) {
      setReviewError("请先加载 job_id，再进行规则发布签名（专家确认）。");
      return "";
    }
    let response: Response;
    try {
      response = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expert_id: expertId.trim(),
          expert_name: expertName.trim(),
          comment: expertComment.trim(),
        }),
      });
    } catch (err) {
      throw new Error(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    }
    const payload = await readJsonResponse<{ signature_hash?: string }>(response);
    if (!response.ok) {
      throw new Error(getErrorMessage(payload, `规则发布签名失败（HTTP ${response.status}）`));
    }
    const signatureHash = (payload as { signature_hash?: string }).signature_hash || "";
    setSignMessage(`规则发布签名成功：${signatureHash || "-"}`);
    setLatestSignatureHash(signatureHash || "");
    await loadReviewJob(jobId);
    return signatureHash;
  }

  async function submitHitlDecision(item: HitlQueueItem, action: "accept" | "modify" | "reject"): Promise<void> {
    const jobId = String(selectedJobId || reviewPackage?.job_id || "").trim();
    const candidateId = String(item.candidate_id || "").trim();
    if (!jobId || !candidateId) return;
    setHitlBusyById((prev) => ({ ...prev, [candidateId]: true }));
    setReviewError("");
    try {
      let candidatePatch: Record<string, unknown> = {};
      if (action === "modify") {
        const raw = String(hitlModifyById[candidateId] || "").trim();
        if (raw) {
          candidatePatch = JSON.parse(raw) as Record<string, unknown>;
        }
      }
      const resp = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/hitl-queue/${encodeURIComponent(candidateId)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          reviewer_id: reviewerId.trim() || "expert.default",
          reviewer_name: reviewerName.trim() || "领域专家",
          action,
          comment: reviewComment.trim(),
          candidate_patch: candidatePatch,
        }),
      });
      const payload = await readJsonResponse<Record<string, unknown>>(resp);
      if (!resp.ok) {
        throw new Error(getErrorMessage(payload, `HITL 决策失败（HTTP ${resp.status}）`));
      }
      await loadReviewJob(jobId);
      setReviewSuccess(`HITL ${action} 已提交：${candidateId}`);
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setHitlBusyById((prev) => ({ ...prev, [candidateId]: false }));
    }
  }

  async function submitAssetReview(row: AssetReviewRow, decision: "approve" | "reject" | "needs_edit"): Promise<void> {
    const jobId = selectedJobId.trim();
    if (!jobId) {
      setReviewError("缺少 job_id，无法提交资产人工校验。");
      return;
    }
    const key = `${row.assetType}:${row.assetId}`;
    setAssetReviewBusy((prev) => ({ ...prev, [key]: true }));
    setReviewError("");
    setReviewSuccess("");
    try {
      const reason = String(row.unclosedReason || "").toLowerCase();
      const reviewChecklist = {
        semantic_correct: !reason.includes("semantic"),
        slot_correct: !(reason.includes("slotkey") || reason.includes("slot")),
        operator_correct: !reason.includes("operator"),
        threshold_correct: !reason.includes("threshold"),
        formula_correct: !reason.includes("formula"),
        runtime_ready: !(reason.includes("runtime") || reason.includes("inputs")),
        publishable: decision === "approve" && !row.unclosed,
      };
      const response = await fetch(`${endpointBase}/normref/ingest/assets/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          object_type: row.assetType,
          object_id: row.assetId,
          reviewer_id: reviewerId.trim() || "expert.default",
          reviewer_name: reviewerName.trim() || "领域专家",
          decision,
          review_status: decision === "approve" ? "approved" : decision,
          changed_fields: row.changedFields,
          comment: reviewComment.trim(),
          review_checklist: reviewChecklist,
        }),
      });
      const payload = await readJsonResponse<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `资产人工校验失败（HTTP ${response.status}）`));
      }
      setAssetReviewLatestByKeyFromApi((prev) => ({ ...prev, [key]: decision }));
      setReviewSuccess(`已提交：${row.assetType.toUpperCase()} ${row.assetId} → ${statusLabel(decision)}`);
      await refreshAssetReviewApiState(jobId);
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setAssetReviewBusy((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function submitAssetPatch(row: AssetReviewRow): Promise<void> {
    const jobId = selectedJobId.trim();
    if (!jobId) {
      setReviewError("缺少 job_id，无法提交修改。");
      return;
    }
    const key = `${row.assetType}:${row.assetId}`;
    const patchText = String(assetPatchByKey[key] || "").trim();
    if (!patchText) {
      setReviewError("请先填写 JSON patch。");
      return;
    }
    let patchObj: Record<string, unknown>;
    try {
      const parsed = JSON.parse(patchText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("patch 必须是 JSON 对象");
      }
      patchObj = parsed as Record<string, unknown>;
    } catch (err) {
      setReviewError(`patch JSON 解析失败：${toUserFacingError(err)}`);
      return;
    }
    setAssetReviewBusy((prev) => ({ ...prev, [key]: true }));
    setReviewError("");
    setReviewSuccess("");
    try {
      const response = await fetch(`${endpointBase}/normref/ingest/assets/patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          object_type: row.assetType,
          object_id: row.assetId,
          patch: patchObj,
          reviewer_id: reviewerId.trim() || "expert.default",
          reviewer_name: reviewerName.trim() || "领域专家",
          comment: reviewComment.trim(),
        }),
      });
      const payload = await readJsonResponse<Record<string, unknown>>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `应用修改失败（HTTP ${response.status}）`));
      }
      setReviewSuccess(`已应用修改：${row.assetType.toUpperCase()} ${row.assetId}`);
      await loadReviewJob(jobId);
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setAssetReviewBusy((prev) => ({ ...prev, [key]: false }));
    }
  }

  function setPatchFormValue(key: string, field: string, value: string): void {
    setAssetPatchFormByKey((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value,
      },
    }));
  }

  function buildPatchFromForm(row: AssetReviewRow, key: string): void {
    const form = assetPatchFormByKey[key] || {};
    if (row.assetType === "specir") {
      const patch = {
        normRef: form.normRef || undefined,
        slotKey: form.slotKey || undefined,
        constraint: {
          operator: form.operator || undefined,
          value: form.value ? Number(form.value) : undefined,
          min: form.min ? Number(form.min) : undefined,
          max: form.max ? Number(form.max) : undefined,
          unit: form.unit || undefined,
          formula: form.formula || undefined,
        },
        gate: {
          logic: form.logic || undefined,
          decision: form.decision || undefined,
          on_fail: form.on_fail || undefined,
        },
        outputUnit: form.outputUnit || undefined,
      };
      setAssetPatchByKey((prev) => ({ ...prev, [key]: JSON.stringify(patch) }));
      return;
    }
    if (row.assetType === "rule") {
      const patch = {
        norm_ref: form.norm_ref || undefined,
        unresolved: false,
        condition: {
          field: form.field || undefined,
          operator: form.operator || undefined,
          value: form.value ? Number(form.value) : undefined,
          unit: form.unit || undefined,
        },
      };
      setAssetPatchByKey((prev) => ({ ...prev, [key]: JSON.stringify(patch) }));
      return;
    }
    if (row.assetType === "gate") {
      const patch = {
        logic: form.logic || undefined,
        decision: form.decision || undefined,
        rule_ids: (form.rule_ids || "").split(",").map((x) => x.trim()).filter(Boolean),
      };
      setAssetPatchByKey((prev) => ({ ...prev, [key]: JSON.stringify(patch) }));
      return;
    }
    const patch = {
      source_clause_ids: (form.source_clause_ids || "").split(",").map((x) => x.trim()).filter(Boolean),
      executable: form.executable === "true",
      reason: form.reason || undefined,
    };
    setAssetPatchByKey((prev) => ({ ...prev, [key]: JSON.stringify(patch) }));
  }

  async function buildNormDocForCurrentJob(): Promise<BuildNormDocResponse> {
    const jobId = selectedJobId.trim();
    if (!jobId) {
      setReviewError("请先加载 job_id，再生成 NormDoc。");
      throw new Error("请先加载 job_id，再生成 NormDoc。");
    }
    if (!buildFormType.trim() || !buildStandardId.trim() || !buildStandardVersion.trim()) {
      throw new Error("11_normdoc.json 尚未就绪，缺少 NormDoc 名称/标准编号/版本。");
    }
    const normRef =
      String((reviewPackage as { normRef?: unknown } | null)?.normRef || "").trim()
      || String((artifactNormDoc as { normRef?: unknown } | null)?.normRef || "").trim()
      || buildNormRefFromMeta(buildStandardId.trim(), "table", buildFormType.trim());
    let response: Response;
    try {
      response = await fetch(`${endpointBase}/normref/ingest/jobs/${encodeURIComponent(jobId)}/build-normdoc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          normRef,
          form_type: buildFormType.trim(),
          standard_id: buildStandardId.trim(),
          standard_version: buildStandardVersion.trim(),
          output_path: buildOutputPath.trim(),
        }),
      });
    } catch (err) {
      throw new Error(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    }
    const payload = await readJsonResponse<BuildNormDocResponse>(response);
    if (!response.ok) {
      throw new Error(getErrorMessage(payload, `生成失败（HTTP ${response.status}）`));
    }
    const typed = payload as BuildNormDocResponse;
    setBuildResult(typed);
    await loadReviewJob(jobId);
    return typed;
  }

  function collectApprovedRuleIds(): string[] {
    return Array.from(
      new Set(
        reviewCandidates
          .filter((candidate) => String(candidate.status || "").toLowerCase() === "approved")
          .map((candidate) => String(candidate.rule_id || "").trim())
          .filter(Boolean),
      ),
    );
  }

  function resolveStandardCodeForPublish(): string {
    return String(buildStandardId || "").trim() || String(currentJobSpec.stdCode || "").trim();
  }

  async function resolvePublishableSpuIds(approvedRuleIds: string[]): Promise<{
    publishable: string[];
    skipped: string[];
    fallbackApplied: boolean;
  }> {
    if (approvedRuleIds.length === 0) {
      return { publishable: [], skipped: [], fallbackApplied: false };
    }
    let response: Response;
    try {
      response = await fetch(`${ruleStoreEndpointBase}/api/registry/spus`);
    } catch (err) {
      throw new Error(toUserFacingError(err, { baseUrl: ruleStoreEndpointBase, serviceName: "Rule Store API" }));
    }
    const payload = await readJsonResponse<RegistrySpuResponse>(response);
    if (!response.ok) {
      throw new Error(getErrorMessage(payload, `读取执行器注册表失败（HTTP ${response.status}）`));
    }
    const rawItems = (payload as RegistrySpuResponse).items;
    const registryItems: RegistrySpuItem[] = Array.isArray(rawItems) ? rawItems : [];
    const registrySpuIds = registryItems
      .map((item: RegistrySpuItem) => String(item?.spuId || "").trim())
      .filter(Boolean);
    const registeredSpuSet = new Set(registrySpuIds);
    const pickRegistrySpuByKeyword = (keyword: "compaction" | "deflection" | "thickness"): string => {
      const matched = registrySpuIds.find((spuId) => spuId.toLowerCase().includes(`.${keyword}.`));
      return matched ? String(matched).trim() : "";
    };
    const mappedByKeyword = {
      compaction: pickRegistrySpuByKeyword("compaction"),
      deflection: pickRegistrySpuByKeyword("deflection"),
      thickness: pickRegistrySpuByKeyword("thickness"),
    };

    const publishable: string[] = [];
    const skipped: string[] = [];
    for (const item of approvedRuleIds) {
      if (registeredSpuSet.has(item)) {
        publishable.push(item);
      } else {
        const lower = item.toLowerCase();
        let mapped = "";
        if (lower.includes("compaction")) {
          mapped = mappedByKeyword.compaction;
        } else if (lower.includes("thickness")) {
          mapped = mappedByKeyword.thickness;
        } else if (lower.includes("deflection") || lower.includes("roughness")) {
          mapped = mappedByKeyword.deflection;
        }
        if (mapped) {
          publishable.push(mapped);
        } else {
          skipped.push(item);
        }
      }
    }

    return {
      publishable: Array.from(new Set(publishable)),
      skipped,
      fallbackApplied: false,
    };
  }

  function resolveMetricFromSpuId(spuId: string): "compaction" | "thickness" | "deflection" | null {
    const lower = String(spuId || "").toLowerCase();
    if (lower.includes(".compaction.")) {
      return "compaction";
    }
    if (lower.includes(".thickness.")) {
      return "thickness";
    }
    if (lower.includes(".deflection.") || lower.includes(".roughness.")) {
      return "deflection";
    }
    return null;
  }

  function buildSpuClauseBindings(
    publishableSpuIds: string[],
    options: { normdocId: string; ruleVersion: string },
  ): {
    bindings: Record<string, {
      clause_id: string;
      clause_no: string;
      clause_ids: string[];
      normdoc_id: string;
      rule_version: string;
      review_required: boolean;
    }>;
    unresolved: string[];
  } {
    const approvedCandidates = reviewCandidates.filter((candidate) => String(candidate.status || "").toLowerCase() === "approved");
    const boundByMetric = new Map<string, RuleCandidate>();
    for (const candidate of approvedCandidates) {
      const metric = inferCandidateMetric(candidate);
      if (!metric) {
        continue;
      }
      if (resolveBindingStatus(candidate) !== "bound") {
        continue;
      }
      const previous = boundByMetric.get(metric);
      if (!previous) {
        boundByMetric.set(metric, candidate);
        continue;
      }
      const prevScore = Number(previous.clause_score ?? -1);
      const nextScore = Number(candidate.clause_score ?? -1);
      if (nextScore > prevScore) {
        boundByMetric.set(metric, candidate);
      }
    }

    const bindings: Record<string, {
      clause_id: string;
      clause_no: string;
      clause_ids: string[];
      normdoc_id: string;
      rule_version: string;
      review_required: boolean;
    }> = {};
    const unresolved: string[] = [];

    for (const spuId of publishableSpuIds) {
      const metric = resolveMetricFromSpuId(spuId);
      if (!metric) {
        unresolved.push(`${spuId}: 无法识别检测项类型`);
        continue;
      }
      const candidate = boundByMetric.get(metric);
      if (!candidate) {
        unresolved.push(`${spuId}: 未找到已绑定条款的候选规则`);
        continue;
      }
      const clauseNo = resolveClauseNo(candidate);
      const clauseIdFromCandidate = String(candidate.clause_id || "").trim();
      const clauseIdFromClauseNo = clauseNo !== "—" ? clauseNo : "";
      const clauseIdFromTree = findClauseIdByMetric(step2ClauseTreeRoots, metric);
      const clauseId = clauseIdFromCandidate || clauseIdFromClauseNo || clauseIdFromTree;
      if (!clauseId || clauseNo === "—") {
        unresolved.push(`${spuId}: 条款绑定缺失`);
        continue;
      }
      bindings[spuId] = {
        clause_id: clauseId,
        clause_no: clauseNo,
        clause_ids: [clauseId],
        normdoc_id: options.normdocId,
        rule_version: options.ruleVersion,
        review_required: false,
      };
    }

    return { bindings, unresolved };
  }

  function resolveRuleStoreNormdocId(standardCode: string, version: string): string {
    return `${standardCode}@@${version}`;
  }

  async function publishNormDocViaWorkflow(): Promise<PublishWorkflowResponse> {
    const standardCode = normDocMeta.standardId.trim() || resolveStandardCodeForPublish();
    const version = normDocMeta.version.trim() || buildStandardVersion.trim();
    const jobId = selectedJobId.trim();
    const normdocId = normDocMeta.normdocId.trim();
    const bundleHash = normDocMeta.bundleHash.trim();
    const publisher = expertId.trim() || "expert.001";
    const signature = latestSignatureHash.trim();
    if (!standardCode) {
      throw new Error("缺少标准编号，无法发布。");
    }
    if (!version) {
      throw new Error("缺少标准版本，无法发布。");
    }
    if (!jobId) {
      throw new Error("缺少 job_id，无法执行发布前 artifacts 校验。");
    }
    if (!normdocId) {
      throw new Error("缺少 normdoc_id，无法发布。");
    }
    if (!bundleHash) {
      throw new Error("缺少 bundle_hash，无法发布。");
    }
    if (!signature) {
      throw new Error("缺少 signature，无法发布。");
    }
    const normRef =
      String((artifactNormDoc as { normRef?: unknown } | null)?.normRef || "").trim()
      || String((reviewPackage as { normRef?: unknown } | null)?.normRef || "").trim()
      || buildNormRefFromMeta(standardCode, "table", buildFormType.trim() || "debug_field");
    let response: Response;
    try {
      response = await fetch(`${endpointBase}/normref/publish-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          normRef,
          job_id: jobId,
          normdoc_id: normdocId,
          bundle_hash: bundleHash,
          publisher,
          signature,
          standard_code: standardCode,
          version,
          published_by: publisher,
          publish_executable_package: publishExecutablePackage,
        }),
      });
    } catch (err) {
      throw new Error(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    }
    const payload = await readJsonResponse<PublishWorkflowResponse>(response);
    if (!response.ok) {
      throw new Error(getErrorMessage(payload, `发布到规则库失败（HTTP ${response.status}）`));
    }
    return payload as PublishWorkflowResponse;
  }

  async function onGenerateAndPublishNormDoc(): Promise<void> {
    if (!reviewPackage) {
      setReviewError("请先完成规范上传与 AI 解析，再进入人工校验。");
      return;
    }
    if (reviewCandidates.length === 0) {
      setReviewError("当前没有可确认的候选规则，无法生成 NormDoc。");
      return;
    }
    if (pendingReviewCount > 0) {
      setReviewError(`仍有 ${pendingReviewCount} 项待人工确认，请先完成校验。`);
      return;
    }
    if (approvedReviewCount <= 0) {
      setReviewError("尚未确认任何可用检测项，无法生成 NormDoc。");
      return;
    }
    if (approvedMissingClauseCount > 0) {
      // 发布前自动清理：所有“已通过但条款待绑定”的候选统一驳回，避免卡在 Step 3。
      const approvedPendingBindings = reviewCandidates.filter((candidate) =>
        String(candidate.status || "").toLowerCase() === "approved"
        && Boolean(inferCandidateMetric(candidate))
        && resolveBindingStatus(candidate) !== "bound",
      );
      if (approvedPendingBindings.length > 0) {
        try {
          for (const candidate of approvedPendingBindings) {
            const candidateId = String(candidate.candidate_id || "").trim();
            if (!candidateId) {
              continue;
            }
            await decideCandidate(
              candidateId,
              "reject",
              "自动清理：已通过但条款绑定未完成，发布前自动驳回",
            );
          }
          await loadReviewJob(selectedJobId.trim());
        } catch (err) {
          setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
          return;
        }
      }
    }
    setPublishFlowLoading(true);
    setPublishFlowMessage("");
    setReviewError("");
    setPublishSummary(null);
    try {
      await signCurrentJob();
      const normDoc = await buildNormDocForCurrentJob();
      const published = await publishNormDocViaWorkflow();
      const normdoc = published.normdoc;
      setPublish(true);
      setWriteToDocs(true);
      const path = String(normDoc.output_path || "").trim();
      const nameMatch = path.split(/[\\/]/);
      const normDocName = nameMatch[nameMatch.length - 1] || path || "normdoc.autogen.json";
      const publishedAt = new Date().toLocaleString("zh-CN", { hour12: false });
      setPublishSummary({
        normDocName: normDocMeta.name || normDocMeta.formType || normDocName,
        standardId: normDocMeta.standardId || resolveStandardCodeForPublish() || "-",
        version: String(normdoc?.version || normDocMeta.version || "-"),
        ruleCount: Number(normdoc?.rule_count ?? normDoc.approved_count ?? approvedReviewCount),
        componentCount: Number(normdoc?.component_count ?? 0),
        bundleHash: String(published.bundle_hash || normdoc?.bundle_hash || "-"),
        signer: expertName.trim() || expertId.trim() || "专家",
        publishedAt: String(normdoc?.published_at || publishedAt),
        normdocId: String(normdoc?.normdoc_id || "-"),
        packageId: String(published.package_id || normdoc?.normdoc_id || "-"),
        status: String(normdoc?.status || "published"),
      });
      setPublishFlowMessage("已按 SpecBot 正式流程发布 NormDoc，可在 Rule Store / Executor 使用。");
    } catch (err) {
      setReviewError(toUserFacingError(err));
    } finally {
      setPublishFlowLoading(false);
    }
  }

  async function buildSpecBundleAndDownload(): Promise<void> {
    const standardCode = buildStandardId.trim() || resolveStandardCodeForPublish();
    const version = buildStandardVersion.trim();
    if (!standardCode) {
      setReviewError("请先填写标准编号，再生成 specbundle。");
      return;
    }
    if (!version) {
      setReviewError("请先等待 11_normdoc.json 产出标准版本，再生成 specbundle。");
      return;
    }
    setSpecBundleLoading(true);
    setSpecBundleMessage("");
    setSpecBundleVerifyReport(null);
    setReviewError("");
    try {
      const response = await fetch(`${endpointBase}/normref/specbundle/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          standard_code: standardCode,
          version,
          job_id: selectedJobId.trim(),
        }),
      });
      const payload = await readJsonResponse<SpecBundleBuildResponse>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `生成 specbundle 失败（HTTP ${response.status}）`));
      }
      const typed = payload as SpecBundleBuildResponse;
      const bundleName = String(typed.bundle_name || "").trim();
      const downloadUrl = String(typed.download_url || "").trim();
      if (!bundleName || !downloadUrl) {
        throw new Error("specbundle 生成成功但返回下载地址为空。");
      }
      setSpecBundleName(bundleName);
      const absoluteDownloadUrl = `${endpointBase}${downloadUrl}`;
      const anchor = document.createElement("a");
      anchor.href = absoluteDownloadUrl;
      anchor.download = bundleName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      const sourceMode = String(typed.source_mode || "").trim();
      const sourceJobId = String(typed.source_job_id || "").trim();
      const modeText = sourceMode ? `，来源模式：${sourceMode}` : "";
      const jobText = sourceJobId ? `，来源任务：${sourceJobId}` : "";
      setSpecBundleMessage(`specbundle 已生成并开始下载：${bundleName}${modeText}${jobText}`);
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setSpecBundleLoading(false);
    }
  }

  async function buildRulePackAndDownload(): Promise<void> {
    const jobId = selectedJobId.trim();
    if (!jobId) {
      setReviewError("请先加载 job_id，再生成规则包。");
      return;
    }
    const formCode = (rulePackFormCode.trim() || "bridge_shi_13").replace(/\s+/g, "_");
    setRulePackLoading(true);
    setRulePackMessage("");
    setReviewError("");
    try {
      const selectedSlotKeys = Array.from(
        new Set(
          artifactComponents
            .flatMap((item) => {
              const values = [
                String((item as { mapped_slotKey?: unknown }).mapped_slotKey || "").trim(),
                String((item as { slotKey?: unknown }).slotKey || "").trim(),
                String((item as { component_id?: unknown }).component_id || "").trim(),
              ];
              return values.filter(Boolean);
            }),
        ),
      );
      const selectedSpecirIds = Array.from(
        new Set(
          artifactRules
            .map((r) => String((r as { source_specir_id?: unknown }).source_specir_id || (r as { specir_id?: unknown }).specir_id || "").trim())
            .filter(Boolean),
        ),
      );
      const response = await fetch(`${endpointBase}/normref/rulepack/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          form_code: formCode,
          form_name: normDocMeta.name || "",
          package_version: "v1",
          selected_slotKeys: selectedSlotKeys,
          selected_specir_ids: selectedSpecirIds,
        }),
      });
      const payload = await readJsonResponse<RulePackBuildResponse>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `生成规则包失败（HTTP ${response.status}）`));
      }
      const typed = payload as RulePackBuildResponse;
      const name = String(typed.rulepack_name || "").trim();
      const downloadUrl = String(typed.download_url || "").trim();
      if (!name || !downloadUrl) {
        throw new Error("规则包生成成功但下载地址为空。");
      }
      setRulePackName(name);
      setRulePackMeta((typed.meta && typeof typed.meta === "object") ? typed.meta : null);
      const filtering = (typed.whitelist_filtering && typeof typed.whitelist_filtering === "object") ? typed.whitelist_filtering : null;
      const beforeCount = (filtering?.before_count && typeof filtering.before_count === "object") ? filtering.before_count : {};
      const afterCount = (filtering?.after_count && typeof filtering.after_count === "object") ? filtering.after_count : {};
      const removedReason = (filtering?.removed_reason && typeof filtering.removed_reason === "object") ? filtering.removed_reason : {};
      const removedNoiseCount = Number(filtering?.removed_noise_count || 0);
      const summaryText = [
        `Rulepack 下载前摘要`,
        `form_code=${formCode}`,
        `before: specir=${Number(beforeCount.specir || 0)}, rules=${Number(beforeCount.rules || 0)}, gates=${Number(beforeCount.gates || 0)}, components=${Number(beforeCount.components || 0)}, proofs=${Number(beforeCount.proof_templates || 0)}`,
        `after: specir=${Number(afterCount.specir || 0)}, rules=${Number(afterCount.rules || 0)}, gates=${Number(afterCount.gates || 0)}, components=${Number(afterCount.components || 0)}, proofs=${Number(afterCount.proof_templates || 0)}`,
        `removed_noise_count=${removedNoiseCount}`,
        `manifest: specir=${Number(typed.rulepack_manifest?.specir_count || 0)}, rules=${Number(typed.rulepack_manifest?.rule_count || 0)}, gates=${Number(typed.rulepack_manifest?.gate_count || 0)}, slots=${Number(typed.rulepack_manifest?.slot_count || 0)}, noise=${Number(typed.rulepack_manifest?.removed_noise_count || 0)}`,
        `removed_reason=${Object.keys(removedReason).length > 0 ? JSON.stringify(removedReason) : "{}"}`,
      ].join("\n");
      const confirmed = window.confirm(`${summaryText}\n\n确认下载 rulepack？`);
      if (!confirmed) {
        setRulePackMessage(`已取消下载。\n${summaryText}`);
        return;
      }
      const absoluteDownloadUrl = `${endpointBase}${downloadUrl}`;
      const anchor = document.createElement("a");
      anchor.href = absoluteDownloadUrl;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      const counts = (typed.counts && typeof typed.counts === "object") ? typed.counts : null;
      const countText = counts
        ? `（rules=${Number(counts.rules || 0)} / gates=${Number(counts.gates || 0)} / components=${Number(counts.components || 0)} / proofs=${Number(counts.proof_templates || 0)}）`
        : "";
      setRulePackMessage(`规则包已生成并开始下载：${name}${countText}\n${summaryText}`);
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setRulePackLoading(false);
    }
  }

  async function verifySpecBundle(): Promise<void> {
    const bundleName = specBundleName.trim();
    if (!bundleName) {
      setReviewError("请先生成 specbundle。");
      return;
    }
    setSpecBundleVerifyLoading(true);
    setReviewError("");
    try {
      const response = await fetch(`${endpointBase}/normref/specbundle/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_name: bundleName }),
      });
      const payload = await readJsonResponse<SpecBundleVerifyResponse>(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `校验 specbundle 失败（HTTP ${response.status}）`));
      }
      setSpecBundleVerifyReport(payload as SpecBundleVerifyResponse);
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
      setSpecBundleVerifyReport(null);
    } finally {
      setSpecBundleVerifyLoading(false);
    }
  }

  const pendingReviewCount = reviewPackage?.review_summary?.pending
    ?? reviewCandidates.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return status === "pending" || status === "pending_review" || status === "review_required";
    }).length;
  const approvedReviewCount = reviewPackage?.review_summary?.approved
    ?? reviewCandidates.filter((item) => String(item.status || "").toLowerCase() === "approved").length;
  const sourceFilePath = String((reviewPackage as unknown as { source_artifacts?: { input_file?: string } })?.source_artifacts?.input_file || result?.uploaded_file || "").trim();
  const publishRelevantApprovedCandidates = reviewCandidates.filter((item) =>
    String(item.status || "").toLowerCase() === "approved" && Boolean(inferCandidateMetric(item)));
  const approvedMissingClauseCount = publishRelevantApprovedCandidates.filter((item) => !hasResolvableClauseBinding(item)).length;
  const approvedBoundClauseCount = publishRelevantApprovedCandidates.length - approvedMissingClauseCount;
  const signatureCount = reviewPackage?.expert_signatures?.length ?? 0;
  const generatedNormDocCount = reviewPackage?.generated_normdocs?.length ?? 0;
  const allArtifactValid = Boolean(
    artifactIndex
    && Object.keys(artifactIndex.validations || {}).length > 0
    && Object.values(artifactIndex.validations || {}).every((item) => Boolean(item?.valid)),
  );
  const canGenerateAndPublishNormDoc = Boolean(
    currentJobId
      && reviewPackage
      && reviewCandidates.length > 0
      && pendingReviewCount === 0
      && approvedReviewCount > 0
      && approvedMissingClauseCount === 0
      && allArtifactValid,
  );
  const publishEnabled = Boolean(publishSummary || result?.ingest?.report?.publish_enabled || publish);
  const identifiedClauseCount = firstJob?.clause_tree_stats?.node_count ?? firstJob?.clause_tree?.stats?.node_count ?? 0;
  const candidateRuleCount = firstJob?.candidate_count ?? firstJob?.ai_preprocess?.ai_candidate_count ?? reviewPackage?.candidate_count ?? 0;
  const manualConfirmCountFromJobSummary = Object.entries(firstJob?.status_summary ?? {}).reduce((acc, [key, value]) => {
    const lowerKey = key.toLowerCase();
    const nextValue = Number(value) || 0;
    if (lowerKey.includes("pending") || lowerKey.includes("review_required")) {
      return acc + nextValue;
    }
    return acc;
  }, 0);
  const manualConfirmCount = reviewPackage ? pendingReviewCount : manualConfirmCountFromJobSummary;
  const executableRuleCount = artifactRules.filter((item) => Boolean(item.enabled) && !Boolean(item.unresolved)).length;
  const unresolvedRuleCount = artifactRules.filter((item) => Boolean(item.unresolved)).length;
  const unresolvedGateCount = artifactGates.filter((item) => Boolean(item.unresolved)).length;
  const hasDtoProofWithoutExecutable = artifactDtos.length > 0 && artifactProofTemplates.length > 0 && (artifactRules.length === 0 || artifactGates.length === 0);
  const specExists = Boolean(currentJobSpec.stdCode || normDocMeta.standardId);
  const coreAssetsReady = specExists
    && artifactCatalogNodes.length > 0
    && artifactComponents.length > 0
    && artifactRules.length > 0
    && artifactGates.length > 0;
  const runtimeDerivedPending = coreAssetsReady && artifactDtos.length <= 0;
  const publishBlockedByUnresolved = unresolvedRuleCount > 0 || unresolvedGateCount > 0;
  const normdocStatus = normDocMeta.status.trim().toLowerCase();
  const auditBlockers = Array.isArray((artifactPipelineAudit as { blockers?: unknown } | null)?.blockers)
    ? ((artifactPipelineAudit as { blockers?: unknown[] }).blockers || []).map((x) => String(x))
    : [];
  const normdocIsDraftInvalid = normdocStatus === "draft_invalid";
  const normdocIsDraftEmpty = normdocStatus === "draft_empty";
  const normdocIsInvalidNormdoc = normdocStatus === "invalid_normdoc";
  const normdocReadyToPublish = normdocStatus === "ready_to_publish";
  const normdocInvalidReasons = Array.isArray((artifactNormDoc as { invalid_reasons?: unknown } | null)?.invalid_reasons)
    ? ((artifactNormDoc as { invalid_reasons?: unknown[] }).invalid_reasons || []).map((x) => String(x).trim()).filter(Boolean)
    : [];
  const normdocPublishable = Boolean(normDocMeta.publishable);
  const layerOverview = useMemo(() => {
    const pageCountFromAudit = Number(
      ((artifactPipelineAudit as { document_ir?: { page_count?: unknown } } | null)?.document_ir?.page_count) ?? 0,
    );
    const headingCount = artifactClauseTreeNodes.filter((n) => {
      const t = String((n as { node_type?: unknown }).node_type || "").toLowerCase();
      return t.includes("heading") || t.includes("chapter") || t.includes("section");
    }).length;
    const clauseCount = artifactClauseTreeNodes.filter((n) => {
      const t = String((n as { node_type?: unknown }).node_type || "").toLowerCase();
      return t.includes("clause") || t.includes("article");
    }).length;
    const tableCountFromTree = artifactClauseTreeNodes.filter((n) => {
      const t = String((n as { node_type?: unknown }).node_type || "").toLowerCase();
      return t.includes("table");
    }).length;
    const tableCountFromCls = artifactClassifications.filter((row) => JSON.stringify(row).toLowerCase().includes("table")).length;
    const pageCount = Math.max(pageCountFromAudit, Number(reviewPackage?.clause_tree_stats?.root_count ?? 0), 0);
    const blockCount = artifactClauseTreeNodes.length;
    const tableCount = Math.max(tableCountFromTree, tableCountFromCls, 0);

    const specItems = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    const specirCountFromDoc = Number(specirDoc?.count ?? specItems.length ?? 0);
    const specirCountFromArtifacts = Number(artifactIndex?.artifact_summaries?.["05_components.json"]?.count ?? 0);
    const specirCount = Math.max(specirCountFromDoc, specirCountFromArtifacts, artifactComponents.length);
    const approvedSpecirCount = specItems.filter((it) => String((it as { status?: unknown }).status || "").toLowerCase() === "approved").length || approvedReviewCount;
    const unresolvedSpecirCount = Math.max(
      specItems.filter((it) => Array.isArray(it.issues) && it.issues.length > 0).length,
      Number(pendingReviewCount || 0),
    );
    const confidenceRows = specItems
      .map((it) => Number((it as { confidence?: unknown }).confidence))
      .filter((v) => Number.isFinite(v));
    const confidenceDistribution = {
      high: confidenceRows.filter((v) => v >= 0.8).length,
      medium: confidenceRows.filter((v) => v >= 0.5 && v < 0.8).length,
      low: confidenceRows.filter((v) => v < 0.5).length,
    };
    const completeBodyGateCalCount = specItems.filter((it) => {
      const hasBody = Boolean(it.rule);
      const hasGate = Boolean(it.gate);
      const hasCal = Boolean(String((it as { explanation?: unknown }).explanation || "").trim());
      return hasBody && hasGate && hasCal;
    }).length;
    const bodyGateCalCompleteness = specirCount > 0 ? Math.round((completeBodyGateCalCount / specirCount) * 100) : 0;

    const selectedSpecirCount = new Set(
      artifactRules
        .map((r) => String((r as { source_specir_id?: unknown }).source_specir_id || (r as { specir_id?: unknown }).specir_id || "").trim())
        .filter(Boolean),
    ).size;
    const ruleCount = artifactRules.length;
    const gateCount = artifactGates.length;
    const publishable = Boolean(normdocPublishable && ruleCount > 0 && gateCount > 0);
    const componentEligibleFromArtifacts = artifactComponents.filter((row) => {
      const eligible = (row as { component_eligible?: unknown }).component_eligible;
      if (typeof eligible === "boolean") return eligible;
      return true;
    }).length;
    const componentEligibleCount = componentEligibleFromArtifacts;
    const componentBlockedCount = Math.max(0, artifactComponents.length - componentEligibleCount);

    return {
      documentIR: { pageCount, blockCount, headingCount, clauseCount, tableCount },
      specIR: { specirCount, approvedSpecirCount, unresolvedSpecirCount, confidenceDistribution, bodyGateCalCompleteness },
      components: {
        clause_count: clauseCount,
        specir_count: specirCount,
        component_count: componentEligibleCount,
        blocked_component_count: componentBlockedCount,
      },
      rulepack: { formCode: rulePackMeta?.form_code || rulePackFormCode || "-", selectedSpecirCount, ruleCount, gateCount, publishable },
      reviewSign: {
        pending_review: Number(pendingReviewCount || 0),
        approved: Number(approvedReviewCount || 0),
        rejected: Number(assetReviewSummaryFromApi?.rejected || 0),
        signed: Number(signatureCount || 0),
      },
    };
  }, [
    approvedReviewCount,
    artifactComponents.length,
    artifactIndex?.artifact_summaries,
    artifactClassifications,
    artifactClauseTreeNodes,
    artifactGates,
    artifactPipelineAudit,
    artifactRules,
    assetReviewSummaryFromApi?.rejected,
    normdocPublishable,
    pendingReviewCount,
    reviewPackage?.clause_tree_stats?.root_count,
    rulePackFormCode,
    rulePackMeta?.form_code,
    signatureCount,
    specirDoc,
    pendingReviewCount,
  ]);
  const normdocHeaderPresent = useMemo(() => {
    const node = artifactNormDoc as Record<string, unknown> | null;
    if (!node) return false;
    const header = (node.header && typeof node.header === "object")
      ? (node.header as Record<string, unknown>)
      : ((node.spec && typeof node.spec === "object") ? (node.spec as Record<string, unknown>) : {});
    const hasStandard = Boolean(String(header.standard_id || header.spec_id || normDocMeta.standardId || "").trim());
    const hasVersion = Boolean(String(header.version || normDocMeta.version || "").trim());
    return hasStandard && hasVersion;
  }, [artifactNormDoc, normDocMeta.standardId, normDocMeta.version]);
  const normdocBodyRulesCount = useMemo(() => {
    const node = artifactNormDoc as Record<string, unknown> | null;
    if (!node) return 0;
    const body = (node.body && typeof node.body === "object") ? (node.body as Record<string, unknown>) : {};
    const rulesInBody = Array.isArray(body.rules) ? body.rules.length : 0;
    return Math.max(rulesInBody, Number(normDocMeta.rulesCount || 0));
  }, [artifactNormDoc, normDocMeta.rulesCount]);
  const normdocGateCount = useMemo(() => {
    const node = artifactNormDoc as Record<string, unknown> | null;
    if (!node) return 0;
    const gateNode = (node.gate && typeof node.gate === "object") ? (node.gate as Record<string, unknown>) : {};
    const gatesInGate = Array.isArray(gateNode.gates) ? gateNode.gates.length : 0;
    return Math.max(gatesInGate, Number(normDocMeta.gatesCount || 0));
  }, [artifactNormDoc, normDocMeta.gatesCount]);
  const normdocNormRefsCount = useMemo(() => {
    const node = artifactNormDoc as Record<string, unknown> | null;
    if (!node) return 0;
    const refs = Array.isArray(node.norm_refs) ? node.norm_refs : [];
    const body = (node.body && typeof node.body === "object") ? (node.body as Record<string, unknown>) : {};
    const bodyRefs = Array.isArray(body.norm_refs) ? body.norm_refs : [];
    return Math.max(refs.length, bodyRefs.length);
  }, [artifactNormDoc]);
  const normdocInvalidCoreReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!normdocHeaderPresent) reasons.push("缺少 Header");
    if (normdocBodyRulesCount <= 0) reasons.push("无规则");
    if (normdocGateCount <= 0) reasons.push("无 Gate");
    if (normdocNormRefsCount <= 0) reasons.push("缺少 norm_refs（来源）");
    return reasons;
  }, [normdocHeaderPresent, normdocBodyRulesCount, normdocGateCount, normdocNormRefsCount]);
  const normdocCoreValid = normdocInvalidCoreReasons.length === 0;
  const layerpegHealth = useMemo(() => {
    const lp = (artifactNormDoc as unknown as { layerpeg?: Record<string, unknown> } | null)?.layerpeg;
    const header = (lp as { header?: Record<string, unknown> } | undefined)?.header || {};
    const gate = (lp as { gate?: Record<string, unknown> } | undefined)?.gate || {};
    const body = (lp as { body?: Record<string, unknown> } | undefined)?.body || {};
    const proof = (lp as { proof?: Record<string, unknown> } | undefined)?.proof || {};
    const state = (lp as { state?: Record<string, unknown> } | undefined)?.state || {};
    const outputDto = (body as { outputDto?: Record<string, unknown> }).outputDto || {};
    const rulesCount = Number(outputDto.rules_count ?? normDocMeta.rulesCount ?? 0);
    const gatesCount = Number(outputDto.gates_count ?? normDocMeta.gatesCount ?? 0);
    const componentsCount = Number(outputDto.components_count ?? artifactComponents.length ?? 0);
    const proofEvidence = Array.isArray((proof as { evidence?: unknown }).evidence) ? ((proof as { evidence?: unknown[] }).evidence || []).length : 0;
    const decision = String((gate as { decision?: unknown }).decision || "").toLowerCase();
    const currentState = String((state as { current?: unknown }).current || "").toUpperCase();
    const items = [
      {
        layer: "Header",
        ok: Boolean(String((header as { usi?: unknown }).usi || "").trim() && String((header as { version?: unknown }).version || "").trim()),
        reason: "需具备 usi/version",
      },
      {
        layer: "Gate",
        ok: rulesCount > 0 && gatesCount > 0 && (decision === "pass" || decision === "override"),
        reason: `rules=${rulesCount}, gates=${gatesCount}, decision=${decision || "-"}`,
      },
      {
        layer: "Body",
        ok: componentsCount > 0 && artifactClauseTreeNodes.length > 0,
        reason: `components=${componentsCount}, clause_tree=${artifactClauseTreeNodes.length}`,
      },
      {
        layer: "Proof",
        ok: proofEvidence > 0,
        reason: `evidence=${proofEvidence}`,
      },
      {
        layer: "State",
        ok: currentState === "READY_TO_PUBLISH",
        reason: `current=${currentState || "-"}`,
      },
    ];
    return items;
  }, [artifactNormDoc, artifactComponents.length, artifactClauseTreeNodes.length, normDocMeta.rulesCount, normDocMeta.gatesCount]);
  const unresolvedPendingRuleCount = artifactRules.filter((item) => {
    const s = String((item as { semantic_status?: unknown }).semantic_status || "").trim().toLowerCase();
    return s === "ambiguous" || s === "conflicted" || s === "rejected";
  }).length;
  const unresolvedPendingGateCount = artifactGates.filter((item) => {
    const s = String((item as { semantic_status?: unknown }).semantic_status || "").trim().toLowerCase();
    return s === "ambiguous" || s === "conflicted" || s === "rejected";
  }).length;
  const normalizedComponentRows = useMemo(() => {
    const isDirectoryLikeText = (text: string): boolean => {
      const t = String(text || "").trim().toLowerCase();
      if (!t) return false;
      return (
        t.includes("总则")
        || t.includes("术语")
        || t.includes("说明")
        || t.includes("范围")
        || t.includes("目的")
        || t.includes("附录")
        || t.includes("chapter")
        || t.includes("section")
      );
    };
    const computeEligibility = (input: {
      executable: boolean;
      hasRule: boolean;
      hasGate: boolean;
      hasDto: boolean;
      slotKey: string;
      semanticType: string;
      semanticStatus: string;
      executionStatus: string;
      confidence: number;
      reviewStatus: string;
      summary: string;
      neededByRulepack: boolean;
      crossFormUsage: number;
      directoryLike: boolean;
      explanatoryOnly: boolean;
    }) => {
      const executabilityScore = input.executionStatus === "executable"
        ? 1
        : input.executionStatus === "partial_executable"
          ? 0.7
          : 0.2;
      const reusabilityScore = input.slotKey ? 0.9 : 0.35;
      const crossFormUsageScore = Math.min(1, Math.max(0, input.crossFormUsage / 3));
      const semanticValueScore = input.semanticType === "non_executable_clause"
        ? 0.2
        : (input.semanticStatus === "understood" || input.semanticStatus === "parsed" ? 0.85 : 0.45);
      const stabilityScore = Math.max(
        0,
        Math.min(1, (Number.isFinite(input.confidence) ? input.confidence : 0.5) * (input.reviewStatus === "approved" ? 1 : 0.8)),
      );
      const score = (
        executabilityScore * 0.3
        + reusabilityScore * 0.25
        + crossFormUsageScore * 0.15
        + semanticValueScore * 0.2
        + stabilityScore * 0.1
      );
      const blockedByNature = input.directoryLike || input.explanatoryOnly || input.semanticType === "non_executable_clause";
      const referenced = input.hasRule || input.hasGate || input.hasDto;
      const eligible = (
        (!blockedByNature && score >= 0.7)
        || referenced
        || input.neededByRulepack
      );
      return {
        component_eligibility_score: Number(score.toFixed(4)),
        executability_score: Number(executabilityScore.toFixed(4)),
        reusability_score: Number(reusabilityScore.toFixed(4)),
        cross_form_usage: input.crossFormUsage,
        semantic_value_score: Number(semanticValueScore.toFixed(4)),
        stability_score: Number(stabilityScore.toFixed(4)),
        blocked_by_nature: blockedByNature,
        eligible,
      };
    };

    const specItems = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    if (specItems.length > 0) {
      return specItems
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const compId = String(item.component_id || "-");
          const slotKey = String((item as { slotKey?: unknown }).slotKey || "").trim();
          const semanticType = String((item as { semantic_type?: unknown }).semantic_type || "").trim().toLowerCase();
          const semanticStatus = String((item as { semantic_status?: unknown }).semantic_status || "").trim().toLowerCase();
          const executionStatus = String((item as { execution_status?: unknown }).execution_status || "").trim().toLowerCase();
          const confidence = Number((item as { confidence?: unknown }).confidence);
          const reviewStatus = String((item as { review_status?: unknown }).review_status || "").trim().toLowerCase();
          const gateNeed = Boolean(item.gate?.need_gate);
          const hasGate = Boolean(String(item.gate?.logic || "").trim()) || !gateNeed;
          const hasRule = Boolean(item.rule);
          const hasDto = artifactDtos.some((d) => String((d as { component_id?: unknown }).component_id || "").trim() === compId);
          const crossFormUsage = 0;
          const neededByRulepack = Boolean((item as { rulepack_required?: unknown }).rulepack_required || (item as { needed_by_rulepack?: unknown }).needed_by_rulepack);
          const summary = String(item.summary || item.explanation || "").trim();
          const directoryLike = isDirectoryLikeText(summary) || isDirectoryLikeText(String((item.evidence?.source_clause_id || "")));
          const explanatoryOnly = !hasRule && !gateNeed && !Boolean(item.executable);
          const eligibility = computeEligibility({
            executable: Boolean(item.executable),
            hasRule,
            hasGate,
            hasDto,
            slotKey,
            semanticType,
            semanticStatus,
            executionStatus,
            confidence,
            reviewStatus,
            summary,
            neededByRulepack,
            crossFormUsage,
            directoryLike,
            explanatoryOnly,
          });
          return {
            component_id: compId,
            name: String(item.summary || item.explanation || compId || "-"),
            type: "SpecIRComponent",
            spec_id: String(specirDoc?.std_code || "-"),
            catalog_path: String(item.evidence?.catalog_path || "-"),
            source_clause_ids: String(item.evidence?.source_clause_id || "").trim() ? [String(item.evidence?.source_clause_id || "").trim()] : [],
            original_text: String(item.evidence?.original_text || "").trim() || "-",
            executable: Boolean(item.executable),
            rules: item.rule ? [`${compId}.rule`] : [],
            gates: hasGate && gateNeed ? [`${compId}.gate`] : [],
            status: Array.isArray(item.issues) && item.issues.length > 0 ? "warning" : "healthy",
            reason: Array.isArray(item.issues) ? item.issues.join("；") : "-",
            slotKey: slotKey || "-",
            semantic_type: semanticType || "-",
            semantic_status: semanticStatus || "-",
            execution_status: executionStatus || (Boolean(item.executable) ? "executable" : "not_executable"),
            component_eligibility_score: eligibility.component_eligibility_score,
            executability_score: eligibility.executability_score,
            reusability_score: eligibility.reusability_score,
            cross_form_usage: eligibility.cross_form_usage,
            semantic_value_score: eligibility.semantic_value_score,
            stability_score: eligibility.stability_score,
            blocked_by_nature: eligibility.blocked_by_nature,
            component_eligible: eligibility.eligible,
            specir_summary: String(item.summary || "").trim(),
            specir_explanation: String(item.explanation || "").trim(),
            specir_rule: item.rule || null,
            specir_gate: item.gate || null,
            specir_issues: Array.isArray(item.issues) ? item.issues : [],
          };
        });
    }
    return artifactComponents.map((item) => {
      const componentId = String(item.component_id || "-");
      const rules = Array.isArray(item.rules) ? item.rules.map((x) => String(x)) : [];
      const gates = Array.isArray(item.gates) ? item.gates.map((x) => String(x)) : [];
      const hasRule = rules.length > 0;
      const hasGate = gates.length > 0;
      const hasDto = artifactDtos.some((d) => String((d as { component_id?: unknown }).component_id || "").trim() === componentId);
      const slotKey = String((item as { slot_key?: unknown }).slot_key || (item as { slotKey?: unknown }).slotKey || "").trim();
      const semanticType = String((item as { semantic_type?: unknown }).semantic_type || "").trim().toLowerCase();
      const semanticStatus = String((item as { semantic_status?: unknown }).semantic_status || "").trim().toLowerCase();
      const executionStatus = String((item as { execution_status?: unknown }).execution_status || "").trim().toLowerCase();
      const confidence = Number((item as { confidence?: unknown }).confidence);
      const reviewStatus = String((item as { review_status?: unknown }).review_status || "").trim().toLowerCase();
      const summary = String(item.name || item.original_text || "").trim();
      const directoryLike = isDirectoryLikeText(summary);
      const explanatoryOnly = !hasRule && !hasGate && !Boolean(item.executable);
      const neededByRulepack = Boolean((item as { rulepack_required?: unknown }).rulepack_required || (item as { needed_by_rulepack?: unknown }).needed_by_rulepack);
      const crossFormUsage = Number((item as { cross_form_usage?: unknown }).cross_form_usage || 0) || 0;
      const eligibility = computeEligibility({
        executable: Boolean(item.executable),
        hasRule,
        hasGate,
        hasDto,
        slotKey,
        semanticType,
        semanticStatus,
        executionStatus,
        confidence,
        reviewStatus,
        summary,
        neededByRulepack,
        crossFormUsage,
        directoryLike,
        explanatoryOnly,
      });
      return {
        component_id: componentId,
        name: String(item.name || "-"),
        type: String(item.type || "-"),
        spec_id: String(item.spec_id || item.spec_ref || "-"),
        catalog_path: String(item.catalog_path || "-"),
        source_clause_ids: Array.isArray(item.source_clause_ids) ? item.source_clause_ids.map((x) => String(x)) : [],
        original_text: String(item.original_text || "").trim() || "-",
        executable: Boolean(item.executable),
        rules,
        gates,
        status: String(item.status || "-"),
        reason: String(item.reason || "").trim() || "-",
        slotKey: slotKey || "-",
        semantic_type: semanticType || "-",
        semantic_status: semanticStatus || "-",
        execution_status: executionStatus || (Boolean(item.executable) ? "executable" : "not_executable"),
        component_eligibility_score: eligibility.component_eligibility_score,
        executability_score: eligibility.executability_score,
        reusability_score: eligibility.reusability_score,
        cross_form_usage: eligibility.cross_form_usage,
        semantic_value_score: eligibility.semantic_value_score,
        stability_score: eligibility.stability_score,
        blocked_by_nature: eligibility.blocked_by_nature,
        component_eligible: eligibility.eligible,
        specir_summary: "",
        specir_explanation: "",
        specir_rule: null,
        specir_gate: null,
        specir_issues: [] as string[],
      };
    });
  }, [artifactComponents, artifactDtos, specirDoc]);
  const componentTypesOrdered = [
    "ChapterComponent",
    "WorkItemComponent",
    "ProcessComponent",
    "MaterialComponent",
    "MethodComponent",
    "MeasuredItemComponent",
    "TableComponent",
    "AppendixComponent",
  ];
  const componentTypeLabelMap: Record<string, string> = {
    ChapterComponent: "章节构件",
    WorkItemComponent: "作业项构件",
    ProcessComponent: "工序构件",
    MaterialComponent: "材料构件",
    MethodComponent: "方法构件",
    MeasuredItemComponent: "实测项构件",
    TableComponent: "表格构件",
    AppendixComponent: "附录构件",
  };
  const getComponentTypeLabel = (type: string): string => componentTypeLabelMap[type] || type || "-";
  const summarizeConstraintText = useCallback((text: string): string => {
    const plain = String(text || "").replace(/\s+/g, " ").trim();
    if (!plain) return "-";
    const m = plain.match(/(.{1,16}?)(不大于|小于等于|不得超过|不小于|大于等于|大于|小于|≤|≥)\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z%°℃\/]*)/);
    if (m) {
      const opMap: Record<string, string> = {
        "不大于": "≤",
        "小于等于": "≤",
        "不得超过": "≤",
        "不小于": "≥",
        "大于等于": "≥",
        "大于": ">",
        "小于": "<",
      };
      const op = opMap[m[2]] || m[2];
      return `${m[1].trim()} ${op} ${m[3]}${m[4] || ""}`.trim();
    }
    return plain.length > 60 ? `${plain.slice(0, 60)}...` : plain;
  }, []);
  const toReadableRuleLine = useCallback((rule: Record<string, unknown>): string => {
    const field = String(rule.field || "-");
    const cond = (rule.condition && typeof rule.condition === "object") ? (rule.condition as Record<string, unknown>) : {};
    const operatorRaw = String(rule.operator || cond.operator || "-");
    const value = String(rule.value ?? rule.min ?? cond.value ?? "-");
    const unit = String(rule.unit || cond.unit || "");
    const opMap: Record<string, string> = {
      lte: "≤",
      gte: "≥",
      lt: "<",
      gt: ">",
      eq: "=",
      neq: "≠",
      exists: "存在",
      range: "区间",
    };
    const op = opMap[operatorRaw] || operatorRaw;
    if (operatorRaw === "exists") return `${field} 必须存在`;
    if (operatorRaw === "range") return `${field} 在 ${value}${unit} 区间内`;
    return `${field} ${op} ${value}${unit}`;
  }, []);
  const filteredComponents = useMemo(() => normalizedComponentRows.filter((row) => {
    if (!Boolean((row as { component_eligible?: unknown }).component_eligible)) return false;
    if (componentTypeFilter !== "all" && row.type !== componentTypeFilter) return false;
    if (componentExecutableFilter === "true" && !row.executable) return false;
    if (componentExecutableFilter === "false" && row.executable) return false;
    const reviewStatus = componentReviewStatusById[row.component_id] || "unreviewed";
    if (componentReviewFilter === "reviewed" && reviewStatus !== "reviewed") return false;
    if (componentReviewFilter === "issue" && reviewStatus !== "issue") return false;
    if (componentReviewFilter === "unreviewed" && reviewStatus !== "unreviewed") return false;
    const clauseNeedle = componentClauseFilter.trim().toLowerCase();
    if (clauseNeedle) {
      const joined = row.source_clause_ids.join(" ").toLowerCase();
      if (!joined.includes(clauseNeedle)) return false;
    }
    return true;
  }), [normalizedComponentRows, componentTypeFilter, componentExecutableFilter, componentReviewFilter, componentClauseFilter, componentReviewStatusById]);
  useEffect(() => {
    setComponentReviewStatusById((prev) => {
      const next: Record<string, "unreviewed" | "reviewed" | "issue"> = {};
      for (const row of normalizedComponentRows) {
        next[row.component_id] = prev[row.component_id] || "unreviewed";
      }
      return next;
    });
  }, [normalizedComponentRows]);
  const componentDetailRow = useMemo(
    () => normalizedComponentRows.find((row) => row.component_id === componentDetailId) || null,
    [normalizedComponentRows, componentDetailId],
  );
  const componentListRows = useMemo(
    () => {
      const simplifyComponentId = (id: string): string => {
        const m = id.match(/component\.(.+)$/i);
        return (m?.[1] || id).replace(/_/g, ".");
      };
      const rulesByComponent = new Map<string, Record<string, unknown>[]>();
      for (const r of artifactRules) {
        const cid = String(r.component_id || "").trim();
        if (!cid) continue;
        const rows = rulesByComponent.get(cid) || [];
        rows.push(r);
        rulesByComponent.set(cid, rows);
      }
      return filteredComponents.slice().sort((a, b) => {
        if (a.executable !== b.executable) return a.executable ? -1 : 1;
        return a.component_id.localeCompare(b.component_id, "zh-CN");
      }).map((row) => {
        const rules = rulesByComponent.get(row.component_id) || [];
        const ruleSummary = String((row as { specir_summary?: unknown }).specir_summary || "").trim()
          || String((row as { specir_explanation?: unknown }).specir_explanation || "").trim()
          || (rules.length > 0 ? toReadableRuleLine(rules[0]) : "无可解析规则摘要");
        return {
          component_id: row.component_id,
          component_short_id: simplifyComponentId(row.component_id),
          rule_summary: ruleSummary,
          executable: row.executable,
          hasGate: row.gates.length > 0,
          review_status: componentReviewStatusById[row.component_id] || "unreviewed",
        };
      });
    },
    [filteredComponents, componentReviewStatusById, artifactRules, toReadableRuleLine],
  );
  const componentQualityStats = useMemo(() => {
    const total = normalizedComponentRows.length;
    const executableCount = normalizedComponentRows.filter((row) => row.executable).length;
    const withGateCount = normalizedComponentRows.filter((row) => row.gates.length > 0).length;
    const reviewedCount = normalizedComponentRows.filter((row) => (componentReviewStatusById[row.component_id] || "unreviewed") === "reviewed").length;
    const unreviewedCount = normalizedComponentRows.filter((row) => (componentReviewStatusById[row.component_id] || "unreviewed") === "unreviewed").length;
    const incompleteCount = normalizedComponentRows.filter((row) => {
      const status = componentReviewStatusById[row.component_id] || "unreviewed";
      const gateMissing = row.rules.length > 0 && row.gates.length === 0;
      return !row.executable || gateMissing || status !== "reviewed";
    }).length;
    const executableRatio = total > 0 ? Math.round((executableCount / total) * 100) : 0;
    const gateRatio = total > 0 ? Math.round((withGateCount / total) * 100) : 0;
    const riskHints: string[] = [];
    if (gateRatio < 60) riskHints.push("⚠️ Gate覆盖率低");
    if (unreviewedCount > total * 0.5) riskHints.push("⚠️ 多数规则未校验");
    if (executableRatio < 60) riskHints.push("⚠️ 可执行占比偏低");
    return {
      total,
      executableCount,
      executableRatio,
      withGateCount,
      gateRatio,
      reviewedCount,
      unreviewedCount,
      incompleteCount,
      riskHints,
    };
  }, [normalizedComponentRows, componentReviewStatusById]);
  useEffect(() => {
    if (!componentListRows.length) {
      if (componentDetailId) setComponentDetailId("");
      return;
    }
    if (componentDetailId && componentListRows.some((row) => row.component_id === componentDetailId)) return;
    setComponentDetailId(componentListRows[0].component_id);
  }, [componentListRows, componentDetailId]);
  const selectedComponentRules = useMemo(
    () => {
      const fromArtifacts = artifactRules.filter((r) => String(r.component_id || "") === String(componentDetailRow?.component_id || ""));
      if (fromArtifacts.length > 0) return fromArtifacts;
      const sr = (componentDetailRow as { specir_rule?: SpecIRRule | null } | null)?.specir_rule;
      if (sr && typeof sr === "object") {
        return [{
          component_id: componentDetailRow?.component_id || "",
          field: sr.field || "-",
          operator: sr.op || "-",
          value: sr.value ?? sr.min ?? sr.max ?? "-",
          min: sr.min ?? null,
          max: sr.max ?? null,
          unit: sr.unit || "-",
        } as ArtifactRule];
      }
      return [];
    },
    [artifactRules, componentDetailRow],
  );
  const selectedComponentGates = useMemo(
    () => {
      const fromArtifacts = artifactGates.filter((g) => String(g.component_id || "") === String(componentDetailRow?.component_id || ""));
      if (fromArtifacts.length > 0) return fromArtifacts;
      const sg = (componentDetailRow as { specir_gate?: SpecIRGate | null } | null)?.specir_gate;
      if (sg && Boolean(String(sg.logic || "").trim())) {
        return [{
          component_id: componentDetailRow?.component_id || "",
          gate_id: `${componentDetailRow?.component_id || "component"}.gate`,
          logic: sg.logic || "-",
          action: "PASS/FAIL",
          fail_level: sg.fail_level || "-",
        } as ArtifactGate];
      }
      return [];
    },
    [artifactGates, componentDetailRow],
  );
  const selectedComponentDto = useMemo(
    () => artifactDtos.find((d) => String((d as { component_id?: unknown }).component_id || "") === String(componentDetailRow?.component_id || "")) as Record<string, unknown> | undefined,
    [artifactDtos, componentDetailRow?.component_id],
  );
  const selectedComponentProofTemplate = useMemo(
    () => artifactProofTemplates.find((p) => String((p as { component_id?: unknown }).component_id || "") === String(componentDetailRow?.component_id || "")) as Record<string, unknown> | undefined,
    [artifactProofTemplates, componentDetailRow?.component_id],
  );
  const selectedComponentDecision = useMemo(() => {
    if (!componentDetailRow) return null;
    const reviewStatus = componentReviewStatusById[componentDetailRow.component_id] || "unreviewed";
    const hasRule = selectedComponentRules.length > 0;
    const hasGate = selectedComponentGates.length > 0;
    const canExecute = Boolean(componentDetailRow.executable && hasRule && hasGate);
    let riskLevel: "high" | "medium" | "low" = "low";
    if (!hasRule || !hasGate || !componentDetailRow.executable) riskLevel = "high";
    else if (reviewStatus !== "reviewed") riskLevel = "medium";
    const nextAction = !hasRule
      ? "补全 Rule 字段与阈值"
      : !hasGate
        ? "补全 Gate 判定逻辑"
        : reviewStatus === "issue"
          ? "先处理人工校验问题"
          : reviewStatus === "unreviewed"
            ? "执行人工校验确认"
            : "可进入执行与发布链路";
    return { hasRule, hasGate, canExecute, riskLevel, nextAction, reviewStatus };
  }, [componentDetailRow, componentReviewStatusById, selectedComponentRules.length, selectedComponentGates.length]);
  const selectedComponentGateStatus = useMemo(() => {
    if (!componentDetailRow) return null;
    const hasRule = selectedComponentRules.length > 0;
    const hasGate = selectedComponentGates.length > 0;
    if (hasGate) {
      return {
        key: "complete" as const,
        title: "✔ 已定义",
        detail: "存在判定逻辑",
        badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
      };
    }
    if (hasRule && !hasGate) {
      return {
        key: "missing" as const,
        title: "❌ 未定义",
        detail: "该规则无法判定通过/失败",
        badgeClass: "border-rose-500/40 bg-rose-500/10 text-rose-200",
      };
    }
    return {
      key: "not_needed" as const,
      title: "－ 不需要",
      detail: "当前无可执行 Rule，无需 Gate 判定",
      badgeClass: "border-slate-600/50 bg-slate-800/40 text-slate-300",
    };
  }, [componentDetailRow, selectedComponentRules.length, selectedComponentGates.length]);
  const markComponentReview = useCallback((componentId: string, action: "reviewed" | "issue" | "reset") => {
    const nextStatus: "unreviewed" | "reviewed" | "issue" = action === "reset" ? "unreviewed" : action;
    setComponentReviewStatusById((prev) => ({ ...prev, [componentId]: nextStatus }));
    if (action === "reset") {
      setComponentReviewNote("");
      setComponentReviewChecklist({
        rule_correct: true,
        gate_complete: true,
        evidence_consistent: true,
      });
      return;
    }
    setComponentReviewRecordsById((prev) => {
      const rows = prev[componentId] || [];
      const record = {
        reviewer_id: reviewerId.trim() || "expert.001",
        reviewer_name: reviewerName.trim() || "领域专家",
        reviewed_at: new Date().toISOString(),
        action,
        checklist: componentReviewChecklist,
        suggestion: componentReviewNote.trim(),
        note: componentReviewNote.trim(),
      };
      return { ...prev, [componentId]: [record, ...rows].slice(0, 50) };
    });
    setComponentReviewNote("");
    setComponentReviewChecklist({
      rule_correct: true,
      gate_complete: true,
      evidence_consistent: true,
    });
  }, [reviewerId, reviewerName, componentReviewNote, componentReviewChecklist]);
  const selectedComponentReviewRecords = useMemo(
    () => componentDetailRow ? (componentReviewRecordsById[componentDetailRow.component_id] || []) : [],
    [componentDetailRow, componentReviewRecordsById],
  );
  useEffect(() => {
    setComponentReviewStatusById({});
    setComponentReviewRecordsById({});
  }, [currentJobId]);
  const generatedComponentCount = normalizedComponentRows.filter((row) => Boolean((row as { component_eligible?: unknown }).component_eligible)).length;
  const generatedGateCount = artifactGates.length;
  const hasExecutableRuleForGate = artifactRules.some((item) => {
    const s = String((item as { execution_status?: unknown }).execution_status || "").trim().toLowerCase();
    if (s) return s === "executable" || s === "partial_executable" || s === "derived_rule_ready" || s === "derived_gate_ready";
    return Boolean((item as { enabled?: unknown }).enabled) && !Boolean((item as { unresolved?: unknown }).unresolved);
  });
  const globalGateStatus = useMemo(() => {
    if (generatedGateCount > 0 && hasExecutableRuleForGate) {
      return {
        key: "complete" as const,
        title: "✔ 已定义",
        detail: "由 ready Rule 组合生成",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
      };
    }
    if (generatedGateCount > 0 && !hasExecutableRuleForGate) {
      return {
        key: "missing" as const,
        title: "❌ 逻辑不一致",
        detail: "存在 Gate 但无 ready Rule（不应出现）",
        className: "border-rose-500/30 bg-rose-500/10 text-rose-100",
      };
    }
    if (artifactRules.length > 0 && generatedGateCount === 0 && hasExecutableRuleForGate) {
      return {
        key: "missing" as const,
        title: "❌ 未定义",
        detail: "该规则无法判定通过/失败",
        className: "border-rose-500/30 bg-rose-500/10 text-rose-100",
      };
    }
    if (artifactRules.length > 0 && generatedGateCount === 0) {
      return {
        key: "not_needed" as const,
        title: "－ 暂不可执行",
        detail: "当前 Rule 语义可理解但 execution_status 非 executable，不作为错误处理",
        className: "border-sky-500/30 bg-sky-500/10 text-sky-100",
      };
    }
    return {
      key: "not_needed" as const,
      title: "－ 不需要",
      detail: "当前无可执行 Rule，无需 Gate 判定",
      className: "border-slate-600/40 bg-slate-800/40 text-slate-200",
    };
  }, [generatedGateCount, artifactRules.length, hasExecutableRuleForGate]);
  const clauseTreeNodeCount = artifactClauseTreeNodes.length;
  const catalogNodeCount = artifactCatalogNodes.length;
  const jtgt3650CatalogRequired = useMemo<Array<{ id: string; title: string }>>(() => [
    { id: "1", title: "总则" },
    { id: "2", title: "术语" },
    { id: "3", title: "施工准备和施工测量" },
    { id: "3.1", title: "施工准备" },
    { id: "3.2", title: "施工测量" },
    { id: "4", title: "钢筋" },
    { id: "4.1", title: "一般规定" },
    { id: "4.2", title: "加工" },
    { id: "4.3", title: "连接" },
    { id: "4.4", title: "绑扎与安装" },
    { id: "5", title: "模板、支架" },
    { id: "6", title: "混凝土工程" },
    { id: "7", title: "预应力混凝土工程" },
    { id: "8", title: "钢结构工程" },
    { id: "9", title: "灌注桩" },
    { id: "9.1", title: "一般规定" },
    { id: "9.2", title: "钻孔灌注桩" },
    { id: "9.3", title: "岩溶、采空区和其他特殊地区的钻孔灌注桩" },
    { id: "9.4", title: "大直径、超长灌注桩" },
    { id: "9.5", title: "灌注桩后压浆" },
    { id: "9.6", title: "挖孔灌注桩" },
    { id: "9.7", title: "成孔、成桩检验" },
  ], []);
  const jtgt3650CatalogMissing = useMemo(() => {
    const rows = artifactCatalogNodes.map((node) => {
      const id = String((node as { id?: unknown }).id || "").trim();
      const title = String((node as { title?: unknown; name?: unknown }).title || (node as { name?: unknown }).name || "").trim();
      return { id, title };
    });
    return jtgt3650CatalogRequired.filter((req) => !rows.some((row) => row.id === req.id && row.title.includes(req.title)));
  }, [artifactCatalogNodes, jtgt3650CatalogRequired]);
  const localStdForCatalog = String((currentJobSpec.stdCode || "").trim()).toUpperCase().replace(/[\\/_\\-\\s]/g, "");
  const isJtgt3650Local = localStdForCatalog.includes("JTGT36502020") || localStdForCatalog.includes("JTGTF36502020");
  const localCatalogAcceptancePassed = !isJtgt3650Local || jtgt3650CatalogMissing.length === 0;
  const normRefIndexEntries = useMemo(() => {
    const payload = artifactDocs["norm_ref_index.json"] as { entries?: unknown; count?: unknown } | undefined;
    if (!payload) return [] as Array<Record<string, unknown>>;
    if (Array.isArray(payload.entries)) return payload.entries as Array<Record<string, unknown>>;
    return [];
  }, [artifactDocs]);
  const normRefCount = normRefIndexEntries.length;
  const backendParseAcceptance = (
    (reviewPackage as unknown as { parse_acceptance?: Record<string, unknown> } | null)?.parse_acceptance
    || (result as { parse_acceptance?: Record<string, unknown> } | null)?.parse_acceptance
    || null
  ) as Record<string, unknown> | null;
  const backendUploadStatus = String((backendParseAcceptance?.upload_status as string) || "").trim().toLowerCase();
  const uploadStatus: "not_uploaded" | "success" = backendUploadStatus === "uploaded"
    ? "success"
    : sourceFilePath ? "success" : "not_uploaded";
  const backendParseSuccess = backendParseAcceptance?.success === true;
  const backendParseStatus = String((backendParseAcceptance?.parse_status as string) || "").trim().toLowerCase();
  const localSpecCode = String((currentJobSpec.stdCode || "").trim()).toUpperCase();
  const localSpecCodeRecognized = localSpecCode.length > 0 && localSpecCode !== "UNKNOWN-STD";
  const localParseSuccess = Boolean(
    sourceFilePath
    && localSpecCodeRecognized
    && localCatalogAcceptancePassed
    && normRefCount > 0
    && normRefIndexEntries.length > 0,
  );
  const parseStatus: "not_started" | "running" | "success" | "not_indexed" = artifactLoading
    ? "running"
    : uploadStatus !== "success"
      ? "not_started"
      : ((backendParseSuccess || backendParseStatus === "success" || localParseSuccess) && normRefCount > 0)
        ? "success"
        : "not_indexed";
  const normdocByArtifactsValid = normdocHeaderPresent
    && normdocBodyRulesCount > 0
    && normdocGateCount > 0
    && normdocNormRefsCount > 0
    && generatedGateCount > 0;
  const normdocDisplayStatus: "valid" | "invalid" | "blocked" = normRefCount <= 0
    ? "blocked"
    : normdocByArtifactsValid
      ? "valid"
      : "invalid";
  const normalizedNormRefRows = useMemo(() => normRefIndexEntries.map((row, idx) => {
    const record = row as Record<string, unknown>;
    const node = (record.node && typeof record.node === "object") ? (record.node as Record<string, unknown>) : {};
    const locator = (record.locator && typeof record.locator === "object") ? (record.locator as Record<string, unknown>) : {};
    const source = (locator.source && typeof locator.source === "object") ? (locator.source as Record<string, unknown>) : {};
    const semantic = (locator.semantic && typeof locator.semantic === "object") ? (locator.semantic as Record<string, unknown>) : {};
    const normRef = String(record.normRef || record.norm_ref || "").trim();
    const nodeId = String(node.id || semantic.no || "").trim();
    const nodeType = String(node.type || semantic.type || "").trim().toLowerCase();
    const nodeTitle = String(node.title || node.name || "").trim();
    const nodeParentId = String(node.parent_id || "").trim();
    const nodePage = Number(node.page ?? node.source_page ?? 0) || 0;
    const field = String(record.field || semantic.field || semantic.column || "").trim();
    const unit = String(record.unit || semantic.unit || "").trim();
    const unresolvedFlag = Boolean(record.unresolved || record.parse_failed || record.needs_review);
    const status = unresolvedFlag ? "unresolved" : "ok";
    const sourceClauseRaw = String(
      record.source_clause
      || record.source_clause_id
      || semantic.clause_id
      || source.clause_id
      || source.clause_no
      || source.title
      || source.path
      || "",
    ).trim();
    const sourceClause = sourceClauseRaw || nodeId || nodeTitle || "-";
    const sourceText = String(
      record.source_text
      || source.text
      || source.raw_text
      || source.excerpt
      || source.snippet
      || record.description
      || node.source_text
      || "",
    ).trim();
    return {
      id: `${normRef || "normref"}-${idx}`,
      normRef,
      nodeId: nodeId || "-",
      nodeType: nodeType || "-",
      nodeTitle: nodeTitle || "-",
      nodeParentId: nodeParentId || "-",
      nodePage,
      field: field || "-",
      unit: unit || "-",
      sourceClause,
      sourceText: sourceText || "暂无来源条文文本。",
      status,
      pageImageUrl: String(record.page_image_url || record.image_url || node.page_image_url || node.image_url || "").trim(),
      bbox: record.bbox || node.bbox || null,
    };
  }).filter((row) => row.normRef.length > 0), [normRefIndexEntries]);
  const normRefOkCount = normalizedNormRefRows.filter((x) => x.status === "ok").length;
  const normRefUnresolvedCount = normalizedNormRefRows.filter((x) => x.status === "unresolved").length;
  const unresolvedRuleDisplayText = normRefCount <= 0 ? "N/A" : String(unresolvedRuleCount);
  const normRefStructureComplete = normRefCount > 0
    && normalizedNormRefRows.every((x) => x.field !== "-" && x.unit !== "-" && x.sourceClause !== "-");
  const normRefAssetState: WorkflowState = normRefCount <= 0
    ? "failed"
    : normRefUnresolvedCount > 0
      ? "partial"
      : normRefStructureComplete
        ? "completed"
        : "partial";
  const normalizedInputNormRef = inputNormRef.trim();
  const effectiveNormRefCount = inputSource === "normref"
    ? (normalizedInputNormRef ? 1 : 0)
    : normRefCount;
  const pdfUploadStatusText = uploadStatus === "success" ? "已上传" : "未上传";
  const catalogStatusText = (loading || ingestRunning || artifactLoading)
    ? "生成中"
    : (catalogNodeCount > 0 ? "成功" : "未生成 / 失败");
  const normRefStatusText = (loading || ingestRunning || artifactLoading)
    ? "生成中"
    : (normRefCount > 0 ? "成功" : "未生成");
  const catalogStatusClass = (loading || ingestRunning || artifactLoading)
    ? "text-sky-300"
    : (catalogNodeCount > 0 ? "text-emerald-300" : "text-amber-300");
  const normRefStatusClass = (loading || ingestRunning || artifactLoading)
    ? "text-sky-300"
    : (normRefCount > 0 ? "text-emerald-300" : "text-amber-300");
  const parseSuccessByArtifacts = catalogNodeCount > 0 && normRefCount > 0;
  const currentStageText = (loading || ingestRunning)
    ? `上传与解析处理中${ingestProgress > 0 ? `（${Math.min(100, Math.max(0, ingestProgress))}%）` : ""}`
    : (parseSuccessByArtifacts ? "Catalog 与 normRef 已生成" : "等待 Catalog 生成");
  const parseStatusText = parseStatus === "running" || loading || ingestRunning
    ? "解析中"
    : parseSuccessByArtifacts
      ? "解析成功"
      : parseStatus === "not_indexed"
        ? "未生成 normRef / 解析失败"
        : "未开始";
  const parseNotSuccessTip = parseSuccessByArtifacts
    ? ""
    : (
      (loading || ingestRunning || artifactLoading)
        ? `PDF已上传，解析任务进行中（${Math.min(100, Math.max(0, ingestProgress))}%）。正在等待 Catalog 与 normRef 生成。`
        : (isJtgt3650Local && jtgt3650CatalogMissing.length > 0
          ? `PDF已上传，但Catalog缺失关键目录：${jtgt3650CatalogMissing.slice(0, 6).map((x) => `${x.id} ${x.title}`).join("，")}${jtgt3650CatalogMissing.length > 6 ? "..." : ""}`
          : "PDF已上传，但尚未完成规范条文索引生成。请检查 PDF → normRef 解析任务是否启动、失败或缺少解析结果。")
    );
  const parseStatusClass = parseStatus === "running"
    ? "text-sky-300"
    : parseSuccessByArtifacts
      ? "text-emerald-300"
      : parseStatus === "not_started"
        ? "text-slate-300"
        : "text-amber-300";
  const pdfOnlyWithoutNormRef = uploadStatus === "success" && parseStatus === "not_indexed";
  const normalizeConfidence = (v: unknown, fallback = 0.85): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  };
  const confidenceLevelOf = (confidence: number): ConfidenceLevel => {
    if (confidence >= 0.92) return "high";
    if (confidence >= 0.75) return "medium";
    return "low";
  };
  const catalogChapterCount = useMemo(() => artifactCatalogNodes.filter((n) => {
    const t = String((n as { type?: unknown }).type || "").toLowerCase();
    return t === "chapter" || t === "appendix";
  }).length, [artifactCatalogNodes]);
  const catalogSectionCount = useMemo(() => artifactCatalogNodes.filter((n) => {
    const t = String((n as { type?: unknown }).type || "").toLowerCase();
    return t === "section";
  }).length, [artifactCatalogNodes]);
  const catalogClauseCount = useMemo(() => artifactCatalogNodes.filter((n) => {
    const t = String((n as { type?: unknown }).type || "").toLowerCase();
    return t === "clause" || t === "article" || t === "item";
  }).length, [artifactCatalogNodes]);
  const catalogTableCount = useMemo(() => artifactCatalogNodes.filter((n) => {
    const t = String((n as { type?: unknown }).type || "").toLowerCase();
    return t.includes("table");
  }).length, [artifactCatalogNodes]);
  const catalogFieldCount = useMemo(
    () => artifactRules.filter((r) => String(r.field || "").trim().length > 0).length,
    [artifactRules],
  );
  const normRefVuriByCatalogKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of normRefIndexEntries) {
      const e = entry as Record<string, unknown>;
      const node = (e.node && typeof e.node === "object") ? (e.node as Record<string, unknown>) : {};
      const nid = String(node.id || "").trim();
      const ntype = String(node.type || "").trim().toLowerCase();
      const vuri = String(e.vuri || e.normRef || "").trim();
      if (!nid || !ntype || !vuri) continue;
      map.set(`${ntype}@@${nid}`, vuri);
    }
    return map;
  }, [normRefIndexEntries]);
  const catalogTreeRows = useMemo(() => {
    type Row = {
      key: string;
      id: string;
      title: string;
      type: string;
      page: number;
      parentId: string | null;
      vuri: string;
      children: Row[];
      sortWeight: number;
    };
    const rows: Row[] = [];
    const byKey = new Map<string, Row>();
    const sortWeight = (t: string): number => ({ chapter: 1, section: 2, clause: 3, table: 4 }[t] || 9);
    const toNoTuple = (id: string): number[] => id.split(".").map((x) => Number((x || "").replace(/[^\d]/g, "")) || 0);
    for (const node of artifactCatalogNodes) {
      const n = node as Record<string, unknown>;
      const id = String(n.id || n.node_id || "").trim();
      const type = String(n.type || "").trim().toLowerCase();
      if (!id || !type) continue;
      const title = String(n.title || n.name || id).trim() || id;
      const page = Number(n.page ?? n.source_page ?? 0) || 0;
      const parentRaw = String(n.parent_id || "").trim();
      const key = `${type}@@${id}`;
      const row: Row = {
        key,
        id,
        title,
        type,
        page,
        parentId: parentRaw || null,
        vuri: normRefVuriByCatalogKey.get(key) || "",
        children: [],
        sortWeight: sortWeight(type),
      };
      byKey.set(key, row);
      rows.push(row);
    }
    const roots: Row[] = [];
    for (const row of rows) {
      const pid = row.parentId;
      if (!pid) {
        roots.push(row);
        continue;
      }
      const parentCandidates = [
        `chapter@@${pid}`,
        `section@@${pid}`,
        `clause@@${pid}`,
      ];
      const parent = parentCandidates.map((k) => byKey.get(k)).find(Boolean);
      if (parent) parent.children.push(row);
      else roots.push(row);
    }
    const sortRows = (items: Row[]) => {
      items.sort((a, b) => {
        if (a.sortWeight !== b.sortWeight) return a.sortWeight - b.sortWeight;
        const an = toNoTuple(a.id);
        const bn = toNoTuple(b.id);
        const len = Math.max(an.length, bn.length);
        for (let i = 0; i < len; i += 1) {
          const diff = (an[i] || 0) - (bn[i] || 0);
          if (diff !== 0) return diff;
        }
        return a.id.localeCompare(b.id, "zh-CN");
      });
      for (const item of items) sortRows(item.children);
    };
    sortRows(roots);
    return roots;
  }, [artifactCatalogNodes, normRefVuriByCatalogKey]);
  const flatCatalogTreeNodes = useMemo(() => {
    type TreeNodeLite = {
      key: string;
      id: string;
      title: string;
      type: string;
      page: number;
      vuri: string;
      parentId?: string | null;
      children: TreeNodeLite[];
    };
    type FlatNode = {
      key: string;
      id: string;
      title: string;
      type: string;
      page: number;
      vuri: string;
      parentId?: string | null;
      depth: number;
      pathText: string;
    };
    const out: FlatNode[] = [];
    const visit = (node: TreeNodeLite, depth: number, path: string[]) => {
      const nextPath = [...path, `${node.id} ${node.title}`];
      out.push({
        key: node.key,
        id: node.id,
        title: node.title,
        type: node.type,
        page: node.page,
        vuri: node.vuri,
        parentId: node.parentId,
        depth,
        pathText: nextPath.join(" > "),
      });
      node.children.forEach((child) => visit(child, depth + 1, nextPath));
    };
    catalogTreeRows.forEach((root) => visit(root as unknown as TreeNodeLite, 0, []));
    return out;
  }, [catalogTreeRows]);
  useEffect(() => {
    if (flatCatalogTreeNodes.length === 0) {
      if (selectedCatalogNodeKey) setSelectedCatalogNodeKey("");
      return;
    }
    if (!selectedCatalogNodeKey || !flatCatalogTreeNodes.some((node) => node.key === selectedCatalogNodeKey)) {
      setSelectedCatalogNodeKey(flatCatalogTreeNodes[0].key);
    }
  }, [flatCatalogTreeNodes, selectedCatalogNodeKey]);
  useEffect(() => {
    if (!pendingCatalogNodeKey) return;
    const exists = flatCatalogTreeNodes.some((n) => n.key === pendingCatalogNodeKey);
    if (exists) {
      setSelectedCatalogNodeKey(pendingCatalogNodeKey);
      setPendingCatalogNodeKey("");
    }
  }, [flatCatalogTreeNodes, pendingCatalogNodeKey]);
  const selectedCatalogTreeNode = useMemo(
    () => flatCatalogTreeNodes.find((node) => node.key === selectedCatalogNodeKey) || flatCatalogTreeNodes[0] || null,
    [flatCatalogTreeNodes, selectedCatalogNodeKey],
  );
  const selectedCatalogLinkedNormRefs = useMemo(() => {
    if (!selectedCatalogTreeNode) return [] as typeof normalizedNormRefRows;
    const nodeId = String(selectedCatalogTreeNode.id || "").trim();
    const nodeType = String(selectedCatalogTreeNode.type || "").trim().toLowerCase();
    const nodeVuri = String(selectedCatalogTreeNode.vuri || "").trim();
    const exactByVuri = normalizedNormRefRows.filter((row) => nodeVuri.length > 0 && row.normRef === nodeVuri);
    if (exactByVuri.length > 0) return exactByVuri;
    const byNodeIdentity = normalizedNormRefRows.filter((row) => {
      const rid = String(row.nodeId || "").trim();
      const rtype = String(row.nodeType || "").trim().toLowerCase();
      return rid === nodeId && rtype === nodeType;
    });
    if (byNodeIdentity.length > 0) return byNodeIdentity;
    const bySourceClause = normalizedNormRefRows.filter((row) => {
      const sourceClause = String(row.sourceClause || "").trim();
      return sourceClause === nodeId || sourceClause.includes(nodeId);
    });
    return bySourceClause;
  }, [selectedCatalogTreeNode, normalizedNormRefRows]);
  const selectedCatalogPrimaryNormRef = useMemo(
    () => selectedCatalogLinkedNormRefs.find((row) => row.status === "ok") || selectedCatalogLinkedNormRefs[0] || null,
    [selectedCatalogLinkedNormRefs],
  );
  const selectedCatalogIsFavorite = useMemo(() => {
    const key = String(selectedCatalogTreeNode?.key || "").trim();
    return key ? Boolean(favoriteNodeKeys[key]) : false;
  }, [favoriteNodeKeys, selectedCatalogTreeNode?.key]);
  const catalogCoverageRows = useMemo(() => {
    const matchRowsForNode = (node: { id: string; type: string; vuri: string }) => {
      const nodeId = String(node.id || "").trim();
      const nodeType = String(node.type || "").trim().toLowerCase();
      const nodeVuri = String(node.vuri || "").trim();
      const exactByVuri = normalizedNormRefRows.filter((row) => nodeVuri.length > 0 && row.normRef === nodeVuri);
      if (exactByVuri.length > 0) return exactByVuri;
      const byNodeIdentity = normalizedNormRefRows.filter((row) => {
        const rid = String(row.nodeId || "").trim();
        const rtype = String(row.nodeType || "").trim().toLowerCase();
        return rid === nodeId && rtype === nodeType;
      });
      if (byNodeIdentity.length > 0) return byNodeIdentity;
      return normalizedNormRefRows.filter((row) => {
        const sourceClause = String(row.sourceClause || "").trim();
        return sourceClause === nodeId || sourceClause.includes(nodeId);
      });
    };
    return flatCatalogTreeNodes.map((node) => {
      const linked = matchRowsForNode(node);
      const hasMapping = linked.length > 0;
      const hasSourceText = linked.some((x) => String(x.sourceText || "").trim().length > 0 && String(x.sourceText || "").trim() !== "暂无来源条文文本。");
      const isClauseLike = ["clause", "article", "item", "table"].includes(String(node.type || "").toLowerCase());
      const hasDetail = linked.some((x) => String(x.field || "").trim() !== "-" || String(x.unit || "").trim() !== "-");
      const detailReady = !isClauseLike || hasDetail;
      return {
        ...node,
        linkedCount: linked.length,
        hasMapping,
        hasSourceText,
        detailReady,
        linked,
      };
    });
  }, [flatCatalogTreeNodes, normalizedNormRefRows]);
  const catalogCoverageSummary = useMemo(() => {
    const total = catalogCoverageRows.length;
    const mapped = catalogCoverageRows.filter((x) => x.hasMapping).length;
    const withText = catalogCoverageRows.filter((x) => x.hasSourceText).length;
    const detailReady = catalogCoverageRows.filter((x) => x.detailReady).length;
    return { total, mapped, withText, detailReady };
  }, [catalogCoverageRows]);
  const filteredCatalogCoverageRows = useMemo(() => {
    if (catalogCoverageFilter === "unmapped") return catalogCoverageRows.filter((x) => !x.hasMapping);
    if (catalogCoverageFilter === "no_text") return catalogCoverageRows.filter((x) => x.hasMapping && !x.hasSourceText);
    if (catalogCoverageFilter === "no_detail") return catalogCoverageRows.filter((x) => !x.detailReady);
    return catalogCoverageRows;
  }, [catalogCoverageFilter, catalogCoverageRows]);
  const selectedClauseHint = useMemo(() => {
    const fromNode = String(selectedCatalogTreeNode?.id || "").trim();
    const fromSource = String(selectedCatalogPrimaryNormRef?.sourceClause || "").trim();
    if (fromSource && fromSource !== "-") return fromSource;
    return fromNode;
  }, [selectedCatalogPrimaryNormRef?.sourceClause, selectedCatalogTreeNode?.id]);
  const selectedSourceTextLines = useMemo(() => {
    const text = String(selectedCatalogPrimaryNormRef?.sourceText || "").trim();
    if (!text) return [] as string[];
    return text
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [selectedCatalogPrimaryNormRef?.sourceText]);
  const selectedSourceKeyPoints = useMemo(() => {
    const numbered = selectedSourceTextLines.filter((line) => /^(\d+(\.\d+)*|[（(]?\d+[）)]|[一二三四五六七八九十]+[、.])/.test(line));
    if (numbered.length > 0) return numbered.slice(0, 12);
    return selectedSourceTextLines.slice(0, 12);
  }, [selectedSourceTextLines]);
  const selectedSourceToleranceHints = useMemo(() => {
    const lines = selectedSourceTextLines.filter((line) => /(≤|>=|<=|≥|±|允许偏差|偏差|公差|mm|MPa|%)/i.test(line));
    return lines.slice(0, 8);
  }, [selectedSourceTextLines]);
  const selectedSourceMethodHints = useMemo(() => {
    const lines = selectedSourceTextLines.filter((line) => /(检测方法|频率|测|水准仪|全站仪|抽检|检查)/i.test(line));
    return lines.slice(0, 8);
  }, [selectedSourceTextLines]);
  const selectedRelatedClassificationRows = useMemo(() => {
    const hint = String(selectedClauseHint || "").trim();
    if (!hint) return [] as ArtifactClauseClassification[];
    const byHint = artifactClassifications.filter((row) => {
      const record = row as Record<string, unknown>;
      const sourceClauseId = String(record.source_clause_id || record.clause_id || record.clause_no || "").trim();
      const sourceClause = String(record.source_clause || "").trim();
      const raw = JSON.stringify(record, null, 0);
      return sourceClauseId === hint || sourceClause === hint || raw.includes(hint);
    });
    return byHint.slice(0, 8);
  }, [artifactClassifications, selectedClauseHint]);
  const selectedStructuredDetailRows = useMemo(() => {
    const pick = (record: Record<string, unknown>, keys: string[]): string => {
      for (const key of keys) {
        const value = record[key];
        const text = String(value ?? "").trim();
        if (text) return text;
      }
      return "";
    };
    return selectedRelatedClassificationRows.map((row, idx) => {
      const record = row as Record<string, unknown>;
      const item = pick(record, ["check_item", "item_name", "field", "field_name", "metric", "name", "title"]);
      const tolerance = pick(record, ["tolerance", "threshold", "allowed_deviation", "limit", "criterion", "value", "range"]);
      const method = pick(record, ["method", "check_method", "inspection_method", "frequency", "check_frequency", "sampling"]);
      const condition = pick(record, ["condition", "branch", "material_condition", "scope", "applicable_condition"]);
      const unit = pick(record, ["unit", "uom"]);
      const clause = pick(record, ["source_clause", "source_clause_id", "clause_id", "clause_no"]);
      return {
        id: `${clause || selectedClauseHint || "detail"}-${idx}`,
        checkItem: item || "-",
        tolerance: tolerance || "-",
        method: method || "-",
        condition: condition || "-",
        unit: unit || "-",
        clause: clause || selectedClauseHint || "-",
      };
    });
  }, [selectedRelatedClassificationRows, selectedClauseHint]);
  const selectedSourceParagraphs = useMemo(() => {
    return selectedSourceTextLines
      .filter((line) => !/^([（(]?\d+[）)]|[一二三四五六七八九十]+[、.])/.test(line))
      .slice(0, 16);
  }, [selectedSourceTextLines]);
  const selectedSourceListItems = useMemo(() => {
    return selectedSourceTextLines
      .filter((line) => /^([（(]?\d+[）)]|[一二三四五六七八九十]+[、.])/.test(line))
      .slice(0, 16);
  }, [selectedSourceTextLines]);
  const selectedPaperPreviewTableRows = useMemo(() => {
    return selectedStructuredDetailRows
      .filter((row) => row.checkItem !== "-" || row.tolerance !== "-" || row.method !== "-")
      .slice(0, 12)
      .map((row, idx) => ({
        no: String(idx + 1),
        item: row.checkItem,
        tolerance: row.tolerance,
        method: row.method,
      }));
  }, [selectedStructuredDetailRows]);
  const selectedIndicatorRows = useMemo(() => {
    return selectedStructuredDetailRows
      .filter((row) => row.checkItem !== "-" || row.tolerance !== "-")
      .slice(0, 12)
      .map((row, idx) => ({
        no: idx + 1,
        item: row.checkItem,
        threshold: row.tolerance,
        unit: row.unit !== "-" ? row.unit : "—",
        method: row.method !== "-" ? row.method : "—",
      }));
  }, [selectedStructuredDetailRows]);
  const selectedFormCards = useMemo(() => {
    const fromClassifications = selectedRelatedClassificationRows.slice(0, 6).map((row, idx) => {
      const record = row as Record<string, unknown>;
      const title = String(record.form_name || record.table_name || record.sheet_name || record.source_table || record.title || `关联表单 ${idx + 1}`).trim();
      const hints = [
        String(record.field || "").trim(),
        String(record.field_name || "").trim(),
        String(record.metric || "").trim(),
      ].filter(Boolean).slice(0, 3);
      return { id: `form-${idx}`, title: title || `关联表单 ${idx + 1}`, hints };
    });
    if (fromClassifications.length > 0) return fromClassifications;
    return selectedStructuredDetailRows.slice(0, 4).map((row, idx) => ({
      id: `form-fallback-${idx}`,
      title: `关联表单 ${idx + 1}`,
      hints: [row.checkItem, row.method].filter((x) => x && x !== "-"),
    }));
  }, [selectedRelatedClassificationRows, selectedStructuredDetailRows]);
  const selectedFieldMappingRows = useMemo(() => {
    return selectedStructuredDetailRows
      .filter((row) => row.checkItem !== "-")
      .slice(0, 12)
      .map((row) => ({
        field: row.checkItem,
        mapped: row.tolerance !== "-" ? row.tolerance : row.condition,
      }));
  }, [selectedStructuredDetailRows]);
  const selectedFormulaRows = useMemo(() => {
    return selectedSourceTextLines
      .filter((line) => /=|×|÷|\+|-|∑|Δ|h\d|d\d/i.test(line))
      .slice(0, 8);
  }, [selectedSourceTextLines]);
  const selectedReferenceRows = useMemo(() => {
    return selectedCatalogLinkedNormRefs
      .slice(0, 12)
      .map((row) => ({
        normRef: row.normRef,
        clause: row.sourceClause,
      }));
  }, [selectedCatalogLinkedNormRefs]);
  const selectedClauseStitchedLines = useMemo(() => {
    const targetId = String(selectedCatalogTreeNode?.id || "").trim();
    if (!targetId) return [] as string[];
    const idSegCount = targetId.split(".").filter(Boolean).length;
    const isPeerClauseId = (value: string) => {
      const v = String(value || "").trim();
      if (!v || v === targetId) return false;
      if (!/^\d+(?:\.\d+){1,3}$/.test(v)) return false;
      return v.split(".").filter(Boolean).length === idSegCount;
    };
    const rows = artifactClauseTreeNodes
      .map((node) => {
        const record = node as Record<string, unknown>;
        const pageNo = Number(record.page_no ?? record.page ?? record.source_page ?? 0) || 0;
        const lineNo = Number(record.line_no ?? record.line ?? 0) || 0;
        const clauseId = String(record.clause_id || record.id || "").trim();
        const text = String(record.source_text || record.title || record.name || record.text || "").trim();
        const nodeType = String(record.node_type || record.type || "").trim().toLowerCase();
        return { pageNo, lineNo, clauseId, text, nodeType };
      })
      .filter((row) => row.pageNo > 0 && row.text)
      .sort((a, b) => (a.pageNo - b.pageNo) || (a.lineNo - b.lineNo));
    const startIdx = rows.findIndex((row) => row.clauseId === targetId || row.text.startsWith(`${targetId} `));
    if (startIdx < 0) return [] as string[];
    const startPage = rows[startIdx].pageNo;
    const stitched: string[] = [];
    for (let i = startIdx; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.pageNo > startPage + 1) break;
      if (i > startIdx && row.clauseId && isPeerClauseId(row.clauseId)) break;
      if (i > startIdx && row.clauseId && row.clauseId !== targetId && /^第?\d+章/.test(row.text)) break;
      if (i > startIdx && row.clauseId && row.clauseId !== targetId && row.nodeType === "section") break;
      const raw = row.text;
      const cleaned = i === startIdx
        ? raw.replace(new RegExp(`^${targetId.replace(/\./g, "\\.")}\\s*`), "").trim()
        : raw.trim();
      if (!cleaned) continue;
      if (/^条文说明[:：]?$/.test(cleaned)) break;
      if (/^第?\d+章/.test(cleaned) || /^附录/.test(cleaned)) break;
      stitched.push(cleaned);
    }
    const merged = stitched
      .join("")
      .replace(/\s+/g, " ")
      .replace(/([，。；：！？])\1+/g, "$1")
      .trim();
    if (!merged) return [] as string[];
    const chunks = merged
      .split(/(?<=[。！？；])/)
      .map((x) => x.trim())
      .filter(Boolean);
    return chunks.length > 0 ? chunks : [merged];
  }, [artifactClauseTreeNodes, selectedCatalogTreeNode?.id]);
  type ClauseKnowledgeObject = {
    id: string;
    title: string;
    content: string[];
    business_tags: string[];
    roles: string[];
    process_stage: string;
    chapter: string;
    process_name: string;
    applicable_object: string;
    risk_level: string;
    clause_type: string;
    control_items: Array<{ no: number; item: string; threshold: string; unit: string; method: string; frequency: string; acceptance: string }>;
    related_forms: Array<{ id: string; title: string; process: string; fieldCount: number }>;
    field_mappings: Array<{ field: string; nameZh: string; mapped: string; autoValue: string }>;
    formulas: string[];
    references: Array<{ normName: string; clause: string; normRef: string; purpose: string }>;
    spec_tables: Array<{
      table_no: string;
      table_name: string;
      source_clause: string;
      columns: string[];
      header_rows: string[][];
      rows: Array<{
        index: string;
        index_raw: string;
        check_item: string;
        sub_item?: string;
        tolerance: string;
        method_frequency: string;
        unit: string;
        inspection_method: string;
        inspection_frequency: string;
        is_key_item: boolean;
        is_mandatory: boolean;
        row_span: number;
      }>;
      has_key_items: boolean;
      has_mandatory_items: boolean;
      remarks: string[];
    }>;
    inspection_rules: string[];
    acceptance_rules: string[];
    engineering_rules: Array<{ item: string; level: string; constraint: string; value: string; unit: string; target: string }>;
    condition_constraints: Array<{ item: string; operator: string; value: string; unit: string; level: string; source: string }>;
    process_requirements: string[];
    applicability: {
      objects: string[];
      roles: string[];
      stages: string[];
    };
    explanation_lines: string[];
    table_links: string[];
    parse_integrity: {
      is_complete: boolean;
      reason: string;
      tail_fragment: string;
    };
    analysis: {
      key_points: string[];
      engineering_interpretation: string;
      scenarios: string[];
      common_issues: string[];
    };
  };
  const selectedClauseKnowledgeObject = useMemo<ClauseKnowledgeObject | null>(() => {
    if (!selectedCatalogTreeNode) return null;
    const clauseId = String(selectedCatalogTreeNode.id || "").trim() || "-";
    const clauseTitle = String(selectedCatalogTreeNode.title || "").trim() || "未命名条文";
    const rawLines = (
      selectedClauseStitchedLines.length > 0
        ? selectedClauseStitchedLines
        : (selectedSourceTextLines.length > 0 ? selectedSourceTextLines : selectedSourceKeyPoints)
    ).map((x) => String(x || "").trim()).filter(Boolean);
    const titleFull = `${clauseId} ${clauseTitle}`.trim();
    const dedupedContentLines = rawLines.filter((line, idx, arr) => {
      const normalized = line.replace(/\s+/g, "");
      const titleNorm = titleFull.replace(/\s+/g, "");
      if (!normalized) return false;
      if (normalized === titleNorm) return false;
      if (normalized === clauseTitle.replace(/\s+/g, "")) return false;
      return arr.findIndex((x) => x.replace(/\s+/g, "") === normalized) === idx;
    });
    const contentLines = dedupedContentLines.length > 0 ? dedupedContentLines.slice(0, 16) : ["暂无条文正文，请检查当前条文的解析结果。"];
    const fullClauseText = contentLines.join(" ").trim();
    const explanationLines = rawLines.filter((line) => /条文说明|说明[:：]/.test(line)).slice(0, 8);
    const tableLinks = Array.from(new Set((fullClauseText.match(/表\s*\d+(?:\.\d+)*(?:-\d+)?/g) || []).map((x) => x.replace(/\s+/g, ""))));
    const extractRuleLevel = (text: string) => {
      if (/严禁|不得/.test(text)) return "禁止";
      if (/必须|应当|应/.test(text)) return "应";
      if (/宜/.test(text)) return "宜";
      if (/可/.test(text)) return "可";
      return "一般";
    };
    const inferObject = (text: string) => {
      if (/简支|连续梁|梁段|桥梁/.test(text)) return "桥梁/梁段";
      if (/钢筋|螺栓|垫圈|螺母/.test(text)) return "钢构件/连接副";
      if (/桩|墩|台/.test(text)) return "下部结构";
      return "通用工程对象";
    };
    const sentenceRows = fullClauseText
      .split(/[。；;]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const conditionConstraints = sentenceRows
      .map((row) => {
        const text = String(row || "").trim();
        const level = extractRuleLevel(text);
        const ranged = text.match(/([^\s，,:：]+)\s*([+\-]?\d+(?:\.\d+)?)\s*[~～\-]\s*([+\-]?\d+(?:\.\d+)?)(mm|cm|m|MPa|kN|%|℃|段|处|次|个|根)?/i);
        if (ranged) {
          return {
            item: String(ranged[1] || "控制项"),
            operator: "range",
            value: `${ranged[2]}~${ranged[3]}`,
            unit: String(ranged[4] || "").trim() || "-",
            level,
            source: text,
          };
        }
        const minMatched = text.match(/([^\s，,:：]+).{0,12}(?:不少于|不小于|≥|>=)\s*([+\-]?\d+(?:\.\d+)?)(mm|cm|m|MPa|kN|%|℃|段|处|次|个|根)?/i);
        if (minMatched) {
          return {
            item: String(minMatched[1] || "控制项"),
            operator: ">=",
            value: String(minMatched[2] || "-"),
            unit: String(minMatched[3] || "").trim() || "-",
            level,
            source: text,
          };
        }
        const maxMatched = text.match(/([^\s，,:：]+).{0,12}(?:不大于|不得大于|不应大于|≤|<=)\s*([+\-]?\d+(?:\.\d+)?)(mm|cm|m|MPa|kN|%|℃|段|处|次|个|根)?/i);
        if (maxMatched) {
          return {
            item: String(maxMatched[1] || "控制项"),
            operator: "<=",
            value: String(maxMatched[2] || "-"),
            unit: String(maxMatched[3] || "").trim() || "-",
            level,
            source: text,
          };
        }
        const exactMatched = text.match(/([^\s，,:：]+).{0,8}(?:为|应为|取)\s*([+\-]?\d+(?:\.\d+)?)(mm|cm|m|MPa|kN|%|℃|段|处|次|个|根)?/i);
        if (exactMatched) {
          return {
            item: String(exactMatched[1] || "控制项"),
            operator: "=",
            value: String(exactMatched[2] || "-"),
            unit: String(exactMatched[3] || "").trim() || "-",
            level,
            source: text,
          };
        }
        return null;
      })
      .filter((row): row is { item: string; operator: string; value: string; unit: string; level: string; source: string } => Boolean(row));
    const engineeringRules = sentenceRows
      .filter((row) => /应|宜|不得|必须|严禁|可/.test(row))
      .slice(0, 12)
      .map((row) => {
        const c = conditionConstraints.find((x) => row.includes(x.source) || x.source.includes(row));
        return {
          item: c?.item || (row.match(/^([^\s，,:：]{2,18})/)?.[1] || "工程规则"),
          level: extractRuleLevel(row),
          constraint: c?.operator || (tableLinks.length > 0 && /符合表/.test(row) ? "table_ref" : "text_rule"),
          value: c?.value || (tableLinks.length > 0 && /符合表/.test(row) ? tableLinks.join("、") : "-"),
          unit: c?.unit || "-",
          target: inferObject(row),
        };
      });
    const processRequirements = sentenceRows
      .filter((row) => /施工|拼装|吊装|运输|存放|检测|检验|复核|核对|试验|验收/.test(row))
      .slice(0, 12);
    const tail = String(contentLines[contentLines.length - 1] || "").trim();
    const looksTailBroken = tail.length > 0
      && !/[。！？；：]$/.test(tail)
      && /[并及与或运按由应将为在对从向至于其该等时后前内外上下一二三四五六七八九十]$/.test(tail);
    const tooShortOnlyOneLine = contentLines.length === 1 && tail.length > 16 && !/[。！？；：]$/.test(tail);
    const parseComplete = !(looksTailBroken || tooShortOnlyOneLine);
    const parseIntegrityReason = parseComplete
      ? "条文正文完整性正常"
      : "条文正文疑似被截断（上游解析资产返回半句）";
    const pathText = String(selectedCatalogTreeNode.pathText || "").trim();
    const pathSegments = pathText.split(" > ").map((x) => x.trim()).filter(Boolean);
    const chapterSeg = pathSegments.find((x) => /^(\d+)\s/.test(x) || /^第\d+章/.test(x)) || "未识别章节";
    const processSeg = pathSegments.find((x) => /^\d+\.\d+/.test(x)) || chapterSeg;
    const lowered = `${clauseId} ${clauseTitle} ${contentLines.join(" ")}`;
    const hasSurvey = /调查|核对|复核|勘察/.test(lowered);
    const hasMeasure = /测量|标高|高程|偏差|尺寸/.test(lowered);
    const hasMaterial = /材料|钢筋|混凝土|砂浆|水泥/.test(lowered);
    const hasSafety = /安全|风险|防护|应急|危险/.test(lowered);
    const hasQuality = /质量|验收|检验|检查/.test(lowered);
    const stage = hasSurvey ? "施工准备" : (hasMeasure ? "施工测量" : "施工执行");
    const clauseType = hasSurvey ? "施工准备要求" : (hasMeasure ? "测量控制要求" : "一般施工要求");
    const businessTags = [
      stage,
      hasMeasure ? "测量控制" : "现场核对",
      hasMaterial ? "材料管理" : "技术负责人",
      hasSafety ? "安全风险" : "监理关注",
    ];
    const roles = hasSafety
      ? ["施工员", "技术负责人", "安全员", "监理"]
      : ["施工员", "技术负责人", "监理"];
    const controlRows = selectedIndicatorRows
      .filter((row) => String(row.item || "").trim())
      .map((row, idx) => ({
        no: Number(row.no ?? idx + 1) || idx + 1,
        item: String(row.item || "-"),
        threshold: String(row.threshold || "-"),
        unit: String(row.unit || "—"),
        method: String(row.method || "—"),
        frequency: selectedSourceMethodHints[idx] ? "按条文要求执行" : "每工序开工前",
        acceptance: selectedSourceToleranceHints[idx] || "满足规范条文要求",
      }));
    const formRows = selectedFormCards.map((card, idx) => ({
      id: String(card.id || `form-${idx + 1}`),
      title: String(card.title || `关联表单 ${idx + 1}`),
      process: stage,
      fieldCount: Array.isArray(card.hints) ? card.hints.filter(Boolean).length : 0,
    }));
    const mappingRows = selectedFieldMappingRows
      .filter((row) => String(row.field || "").trim())
      .map((row, idx) => ({
        field: String(row.field || `field_${idx + 1}`),
        nameZh: String(row.field || `字段${idx + 1}`),
        mapped: String(row.mapped || "-"),
        autoValue: /自动|系统|计算/.test(String(row.mapped || "")) ? "是" : "否",
      }));
    const formulaRows = selectedFormulaRows.filter((x) => String(x || "").trim());
    const referenceRows = selectedReferenceRows
      .filter((row) => String(row.normRef || "").trim() || String(row.clause || "").trim())
      .map((row) => ({
        normName: "JTG/T 3650-2020",
        clause: String(row.clause || clauseId),
        normRef: String(row.normRef || "-"),
        purpose: hasSurvey ? "用于施工准备阶段调查与核对" : "用于当前条文执行与验收判定",
      }));
    const parseMethodFrequency = (raw: string) => {
      const text = String(raw || "").trim();
      if (!text) return { method: "-", frequency: "-" };
      const parts = text.split(/[：:]/).map((x) => x.trim()).filter(Boolean);
      if (parts.length >= 2) return { method: parts[0], frequency: parts.slice(1).join("：") || "-" };
      const freqMatch = text.match(/(每[^，。；;]+|各测[^，。；;]+|测[^，。；;]+处|抽检[^，。；;]+)/);
      if (freqMatch) {
        const frequency = freqMatch[1].trim();
        const method = text.replace(frequency, "").replace(/[，。；;]$/, "").trim() || "-";
        return { method, frequency };
      }
      return { method: text, frequency: "按条文要求执行" };
    };
    const extractUnitFromItem = (itemText: string) => {
      const m = String(itemText || "").match(/[（(]([^)）]{1,12})[)）]/);
      if (!m) return "";
      return String(m[1] || "").trim();
    };
    const stripUnit = (itemText: string) => String(itemText || "").replace(/[（(][^)）]{1,12}[)）]/g, "").trim();
    const tableReferenceRows = referenceRows.filter((row) => /\/table\//i.test(String(row.normRef || "")));
    const tableRowsSource = selectedStructuredDetailRows.filter((row) => row.checkItem !== "-" || row.tolerance !== "-" || row.method !== "-");
    const groupedByItem = new Map<string, typeof tableRowsSource>();
    for (const row of tableRowsSource) {
      const key = stripUnit(String(row.checkItem || ""));
      const bucket = groupedByItem.get(key) || [];
      bucket.push(row);
      groupedByItem.set(key, bucket);
    }
    const tableObjects = tableReferenceRows.map((refRow, tableIdx) => {
      const tableNoRaw = String(refRow.normRef || "").split("/").pop() || `${clauseId}-T${tableIdx + 1}`;
      const tableNo = `表${tableNoRaw}`;
      const tableName = `${clauseTitle} 结构化实测项目`;
      const headerRows = [
        ["项次", "检查项目", "分组/子项", "规定值或允许偏差", "检查方法和频率"],
      ];
      let runningNo = 1;
      const normalizedRows = Array.from(groupedByItem.entries()).flatMap(([itemKey, rows]) => {
        const rowSpan = rows.length;
        return rows.map((row, childIdx) => {
          const idxRaw = childIdx === 0 ? `${runningNo}${/△/.test(String(row.clause || "")) ? "△" : ""}` : "";
          if (childIdx === rowSpan - 1) runningNo += 1;
          const methodFreq = parseMethodFrequency(String(row.method || ""));
          const tolerance = String(row.tolerance || "-");
          const unit = String(row.unit || "").trim() !== "-" ? String(row.unit || "").trim() : extractUnitFromItem(String(row.checkItem || ""));
          const checkItemRaw = String(row.checkItem || itemKey || "-");
          const subItem = String(row.condition || "").trim();
          const isKey = /△/.test(idxRaw) || /关键|重点/.test(checkItemRaw);
          const isMandatory = /必须|应|不得|严禁/.test([checkItemRaw, tolerance, String(row.method || "")].join(" "));
          return {
            index: idxRaw || String(runningNo),
            index_raw: idxRaw || String(runningNo),
            check_item: childIdx === 0 ? stripUnit(checkItemRaw) || itemKey || "-" : "",
            sub_item: subItem && subItem !== "-" ? subItem : "",
            tolerance,
            method_frequency: String(row.method || "-"),
            unit: unit || "-",
            inspection_method: methodFreq.method,
            inspection_frequency: methodFreq.frequency,
            is_key_item: isKey,
            is_mandatory: isMandatory,
            row_span: rowSpan,
          };
        });
      });
      const hasKey = normalizedRows.some((row) => row.is_key_item);
      const hasMandatory = normalizedRows.some((row) => row.is_mandatory);
      const remarks = [
        hasKey ? "含关键项（△）" : "无关键项标识",
        hasMandatory ? "含强制执行项" : "未识别强制执行项",
      ];
      return {
        table_no: tableNo,
        table_name: tableName,
        source_clause: String(refRow.clause || clauseId),
        columns: ["项次", "检查项目", "分组/子项", "规定值或允许偏差", "检查方法和频率"],
        header_rows: headerRows,
        rows: normalizedRows,
        has_key_items: hasKey,
        has_mandatory_items: hasMandatory,
        remarks,
      };
    });
    const tableDerivedControlRows = tableObjects.flatMap((table) => table.rows.map((row) => ({
      no: 0,
      item: [row.check_item, row.sub_item].filter(Boolean).join(" / ") || "-",
      threshold: row.tolerance || "-",
      unit: row.unit || "—",
      method: row.inspection_method || "-",
      frequency: row.inspection_frequency || "按表格要求执行",
      acceptance: row.is_key_item ? "关键项，必须满足要求" : "满足表格允许偏差",
    })));
    const mergedControlRows = [...tableDerivedControlRows, ...controlRows]
      .filter((row) => String(row.item || "").trim() && String(row.item || "").trim() !== "-")
      .map((row, idx) => ({ ...row, no: idx + 1 }));
    const keyPoints = (selectedSourceKeyPoints.length > 0 ? selectedSourceKeyPoints : contentLines)
      .map((x) => String(x || "").trim())
      .filter((x, idx, arr) => {
        const norm = x.replace(/\s+/g, "");
        const titleNorm = titleFull.replace(/\s+/g, "");
        if (!norm || norm === titleNorm) return false;
        return arr.findIndex((y) => y.replace(/\s+/g, "") === norm) === idx;
      })
      .slice(0, 6);
    const contentNormSet = new Set(contentLines.map((x) => x.replace(/\s+/g, "")));
    const analysisKeyPoints = keyPoints.filter((kp, idx, arr) => {
      const norm = kp.replace(/\s+/g, "");
      if (!norm) return false;
      if (contentNormSet.has(norm)) return false;
      return arr.findIndex((x) => x.replace(/\s+/g, "") === norm) === idx;
    });
    return {
      id: clauseId,
      title: clauseTitle,
      content: contentLines,
      business_tags: businessTags,
      roles,
      process_stage: stage,
      chapter: chapterSeg,
      process_name: processSeg,
      applicable_object: hasMaterial ? "桥涵及材料相关工序" : "桥涵工程",
      risk_level: hasSafety ? "高" : (hasMeasure || hasQuality ? "中" : "低"),
      clause_type: clauseType,
      control_items: mergedControlRows,
      related_forms: formRows,
      field_mappings: mappingRows,
      formulas: formulaRows,
      references: referenceRows,
      spec_tables: tableObjects,
      inspection_rules: selectedSourceMethodHints.length > 0 ? selectedSourceMethodHints.slice(0, 6) : ["按条文规定方法进行检查并形成记录。"],
      acceptance_rules: selectedSourceToleranceHints.length > 0 ? selectedSourceToleranceHints.slice(0, 6) : ["满足条文阈值与验收条件。"],
      engineering_rules: engineeringRules,
      condition_constraints: conditionConstraints,
      process_requirements: processRequirements,
      applicability: {
        objects: Array.from(new Set([inferObject(fullClauseText), hasMaterial ? "桥涵及材料相关工序" : "桥涵工程"])).filter(Boolean),
        roles,
        stages: Array.from(new Set([stage, processSeg, hasMeasure ? "测量复核" : "施工执行"])).filter(Boolean),
      },
      explanation_lines: explanationLines,
      table_links: tableLinks,
      parse_integrity: {
        is_complete: parseComplete,
        reason: parseIntegrityReason,
        tail_fragment: tail,
      },
      analysis: {
        key_points: analysisKeyPoints.length > 0 ? analysisKeyPoints : keyPoints.slice(0, 3),
        engineering_interpretation: explanationLines[0]
          || processRequirements[0]
          || conditionConstraints[0]?.source
          || contentLines[0]
          || "未识别到工程解释",
        scenarios: [stage, hasMeasure ? "测量放样与复核" : "施工准备与执行", hasSafety ? "风险控制" : "质量控制"],
        common_issues: ["原始记录缺失", "参数来源不一致", "检查频率执行不到位"],
      },
    };
  }, [
    selectedCatalogTreeNode,
    selectedClauseStitchedLines,
    selectedSourceTextLines,
    selectedSourceKeyPoints,
    selectedIndicatorRows,
    selectedSourceMethodHints,
    selectedSourceToleranceHints,
    selectedFormCards,
    selectedFieldMappingRows,
    selectedFormulaRows,
    selectedReferenceRows,
    selectedStructuredDetailRows,
  ]);
  const selectedClauseExecutionView = useMemo(() => {
    const clauseId = String(selectedCatalogTreeNode?.id || "").trim();
    const containsClause = (v: unknown) => String(v || "").trim().includes(clauseId);
    const specItemsRaw = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    const specirItems = specItemsRaw.filter((item) => {
      const row = item as Record<string, unknown>;
      const srcClause = String((row.evidence as { source_clause_id?: unknown } | undefined)?.source_clause_id || row.source_clause_id || "").trim();
      const normRef = String(row.normRef || "").trim();
      return !clauseId || containsClause(srcClause) || containsClause(normRef);
    });
    const componentIds = new Set(
      specirItems
        .map((item) => String((item as { component_id?: unknown; specir_id?: unknown }).component_id || (item as { specir_id?: unknown }).specir_id || "").trim())
        .filter(Boolean),
    );
    const rules = artifactRules.filter((r) => {
      const rec = r as Record<string, unknown>;
      const byComp = componentIds.has(String(rec.component_id || "").trim());
      const byClause = containsClause(rec.clause_no) || containsClause(rec.source_clause_id) || containsClause(rec.norm_ref);
      return !clauseId || byComp || byClause;
    });
    const gates = artifactGates.filter((g) => {
      const rec = g as Record<string, unknown>;
      const byComp = componentIds.has(String(rec.component_id || "").trim());
      const byClause = containsClause(rec.clause_no) || containsClause(rec.source_clause_id) || containsClause(rec.norm_ref);
      return !clauseId || byComp || byClause;
    });
    const proofs = artifactProofTemplates.filter((p) => componentIds.has(String((p as { component_id?: unknown }).component_id || "").trim()));
    const body = specirItems.map((item, idx) => {
      const row = item as Record<string, unknown>;
      const evidence = (row.evidence && typeof row.evidence === "object") ? row.evidence as Record<string, unknown> : {};
      const ruleObj = (row.rule && typeof row.rule === "object") ? row.rule as Record<string, unknown> : {};
      const gateObj = (row.gate && typeof row.gate === "object") ? row.gate as Record<string, unknown> : {};
      return {
        id: String(row.specir_id || row.component_id || `specir-${idx + 1}`),
        normRef: String(row.normRef || "-"),
        source_text: String(row.source_text || evidence.source_text || evidence.original_text || "-"),
        slotKey: String(row.slotKey || row.slot_key || ruleObj.field || "-"),
        unit: String(ruleObj.unit || "-"),
        gate: String(gateObj.logic || "-"),
      };
    });
    const focus = String(executionTraceFocusId || "").trim();
    if (!focus) {
      return { body, specirItems, rules, gates, proofs, focused: false };
    }
    const focusMatch = (text: unknown) => String(text || "").trim() === focus;
    const bodyFocused = body.filter((x) => focusMatch(x.id));
    const specirFocused = specirItems.filter((item) => {
      const row = item as Record<string, unknown>;
      return focusMatch(row.component_id) || focusMatch(row.specir_id);
    });
    const rulesFocused = rules.filter((r) => focusMatch((r as Record<string, unknown>).component_id));
    const gatesFocused = gates.filter((g) => focusMatch((g as Record<string, unknown>).component_id));
    const proofsFocused = proofs.filter((p) => focusMatch((p as Record<string, unknown>).component_id));
    return {
      body: bodyFocused.length > 0 ? bodyFocused : body,
      specirItems: specirFocused.length > 0 ? specirFocused : specirItems,
      rules: rulesFocused.length > 0 ? rulesFocused : rules,
      gates: gatesFocused.length > 0 ? gatesFocused : gates,
      proofs: proofsFocused.length > 0 ? proofsFocused : proofs,
      focused: true,
    };
  }, [artifactGates, artifactProofTemplates, artifactRules, executionTraceFocusId, selectedCatalogTreeNode?.id, specirDoc]);
  const selectedClauseQaMappingRows = useMemo(() => {
    const specRows = selectedClauseExecutionView.specirItems.map((item) => item as Record<string, unknown>);
    const ruleRows = selectedClauseExecutionView.rules.map((item) => item as Record<string, unknown>);
    const gateRows = selectedClauseExecutionView.gates.map((item) => item as Record<string, unknown>);
    const gateByComp = new Map<string, Record<string, unknown>>();
    for (const g of gateRows) {
      const cid = String(g.component_id || "").trim();
      if (cid && !gateByComp.has(cid)) gateByComp.set(cid, g);
    }
    const ruleByComp = new Map<string, Record<string, unknown>>();
    for (const r of ruleRows) {
      const cid = String(r.component_id || "").trim();
      if (cid && !ruleByComp.has(cid)) ruleByComp.set(cid, r);
    }
    return specRows.map((s, idx) => {
      const compId = String(s.component_id || s.specir_id || "").trim();
      const rule = ruleByComp.get(compId) || {};
      const gate = gateByComp.get(compId) || {};
      const evidence = (s.evidence && typeof s.evidence === "object") ? s.evidence as Record<string, unknown> : {};
      const normRef = String(s.normRef || evidence.normRef || "-").trim() || "-";
      const sourceText = String(s.source_text || evidence.source_text || evidence.original_text || "-").trim() || "-";
      const slotKey = String(s.slotKey || s.slot_key || rule.field || "-").trim() || "-";
      const fieldName = String(rule.field || slotKey || `field_${idx + 1}`).trim();
      const op = String(rule.operator || "").trim();
      const val = String(rule.value ?? rule.min ?? rule.max ?? "").trim();
      const unit = String(rule.unit || "").trim();
      const fallbackConstraint = selectedClauseKnowledgeObject?.condition_constraints?.[0];
      const fallbackAcceptance = fallbackConstraint
        ? `${fallbackConstraint.item} ${fallbackConstraint.operator} ${fallbackConstraint.value}${fallbackConstraint.unit !== "-" ? fallbackConstraint.unit : ""}`
        : "";
      const acceptance = [fieldName, op, val ? `${val}${unit}` : ""].filter(Boolean).join(" ");
      return {
        field_name: fieldName || "-",
        slot_key: slotKey,
        rule_id: String(rule.rule_id || "-").trim() || "-",
        gate_id: String(gate.gate_id || "-").trim() || "-",
        specir_id: String(s.specir_id || s.component_id || "-").trim() || "-",
        norm_ref: normRef,
        source_text: sourceText,
        acceptance_logic: acceptance || String(gate.logic || "").trim() || fallbackAcceptance || "-",
      };
    });
  }, [selectedClauseExecutionView.gates, selectedClauseExecutionView.rules, selectedClauseExecutionView.specirItems, selectedClauseKnowledgeObject?.condition_constraints]);
  const selectedClauseQaAudit = useMemo(() => {
    const requiredKeys: Array<keyof (typeof selectedClauseQaMappingRows)[number]> = [
      "field_name",
      "slot_key",
      "rule_id",
      "gate_id",
      "specir_id",
      "norm_ref",
      "source_text",
      "acceptance_logic",
    ];
    const rows = selectedClauseQaMappingRows;
    const total = rows.length;
    const rowMissing: Array<{ index: number; missing: string[] }> = rows.map((row, idx) => {
      const missing = requiredKeys.filter((k) => {
        const v = String(row[k] || "").trim();
        return !v || v === "-";
      }).map((k) => String(k));
      return { index: idx, missing };
    });
    const completeCount = rowMissing.filter((x) => x.missing.length === 0).length;
    const incompleteRows = rowMissing.filter((x) => x.missing.length > 0);
    const completeness = total > 0 ? Math.round((completeCount / total) * 100) : 0;
    const missingStats: Record<string, number> = {};
    for (const r of incompleteRows) {
      for (const m of r.missing) missingStats[m] = (missingStats[m] || 0) + 1;
    }
    const blocker = total <= 0 || incompleteRows.length > 0;
    return {
      total,
      completeCount,
      incompleteCount: incompleteRows.length,
      completeness,
      blocker,
      missingStats,
      incompleteRows: incompleteRows.slice(0, 8),
    };
  }, [selectedClauseQaMappingRows]);
  const clauseTextQualityAudit = useMemo(() => {
    const payload = artifactPipelineAudit as Record<string, unknown> | null;
    const quality = (payload?.clause_text_quality && typeof payload.clause_text_quality === "object")
      ? payload.clause_text_quality as Record<string, unknown>
      : {};
    const possibleTruncatedCount = Number(quality.possible_truncated_count || 0) || 0;
    const sampleRaw = Array.isArray(quality.possible_truncated_sample) ? quality.possible_truncated_sample : [];
    const sample = sampleRaw
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const row = x as Record<string, unknown>;
        return {
          clause_id: String(row.clause_id || "-"),
          source_page: Number(row.source_page || 0) || 0,
          source_text_tail: String(row.source_text_tail || "-"),
          reason: String(row.reason || "-"),
        };
      });
    return { possibleTruncatedCount, sample };
  }, [artifactPipelineAudit]);
  useEffect(() => {
    if (!selectedClauseKnowledgeObject) return;
    if (normWorkbenchTab === "spec_table" && selectedClauseKnowledgeObject.spec_tables.length === 0) {
      setNormWorkbenchTab("content");
    }
  }, [normWorkbenchTab, selectedClauseKnowledgeObject]);
  useEffect(() => {
    if (
      workspaceMode === "test"
      && (normWorkbenchTab === "qa_map" || normWorkbenchTab === "body" || normWorkbenchTab === "specir" || normWorkbenchTab === "gate" || normWorkbenchTab === "proof")
    ) {
      setNormWorkbenchTab("content");
    }
  }, [workspaceMode, normWorkbenchTab]);
  useEffect(() => {
    setExecutionTraceFocusId("");
  }, [selectedCatalogTreeNode?.id]);
  const selectedPageAnchor = useMemo(() => {
    const fromTree = Number(selectedCatalogTreeNode?.page || 0) || 0;
    if (fromTree > 0) return fromTree;
    const fromNormRef = Number(selectedCatalogPrimaryNormRef?.nodePage || 0) || 0;
    if (fromNormRef > 0) return fromNormRef;
    return 0;
  }, [selectedCatalogPrimaryNormRef?.nodePage, selectedCatalogTreeNode?.page]);
  const selectedPageContextNodes = useMemo(() => {
    if (selectedPageAnchor <= 0) return [] as Array<{ clauseId: string; title: string; pageNo: number; lineNo: number; nodeType: string; bbox: string }>;
    const rows = artifactClauseTreeNodes
      .map((node) => {
        const record = node as Record<string, unknown>;
        const pageNo = Number(record.page_no ?? record.page ?? record.source_page ?? 0) || 0;
        const lineNo = Number(record.line_no ?? record.line ?? 0) || 0;
        const clauseId = String(record.clause_id || record.id || "").trim();
        const title = String(record.title || record.name || record.text || "").trim();
        const nodeType = String(record.node_type || record.type || "").trim().toLowerCase();
        const bboxObj = record.bbox && typeof record.bbox === "object" ? (record.bbox as Record<string, unknown>) : null;
        const bbox = bboxObj
          ? `x=${String(bboxObj.x ?? "-")},y=${String(bboxObj.y ?? "-")},w=${String(bboxObj.w ?? "-")},h=${String(bboxObj.h ?? "-")}`
          : "-";
        return { clauseId, title, pageNo, lineNo, nodeType, bbox };
      })
      .filter((row) => row.pageNo === selectedPageAnchor && (row.clauseId || row.title))
      .sort((a, b) => (a.lineNo || 999999) - (b.lineNo || 999999));
    return rows.slice(0, 80);
  }, [artifactClauseTreeNodes, selectedPageAnchor]);
  const selectedPageContextWindow = useMemo(() => {
    if (selectedPageContextNodes.length === 0) return [] as typeof selectedPageContextNodes;
    const targetId = String(selectedCatalogTreeNode?.id || "").trim();
    const idx = selectedPageContextNodes.findIndex((row) => row.clauseId === targetId || row.title.includes(targetId));
    if (idx < 0) return selectedPageContextNodes.slice(0, 10);
    const from = Math.max(0, idx - 3);
    const to = Math.min(selectedPageContextNodes.length, idx + 4);
    return selectedPageContextNodes.slice(from, to);
  }, [selectedCatalogTreeNode?.id, selectedPageContextNodes]);
  const pageImageUrlByPage = useMemo(() => {
    const out: Record<number, string> = {};
    const add = (page: unknown, url: unknown) => {
      const p = Number(page);
      const u = String(url || "").trim();
      if (!Number.isFinite(p) || p <= 0 || !u) return;
      if (!out[p]) out[p] = u;
    };
    const walk = (value: unknown) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((item) => walk(item));
        return;
      }
      if (typeof value !== "object") return;
      const obj = value as Record<string, unknown>;
      add(obj.page_no ?? obj.page ?? obj.source_page, obj.page_image_url ?? obj.image_url ?? obj.page_image ?? obj.scan_image ?? obj.pdf_page_image);
      Object.values(obj).forEach((v) => {
        if (typeof v === "object" && v !== null) walk(v);
      });
    };
    walk(artifactDocs["01_spec.json"]);
    walk(artifactDocs["03_clause_tree.json"]);
    walk(normRefIndexEntries);
    return out;
  }, [artifactDocs, normRefIndexEntries]);
  const selectedPageImageCandidates = useMemo(() => {
    if (selectedPageAnchor <= 0) return [] as Array<{ url: string; bbox: { x: number; y: number; w: number; h: number } | null; clauseId: string; lineNo: number }>;
    const parseBBox = (raw: unknown): { x: number; y: number; w: number; h: number } | null => {
      if (!raw) return null;
      if (Array.isArray(raw) && raw.length >= 4) {
        const x1 = Number(raw[0]);
        const y1 = Number(raw[1]);
        const x2 = Number(raw[2]);
        const y2 = Number(raw[3]);
        if ([x1, y1, x2, y2].every(Number.isFinite)) {
          return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
        }
      }
      if (typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        const x = Number(obj.x ?? obj.left ?? obj.x1 ?? 0);
        const y = Number(obj.y ?? obj.top ?? obj.y1 ?? 0);
        const wRaw = obj.w ?? obj.width;
        const hRaw = obj.h ?? obj.height;
        const x2 = Number(obj.x2 ?? obj.right ?? NaN);
        const y2 = Number(obj.y2 ?? obj.bottom ?? NaN);
        const w = Number(wRaw ?? (Number.isFinite(x2) ? x2 - x : NaN));
        const h = Number(hRaw ?? (Number.isFinite(y2) ? y2 - y : NaN));
        if ([x, y, w, h].every(Number.isFinite)) return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
      }
      return null;
    };
    const rows = artifactClauseTreeNodes
      .map((node) => {
        const record = node as Record<string, unknown>;
        const pageNo = Number(record.page_no ?? record.page ?? record.source_page ?? 0) || 0;
        if (pageNo !== selectedPageAnchor) return null;
        const url = String(
          record.page_image_url
          || record.image_url
          || record.page_image
          || record.scan_image
          || record.pdf_page_image
          || "",
        ).trim();
        if (!url) return null;
        const bbox = parseBBox(record.bbox || record.location_bbox || record.text_bbox || null);
        const clauseId = String(record.clause_id || record.id || "").trim();
        const lineNo = Number(record.line_no ?? record.line ?? 0) || 0;
        return { url, bbox, clauseId, lineNo };
      })
      .filter((item): item is { url: string; bbox: { x: number; y: number; w: number; h: number } | null; clauseId: string; lineNo: number } => Boolean(item))
      .sort((a, b) => a.lineNo - b.lineNo);
    if (rows.length === 0) {
      const fromNormRef = selectedCatalogPrimaryNormRef && typeof selectedCatalogPrimaryNormRef === "object"
        ? String((selectedCatalogPrimaryNormRef as { pageImageUrl?: unknown }).pageImageUrl || "").trim()
        : "";
      const normRefBBox = parseBBox(
        selectedCatalogPrimaryNormRef && typeof selectedCatalogPrimaryNormRef === "object"
          ? (selectedCatalogPrimaryNormRef as { bbox?: unknown }).bbox
          : null,
      );
      const url = fromNormRef || pageImageUrlByPage[selectedPageAnchor] || "";
      if (url) {
        return [{
          url,
          bbox: normRefBBox,
          clauseId: String(selectedCatalogTreeNode?.id || "").trim(),
          lineNo: 0,
        }];
      }
    }
    return rows;
  }, [artifactClauseTreeNodes, pageImageUrlByPage, selectedCatalogPrimaryNormRef, selectedCatalogTreeNode?.id, selectedPageAnchor]);
  const selectedPageImagePreview = useMemo(() => {
    if (selectedPageImageCandidates.length === 0) return null;
    const targetId = String(selectedCatalogTreeNode?.id || "").trim();
    return selectedPageImageCandidates.find((x) => x.clauseId === targetId) || selectedPageImageCandidates[0];
  }, [selectedCatalogTreeNode?.id, selectedPageImageCandidates]);
  const catalogTreeRowsForCheck = useMemo(() => {
    const keepL1ToL3Only = (nodes: typeof catalogTreeRows): typeof catalogTreeRows =>
      nodes
        .map((node) => {
          const t = String(node.type || "").toLowerCase();
          const keepSelf = t === "chapter" || t === "part" || t === "appendix" || t === "section" || t === "clause" || t === "article";
          const children = keepL1ToL3Only(node.children);
          if (keepSelf) return { ...node, children };
          if (children.length > 0) return { ...node, children };
          return null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const baseTree = catalogStrictThreeLevels ? keepL1ToL3Only(catalogTreeRows) : catalogTreeRows;
    if (!catalogL3Only) return baseTree;
    const keepClauseLike = (type: string): boolean => {
      const t = String(type || "").toLowerCase();
      return t === "clause" || t === "article" || t === "item";
    };
    const filterTree = (nodes: typeof catalogTreeRows): typeof catalogTreeRows =>
      nodes
        .map((node) => {
          const children = filterTree(node.children);
          if (keepClauseLike(node.type) || children.length > 0) {
            return { ...node, children };
          }
          return null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
    return filterTree(baseTree);
  }, [catalogL3Only, catalogStrictThreeLevels, catalogTreeRows]);
  useEffect(() => {
    if (!catalogL3Only) return;
    const visibleKeys = new Set<string>();
    const walk = (nodes: typeof catalogTreeRowsForCheck) => {
      nodes.forEach((node) => {
        visibleKeys.add(node.key);
        walk(node.children);
      });
    };
    walk(catalogTreeRowsForCheck);
    if (selectedCatalogNodeKey && !visibleKeys.has(selectedCatalogNodeKey)) {
      const firstVisible = Array.from(visibleKeys)[0] || "";
      setSelectedCatalogNodeKey(firstVisible);
    }
  }, [catalogL3Only, catalogTreeRowsForCheck, selectedCatalogNodeKey]);
  const catalogStructureReady = catalogNodeCount > 0 && normRefCount > 0;
  const catalogStructureState: WorkflowState = catalogStructureReady
    ? "completed"
    : (catalogNodeCount > 0 || normRefCount > 0)
      ? "partial"
      : "failed";
  const catalogStatus = catalogNodeCount > 0 ? "success" : "failed";
  const clauseRefCount = normalizedNormRefRows.filter((row) => row.nodeType === "clause").length;
  const tableRefCount = normalizedNormRefRows.filter((row) => /\/table[-_/]|table[-_/]/i.test(row.normRef)).length;
  const fieldRefCount = normalizedNormRefRows.filter((row) => row.field && row.field !== "-").length;
  const ruleGenerationStatus = String(((artifactDocs["07_rules.json"] as { rule_generation_status?: unknown } | undefined)?.rule_generation_status) || "").trim();
  const gateGenerationStatus = String(((artifactDocs["08_gates.json"] as { gate_generation_status?: unknown } | undefined)?.gate_generation_status) || "").trim();
  const semanticUnresolvedSet = new Set<SemanticStatus>(["ambiguous", "conflicted", "rejected"]);
  const normalizeSemanticStatus = (raw: unknown, issues: unknown[] = []): SemanticStatus => {
    const v = String(raw || "").trim().toLowerCase();
    if (v === "parsed" || v === "understood" || v === "ambiguous" || v === "conflicted" || v === "rejected") {
      return v as SemanticStatus;
    }
    if ((issues || []).length > 0) return "ambiguous";
    return "understood";
  };
  const normalizeExecutionStatus = (raw: unknown): ExecutionStatus | "" => {
    const v = String(raw || "").trim().toLowerCase();
    if (
      v === "executable"
      || v === "partial_executable"
      || v === "not_executable"
      || v === "needs_slot"
      || v === "needs_formula"
      || v === "needs_runtime"
    ) {
      return v as ExecutionStatus;
    }
    return "";
  };
  const normRefAddressSet = useMemo(() => new Set(normalizedNormRefRows.map((row) => row.normRef)), [normalizedNormRefRows]);
  const normRefEvidenceMap = useMemo(() => {
    const map: Record<string, { sourceText: string; pageNo: number }> = {};
    normalizedNormRefRows.forEach((row) => {
      if (!row.normRef) return;
      map[row.normRef] = {
        sourceText: String(row.sourceText || "").trim(),
        pageNo: Number(row.nodePage || 0) || 0,
      };
    });
    return map;
  }, [normalizedNormRefRows]);
  const specirExecutionStatusSummary = useMemo(() => {
    const rows = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    const counter: Record<ExecutionStatus, number> = {
      executable: 0,
      partial_executable: 0,
      not_executable: 0,
      needs_slot: 0,
      needs_formula: 0,
      needs_runtime: 0,
    };
    rows.forEach((it) => {
      const statusRaw = (it as { execution_status?: unknown }).execution_status;
      const s = normalizeExecutionStatus(statusRaw) || (Boolean((it as { executable?: unknown }).executable) ? "executable" : "not_executable");
      counter[s] += 1;
    });
    return counter;
  }, [specirDoc]);
  const specirSlotCoverage = useMemo(() => {
    const rows = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    let totalExecutableSpecir = 0;
    let boundSlotCount = 0;
    let unboundSlotCount = 0;
    rows.forEach((it) => {
      const statusRaw = (it as { execution_status?: unknown }).execution_status;
      const es = normalizeExecutionStatus(statusRaw);
      if (!(es === "executable" || es === "partial_executable")) return;
      totalExecutableSpecir += 1;
      const slotKey = String((it as { slotKey?: unknown }).slotKey || "").trim();
      if (slotKey && slotKey !== "measured_value") boundSlotCount += 1;
      else unboundSlotCount += 1;
    });
    return { totalExecutableSpecir, boundSlotCount, unboundSlotCount };
  }, [specirDoc]);
  const specirRuntimeCapability = useMemo(() => {
    const modeSummary = {
      automatic: 0,
      semi_automatic: 0,
      manual_confirmed: 0,
      non_executable: 0,
      unknown: 0,
    };
    const requirementKeys = [
      "manual_input",
      "sensor",
      "lab_test",
      "design_value",
      "measured_value",
      "bim_model",
      "formula_engine",
      "external_standard",
      "human_judgement",
    ];
    const requirementSummary: Record<string, number> = {};
    requirementKeys.forEach((k) => { requirementSummary[k] = 0; });
    const items = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    for (const it of items) {
      const mode = String((it as { runtime_mode?: unknown }).runtime_mode || "").trim().toLowerCase();
      if (mode === "automatic" || mode === "semi_automatic" || mode === "manual_confirmed" || mode === "non_executable") {
        modeSummary[mode] += 1;
      } else {
        modeSummary.unknown += 1;
      }
      const reqs = Array.isArray((it as { runtime_requirements?: unknown }).runtime_requirements)
        ? ((it as { runtime_requirements?: unknown[] }).runtime_requirements || []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
        : [];
      reqs.forEach((r) => {
        if (Object.prototype.hasOwnProperty.call(requirementSummary, r)) requirementSummary[r] += 1;
      });
    }
    return { modeSummary, requirementSummary, requirementKeys };
  }, [specirDoc]);
  const semanticConflicts = useMemo<SemanticConflictRow[]>(() => {
    const items = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    const bySlotAndCond = new Map<string, Array<Record<string, unknown>>>();
    const normalizeCondition = (it: Record<string, unknown>): string => {
      const c = String(it.condition || "").trim().toLowerCase();
      return c || "global";
    };
    const thresholdText = (it: Record<string, unknown>): string => {
      const constraint = (it.constraint && typeof it.constraint === "object") ? (it.constraint as Record<string, unknown>) : {};
      const value = constraint.value;
      const min = constraint.min;
      const max = constraint.max;
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
      if (min !== undefined && min !== null && max !== undefined && max !== null) return `${String(min)}..${String(max)}`;
      if (min !== undefined && min !== null) return String(min);
      if (max !== undefined && max !== null) return String(max);
      return "-";
    };
    const parseNumeric = (v: string): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    items.forEach((raw, idx) => {
      const it = (raw as Record<string, unknown>);
      const slot = String(it.slotKey || "").trim().toLowerCase();
      if (!slot) return;
      const cond = normalizeCondition(it);
      const key = `${slot}@@${cond}`;
      if (!bySlotAndCond.has(key)) bySlotAndCond.set(key, []);
      bySlotAndCond.get(key)?.push({ ...it, _idx: idx });
    });
    const rows: SemanticConflictRow[] = [];
    bySlotAndCond.forEach((group, key) => {
      if (group.length < 2) return;
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const a = group[i];
          const b = group[j];
          const ac = (a.constraint && typeof a.constraint === "object") ? (a.constraint as Record<string, unknown>) : {};
          const bc = (b.constraint && typeof b.constraint === "object") ? (b.constraint as Record<string, unknown>) : {};
          const aOp = String(ac.operator || "").trim();
          const bOp = String(bc.operator || "").trim();
          const aTh = thresholdText(a);
          const bTh = thresholdText(b);
          const aUnit = String(ac.unit || "").trim();
          const bUnit = String(bc.unit || "").trim();
          const aVersion = String(((a.evidence as Record<string, unknown> | undefined)?.version) || "").trim();
          const bVersion = String(((b.evidence as Record<string, unknown> | undefined)?.version) || "").trim();
          const aNormRef = String(a.normRef || "").trim();
          const bNormRef = String(b.normRef || "").trim();
          const condition = key.split("@@")[1] || "global";
          const slotKey = key.split("@@")[0] || "";
          const mk = (t: SemanticConflictType): SemanticConflictRow => ({
            conflict_id: `conflict:${t}:${slotKey}:${condition}:${i}:${j}`,
            slotKey,
            condition,
            conflict_type: t,
            left_specir_id: String(a.specir_id || a.component_id || `specir-${i}`),
            right_specir_id: String(b.specir_id || b.component_id || `specir-${j}`),
            left_normRef: aNormRef,
            right_normRef: bNormRef,
            left_operator: aOp,
            right_operator: bOp,
            left_threshold: aTh,
            right_threshold: bTh,
            left_unit: aUnit,
            right_unit: bUnit,
            left_version: aVersion,
            right_version: bVersion,
            override_required: true,
          });
          if (aNormRef && bNormRef && aNormRef === bNormRef && aOp === bOp && aTh === bTh && aUnit === bUnit) {
            rows.push(mk("duplicate_rule"));
            continue;
          }
          if (aUnit && bUnit && aUnit !== bUnit) rows.push(mk("unit_conflict"));
          if (aVersion && bVersion && aVersion !== bVersion) rows.push(mk("version_conflict"));
          if (aOp !== bOp) rows.push(mk("threshold_conflict"));
          if (aTh !== bTh) rows.push(mk("threshold_conflict"));
          const aNum = parseNumeric(aTh);
          const bNum = parseNumeric(bTh);
          if (aOp === bOp && aNum !== null && bNum !== null && aNum !== bNum) {
            rows.push(mk("stricter_rule_override"));
          }
        }
      }
    });
    const bySlot = new Map<string, Array<Record<string, unknown>>>();
    items.forEach((raw) => {
      const it = raw as Record<string, unknown>;
      const slot = String(it.slotKey || "").trim().toLowerCase();
      if (!slot) return;
      if (!bySlot.has(slot)) bySlot.set(slot, []);
      bySlot.get(slot)?.push(it);
    });
    bySlot.forEach((group, slotKey) => {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const a = group[i];
          const b = group[j];
          const condA = String(a.condition || "").trim().toLowerCase() || "global";
          const condB = String(b.condition || "").trim().toLowerCase() || "global";
          if (condA === condB) continue;
          const ac = (a.constraint && typeof a.constraint === "object") ? (a.constraint as Record<string, unknown>) : {};
          const bc = (b.constraint && typeof b.constraint === "object") ? (b.constraint as Record<string, unknown>) : {};
          const aTh = thresholdText(a);
          const bTh = thresholdText(b);
          if (String(ac.operator || "").trim() !== String(bc.operator || "").trim() || aTh !== bTh) {
            rows.push({
              conflict_id: `conflict:scope_conflict:${slotKey}:${i}:${j}`,
              slotKey,
              condition: `${condA} <> ${condB}`,
              conflict_type: "scope_conflict",
              left_specir_id: String(a.specir_id || a.component_id || `specir-${i}`),
              right_specir_id: String(b.specir_id || b.component_id || `specir-${j}`),
              left_normRef: String(a.normRef || ""),
              right_normRef: String(b.normRef || ""),
              left_operator: String(ac.operator || ""),
              right_operator: String(bc.operator || ""),
              left_threshold: aTh,
              right_threshold: bTh,
              left_unit: String(ac.unit || ""),
              right_unit: String(bc.unit || ""),
              left_version: String(((a.evidence as Record<string, unknown> | undefined)?.version) || ""),
              right_version: String(((b.evidence as Record<string, unknown> | undefined)?.version) || ""),
              override_required: true,
            });
          }
        }
      }
    });
    const unique = new Map<string, SemanticConflictRow>();
    rows.forEach((r) => {
      const k = `${r.conflict_type}:${r.slotKey}:${r.condition}:${r.left_specir_id}:${r.right_specir_id}`;
      if (!unique.has(k)) unique.set(k, r);
    });
    return Array.from(unique.values());
  }, [specirDoc]);
  const unresolvedSemanticConflicts = useMemo(
    () => semanticConflicts.filter((x) => !conflictOverrideById[x.conflict_id]),
    [semanticConflicts, conflictOverrideById],
  );
  const publishBlockedBySemanticConflict = unresolvedSemanticConflicts.length > 0;
  const SLOT_KEY_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){3}$/;
  const specirSlotByComponentId = useMemo(() => {
    const out: Record<string, string> = {};
    const items = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    items.forEach((it) => {
      const cid = String((it as { component_id?: unknown }).component_id || "").trim();
      const sk = String((it as { slotKey?: unknown }).slotKey || "").trim();
      if (cid && sk && !out[cid]) out[cid] = sk;
    });
    return out;
  }, [specirDoc]);
  const specirSlotBySpecirId = useMemo(() => {
    const out: Record<string, string> = {};
    const items = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    items.forEach((it) => {
      const sid = String((it as { specir_id?: unknown }).specir_id || "").trim();
      const sk = String((it as { slotKey?: unknown }).slotKey || "").trim();
      if (sid && sk && !out[sid]) out[sid] = sk;
    });
    return out;
  }, [specirDoc]);
  const specirExecBySpecirId = useMemo(() => {
    const out: Record<string, string> = {};
    const items = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    items.forEach((it) => {
      const sid = String((it as { specir_id?: unknown }).specir_id || "").trim();
      const es = String((it as { execution_status?: unknown }).execution_status || "").trim().toLowerCase();
      if (sid && es && !out[sid]) out[sid] = es;
    });
    return out;
  }, [specirDoc]);
  const specirExecByComponentId = useMemo(() => {
    const out: Record<string, string> = {};
    const items = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    items.forEach((it) => {
      const cid = String((it as { component_id?: unknown }).component_id || "").trim();
      const es = String((it as { execution_status?: unknown }).execution_status || "").trim().toLowerCase();
      if (cid && es && !out[cid]) out[cid] = es;
    });
    return out;
  }, [specirDoc]);
  const manualAssetApprovedCount = useMemo(() => {
    if (assetReviewSummaryFromApi) return Number(assetReviewSummaryFromApi.approved || 0);
    const rows = (artifactPipelineAudit as { manual_reviews?: unknown } | null)?.manual_reviews;
    if (!Array.isArray(rows)) return 0;
    const latestDecisionByKey = new Map<string, string>();
    rows.forEach((x) => {
      const objectType = String((x as { object_type?: unknown })?.object_type || "").toLowerCase();
      const objectId = String((x as { object_id?: unknown })?.object_id || "").trim();
      if (!objectType || !objectId) return;
      const decision = String((x as { decision?: unknown })?.decision || "").toLowerCase();
      latestDecisionByKey.set(`${objectType}:${objectId}`, decision);
    });
    return Array.from(latestDecisionByKey.values()).filter((decision) => decision === "approve" || decision === "approved").length;
  }, [artifactPipelineAudit, assetReviewSummaryFromApi]);
  const manualAssetDecisionByKey = useMemo(() => {
    const rows = (artifactPipelineAudit as { manual_reviews?: unknown } | null)?.manual_reviews;
    const map: Record<string, string> = {};
    if (!Array.isArray(rows)) return map;
    rows.forEach((x) => {
      const objectType = String((x as { object_type?: unknown })?.object_type || "").toLowerCase();
      const objectId = String((x as { object_id?: unknown })?.object_id || "").trim();
      if (!objectType || !objectId) return;
      map[`${objectType}:${objectId}`] = String((x as { decision?: unknown })?.decision || "").toLowerCase();
    });
    return { ...map, ...assetReviewLatestByKeyFromApi };
  }, [artifactPipelineAudit, assetReviewLatestByKeyFromApi]);
  const reviewedSpecirIdSet = useMemo(() => {
    const out = new Set<string>();
    Object.entries(manualAssetDecisionByKey).forEach(([k, v]) => {
      const key = String(k || "").trim();
      const decision = String(v || "").toLowerCase();
      if (!key.startsWith("specir:")) return;
      if (decision === "approve" || decision === "approved") out.add(key.slice("specir:".length));
    });
    return out;
  }, [manualAssetDecisionByKey]);

  const normalizedRuleRows = useMemo(() => artifactRules.map((rule, index) => {
    const condition = ((rule as { condition?: unknown }).condition && typeof (rule as { condition?: unknown }).condition === "object")
      ? ((rule as { condition?: Record<string, unknown> }).condition || {})
      : {};
    const rawField = String((rule as { field?: unknown }).field || condition.field || "").trim();
    const componentId = String((rule as { component_id?: unknown }).component_id || "").trim();
    const sourceSpecirId = String((rule as { source_specir_id?: unknown }).source_specir_id || (rule as { specir_id?: unknown }).specir_id || "").trim();
    const slotKey = String(
      (rule as { slot_key?: unknown }).slot_key
      || (rule as { slotKey?: unknown }).slotKey
      || condition.slot_key
      || condition.slotKey
      || specirSlotBySpecirId[sourceSpecirId]
      || specirSlotByComponentId[componentId]
      || "",
    ).trim();
    const slotValid = SLOT_KEY_RE.test(slotKey);
    const field = slotValid ? slotKey : "";
    const opRaw = String((rule as { operator?: unknown }).operator || condition.operator || "").trim();
    const op = opRaw === "between" || opRaw === ">=" || opRaw === "<=" ? opRaw : (opRaw || "-");
    const min = (rule as { min?: unknown }).min ?? condition.min ?? condition.value ?? null;
    const max = (rule as { max?: unknown }).max ?? condition.max ?? null;
    const value = (rule as { value?: unknown }).value ?? condition.value ?? null;
    const unit = String((rule as { unit?: unknown }).unit || condition.unit || "").trim();
    const normRef = String((rule as { norm_ref?: unknown }).norm_ref || "").trim();
    const explicitSemanticStatus = normalizeSemanticStatus((rule as { semantic_status?: unknown }).semantic_status);
    const explicitExecutionStatus = normalizeExecutionStatus((rule as { execution_status?: unknown }).execution_status);
    const specirExecutionRaw = String(
      specirExecBySpecirId[sourceSpecirId]
      || specirExecByComponentId[componentId]
      || "",
    ).trim().toLowerCase();
    const specirExecution = normalizeExecutionStatus(specirExecutionRaw);
    const hasThreshold = min !== null || max !== null || value !== null;
    const fromNormRef = normRef.length > 0 && normRefAddressSet.has(normRef);
    const evidence = normRef ? normRefEvidenceMap[normRef] : undefined;
    const semanticStatus: SemanticStatus = explicitSemanticStatus;
    const executionStatus: ExecutionStatus = explicitExecutionStatus
      || (
        (!slotValid)
          ? "needs_slot"
          : ((op === "-")
            ? "needs_formula"
            : ((!hasThreshold && op !== "exists")
            ? "needs_formula"
            : ((!normRef || !fromNormRef)
              ? "needs_runtime"
              : "executable")))
      );
    const semanticUnresolved = semanticUnresolvedSet.has(semanticStatus);
    const sourceFromSpecir = Boolean(sourceSpecirId || componentId);
    const specirAllowsRule = specirExecution === "executable" || specirExecution === "partial_executable";
    const hasPendingTask = executionStatus === "needs_slot" || executionStatus === "needs_formula" || executionStatus === "needs_runtime";
    const rejectedBySpecir = !sourceFromSpecir || (specirExecution === "not_executable");
    let ruleStatus: "ready" | "partial" | "pending" | "blocked" | "rejected" = "pending";
    if (rejectedBySpecir || semanticStatus === "rejected") {
      ruleStatus = "rejected";
    } else if (!sourceFromSpecir || !specirAllowsRule || executionStatus === "not_executable") {
      ruleStatus = "blocked";
    } else if (hasPendingTask) {
      ruleStatus = "pending";
    } else {
      const fullyReady = slotValid
        && field.length > 0
        && normRef.length > 0
        && fromNormRef
        && op !== "-"
        && (op === "exists" || hasThreshold);
      ruleStatus = fullyReady && !semanticUnresolved ? "ready" : "partial";
    }
    return {
      id: String((rule as { rule_id?: unknown }).rule_id || `rule-${index}`).trim() || `rule-${index}`,
      specir_id: sourceSpecirId || "-",
      source_from_specir: sourceFromSpecir,
      specir_execution_status: specirExecution || "-",
      specir_allows_rule: specirAllowsRule,
      field: field || "-",
      slotKey: slotKey || "-",
      slotValid,
      debugField: rawField || "-",
      op,
      min,
      max,
      value,
      unit: unit || "-",
      normRef,
      semanticStatus,
      executionStatus,
      semanticUnresolved,
      ruleStatus,
      pendingTask: hasPendingTask ? executionStatus : "",
      fromNormRef,
      hasThreshold,
      sourceText: String(evidence?.sourceText || "").trim(),
      pageNo: Number(evidence?.pageNo || 0) || 0,
    };
  }), [artifactRules, normRefAddressSet, normRefEvidenceMap, specirExecByComponentId, specirExecBySpecirId, specirSlotByComponentId, specirSlotBySpecirId]);
  const visibleRuleRows = useMemo(
    () => normalizedRuleRows.filter((r) => {
      const sid = String((r as { specir_id?: unknown }).specir_id || "").trim();
      return Boolean(sid && reviewedSpecirIdSet.has(sid));
    }),
    [normalizedRuleRows, reviewedSpecirIdSet],
  );
  const normalizedRuleCount = normalizedRuleRows.length;
  const filteredRuleRows = useMemo(() => visibleRuleRows.filter((r) => {
    if (ruleListFilter === "ready") return r.ruleStatus === "ready";
    if (ruleListFilter === "partial") return r.ruleStatus === "partial";
    if (ruleListFilter === "pending") return r.ruleStatus === "pending";
    if (ruleListFilter === "blocked") return r.ruleStatus === "blocked";
    if (ruleListFilter === "rejected") return r.ruleStatus === "rejected";
    return true;
  }), [visibleRuleRows, ruleListFilter]);
  const RULE_ROW_HEIGHT = 76;
  const RULE_LIST_VIEWPORT_HEIGHT = 420;
  const RULE_LIST_OVERSCAN = 6;
  const ruleVisibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(ruleListScrollTop / RULE_ROW_HEIGHT) - RULE_LIST_OVERSCAN);
    const visibleCount = Math.ceil(RULE_LIST_VIEWPORT_HEIGHT / RULE_ROW_HEIGHT) + RULE_LIST_OVERSCAN * 2;
    const endIndex = Math.min(filteredRuleRows.length, startIndex + visibleCount);
    return { startIndex, endIndex };
  }, [ruleListScrollTop, filteredRuleRows.length]);
  const virtualRuleRows = useMemo(
    () => filteredRuleRows.slice(ruleVisibleRange.startIndex, ruleVisibleRange.endIndex),
    [filteredRuleRows, ruleVisibleRange.startIndex, ruleVisibleRange.endIndex],
  );
  useEffect(() => {
    if (!filteredRuleRows.length) {
      if (ruleDetailId) setRuleDetailId("");
      return;
    }
    if (!ruleDetailId || !filteredRuleRows.some((r) => r.id === ruleDetailId)) {
      setRuleDetailId(filteredRuleRows[0].id);
    }
  }, [filteredRuleRows, ruleDetailId]);
  const selectedRuleRow = useMemo(
    () => visibleRuleRows.find((r) => r.id === ruleDetailId) || null,
    [visibleRuleRows, ruleDetailId],
  );
  const ruleWithNormRefCountDisplay = visibleRuleRows.filter((r) => r.normRef.length > 0).length;
  const unresolvedRuleCountDisplay = visibleRuleRows.filter((r) => r.semanticUnresolved).length;
  const ruleReadyCountDisplay = visibleRuleRows.filter((r) => r.ruleStatus === "ready").length;
  const rulePartialCountDisplay = visibleRuleRows.filter((r) => r.ruleStatus === "partial").length;
  const rulePendingCountDisplay = visibleRuleRows.filter((r) => r.ruleStatus === "pending").length;
  const ruleBlockedCountDisplay = visibleRuleRows.filter((r) => r.ruleStatus === "blocked").length;
  const ruleRejectedCountDisplay = visibleRuleRows.filter((r) => r.ruleStatus === "rejected").length;
  const unresolvedRuleReasonStats = useMemo(() => {
    const reasonCountMap = new Map<string, number>();
    const addReason = (reason: string) => {
      reasonCountMap.set(reason, (reasonCountMap.get(reason) || 0) + 1);
    };
    visibleRuleRows.forEach((row) => {
      if (!row.semanticUnresolved) return;
      if (row.semanticStatus === "ambiguous") addReason("语义歧义（ambiguous）");
      if (row.semanticStatus === "conflicted") addReason("语义冲突（conflicted）");
      if (row.semanticStatus === "rejected") addReason("语义拒绝（rejected）");
    });
    return Array.from(reasonCountMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [visibleRuleRows]);
  const ruleStructurallyCompleteCount = normalizedRuleRows.filter((r) =>
    r.id.length > 0
    && r.slotValid
    && r.field !== "-"
    && (r.op === "between" || r.op === ">=" || r.op === "<=" || r.op === ">" || r.op === "<" || r.op === "==" || r.op === "!=")
    && r.unit !== "-"
    && r.hasThreshold
    && r.normRef.length > 0
    && r.fromNormRef,
  ).length;
  const ruleHardInvalidCount = normalizedRuleRows.filter((r) => !(
    r.id.length > 0
    && r.slotValid
    && r.field !== "-"
    && (r.op === "between" || r.op === ">=" || r.op === "<=" || r.op === ">" || r.op === "<" || r.op === "==" || r.op === "!=")
    && r.unit !== "-"
    && r.hasThreshold
    && r.normRef.length > 0
    && r.fromNormRef
  )).length;
  const ruleIsomorphicReady = normRefCount > 0
    && normalizedRuleCount > 0
    && ruleReadyCountDisplay === normalizedRuleCount
    && ruleHardInvalidCount === 0
    && unresolvedRuleCountDisplay === 0;
  const ruleAssetState: WorkflowState = normalizedRuleCount <= 0
    ? "partial"
    : ruleRejectedCountDisplay > 0 || ruleBlockedCountDisplay > 0 || rulePendingCountDisplay > 0 || rulePartialCountDisplay > 0
      ? "partial"
      : ruleReadyCountDisplay === normalizedRuleCount
        ? "completed"
        : "partial";
  const emptyRuleReason = normRefCount <= 0
    ? "依赖 normRef，当前 normRef_count=0"
    : `Rule 未满足可执行约束（需引用 SpecIR.execution_status；not_executable/needs_slot/needs_formula/needs_runtime 不计语义错误）`;
  const renderRuleExpr = (row: { field: string; op: string; min: unknown; max: unknown; unit: string }): string => {
    const fieldLabel = row.field || "-";
    const unitLabel = row.unit && row.unit !== "-" ? ` ${row.unit}` : "";
    if (row.op === "between") {
      return `${fieldLabel} ∈ [${String(row.min ?? "-")}, ${String(row.max ?? "-")}]${unitLabel}`;
    }
    if (row.op === ">=" || row.op === "<=") {
      return `${fieldLabel} ${row.op} ${String(row.min ?? row.max ?? "-")}${unitLabel}`;
    }
    return `${fieldLabel} ${row.op || "-"} ${String(row.min ?? row.max ?? "-")}${unitLabel}`;
  };
  const explainRuleNatural = (row: { field: string; op: string; value?: unknown; min: unknown; max: unknown; unit: string }): string => {
    const fieldLabel = row.field || "该字段";
    const unit = row.unit && row.unit !== "-" ? row.unit : "";
    const value = row.value ?? row.min ?? row.max ?? "-";
    const valueText = `${String(value)}${unit}`;
    const op = String(row.op || "").toLowerCase();
    if (op === "exists") return `必须存在测量值（${fieldLabel}）`;
    if (op === "between" || op === "range") return `${fieldLabel} 必须在 ${String(row.min ?? "-")} 到 ${String(row.max ?? "-")}${unit} 范围内`;
    if (op === ">=" || op === "gte") return `${fieldLabel} 必须大于等于 ${valueText}`;
    if (op === "<=" || op === "lte") return `${fieldLabel} 必须小于等于 ${valueText}`;
    if (op === ">" || op === "gt") return `${fieldLabel} 必须大于 ${valueText}`;
    if (op === "<" || op === "lt") return `${fieldLabel} 必须小于 ${valueText}`;
    if (op === "==" || op === "eq") return `${fieldLabel} 必须等于 ${valueText}`;
    if (op === "!=" || op === "neq") return `${fieldLabel} 必须不等于 ${valueText}`;
    return `${fieldLabel} 需满足条件：${row.op || "-"} ${valueText}`;
  };
  const structuredRuleCount = normalizedRuleRows.filter((r) =>
    r.field !== "-"
    && (r.op === "between" || r.op === ">=" || r.op === "<=")
    && r.normRef.length > 0,
  ).length;
  const normalizedRuleById = useMemo(() => {
    const map: Record<string, (typeof normalizedRuleRows)[number]> = {};
    normalizedRuleRows.forEach((row) => { map[row.id] = row; });
    return map;
  }, [normalizedRuleRows]);
  const specirPendingTasks = useMemo(() => {
    const items = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    const linkedSpecirIds = new Set(
      visibleRuleRows
        .map((r) => String((r as { specir_id?: unknown }).specir_id || "").trim())
        .filter(Boolean),
    );
    return items
      .map((it, idx) => {
        const sid = String((it as { specir_id?: unknown }).specir_id || "").trim() || `specir-${idx}`;
        const es = normalizeExecutionStatus((it as { execution_status?: unknown }).execution_status);
        if (!(es === "needs_slot" || es === "needs_formula" || es === "needs_runtime")) return null;
        if (linkedSpecirIds.has(sid)) return null;
        return {
          id: `pending-${sid}`,
          specir_id: sid,
          pending_task: es,
          normRef: String((it as { normRef?: unknown }).normRef || "").trim() || "-",
          slotKey: String((it as { slotKey?: unknown }).slotKey || "").trim() || "-",
          sourceText: String((it as { evidence?: { original_text?: unknown } }).evidence?.original_text || (it as { summary?: unknown }).summary || "").trim() || "-",
        };
      })
      .filter(Boolean) as Array<{ id: string; specir_id: string; pending_task: string; normRef: string; slotKey: string; sourceText: string }>;
  }, [visibleRuleRows, specirDoc]);
  const normalizedRuleReadyById = useMemo(() => {
    const map: Record<string, boolean> = {};
    normalizedRuleRows.forEach((row) => {
      map[row.id] = row.ruleStatus === "ready";
    });
    return map;
  }, [normalizedRuleRows]);
  const readyRuleCount = useMemo(
    () => normalizedRuleRows.filter((row) => row.ruleStatus === "ready").length,
    [normalizedRuleRows],
  );
  const normalizedGateRows = useMemo(() => artifactGates.map((gate, idx) => {
    const gateId = String((gate as { gate_id?: unknown }).gate_id || `gate-${idx}`).trim() || `gate-${idx}`;
    const logicRaw = String((gate as { logic?: unknown }).logic || "").trim().toUpperCase();
    const logic = logicRaw === "AND" || logicRaw === "OR" || logicRaw === "ANY" || logicRaw === "ALL"
      ? logicRaw
      : "AND";
    const decisionRaw = String(
      (gate as { decision?: unknown }).decision
      || (gate as { pass_condition?: unknown }).pass_condition
      || (gate as { result?: unknown }).result
      || "pass",
    ).trim().toLowerCase();
    const decision = decisionRaw === "pass" || decisionRaw === "fail" || decisionRaw === "blocked"
      ? decisionRaw
      : "blocked";
    const ids = Array.isArray((gate as { rules?: unknown }).rules)
      ? ((gate as { rules?: unknown[] }).rules || [])
      : (Array.isArray((gate as { rule_ids?: unknown }).rule_ids) ? ((gate as { rule_ids?: unknown[] }).rule_ids || []) : []);
    const ruleRefs = ids.map((x) => String(x || "").trim()).filter(Boolean);
    const ruleRows = ruleRefs.map((id) => normalizedRuleById[id]).filter(Boolean);
    const readyRefs = ruleRefs.filter((id) => {
      const rr = normalizedRuleById[id];
      return Boolean(rr) && rr.ruleStatus === "ready";
    });
    const pendingRefs = ruleRefs.filter((id) => {
      const rr = normalizedRuleById[id];
      return Boolean(rr) && rr.ruleStatus === "pending";
    });
    const partialRefs = ruleRefs.filter((id) => {
      const rr = normalizedRuleById[id];
      return Boolean(rr) && rr.ruleStatus === "partial";
    });
    const blockedRefs = ruleRefs.filter((id) => {
      const rr = normalizedRuleById[id];
      return Boolean(rr) && (rr.ruleStatus === "blocked" || rr.ruleStatus === "rejected" || rr.ruleStatus === "pending");
    });
    const coverRules = ruleRefs.length > 0 && ruleRows.length === ruleRefs.length;
    const allRuleReady = ruleRefs.length > 0 && readyRefs.length === ruleRefs.length;
    const gateSchemaValid = gateId.length > 0
      && (logic === "AND" || logic === "OR" || logic === "ANY" || logic === "ALL")
      && ruleRefs.length > 0
      && (decision === "pass" || decision === "fail" || decision === "blocked");
    let gateStatus: "ready" | "partial" | "blocked" | "rejected" = "blocked";
    if (!gateSchemaValid || ruleRefs.length <= 0 || !coverRules) {
      gateStatus = "blocked";
    } else if (blockedRefs.length > 0) {
      gateStatus = "blocked";
    } else if (partialRefs.length > 0 || !allRuleReady) {
      gateStatus = "partial";
    } else {
      gateStatus = "ready";
    }
    const onPass = String((gate as { on_pass?: unknown }).on_pass || "allow").trim() || "allow";
    const onFail = String((gate as { on_fail?: unknown }).on_fail || "block").trim() || "block";
    const confidenceRaw = Number((gate as { confidence?: unknown }).confidence);
    const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : (gateStatus === "ready" ? 0.95 : gateStatus === "partial" ? 0.75 : 0.55);
    const evidenceRefs = ruleRows
      .map((r) => String(r.normRef || "").trim())
      .filter(Boolean);
    const blockedRootCauseSet = new Set<string>();
    ruleRows.forEach((rr) => {
      if (rr.executionStatus === "needs_slot") blockedRootCauseSet.add("missing slot");
      if (rr.executionStatus === "needs_formula") blockedRootCauseSet.add("unresolved formula");
      if (rr.executionStatus === "needs_runtime") blockedRootCauseSet.add("runtime missing");
      if (rr.ruleStatus === "pending" || rr.ruleStatus === "partial") blockedRootCauseSet.add("manual review required");
      const conf = Number((rr as { confidence?: unknown }).confidence);
      if (Number.isFinite(conf) && conf < 0.5) blockedRootCauseSet.add("low confidence");
    });
    if (ruleRefs.length <= 0) blockedRootCauseSet.add("manual review required");
    return {
      gateId,
      logic,
      decision,
      ruleRefs,
      ruleRows,
      pendingRefs,
      partialRefs,
      blockedRefs,
      coverRules,
      allRuleReady,
      gateSchemaValid,
      gateStatus,
      onPass,
      onFail,
      confidence,
      evidenceRefs,
      blockedRootCauses: Array.from(blockedRootCauseSet),
    };
  }), [artifactGates, normalizedRuleById, normalizedRuleReadyById]);
  const gateCoverRules = normalizedGateRows.length > 0 && normalizedGateRows.every((g) => g.coverRules);
  const gateCountDisplay = normalizedGateRows.length;
  const readyGateCountDisplay = normalizedGateRows.filter((g) => g.gateStatus === "ready").length;
  const partialGateCountDisplay = normalizedGateRows.filter((g) => g.gateStatus === "partial").length;
  const blockedGateCountDisplay = normalizedGateRows.filter((g) => g.gateStatus === "blocked").length;
  const blockedGateCountByPublishRule = useMemo(() => {
    const ruleIdSet = new Set(
      normalizedRuleRows
        .map((row) => String(row.id || "").trim())
        .filter(Boolean),
    );
    let blocked = 0;
    normalizedGateRows.forEach((gate) => {
      if (gate.ruleRefs.length <= 0) {
        blocked += 1;
        return;
      }
      if (gate.ruleRefs.some((rid) => !ruleIdSet.has(String(rid || "").trim()))) {
        blocked += 1;
      }
    });
    return blocked;
  }, [normalizedGateRows, normalizedRuleRows]);
  const gateIsomorphicReady = readyRuleCount > 0
    && normalizedGateRows.length > 0
    && normalizedGateRows.every((g) => g.gateStatus === "ready");
  const normDocIsomorphicReady = gateIsomorphicReady && normdocByArtifactsValid;
  const gateFullyReady = normalizedGateRows.length > 0 && normalizedGateRows.every((g) => g.gateStatus === "ready");
  const gateAssetStateDisplay: WorkflowState = normalizedGateRows.length <= 0
    ? "failed"
    : gateFullyReady
      ? "completed"
      : "partial";
  const confidenceSummary = useMemo(() => {
    const empty = { high: 0, medium: 0, low: 0 };
    const bump = (bucket: { high: number; medium: number; low: number }, confidence: number) => {
      const lv = confidenceLevelOf(confidence);
      bucket[lv] += 1;
    };
    const docIR = { ...empty };
    artifactClauseTreeNodes.forEach((x) => bump(docIR, normalizeConfidence((x as { confidence?: unknown }).confidence, 0.88)));
    const catalog = { ...empty };
    artifactCatalogNodes.forEach((x) => bump(catalog, normalizeConfidence((x as { confidence?: unknown }).confidence, 0.87)));
    const normRef = { ...empty };
    normalizedNormRefRows.forEach((x) => bump(normRef, normalizeConfidence((x as { confidence?: unknown }).confidence, x.status === "ok" ? 0.86 : 0.68)));
    const specIR = { ...empty };
    (Array.isArray(specirDoc?.items) ? specirDoc.items : []).forEach((x) => bump(specIR, normalizeConfidence((x as { confidence?: unknown }).confidence, 0.84)));
    const rule = { ...empty };
    normalizedRuleRows.forEach((x) => bump(rule, normalizeConfidence((x as { confidence?: unknown }).confidence, x.ruleStatus === "ready" ? 0.9 : 0.72)));
    const gate = { ...empty };
    normalizedGateRows.forEach((x) => bump(gate, normalizeConfidence((x as { confidence?: unknown }).confidence, x.gateStatus === "ready" ? 0.9 : 0.7)));
    const component = { ...empty };
    normalizedComponentRows.forEach((x) => bump(component, normalizeConfidence((x as { confidence?: unknown }).confidence, Number((x as { stability_score?: unknown }).stability_score ?? 0.82))));
    const lowTotal = docIR.low + catalog.low + normRef.low + specIR.low + rule.low + gate.low + component.low;
    const mediumTotal = docIR.medium + catalog.medium + normRef.medium + specIR.medium + rule.medium + gate.medium + component.medium;
    const highTotal = docIR.high + catalog.high + normRef.high + specIR.high + rule.high + gate.high + component.high;
    return {
      docIR,
      catalog,
      normRef,
      specIR,
      rule,
      gate,
      component,
      totals: { high: highTotal, medium: mediumTotal, low: lowTotal },
      lowRemainingBeforePublish: lowTotal,
    };
  }, [
    artifactCatalogNodes,
    artifactClauseTreeNodes,
    normalizedComponentRows,
    normalizedGateRows,
    normalizedNormRefRows,
    normalizedRuleRows,
    specirDoc,
  ]);
  const emptyGateReason = readyRuleCount <= 0
    ? `依赖 Rule（由 SpecIR.execution_status 驱动），当前 executable 规则数=0；SpecIR execution 分布: executable=${specirExecutionStatusSummary.executable}, partial_executable=${specirExecutionStatusSummary.partial_executable}, not_executable=${specirExecutionStatusSummary.not_executable}, needs_slot=${specirExecutionStatusSummary.needs_slot}, needs_formula=${specirExecutionStatusSummary.needs_formula}, needs_runtime=${specirExecutionStatusSummary.needs_runtime}`
    : "Gate 未满足硬约束（gate_id/logic/rule_refs/decision，且关联 Rule 必须 ready）";
  const publishBlockers = useMemo(() => {
    const reasons: string[] = [];
    if (publishBlockedBySemanticConflict) {
      reasons.push(`存在语义冲突 ${unresolvedSemanticConflicts.length} 项（未 override）`);
    }
    if (!ruleIsomorphicReady) {
      reasons.push("Rule 未满足同构约束（必须由 normRef 完整生成）");
    }
    if (!gateIsomorphicReady) {
      reasons.push("Gate 未满足同构约束（只能由 Rule 组合生成）");
    }
    if ((unresolvedPendingRuleCount + unresolvedPendingGateCount) > 0) {
      reasons.push(`存在 unresolved 条目（Rule ${unresolvedPendingRuleCount} / Gate ${unresolvedPendingGateCount}）`);
    }
    if (!normDocIsomorphicReady) {
      reasons.push(`NormDoc 无效（${normdocInvalidCoreReasons.join("；")}）`);
    }
    if (!normdocPublishable) {
      reasons.push("NormDoc publishable=false");
    }
    if (!normdocReadyToPublish) {
      reasons.push(`NormDoc 状态非 ready_to_publish（${normDocMeta.status || "-"})`);
    }
    return reasons;
  }, [
    ruleIsomorphicReady,
    gateIsomorphicReady,
    unresolvedPendingRuleCount,
    unresolvedPendingGateCount,
    normDocIsomorphicReady,
    normdocInvalidCoreReasons,
    normdocPublishable,
    normdocReadyToPublish,
    normDocMeta.status,
    publishBlockedBySemanticConflict,
    unresolvedSemanticConflicts.length,
  ]);
  const buildSuccessMetrics = useMemo(() => {
    const unresolvedCount = Number(unresolvedPendingRuleCount) + Number(unresolvedPendingGateCount);
    const ruleCount = Number(normalizedRuleCount);
    const gateCount = Number(normalizedGateRows.length);
    const publishable = Boolean(normDocMeta.publishable);
    const normdocValid = Boolean(normdocCoreValid);
    const success = Boolean(
      normRefCount > 0
      && ruleCount > 0
      && gateCount > 0
      && normdocValid
      && publishable,
    );
    return {
      success,
      normRefCount,
      ruleCount,
      gateCount,
      unresolvedCount,
      normdocStatus: normdocValid ? "valid" : "invalid",
      publishable,
    };
  }, [
    normRefCount,
    normalizedRuleCount,
    normalizedGateRows.length,
    unresolvedPendingRuleCount,
    unresolvedPendingGateCount,
    normdocCoreValid,
    normDocMeta.publishable,
  ]);
  const explainRuleGeneration = (status: string): string => {
    if (status === "no_norm_ref") return "未生成 normRef（Catalog 未建立）。";
    if (status === "parse_failed") return "解析失败（未建立可执行规则结构）。";
    if (status === "unresolved_high") return "unresolved 比例过高（规则可执行性不足）。";
    return "规则资产尚未建立。";
  };
  const explainGateGeneration = (status: string): string => {
    if (status === "no_rules") return "无可用 Rule。";
    if (status === "rules_not_executable") return "无可执行 Rule。";
    return "Gate 资产尚未建立。";
  };
  const missingJobTip = "请先完成规范输入（PDF 或 normRef）";
  const classificationByClauseId = useMemo(() => {
    const map: Record<string, ArtifactClauseClassification> = {};
    for (const row of artifactClassifications) {
      const clauseId = String(row.clause_id || "").trim();
      if (clauseId) map[clauseId] = row;
    }
    return map;
  }, [artifactClassifications]);
  const clauseNodeById = useMemo(() => {
    const map: Record<string, ArtifactClauseNode> = {};
    for (const row of artifactClauseTreeNodes) {
      const clauseId = String(row.clause_id || "").trim();
      if (clauseId) map[clauseId] = row;
    }
    return map;
  }, [artifactClauseTreeNodes]);
  const ruleCandidateByClauseId = useMemo(() => {
    const map: Record<string, RuleCandidate> = {};
    for (const candidate of reviewCandidates) {
      const clauseId = String(candidate.clause_id || "").trim() || String(resolveClauseNo(candidate) || "").trim();
      if (!clauseId || map[clauseId]) continue;
      map[clauseId] = candidate;
    }
    return map;
  }, [reviewCandidates]);
  const assetReviewRows = useMemo<AssetReviewRow[]>(() => {
    const rows: AssetReviewRow[] = [];
    const specItems = Array.isArray(specirDoc?.items) ? specirDoc.items : [];
    for (const item of specItems) {
      const executionStatus = String((item as { execution_status?: unknown }).execution_status || "").trim().toLowerCase();
      if (!(executionStatus === "executable" || executionStatus === "partial_executable")) continue;
      const specirId = String((item as { specir_id?: unknown }).specir_id || (item as { component_id?: unknown }).component_id || "").trim();
      if (!specirId) continue;
      const normRef = String((item as { normRef?: unknown }).normRef || "").trim();
      const slotKey = String((item as { slotKey?: unknown }).slotKey || "").trim();
      const sourceText = String(
        (item as { source_text?: unknown }).source_text
        || ((item as { evidence?: { source_text?: unknown; original_text?: unknown } }).evidence?.source_text)
        || ((item as { evidence?: { original_text?: unknown } }).evidence?.original_text)
        || "",
      ).trim();
      const unit = String(
        ((item as { constraint?: { unit?: unknown } }).constraint?.unit)
        || ((item as { rule?: { unit?: unknown } }).rule?.unit)
        || "",
      ).trim();
      const operator = String(
        ((item as { constraint?: { operator?: unknown } }).constraint?.operator)
        || ((item as { rule?: { op?: unknown } }).rule?.op)
        || "",
      ).trim();
      const threshold = (item as { constraint?: { value?: unknown; min?: unknown; max?: unknown } }).constraint
        || (item as { rule?: { value?: unknown; min?: unknown; max?: unknown } }).rule
        || {};
      const gateLogic = String(
        ((item as { gate?: { logic?: unknown } }).gate?.logic)
        || ((item as { gate_logic?: unknown }).gate_logic)
        || "",
      ).trim();
      const onFail = String(
        ((item as { gate?: { on_fail?: unknown; fail_level?: unknown } }).gate?.on_fail)
        || ((item as { gate?: { fail_level?: unknown } }).gate?.fail_level)
        || "",
      ).trim();
      const formula = String(
        ((item as { constraint?: { formula?: unknown } }).constraint?.formula)
        || ((item as { formula?: unknown }).formula)
        || "",
      ).trim();
      const outputUnit = String(
        ((item as { outputUnit?: unknown }).outputUnit)
        || ((item as { output_unit?: unknown }).output_unit)
        || unit,
      ).trim();
      const normRefOk = Boolean(normRef);
      const sourceTextOk = Boolean(sourceText);
      const slotKeyOk = Boolean(slotKey);
      const unitOk = Boolean(unit);
      const operatorOk = Boolean(operator);
      const thresholdOk = [threshold.value, threshold.min, threshold.max].some((v) => typeof v === "number" || (typeof v === "string" && String(v).trim() !== ""));
      const gateLogicOk = Boolean(gateLogic);
      const onFailOk = Boolean(onFail);
      const formulaRequired = executionStatus === "partial_executable" || /calc|formula|computed/.test(String((item as { semantic_type?: unknown }).semantic_type || "").toLowerCase());
      const formulaOk = !formulaRequired || Boolean(formula);
      const inputs = (item as { inputs?: unknown }).inputs;
      const inputsComplete = !formulaRequired || (Array.isArray(inputs) ? inputs.length > 0 : Boolean(slotKey));
      const outputUnitOk = !formulaRequired || Boolean(outputUnit);
      const specirConfidence = normalizeConfidence((item as { confidence?: unknown }).confidence, executionStatus === "executable" ? 0.9 : 0.82);
      const specirConfidenceLevel = confidenceLevelOf(specirConfidence);
      const checks = [
        `body: normRef(${normRefOk ? "ok" : "missing"}) / source_text(${sourceTextOk ? "ok" : "missing"}) / slotKey(${slotKeyOk ? "ok" : "missing"}) / unit(${unitOk ? "ok" : "missing"})`,
        `gate: operator(${operatorOk ? "ok" : "missing"}) / threshold(${thresholdOk ? "ok" : "missing"}) / logic(${gateLogicOk ? "ok" : "missing"}) / onFail(${onFailOk ? "ok" : "missing"})`,
        `cal: formula_required(${formulaRequired ? "yes" : "no"}) / inputs(${inputsComplete ? "ok" : "missing"}) / formula(${formulaOk ? "ok" : "missing"}) / outputUnit(${outputUnitOk ? "ok" : "missing"})`,
      ].join(" | ");
      const missing = [];
      if (!normRefOk) missing.push("body.normRef");
      if (!sourceTextOk) missing.push("body.source_text");
      if (!slotKeyOk) missing.push("body.slotKey");
      if (!unitOk) missing.push("body.unit");
      if (!operatorOk) missing.push("gate.operator");
      if (!thresholdOk) missing.push("gate.threshold");
      if (!gateLogicOk) missing.push("gate.logic");
      if (!onFailOk) missing.push("gate.onFail");
      if (!inputsComplete) missing.push("cal.inputs");
      if (!formulaOk) missing.push("cal.formula");
      if (!outputUnitOk) missing.push("cal.outputUnit");
      const unclosed = missing.length > 0 || specirConfidenceLevel === "low";
      rows.push({
        assetType: "specir",
        assetId: specirId,
        title: `${String((item as { semantic_type?: unknown }).semantic_type || "specir")} / ${normRef || "-"}`,
        checks,
        changedFields: [
          "body.normRef",
          "body.source_text",
          "body.slotKey",
          "body.unit",
          "gate.operator",
          "gate.threshold",
          "gate.logic",
          "gate.onFail",
          "cal.formula_required",
          "cal.inputs",
          "cal.formula",
          "cal.outputUnit",
          "reviewer_id",
          "reviewer_name",
          "review_status",
          "review_comment",
          "signed_at",
          "signature_hash",
        ],
        unclosed,
        unclosedReason: specirConfidenceLevel === "low" ? `low confidence(${specirConfidence.toFixed(3)}) 需人工校验` : (missing.join(", ") || ""),
        confidence: specirConfidence,
        confidenceLevel: specirConfidenceLevel,
      });
    }
    return rows;
  }, [specirDoc]);
  const filteredAssetReviewRows = useMemo(() => {
    return assetReviewRows.filter((row) => {
      if (onlyUnclosedAssets && !row.unclosed) return false;
      if (assetReviewDecisionFilter === "all") return true;
      const key = `${row.assetType}:${row.assetId}`;
      const decision = String(manualAssetDecisionByKey[key] || "").toLowerCase();
      if (assetReviewDecisionFilter === "unsubmitted") return !decision;
      if (assetReviewDecisionFilter === "approved") return decision === "approve" || decision === "approved";
      if (assetReviewDecisionFilter === "needs_edit") return decision === "needs_edit";
      if (assetReviewDecisionFilter === "rejected") return decision === "reject" || decision === "rejected";
      return true;
    }).sort((a, b) => {
      const rank = (x: { confidenceLevel?: string }) => x.confidenceLevel === "low" ? 0 : (x.confidenceLevel === "medium" ? 1 : 2);
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return Number(a.confidence ?? 1) - Number(b.confidence ?? 1);
    });
  }, [assetReviewRows, assetReviewDecisionFilter, manualAssetDecisionByKey, onlyUnclosedAssets]);

  const assetReviewPendingCount = useMemo(
    () => assetReviewRows.filter((row) => !manualAssetDecisionByKey[`${row.assetType}:${row.assetId}`]).length,
    [assetReviewRows, manualAssetDecisionByKey],
  );
  const reviewCompletionRate = useMemo(() => {
    const total = Number(assetReviewRows.length || 0);
    const completed = Math.max(0, total - Number(assetReviewPendingCount || 0));
    return total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0;
  }, [assetReviewPendingCount, assetReviewRows.length]);
  const publishGate = useMemo(() => {
    const approvedCount = manualAssetApprovedCount;
    const requiredReviewCount = assetReviewRows.length;
    const rejectedCount = Number(assetReviewSummaryFromApi?.rejected || 0);
    const lowConfidencePending = assetReviewRows.filter((row) => {
      if (row.confidenceLevel !== "low") return false;
      const d = String(manualAssetDecisionByKey[`${row.assetType}:${row.assetId}`] || "").toLowerCase();
      return !(d === "approve" || d === "approved");
    }).length;
    const semanticConflictCount = unresolvedSemanticConflicts.length;
    const specirCount = Number(layerOverview.specIR.specirCount || 0);
    const ruleCount = Number(
      normalizedRuleCount
      || buildSuccessMetrics.ruleCount
      || normdocBodyRulesCount
      || 0,
    );
    const gateCount = Number(gateCountDisplay || 0);
    const blockedGateCount = Number(blockedGateCountByPublishRule || 0);

    const schemaValid = Boolean(
      (artifactIndex?.validations?.["07_rules.json"]?.schema_valid ?? artifactIndex?.validations?.["07_rules.json"]?.valid)
      && (artifactIndex?.validations?.["08_gates.json"]?.schema_valid ?? artifactIndex?.validations?.["08_gates.json"]?.valid)
      && (artifactIndex?.validations?.["11_normdoc.json"]?.schema_valid ?? artifactIndex?.validations?.["11_normdoc.json"]?.valid),
    );
    const businessValid = Boolean(
      (artifactIndex?.validations?.["07_rules.json"]?.business_valid ?? artifactIndex?.validations?.["07_rules.json"]?.valid)
      && (artifactIndex?.validations?.["08_gates.json"]?.business_valid ?? artifactIndex?.validations?.["08_gates.json"]?.valid)
      && (artifactIndex?.validations?.["11_normdoc.json"]?.business_valid ?? artifactIndex?.validations?.["11_normdoc.json"]?.valid),
    );
    const formScopeValid = Boolean((rulePackMeta?.form_code || rulePackFormCode || "").trim())
      && (!buildFormType.trim() || String(rulePackMeta?.form_code || rulePackFormCode || "").trim() === buildFormType.trim());
    const noiseCount = Number((artifactPipelineAudit as { metadata_noise_nodes_count?: unknown } | null)?.metadata_noise_nodes_count || 0);
    const truncatedClauseCount = Number(
      ((artifactPipelineAudit as { clause_text_quality?: { possible_truncated_count?: unknown } } | null)?.clause_text_quality?.possible_truncated_count || 0),
    ) || 0;

    const blockers = {
      asset: [] as string[],
      rulegate: [] as string[],
      review: [] as string[],
      audit: [] as string[],
    };
    if (specirCount <= 0) blockers.asset.push("specir_count=0");
    if (lowConfidencePending > 0) blockers.asset.push(`low_confidence_pending=${lowConfidencePending}`);
    if (semanticConflictCount > 0) blockers.asset.push(`semantic_conflict_count=${semanticConflictCount}`);

    if (ruleCount <= 0) blockers.rulegate.push("rule_count=0");
    if (gateCount <= 0) blockers.rulegate.push("gate_count=0");
    if (blockedGateCount > 0) blockers.rulegate.push(`blocked_gate_count=${blockedGateCount}`);

    if (requiredReviewCount !== approvedCount) blockers.review.push(`required_review_count(${requiredReviewCount})!=approved_count(${approvedCount})`);
    if (rejectedCount > 0) blockers.review.push(`rejected_count=${rejectedCount}`);

    if (!schemaValid) blockers.audit.push("rulepack.schema_valid=false");
    if (!businessValid) blockers.audit.push("rulepack.business_valid=false");
    if (!formScopeValid) blockers.audit.push("rulepack.form_scope_valid=false");

    const blocked = blockers.asset.length + blockers.rulegate.length + blockers.review.length + blockers.audit.length > 0;
    return {
      publish_status: (blocked ? "blocked" : "ready") as PublishStatus,
      blockers,
      checks: {
        specir_count: specirCount,
        low_confidence_pending: lowConfidencePending,
        semantic_conflict_count: semanticConflictCount,
        rule_count: ruleCount,
        gate_count: gateCount,
        blocked_gate_count: blockedGateCount,
        required_review_count: requiredReviewCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        schema_valid: schemaValid,
        business_valid: businessValid,
        form_scope_valid: formScopeValid,
        noise_count: noiseCount,
        possible_truncated_clause_text_count: truncatedClauseCount,
      },
    };
  }, [
    manualAssetApprovedCount,
    assetReviewRows,
    assetReviewSummaryFromApi?.rejected,
    manualAssetDecisionByKey,
    unresolvedSemanticConflicts.length,
    layerOverview.specIR.specirCount,
    normalizedRuleCount,
    buildSuccessMetrics.ruleCount,
    normdocBodyRulesCount,
    gateCountDisplay,
    blockedGateCountByPublishRule,
    artifactIndex?.validations,
    artifactPipelineAudit,
    rulePackMeta?.form_code,
    rulePackFormCode,
    buildFormType,
  ]);

  async function submitAssetReviewBatch(rows: AssetReviewRow[], decision: "approve" | "reject" | "needs_edit"): Promise<void> {
    const jobId = selectedJobId.trim();
    if (!jobId) {
      setReviewError("缺少 job_id，无法批量提交资产人工校验。");
      return;
    }
    if (rows.length === 0) {
      setReviewError("当前筛选结果为空，无需批量提交。");
      return;
    }
    setAssetBatchBusy(true);
    setReviewError("");
    setReviewSuccess("");
    try {
      for (const row of rows) {
        const key = `${row.assetType}:${row.assetId}`;
        const response = await fetch(`${endpointBase}/normref/ingest/assets/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: jobId,
            object_type: row.assetType,
            object_id: row.assetId,
            reviewer_id: reviewerId.trim() || "expert.default",
            reviewer_name: reviewerName.trim() || "领域专家",
            decision,
            review_status: decision === "approve" ? "approved" : decision,
            changed_fields: row.changedFields,
            comment: reviewComment.trim(),
          }),
        });
        const payload = await readJsonResponse<Record<string, unknown>>(response);
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, `批量资产人工校验失败（HTTP ${response.status}）`));
        }
        setAssetReviewLatestByKeyFromApi((prev) => ({ ...prev, [key]: decision }));
      }
      setReviewSuccess(`批量提交完成：${rows.length} 项 → ${statusLabel(decision)}`);
      await refreshAssetReviewApiState(jobId);
    } catch (err) {
      setReviewError(toUserFacingError(err, { baseUrl: endpointBase, serviceName: "规范入库 API" }));
    } finally {
      setAssetBatchBusy(false);
    }
  }
  const artifactArrayCountByName = useMemo<Record<string, number>>(() => ({
    "02_catalog.json": artifactCatalogNodes.length,
    "03_clause_tree.json": artifactClauseTreeNodes.length,
    "04_clause_classification.json": artifactClassifications.length,
    "05_components.json": artifactComponents.length,
    "06_dto_schema.json": artifactDtos.length,
    "07_rules.json": artifactRules.length,
    "08_gates.json": artifactGates.length,
    "10_proof_templates.json": artifactProofTemplates.length,
  }), [
    artifactCatalogNodes.length,
    artifactClauseTreeNodes.length,
    artifactClassifications.length,
    artifactComponents.length,
    artifactDtos.length,
    artifactRules.length,
    artifactGates.length,
    artifactProofTemplates.length,
  ]);
  const stageTitleMap: Record<PipelineStageKey, string> = {
    pdf: "PDF输入",
    documentIR: "Document IR",
    catalog: "Catalog",
    normRef: "normRef",
    specIR: "SpecIR主资产",
    rule: "派生Rule",
    gate: "派生Gate",
    rulepack: "单表rulepack",
    normDoc: "NormDoc",
    publish: "发布",
  };
  const pipelineOrder: PipelineStageKey[] = ["pdf", "documentIR", "catalog", "normRef", "specIR", "rule", "gate", "rulepack", "normDoc", "publish"];
  const pdfReadyForMainline = sourceFilePath.length > 0;
  const documentIRReadyForMainline = artifactClauseTreeNodes.length > 0 || artifactClassifications.length > 0;
  const catalogReadyForMainline = catalogStatus === "success";
  const normrefReadyForMainline = normRefCount > 0;
  const specirReadyForMainline = Number(specirDoc?.count ?? (Array.isArray(specirDoc?.items) ? specirDoc?.items.length : 0) ?? 0) > 0 || artifactComponents.length > 0;
  const ruleReadyForMainline = artifactRules.length > 0;
  const gateReadyForMainline = artifactGates.length > 0;
  const rulepackReadyForMainline = Boolean((rulePackName || "").trim() || rulePackMeta);
  const normdocReadyForMainline = normdocDisplayStatus === "valid" || normDocIsomorphicReady;
  const publishReadyForMainline = Boolean(publishSummary || publishEnabled);
  const rootCauseCode: "catalog_failed" | "normref_empty" | "specir_empty" | null = !catalogReadyForMainline
    ? "catalog_failed"
    : (!normrefReadyForMainline ? "normref_empty" : (!specirReadyForMainline ? "specir_empty" : null));

  const pipelineStagesBase: Record<PipelineStageKey, PipelineStageView> = {
    pdf: {
      status: pdfReadyForMainline ? "success" : "not_started",
      output_count: pdfReadyForMainline ? 1 : 0,
      error: pdfReadyForMainline ? undefined : "pdf_missing",
    },
    documentIR: {
      status: !pdfReadyForMainline
        ? "blocked"
        : (documentIRReadyForMainline ? "success" : "failed"),
      output_count: !pdfReadyForMainline ? 0 : artifactClauseTreeNodes.length,
      error: !pdfReadyForMainline
        ? "blocked by PDF"
        : (documentIRReadyForMainline ? undefined : "document_ir_missing"),
      blocked_by: !pdfReadyForMainline ? "pdf" : undefined,
    },
    catalog: {
      status: !documentIRReadyForMainline
        ? "blocked"
        : (catalogReadyForMainline ? "success" : "failed"),
      output_count: !documentIRReadyForMainline ? 0 : catalogNodeCount,
      error: !documentIRReadyForMainline
        ? "blocked by Document IR"
        : (catalogReadyForMainline ? undefined : "catalog_failed"),
      blocked_by: !documentIRReadyForMainline ? "documentIR" : undefined,
    },
    normRef: {
      status: rootCauseCode === "catalog_failed"
        ? "blocked"
        : (normrefReadyForMainline ? "success" : "failed"),
      output_count: rootCauseCode === "catalog_failed" ? 0 : (normrefReadyForMainline ? normRefCount : 0),
      error: rootCauseCode === "catalog_failed"
        ? "blocked by Catalog"
        : (normrefReadyForMainline ? undefined : "normRef_count=0"),
      blocked_by: rootCauseCode === "catalog_failed" ? "catalog" : undefined,
    },
    specIR: {
      status: rootCauseCode ? "blocked" : (specirReadyForMainline ? "success" : "failed"),
      output_count: rootCauseCode ? 0 : Number(specirDoc?.count ?? (Array.isArray(specirDoc?.items) ? specirDoc?.items.length : 0) ?? 0),
      error: rootCauseCode
        ? "blocked by normRef"
        : (specirReadyForMainline ? undefined : "specir_count=0"),
      blocked_by: rootCauseCode ? "normRef" : undefined,
    },
    rule: {
      status: rootCauseCode ? "blocked" : (ruleReadyForMainline ? "success" : "failed"),
      output_count: rootCauseCode ? 0 : artifactRules.length,
      error: rootCauseCode ? "blocked by SpecIR" : (ruleReadyForMainline ? undefined : "rule_count=0"),
      blocked_by: rootCauseCode ? "specIR" : undefined,
    },
    gate: {
      status: rootCauseCode ? "blocked" : (gateReadyForMainline ? "success" : "failed"),
      output_count: rootCauseCode ? 0 : artifactGates.length,
      error: rootCauseCode ? "blocked by Rule" : (gateReadyForMainline ? undefined : "gate_count=0"),
      blocked_by: rootCauseCode ? "rule" : undefined,
    },
    rulepack: {
      status: rootCauseCode ? "blocked" : (rulepackReadyForMainline ? "success" : "failed"),
      output_count: rootCauseCode ? 0 : (rulepackReadyForMainline ? 1 : 0),
      error: rootCauseCode ? "blocked by Gate" : (rulepackReadyForMainline ? undefined : "rulepack_missing"),
      blocked_by: rootCauseCode ? "gate" : undefined,
    },
    normDoc: {
      status: rootCauseCode ? "blocked" : (normdocReadyForMainline ? "success" : "failed"),
      output_count: rootCauseCode ? 0 : (normdocReadyForMainline ? 1 : 0),
      error: rootCauseCode ? "blocked by Rulepack" : (normdocReadyForMainline ? undefined : "invalid_normdoc"),
      blocked_by: rootCauseCode ? "rulepack" : undefined,
    },
    publish: {
      status: rootCauseCode
        ? "blocked"
        : normdocReadyForMainline
        ? (publishReadyForMainline ? "success" : (publishFlowLoading ? "running" : "not_started"))
        : "failed",
      output_count: rootCauseCode ? 0 : (normdocReadyForMainline && publishReadyForMainline ? 1 : 0),
      error: rootCauseCode ? "blocked by NormDoc" : (normdocReadyForMainline ? undefined : "发布 blocked：依赖 valid NormDoc"),
      blocked_by: rootCauseCode ? "normDoc" : undefined,
    },
  };
  const pipelineStages: Record<PipelineStageKey, PipelineStageView> = { ...pipelineStagesBase };
  if (!rootCauseCode) {
    for (let i = 1; i < pipelineOrder.length; i += 1) {
      const prevKey = pipelineOrder[i - 1];
      const currentKey = pipelineOrder[i];
      const prev = pipelineStages[prevKey];
      if (prev.status === "failed" || prev.status === "blocked") {
        pipelineStages[currentKey] = {
          status: "blocked",
          output_count: 0,
          blocked_by: prevKey,
        };
      }
    }
  }
  const rootCause = rootCauseCode
    ? {
      stage: rootCauseCode === "catalog_failed" ? "catalog" as PipelineStageKey : (rootCauseCode === "normref_empty" ? "normRef" as PipelineStageKey : "specIR" as PipelineStageKey),
      title: "Root Cause",
      message: rootCauseCode,
    }
    : null;
  const rootCauseStageKey: PipelineStageKey | null = rootCause ? rootCause.stage : null;
  const rootCauseHumanText = rootCauseCode === "catalog_failed"
    ? "目录生成失败（Catalog）"
    : rootCauseCode === "normref_empty"
      ? "normRef 未生成"
      : rootCauseCode === "specir_empty"
        ? "SpecIR 主资产未生成"
      : "";
  const pipelinePrimaryStatusText = rootCauseCode
    ? `流程阻塞：${rootCauseHumanText}`
    : (parseSuccessByArtifacts ? "解析已完成，可继续下一步" : "解析进行中");

  const workflowSteps: Array<{ key: PipelineStageKey; step: string; title: string; stage: PipelineStageView }> = pipelineOrder.map((key, idx) => ({
    key,
    step: String(idx + 1),
    title: stageTitleMap[key],
    stage: pipelineStages[key],
  }));
  type CatalogTreeNodeView = {
    key: string;
    id: string;
    title: string;
    type: string;
    page: number;
    vuri: string;
    parentId?: string | null;
    children: CatalogTreeNodeView[];
  };
  const buildCachedCatalogTree = (rows: ParsedCatalogNodeSnapshot[]): CatalogTreeNodeView[] => {
    const allowed = new Set(["chapter", "section", "clause"]);
    const byKey = new Map<string, CatalogTreeNodeView>();
    const all: CatalogTreeNodeView[] = [];
    const sortWeight = (t: string): number => ({ chapter: 1, section: 2, clause: 3, table: 4 }[t] || 9);
    const toNoTuple = (id: string): number[] => id.split(".").map((x) => Number((x || "").replace(/[^\d]/g, "")) || 0);
    rows.forEach((row) => {
      if (!allowed.has(String(row.type || "").toLowerCase())) return;
      const key = `${row.type}@@${row.id}`;
      const n: CatalogTreeNodeView = {
        key,
        id: row.id,
        title: row.title,
        type: row.type,
        page: row.page,
        vuri: "",
        parentId: row.parentId,
        children: [],
      };
      byKey.set(key, n);
      all.push(n);
    });
    const roots: CatalogTreeNodeView[] = [];
    all.forEach((row) => {
      const pid = String(row.parentId || "").trim();
      if (!pid) {
        roots.push(row);
        return;
      }
      const parent = [`chapter@@${pid}`, `section@@${pid}`, `clause@@${pid}`].map((k) => byKey.get(k)).find(Boolean);
      if (parent) parent.children.push(row);
      else roots.push(row);
    });
    const sortRows = (items: CatalogTreeNodeView[]) => {
      items.sort((a, b) => {
        const sw = sortWeight(a.type) - sortWeight(b.type);
        if (sw !== 0) return sw;
        const an = toNoTuple(a.id);
        const bn = toNoTuple(b.id);
        const len = Math.max(an.length, bn.length);
        for (let i = 0; i < len; i += 1) {
          const diff = (an[i] || 0) - (bn[i] || 0);
          if (diff !== 0) return diff;
        }
        return a.id.localeCompare(b.id, "zh-CN");
      });
      items.forEach((x) => sortRows(x.children));
    };
    sortRows(roots);
    return roots;
  };
  const renderCatalogCheckTree = (nodes: CatalogTreeNodeView[], depth = 0): JSX.Element => (
    <ul className={depth === 0 ? "space-y-1" : "ml-4 space-y-1 border-l border-white/15 pl-3"}>
      {nodes.map((node) => (
        <li key={node.key} className="py-1">
          <button
            type="button"
            className={`w-full rounded-md px-2 py-1 text-left transition ${
              selectedCatalogTreeNode?.key === node.key ? "bg-blue-500/20 ring-1 ring-blue-300/60" : "bg-slate-900/45 hover:bg-slate-800/70"
            }`}
            onClick={() => setSelectedCatalogNodeKey(node.key)}
          >
            <div className="text-base font-medium leading-7 text-slate-100">
              <span className="font-serif">{node.id}</span>
              <span className="ml-3">{node.title}</span>
            </div>
          </button>
          {node.children.length > 0 ? renderCatalogCheckTree(node.children, depth + 1) : null}
        </li>
      ))}
    </ul>
  );
  const renderSpecCatalogTree = (jobId: string, nodes: CatalogTreeNodeView[], depth = 0): JSX.Element => {
    const q = String(catalogSearchKeyword || "").trim().toLowerCase();
    const filtered = q
      ? nodes.filter((n) => `${n.id} ${n.title}`.toLowerCase().includes(q) || n.children.some((c) => `${c.id} ${c.title}`.toLowerCase().includes(q)))
      : nodes;
    return (
      <ul className={depth === 0 ? "space-y-1" : "ml-4 space-y-1 border-l border-white/15 pl-3"}>
        {filtered.map((node) => {
          const nodeKey = node.key;
          const isCurrentSpec = String(selectedJobId || "").trim() === String(jobId || "").trim();
          const hasChildren = node.children.length > 0;
          const expandKey = `${jobId}::${nodeKey}`;
          const isExpanded = expandedSpecTreeKeys[expandKey] ?? (depth < 2);
          return (
            <li key={`${jobId}-${node.key}`} className="py-1">
              <div className="flex items-center gap-1">
                {hasChildren ? (
                  <button
                    type="button"
                    className="rounded px-1 text-xs text-slate-300 hover:bg-slate-800/70"
                    onClick={() => {
                      setExpandedSpecTreeKeys((prev) => ({ ...prev, [expandKey]: !isExpanded }));
                    }}
                    aria-label={isExpanded ? "折叠" : "展开"}
                  >
                    {isExpanded ? "▼" : "▶"}
                  </button>
                ) : (
                  <span className="inline-block w-4" />
                )}
                <button
                  type="button"
                  className={`w-full rounded-md px-2 py-1 text-left transition ${
                    isCurrentSpec && selectedCatalogTreeNode?.key === nodeKey ? "bg-blue-500/20 ring-1 ring-blue-300/60" : "bg-slate-900/45 hover:bg-slate-800/70"
                  }`}
                  onClick={() => {
                    setActiveSpecJobId(jobId);
                    if (!isCurrentSpec) {
                      setSelectedJobId(jobId);
                      setPendingCatalogNodeKey(nodeKey);
                      void loadReviewJob(jobId);
                      return;
                    }
                    setSelectedCatalogNodeKey(nodeKey);
                  }}
                >
                  <div className="text-base font-medium leading-7 text-slate-100">
                    <span className="font-serif">{node.id}</span>
                    <span className="ml-3">{node.title}</span>
                  </div>
                </button>
              </div>
              {hasChildren && isExpanded ? renderSpecCatalogTree(jobId, node.children, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const pipelineStatusLabel: Record<PipelineStageStatus, string> = {
    not_started: "未开始",
    running: "运行中",
    success: "成功",
    failed: "失败",
    blocked: "阻断",
  };
  const blockedReasonByStage: Record<PipelineStageKey, string> = {
    pdf: "blocked by input",
    documentIR: "blocked by PDF",
    catalog: "blocked by Document IR",
    normRef: "blocked by Catalog",
    specIR: "blocked by normRef",
    rule: "blocked by SpecIR",
    gate: "blocked by Rule",
    rulepack: "blocked by Gate",
    normDoc: "blocked by rulepack",
    publish: "blocked by NormDoc",
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
      </div>

      <main className="relative flex w-full flex-col gap-6 p-[15px]">
        <header className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-panel backdrop-blur md:p-8">
          <p className="mb-2 inline-flex rounded-full border border-brand-300/60 bg-brand-500/15 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-brand-200">
            规范入库端
          </p>
          <h1 className="text-3xl font-semibold leading-tight md:text-5xl">规范规则构建工作台</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
            主线：PDF → Document IR → Catalog → normRef → SpecIR → Rule → Gate → 单表 rulepack → NormDoc → 发布
          </p>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            资产原则：SpecIR 是主资产，Rule/Gate/Component/NormDoc 都是派生产物。
          </p>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            状态展示优先级：SpecIR → Rule/Gate → rulepack → NormDoc/发布。
          </p>
          <p className="mt-2 max-w-3xl text-xs text-slate-300">
            当前规范关注：{specFocusLabels.join(" / ")}
          </p>
        </header>

        <section className="rounded-3xl border border-brand-300/30 bg-brand-500/10 p-5 shadow-panel backdrop-blur md:p-6">
          <h2 className="mb-3 text-lg font-semibold text-brand-100">先看这里：流程总览</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">当前结论</p>
              <p className={`mt-1 text-sm font-semibold ${rootCauseCode ? "text-rose-200" : "text-emerald-200"}`}>{pipelinePrimaryStatusText}</p>
              <p className="mt-1 text-xs text-slate-300">阻断点：{statusAggregation?.current?.blocker || pipelineStatus?.current_blocker || rootCauseHumanText || "-"}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">下一步</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{statusAggregation?.current?.next_action || pipelineStatus?.next_action || (rootCauseCode ? "修复 root cause 后重跑" : "进入人工校验/发布")}</p>
              <p className="mt-1 text-xs text-slate-300">发布就绪：{statusAggregation?.readiness?.publish_ready ? "是" : "否"}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs text-slate-400">快速跳转</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <a href="#section-input" className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800">A 输入解析</a>
                <a href="#section-catalog" className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800">B Catalog</a>
                <a href="#section-specir" className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800">C SpecIR</a>
                <a href="#section-rulegate" className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800">D Rule/Gate</a>
                <a href="#section-review" className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800">E 人工校验</a>
                <a href="#section-publish" className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800">F 发布</a>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-500/30 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <h2 className="mb-3 text-lg font-semibold text-cyan-100">Human-in-the-Loop Queue</h2>
          {hitlQueue.length === 0 ? (
            <p className="text-sm text-slate-400">当前无待处理 HITL 项。</p>
          ) : (
            <div className="space-y-3">
              {hitlQueue.map((item, idx) => {
                const cid = String(item.candidate_id || `hitl-${idx}`).trim();
                const busy = Boolean(hitlBusyById[cid]);
                const similar = Array.isArray(item.historical_similar_cases) ? item.historical_similar_cases : [];
                return (
                  <div key={cid} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-200">
                    <p>原文：{String(item.original_text || "-")}</p>
                    <p className="mt-1">推荐 slot：{String(item.recommended_slot || "-")}</p>
                    <p className="mt-1">推荐 gate：<code>{JSON.stringify(item.recommended_gate || {})}</code></p>
                    <p className="mt-1">推荐 formula：<code>{JSON.stringify(item.recommended_formula || {})}</code></p>
                    <p className="mt-1">AI confidence：{Number(item.ai_confidence || 0).toFixed(4)}{item.review_required ? "（需复核）" : ""}</p>
                    <p className="mt-1">历史类似案例：{similar.length}</p>
                    {similar.length > 0 ? (
                      <div className="mt-1 space-y-1 rounded border border-slate-800 bg-slate-900/50 p-2">
                        {similar.slice(0, 3).map((c, i) => (
                          <p key={`${cid}-hist-${i}`}>#{i + 1} slot={String(c.mapped_slotKey || "-")} sim={Number(c.similarity || 0).toFixed(3)} conf={Number(c.confidence || 0).toFixed(3)}</p>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button type="button" disabled={busy} onClick={() => void submitHitlDecision(item, "accept")} className="rounded bg-emerald-600 px-2 py-1 text-white disabled:opacity-60">accept</button>
                      <button type="button" disabled={busy} onClick={() => void submitHitlDecision(item, "reject")} className="rounded bg-rose-600 px-2 py-1 text-white disabled:opacity-60">reject</button>
                      <input
                        value={hitlModifyById[cid] || ""}
                        onChange={(e) => setHitlModifyById((prev) => ({ ...prev, [cid]: e.target.value }))}
                        placeholder='modify patch(JSON), 例如 {"threshold_value":"95"}'
                        className="min-w-[280px] flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                      />
                      <button type="button" disabled={busy} onClick={() => void submitHitlDecision(item, "modify")} className="rounded bg-sky-700 px-2 py-1 text-white disabled:opacity-60">modify</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section id="section-overview" className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <h2 className="mb-3 text-lg font-semibold">顶部流程条</h2>
          <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
            rootCauseCode
              ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
              : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
          }`}>
            <p className="font-semibold">{pipelinePrimaryStatusText}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-100 hover:bg-slate-800"
                onClick={() => { void submitUploadFlow(); }}
              >
                重试解析
              </button>
              <button
                type="button"
                className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-100 hover:bg-slate-800"
                onClick={() => inputSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                定位到输入区
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-brand-300/40 bg-brand-500/10 px-3 py-3">
            <div className="grid gap-2 text-xs md:grid-cols-2 md:text-sm">
              <p>当前阶段：<strong>{statusAggregation?.current?.stage || pipelineStatus?.current_stage || currentStageText || "-"}</strong></p>
              <p>当前阻断点：<strong>{statusAggregation?.current?.blocker || pipelineStatus?.current_blocker || rootCauseHumanText || "-"}</strong></p>
              <p>下一步动作：<strong>{statusAggregation?.current?.next_action || pipelineStatus?.next_action || (rootCauseCode ? "修复 root cause 后重跑" : "进入人工校验/发布")}</strong></p>
              <p>是否可发布：<strong className={statusAggregation?.readiness?.publish_ready ? "text-emerald-300" : "text-amber-300"}>{statusAggregation?.readiness?.publish_ready ? "是" : "否"}</strong></p>
              <p>semantic ready：<strong className={statusAggregation?.readiness?.semantic_ready ? "text-emerald-300" : "text-amber-300"}>{statusAggregation?.readiness?.semantic_ready ? "true" : "false"}</strong></p>
              <p>execution ready：<strong className={statusAggregation?.readiness?.execution_ready ? "text-emerald-300" : "text-amber-300"}>{statusAggregation?.readiness?.execution_ready ? "true" : "false"}</strong></p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">顶部状态仅基于真实资产聚合，不再以“JSON 已生成”判定 success。</p>
          <details className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            <summary className="cursor-pointer font-semibold">Root Cause Summary</summary>
            {(statusAggregation?.root_cause_summary?.items || []).length > 0 ? (
              <div className="mt-1 space-y-1">
                {(statusAggregation?.root_cause_summary?.items || []).slice(0, 8).map((it, idx) => (
                  <p key={`rc-summary-${idx}`}>- {it.message || it.code || "-"}{Number(it.count || 0) > 0 ? `（${Number(it.count || 0)}）` : ""}</p>
                ))}
              </div>
            ) : (
              <p className="mt-1">- 无阻断项</p>
            )}
          </details>
          <details className="mt-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-200">
            <summary className="cursor-pointer font-semibold text-slate-100">Asset Integrity Report</summary>
            {!assetIntegrityReport ? (
              <p className="mt-2">暂无 integrity_report.json</p>
            ) : (
              <div className="mt-2 space-y-1">
                <p>publish_status: <strong className={assetIntegrityReport.publish_status === "ready" ? "text-emerald-300" : "text-rose-300"}>{assetIntegrityReport.publish_status || "-"}</strong></p>
                <p>dangling specir refs: {Number(assetIntegrityReport.summary?.dangling_specir_refs || 0)}</p>
                <p>dangling rule refs: {Number(assetIntegrityReport.summary?.dangling_rule_refs || 0)}</p>
                <p>dangling gate refs: {Number(assetIntegrityReport.summary?.dangling_gate_refs || 0)}</p>
                <p>dangling slot refs: {Number(assetIntegrityReport.summary?.dangling_slot_refs || 0)}</p>
                <p>unused components: {Number(assetIntegrityReport.summary?.unused_components || 0)}</p>
                <p>duplicate rules: {Number(assetIntegrityReport.summary?.duplicate_rules || 0)}</p>
                <p>duplicate gates: {Number(assetIntegrityReport.summary?.duplicate_gates || 0)}</p>
                <p>report_path: {String(assetIntegrityReport.integrity_report_path || "-")}</p>
              </div>
            )}
          </details>
          {rootCause ? (
            <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-100">
              <p className="font-semibold">Root Cause（唯一）</p>
              <p className="mt-1">{rootCauseHumanText || rootCause.message}</p>
              <p className="mt-1 text-xs text-rose-200">技术代码：{rootCause.message}</p>
            </div>
          ) : null}
          <details className="mt-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">展开节点详情</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
            {workflowSteps.map((item) => (
              <div
                key={item.step}
                className={`rounded-2xl border p-3 text-sm ${
                  item.stage.status === "success"
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                    : item.stage.status === "running"
                      ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
                      : item.stage.status === "failed"
                        ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                        : item.stage.status === "blocked"
                          ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                          : "border-slate-700 bg-slate-950/60 text-slate-300"
                }`}
              >
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-xs">
                  {item.key === "normRef" && item.stage.status === "failed" && parseStatus === "not_indexed"
                    ? "not_indexed"
                    : item.stage.status === "blocked"
                      ? blockedReasonByStage[item.key]
                      : pipelineStatusLabel[item.stage.status]}
                </p>
              </div>
            ))}
            </div>
          </details>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <form id="section-input" ref={inputSectionRef} onSubmit={onSubmit} className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
            <h2 className="mb-4 text-lg font-semibold">A. 规范输入与解析状态</h2>
            <p className="mb-2 text-sm text-slate-300">主资产是 SpecIR。PDF 作为输入载体，经 Document IR/Catalog/normRef 编译为 SpecIR。</p>
            <p className="mb-4 text-xs text-slate-400">目标输入终点：SpecIR（normRef 为来源索引层）。</p>

            <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/40 p-3">
              <p className="text-sm font-medium text-slate-100">规范输入</p>
              <div className="mt-2 grid gap-3 text-xs text-slate-300 md:grid-cols-4">
                <p>来源：<strong>{inputSource === "pdf" ? "PDF" : "normRef"}</strong></p>
                <p>PDF上传状态：<strong>{pdfUploadStatusText}</strong></p>
                <p>Catalog 状态：<strong className={catalogStatusClass}>{catalogStatusText}</strong></p>
                <p>normRef 状态：<strong className={normRefStatusClass}>{normRefStatusText}</strong></p>
                <p>生成 normRef 数量：<strong>{effectiveNormRefCount}</strong></p>
                <p>当前阶段：<strong className={parseSuccessByArtifacts ? "text-emerald-300" : "text-amber-300"}>{currentStageText}</strong></p>
                <p>结论：<strong className={parseSuccessByArtifacts ? "text-emerald-300" : "text-amber-300"}>{parseSuccessByArtifacts ? "规范解析成功" : "尚未完成规范解析"}</strong></p>
              </div>
              {pdfOnlyWithoutNormRef ? (
                <p className="mt-2 text-xs text-amber-200">{parseNotSuccessTip}</p>
              ) : null}
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <label className="field">
                <span>来源</span>
                <select value={"pdf"} onChange={() => setInputSource("pdf")}>
                  <option value="pdf">PDF（当前可执行）</option>
                </select>
              </label>
              <label className="field">
                <span>normRef（规范本体地址）</span>
                <input
                  value={inputNormRef}
                  onChange={(e) => setInputNormRef(e.target.value)}
                  placeholder="v://std/jtg-f80-1-2017/table4-2-2/compaction"
                  disabled
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="field">
                <span>标准编号</span>
                <input
                  value={stdCode}
                  onChange={(e) => {
                    setStdCode(e.target.value);
                    setStdCodeTouched(true);
                  }}
                  placeholder="例如：JTG/T 3650-2020"
                />
                {autoDetectedStdCode ? (
                  <p className="mt-1 text-xs text-brand-200">
                    文件名识别：{autoDetectedStdCode}
                    {!stdCodeTouched ? "（已自动填充）" : ""}
                  </p>
                ) : null}
              </label>
              <label className="field">
                <span>规范层级</span>
                <select
                  value={level}
                  onChange={(e) => {
                    setLevel(e.target.value);
                    setLevelTouched(true);
                  }}
                >
                  <option value="industry">行业标准</option>
                  <option value="national">国家标准</option>
                  <option value="local">地方标准</option>
                  <option value="enterprise">企业标准</option>
                  <option value="project">项目标准</option>
                </select>
              </label>
              <label className="field">
                <span>版本标签</span>
                <input value={versionTag} onChange={(e) => setVersionTag(e.target.value)} placeholder="例如：YYYY-MM" />
              </label>
            </div>

            <div className="mt-4">
              <span className="mb-2 block text-sm text-slate-300">PDF 文档（输入载体）</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={inputSource === "normref"}
                onChange={(e) => {
                  void onFileChange(e.target.files?.[0] ?? null);
                }}
              />
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-600 bg-slate-800/60 p-4">
                <button
                  type="button"
                  disabled={inputSource === "normref"}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  选择文件
                </button>
                <span className="text-sm text-slate-300">{file ? file.name : "未选择任何文件"}</span>
              </div>

              {inspectLoading ? (
                <p className="mt-2 text-xs text-brand-200">正在解析文件内容并回填表单...</p>
              ) : null}
              {inspectError ? (
                <p className="mt-2 rounded-lg bg-rose-500/15 p-2 text-xs text-rose-200">{inspectError}</p>
              ) : null}
              {inspectResult?.prefill ? (
                <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950/50 p-2 text-xs text-slate-300">
                  <p>识别来源：{inspectResult.prefill.detected?.source || "-"}</p>
                  <p>识别标准：{inspectResult.prefill.detected?.std_code || "-"}</p>
                  <p>识别标题：{inspectResult.prefill.detected?.title || "-"}</p>
                  {(inspectResult.prefill.warnings ?? []).map((msg, idx) => (
                    <p key={`inspect-warning-${idx}`} className="text-amber-200">
                      提示：{msg}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading || ingestRunning}
                className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading || ingestRunning ? "处理中..." : inputSource === "normref" ? "提交规范输入" : "上传并解析"}
              </button>
            </div>
            {ingestRunning && ingestRunId ? (
              <p className="mt-2 text-xs text-slate-300">任务ID：{ingestRunId} · 进度：{Math.min(100, Math.max(0, ingestProgress))}% · {ingestStageText || "后台处理中..."}</p>
            ) : null}

            {error ? <p className="mt-4 rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200">{error}</p> : null}
          </form>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-panel md:p-6">
              <h2 className="mb-3 text-lg font-semibold">A. 规范输入详情</h2>
              {(() => {
                const detectedStdCode = String(inspectResult?.prefill?.detected?.std_code || currentJobSpec.stdCode || "-").trim() || "-";
                const detectedTitle = String(inspectResult?.prefill?.detected?.title || currentJobSpec.name || "-").trim() || "-";
                const pdfFileName = String(file?.name || sourceFilePath || "-").trim() || "-";
                const pdfPageCount = String((firstJob as unknown as { page_count?: number })?.page_count ?? "-");
                const pdfHash = String(
                  (artifactDocs["01_spec.json"] as { source_pdf_hash?: unknown } | undefined)?.source_pdf_hash
                  || (artifactNormDoc as { spec?: { source_pdf_hash?: unknown } } | null)?.spec?.source_pdf_hash
                  || "-"
                );
                return (
              <div className="space-y-2 text-sm">
                <p>输入来源：<strong>PDF</strong></p>
                <p>文件名：<strong>{pdfFileName}</strong></p>
                <p>识别标准编号：<strong>{detectedStdCode}</strong></p>
                <p>规范名称：<strong>{detectedTitle}</strong></p>
                <button
                  type="button"
                  className="mt-2 rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                  onClick={() => setShowInputTechDetails((prev) => !prev)}
                >
                  {showInputTechDetails ? "收起技术详情" : "展开技术详情"}
                </button>
                {showInputTechDetails ? (
                  <div className="rounded border border-slate-700 bg-slate-950/50 p-2 text-xs text-slate-300">
                    <p>PDF页数：{pdfPageCount}</p>
                    <p>PDF hash：{pdfHash}</p>
                    <p>PDF上传状态：{pdfUploadStatusText}</p>
                    <p>Catalog 状态：{catalogStatusText}</p>
                    <p>normRef 状态：{normRefStatusText}</p>
                  </div>
                ) : null}
              </div>
                );
              })()}
            </div>
          </aside>
        </section>

        <section id="section-catalog" className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <h2 className="mb-3 text-lg font-semibold">B. Catalog 条款目录树</h2>
          {loading || ingestRunning ? (
            <p className="text-sm text-slate-400">uploading / parsing...</p>
          ) : !currentJobId ? (
            <p className="text-sm text-slate-400">{missingJobTip}</p>
          ) : artifactLoading ? (
            <p className="text-sm text-slate-400">normRef index loading / pending...</p>
          ) : (
            <div className="space-y-3">
              {catalogTreeRows.length === 0 ? (
                <p className="text-sm text-rose-200">未生成 Catalog 目录树，暂无法做目录-条文一一核对。</p>
              ) : (
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/45 p-2 shadow-sm lg:grid-cols-[1.35fr_1fr]">
                  <div className="rounded-xl border border-white/10 bg-slate-900/40 p-2 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-slate-900/60 px-2 py-1 text-base text-slate-200">
                      <p className="font-medium">规范目录树（目录 → 章 → 节 → 条）</p>
                      <p className="text-slate-400">共 {parsedSpecLibrary.length} 本</p>
                    </div>
                    <input
                      value={catalogSearchKeyword}
                      onChange={(e) => setCatalogSearchKeyword(e.target.value)}
                      placeholder="搜索目录 / 章 / 节 / 条"
                      className="mb-2 w-full rounded border border-white/15 bg-slate-900/60 px-2 py-1 text-base text-slate-100 placeholder:text-slate-400"
                    />
                    <div className="max-h-[34rem] overflow-auto">
                      {parsedSpecLibrary.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-slate-500">还没有已解析规范。</p>
                      ) : (
                        parsedSpecLibrary
                          .filter((item) => {
                            const q = String(catalogSearchKeyword || "").trim().toLowerCase();
                            if (!q) return true;
                            return `${item.stdCode} ${item.title}`.toLowerCase().includes(q);
                          })
                          .map((item) => {
                            const isActive = String(activeSpecJobId || "").trim() === item.jobId;
                            const specNodes = parsedSpecCatalogCache[item.jobId] || [];
                            const specTree = buildCachedCatalogTree(specNodes);
                            return (
                              <details key={`left-tree-${item.jobId}`} open={isActive} className="mb-2 rounded border border-white/10 bg-slate-900/45">
                                <summary
                                  className="cursor-pointer px-2 py-1 text-base font-medium text-slate-100"
                                  onClick={() => {
                                    setActiveSpecJobId(item.jobId);
                                    if (String(selectedJobId || "").trim() !== item.jobId) {
                                      setSelectedJobId(item.jobId);
                                      void loadReviewJob(item.jobId);
                                    }
                                  }}
                                >
                                  {item.stdCode || "未识别标准"} {item.title ? `｜${item.title}` : ""}
                                </summary>
                                {specTree.length > 0 ? (
                                  <div className="border-t border-white/10 p-1">
                                    {renderSpecCatalogTree(item.jobId, specTree)}
                                  </div>
                                ) : (
                                  <p className="px-2 pb-2 text-[11px] text-slate-400">目录缓存待加载。</p>
                                )}
                              </details>
                            );
                          })
                      )}
                    </div>
                  </div>
                  <div
                    ref={normWorkbenchPrintRef}
                    className="rounded-xl p-3 text-sm"
                    style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(255,255,255,0.1)", color: "#e8eefc" }}
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-[10px]">
                      <p className="text-sm text-slate-300">
                        当前位置：
                        <span className="ml-1 text-slate-100">
                          {selectedCatalogTreeNode
                            ? `JTG/T 3650-2020 > 第3章 施工准备和施工测量 > 3.1 施工准备 > ${selectedCatalogTreeNode.id} ${selectedCatalogTreeNode.title || ""}`.trim()
                            : "JTG/T 3650-2020 > 第3章 施工准备和施工测量 > 3.1 施工准备 > 3.1.2 施工调查及现场核对"}
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const title = `${selectedCatalogTreeNode?.id || ""} ${selectedCatalogTreeNode?.title || ""}`.trim() || "条文业务工作台";
                            const html = normWorkbenchPrintRef.current?.innerHTML || "";
                            const w = window.open("", "_blank", "width=1200,height=900");
                            if (!w) return;
                            w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title><style>body{font-family:Segoe UI,Arial,sans-serif;padding:16px;color:#111;background:#fff}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d9e2f2;padding:6px 8px;text-align:left}button{display:none!important}</style></head><body>${html}</body></html>`);
                            w.document.close();
                            w.focus();
                            w.print();
                          }}
                          className="rounded px-2 py-1 text-xs"
                          style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                        >
                          打印
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const payload = {
                              breadcrumb: selectedCatalogTreeNode
                                ? `JTG/T 3650-2020 > 第3章 施工准备和施工测量 > 3.1 施工准备 > ${selectedCatalogTreeNode.id} ${selectedCatalogTreeNode.title || ""}`.trim()
                                : "JTG/T 3650-2020 > 第3章 施工准备和施工测量 > 3.1 施工准备 > 3.1.2 施工调查及现场核对",
                              title: `${selectedClauseKnowledgeObject?.id || "-"} ${selectedClauseKnowledgeObject?.title || "-"}`.trim(),
                              knowledge: selectedClauseKnowledgeObject,
                              exported_at: new Date().toISOString(),
                            };
                            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "clause-workbench.json";
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                          }}
                          className="rounded px-2 py-1 text-xs"
                          style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                        >
                          导出
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const key = String(selectedCatalogTreeNode?.key || "").trim();
                            if (!key) return;
                            setFavoriteNodeKeys((prev) => ({ ...prev, [key]: !prev[key] }));
                          }}
                          className="rounded px-2 py-1 text-xs"
                          style={{
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: selectedCatalogIsFavorite ? "#2f5fa7" : "rgba(15,23,42,0.6)",
                            color: "#ffffff",
                          }}
                        >
                          {selectedCatalogIsFavorite ? "已收藏" : "收藏"}
                        </button>
                      </div>
                    </div>

                    <p className="mb-2 text-lg font-semibold text-slate-200">条文业务工作台</p>

                    {!selectedCatalogTreeNode || !selectedClauseKnowledgeObject ? (
                      <p className="text-slate-300">请选择左侧目录节点。</p>
                    ) : (
                      <div className="space-y-3">
                        <div
                          className="rounded-lg p-3"
                          style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)", color: "#e8eefc" }}
                        >
                          <p className="text-xl font-semibold">
                            {selectedClauseKnowledgeObject.id} {selectedClauseKnowledgeObject.title}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            {selectedClauseKnowledgeObject.business_tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full px-2 py-1"
                                style={{ background: "rgba(51,65,85,0.6)", color: "#cbd5e1", border: "1px solid rgba(148,163,184,0.35)" }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="mt-3 grid gap-2 text-sm md:grid-cols-2" style={{ color: "#e8eefc" }}>
                            <p>所属章节：{selectedClauseKnowledgeObject.chapter}</p>
                            <p>所属工序：{selectedClauseKnowledgeObject.process_stage}</p>
                            <p>适用对象：{selectedClauseKnowledgeObject.applicable_object}</p>
                            <p>适用角色：{selectedClauseKnowledgeObject.roles.join(" / ")}</p>
                            <p>风险等级：{selectedClauseKnowledgeObject.risk_level}</p>
                            <p>条文类型：{selectedClauseKnowledgeObject.clause_type}</p>
                          </div>
                          {!selectedClauseKnowledgeObject.parse_integrity.is_complete ? (
                            <div className="mt-3 rounded border px-2 py-1 text-xs" style={{ borderColor: "#f59e0b", background: "rgba(245,158,11,0.12)", color: "#fde68a" }}>
                              解析完整性告警：{selectedClauseKnowledgeObject.parse_integrity.reason}；尾句片段“{selectedClauseKnowledgeObject.parse_integrity.tail_fragment}”。建议重跑“全量OCR/跨页拼接”解析。
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {[
                            { id: "qa_map", label: "质检映射" },
                            { id: "body", label: "Body" },
                            { id: "specir", label: "SpecIR" },
                            { id: "gate", label: "Gate" },
                            { id: "proof", label: "Proof" },
                            { id: "eng_rules", label: "工程规则" },
                            { id: "constraints", label: "条件约束" },
                            { id: "process", label: "流程要求" },
                            { id: "scope", label: "适用范围" },
                            { id: "content", label: "条文内容" },
                            { id: "analysis", label: "条文解析" },
                            { id: "indicator", label: "控制指标" },
                            { id: "forms", label: "关联表单" },
                            { id: "mapping", label: "字段映射" },
                            { id: "formula", label: "计算公式" },
                            { id: "refs", label: "引用规范" },
                            ...(selectedClauseKnowledgeObject.spec_tables.length > 0 ? [{ id: "spec_table", label: "规范表格" }] : []),
                          ].map((tab) => (
                            <button
                              key={`biz-tab-${tab.id}`}
                              type="button"
                              onClick={() => setNormWorkbenchTab(tab.id as typeof normWorkbenchTab)}
                              className="rounded px-3 py-1.5 text-sm"
                              style={{
                                background: normWorkbenchTab === tab.id ? "#36588e" : "rgba(15,23,42,0.6)",
                                color: normWorkbenchTab === tab.id ? "#ffffff" : "#cbd5e1",
                                border: "1px solid rgba(255,255,255,0.12)",
                              }}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        <div className="grid gap-3">
                          {normWorkbenchTab === "qa_map" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">质检表字段 ↔ 规范依据一一对应</p>
                              <div className="mb-3 rounded p-2 text-xs" style={{ border: "1px solid rgba(148,163,184,0.35)", background: "rgba(30,41,59,0.72)", color: "#dbeafe" }}>
                                <p>闭环完成度：{selectedClauseQaAudit.completeness}%（{selectedClauseQaAudit.completeCount}/{selectedClauseQaAudit.total}）</p>
                                <p>未闭环行数：{selectedClauseQaAudit.incompleteCount}</p>
                                <p>发布建议：{selectedClauseQaAudit.blocker ? "阻断（存在缺失项）" : "可发布（8项齐全）"}</p>
                                <p>条文完整性：疑似截断 {clauseTextQualityAudit.possibleTruncatedCount} 条</p>
                                {Object.keys(selectedClauseQaAudit.missingStats).length > 0 ? (
                                  <p>缺失分布：{Object.entries(selectedClauseQaAudit.missingStats).map(([k, v]) => `${k}:${v}`).join(" | ")}</p>
                                ) : null}
                              </div>
                              {selectedClauseQaMappingRows.length <= 0 ? (
                                <p className="text-slate-300">当前条文暂无可映射的执行链路数据。</p>
                              ) : (
                                <div className="overflow-auto">
                                  <table className="w-full min-w-[1100px] text-left text-sm" style={{ color: "#e8eefc" }}>
                                    <thead>
                                      <tr style={{ background: "rgba(51,65,85,0.65)" }}>
                                        <th className="px-2 py-1">字段名</th>
                                        <th className="px-2 py-1">slotKey</th>
                                        <th className="px-2 py-1">rule_id</th>
                                        <th className="px-2 py-1">gate_id</th>
                                        <th className="px-2 py-1">specir_id</th>
                                        <th className="px-2 py-1">normRef</th>
                                        <th className="px-2 py-1">source_text</th>
                                        <th className="px-2 py-1">验收逻辑</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {selectedClauseQaMappingRows.map((row, idx) => (
                                        <tr key={`qa-map-${idx}`} style={{ borderTop: "1px solid rgba(148,163,184,0.25)" }}>
                                          <td className="px-2 py-1">{row.field_name}</td>
                                          <td className="px-2 py-1">{row.slot_key}</td>
                                          <td className="px-2 py-1">{row.rule_id}</td>
                                          <td className="px-2 py-1">{row.gate_id}</td>
                                          <td className="px-2 py-1">{row.specir_id}</td>
                                          <td className="px-2 py-1 font-mono">{row.norm_ref}</td>
                                          <td className="px-2 py-1">{row.source_text}</td>
                                          <td className="px-2 py-1">{row.acceptance_logic}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {selectedClauseQaAudit.incompleteRows.length > 0 ? (
                                <div className="mt-2 rounded p-2 text-xs" style={{ border: "1px solid rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.12)", color: "#fef3c7" }}>
                                  {selectedClauseQaAudit.incompleteRows.map((row) => (
                                    <p key={`qa-missing-${row.index}`}>第 {row.index + 1} 行缺失：{row.missing.join(", ")}</p>
                                  ))}
                                </div>
                              ) : null}
                              {clauseTextQualityAudit.sample.length > 0 ? (
                                <div className="mt-2 rounded p-2 text-xs" style={{ border: "1px solid rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.08)", color: "#fde68a" }}>
                                  <p className="mb-1">疑似截断条文样本（来自 12_pipeline_audit）</p>
                                  {clauseTextQualityAudit.sample.slice(0, 8).map((row, idx) => (
                                    <p key={`qa-trunc-${idx}`}>[{row.clause_id}] p{row.source_page} - {row.source_text_tail}</p>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {selectedClauseExecutionView.focused ? (
                            <div className="rounded border px-3 py-2 text-xs" style={{ borderColor: "rgba(96,165,250,0.55)", background: "rgba(30,58,138,0.2)", color: "#bfdbfe" }}>
                              当前链路聚焦：{executionTraceFocusId}
                              <button
                                type="button"
                                onClick={() => setExecutionTraceFocusId("")}
                                className="ml-2 rounded px-2 py-0.5"
                                style={{ border: "1px solid rgba(191,219,254,0.4)", color: "#dbeafe", background: "rgba(15,23,42,0.55)" }}
                              >
                                清除聚焦
                              </button>
                            </div>
                          ) : null}
                          {normWorkbenchTab === "body" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">Body（当前条文）</p>
                              {selectedClauseExecutionView.body.length <= 0 ? (
                                <p className="text-slate-300">当前条文暂无 Body 结构数据。</p>
                              ) : (
                                <div className="overflow-auto">
                                  <table className="w-full min-w-[760px] text-left text-sm" style={{ color: "#e8eefc" }}>
                                    <thead>
                                      <tr style={{ background: "rgba(51,65,85,0.65)" }}>
                                        <th className="px-2 py-1">specir_id</th>
                                        <th className="px-2 py-1">normRef</th>
                                        <th className="px-2 py-1">source_text</th>
                                        <th className="px-2 py-1">slotKey</th>
                                        <th className="px-2 py-1">unit</th>
                                        <th className="px-2 py-1">gate</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {selectedClauseExecutionView.body.map((row, idx) => (
                                        <tr key={`body-row-${idx}`} style={{ borderTop: "1px solid rgba(148,163,184,0.25)" }}>
                                          <td className="px-2 py-1">
                                            <button
                                              type="button"
                                              onClick={() => setExecutionTraceFocusId(String(row.id || ""))}
                                              className="rounded px-2 py-0.5 font-mono text-xs"
                                              style={{ border: "1px solid rgba(148,163,184,0.35)", color: "#dbeafe", background: "rgba(30,41,59,0.72)" }}
                                            >
                                              {row.id}
                                            </button>
                                          </td>
                                          <td className="px-2 py-1">{row.normRef}</td>
                                          <td className="px-2 py-1">{row.source_text}</td>
                                          <td className="px-2 py-1">{row.slotKey}</td>
                                          <td className="px-2 py-1">{row.unit}</td>
                                          <td className="px-2 py-1">{row.gate}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "specir" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">SpecIR（当前条文）</p>
                              {selectedClauseExecutionView.specirItems.length <= 0 ? (
                                <p className="text-slate-300">当前条文暂无 SpecIR 项。</p>
                              ) : (
                                <div className="space-y-2">
                                  {selectedClauseExecutionView.specirItems.slice(0, 20).map((item, idx) => {
                                    const row = item as Record<string, unknown>;
                                    return (
                                      <div key={`specir-card-${idx}`} className="rounded p-2" style={{ background: "rgba(30,41,59,0.72)", border: "1px solid rgba(148,163,184,0.25)", color: "#e8eefc" }}>
                                        <p>
                                          specir_id：
                                          <button
                                            type="button"
                                            onClick={() => setExecutionTraceFocusId(String(row.component_id || row.specir_id || ""))}
                                            className="ml-1 rounded px-2 py-0.5 font-mono text-xs"
                                            style={{ border: "1px solid rgba(148,163,184,0.35)", color: "#dbeafe", background: "rgba(15,23,42,0.55)" }}
                                          >
                                            {String(row.specir_id || row.component_id || "-")}
                                          </button>
                                        </p>
                                        <p>semantic_type：{String(row.semantic_type || "-")}</p>
                                        <p>execution_status：{String(row.execution_status || "-")}</p>
                                        <p>summary：{String(row.summary || row.explanation || "-")}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "gate" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">Gate（当前条文）</p>
                              <p className="mb-2 text-xs text-slate-300">关联 Rule：{selectedClauseExecutionView.rules.length} ｜ Gate：{selectedClauseExecutionView.gates.length}</p>
                              {selectedClauseExecutionView.rules.length > 0 ? (
                                <div className="mb-2 space-y-1">
                                  {selectedClauseExecutionView.rules.slice(0, 8).map((r, idx) => {
                                    const row = r as Record<string, unknown>;
                                    return (
                                      <div key={`gate-rule-${idx}`} className="rounded px-2 py-1 text-xs" style={{ background: "rgba(30,41,59,0.72)", border: "1px solid rgba(148,163,184,0.25)", color: "#cbd5e1" }}>
                                        {String(row.field || "-")} {String(row.operator || "-")} {String(row.value ?? row.min ?? row.max ?? "-")} {String(row.unit || "")}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                              {selectedClauseExecutionView.gates.length <= 0 ? (
                                <p className="text-slate-300">当前条文暂无 Gate。</p>
                              ) : (
                                <div className="space-y-2">
                                  {selectedClauseExecutionView.gates.slice(0, 20).map((g, idx) => {
                                    const row = g as Record<string, unknown>;
                                    return (
                                      <div key={`gate-card-${idx}`} className="rounded p-2" style={{ background: "rgba(30,41,59,0.72)", border: "1px solid rgba(148,163,184,0.25)", color: "#e8eefc" }}>
                                        <p>gate_id：{String(row.gate_id || "-")}</p>
                                        <p>
                                          component_id：
                                          <button
                                            type="button"
                                            onClick={() => setExecutionTraceFocusId(String(row.component_id || ""))}
                                            className="ml-1 rounded px-2 py-0.5 font-mono text-xs"
                                            style={{ border: "1px solid rgba(148,163,184,0.35)", color: "#dbeafe", background: "rgba(15,23,42,0.55)" }}
                                          >
                                            {String(row.component_id || "-")}
                                          </button>
                                        </p>
                                        <p>logic：{String(row.logic || "-")}</p>
                                        <p>action：{String(row.action || "-")}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "proof" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">Proof（当前条文）</p>
                              {selectedClauseExecutionView.proofs.length <= 0 ? (
                                <p className="text-slate-300">当前条文暂无 Proof 模板。</p>
                              ) : (
                                <div className="space-y-2">
                                  {selectedClauseExecutionView.proofs.slice(0, 20).map((p, idx) => {
                                    const row = p as Record<string, unknown>;
                                    return (
                                      <div key={`proof-card-${idx}`} className="rounded p-2" style={{ background: "rgba(30,41,59,0.72)", border: "1px solid rgba(148,163,184,0.25)", color: "#e8eefc" }}>
                                        <p>
                                          component_id：
                                          <button
                                            type="button"
                                            onClick={() => setExecutionTraceFocusId(String(row.component_id || ""))}
                                            className="ml-1 rounded px-2 py-0.5 font-mono text-xs"
                                            style={{ border: "1px solid rgba(148,163,184,0.35)", color: "#dbeafe", background: "rgba(15,23,42,0.55)" }}
                                          >
                                            {String(row.component_id || "-")}
                                          </button>
                                        </p>
                                        <p>proof_template_id：{String(row.proof_template_id || row.id || "-")}</p>
                                        <p>title：{String(row.title || row.name || "-")}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "eng_rules" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">工程规则</p>
                              {selectedClauseKnowledgeObject.engineering_rules.length <= 0 ? (
                                <p className="text-slate-300">未识别到明确工程规则。</p>
                              ) : (
                                <div className="overflow-auto">
                                  <table className="w-full min-w-[680px] text-left text-sm" style={{ color: "#e8eefc" }}>
                                    <thead>
                                      <tr style={{ background: "rgba(51,65,85,0.65)" }}>
                                        <th className="px-2 py-1">控制项</th>
                                        <th className="px-2 py-1">规则等级</th>
                                        <th className="px-2 py-1">约束类型</th>
                                        <th className="px-2 py-1">约束值</th>
                                        <th className="px-2 py-1">单位</th>
                                        <th className="px-2 py-1">适用对象</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {selectedClauseKnowledgeObject.engineering_rules.map((row, idx) => (
                                        <tr key={`biz-er-${idx}`} style={{ borderTop: "1px solid rgba(148,163,184,0.25)" }}>
                                          <td className="px-2 py-1">{row.item}</td>
                                          <td className="px-2 py-1">{row.level}</td>
                                          <td className="px-2 py-1">{row.constraint}</td>
                                          <td className="px-2 py-1">{row.value}</td>
                                          <td className="px-2 py-1">{row.unit}</td>
                                          <td className="px-2 py-1">{row.target}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "constraints" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">条件约束</p>
                              {selectedClauseKnowledgeObject.condition_constraints.length <= 0 ? (
                                <p className="text-slate-300">未识别到显式数值约束。</p>
                              ) : (
                                <div className="space-y-2">
                                  {selectedClauseKnowledgeObject.condition_constraints.map((row, idx) => (
                                    <div key={`biz-cs-${idx}`} className="rounded p-2" style={{ background: "rgba(30,41,59,0.72)", border: "1px solid rgba(148,163,184,0.25)", color: "#e8eefc" }}>
                                      <p>{row.item} {row.operator} {row.value} {row.unit !== "-" ? row.unit : ""}</p>
                                      <p className="text-xs text-slate-300">规则等级：{row.level}</p>
                                      <p className="text-xs text-slate-400">来源：{row.source}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "process" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">流程要求</p>
                              {selectedClauseKnowledgeObject.process_requirements.length <= 0 ? (
                                <p className="text-slate-300">未识别到流程动作约束。</p>
                              ) : (
                                <ol className="list-decimal space-y-1 pl-5 text-slate-200">
                                  {selectedClauseKnowledgeObject.process_requirements.map((row, idx) => (
                                    <li key={`biz-proc-${idx}`}>{row}</li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "scope" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">适用范围</p>
                              <div className="grid gap-2 text-sm md:grid-cols-2" style={{ color: "#e8eefc" }}>
                                <p>适用对象：{selectedClauseKnowledgeObject.applicability.objects.join(" / ") || "-"}</p>
                                <p>适用角色：{selectedClauseKnowledgeObject.applicability.roles.join(" / ") || "-"}</p>
                                <p>适用工序：{selectedClauseKnowledgeObject.applicability.stages.join(" / ") || "-"}</p>
                                <p>表格引用：{selectedClauseKnowledgeObject.table_links.join("、") || "无"}</p>
                              </div>
                              {selectedClauseKnowledgeObject.explanation_lines.length > 0 ? (
                                <div className="mt-3 rounded p-2 text-sm" style={{ background: "rgba(30,41,59,0.72)", border: "1px solid rgba(148,163,184,0.25)", color: "#e8eefc" }}>
                                  <p className="mb-1 font-semibold">条文说明（工程解释层）</p>
                                  {selectedClauseKnowledgeObject.explanation_lines.map((line, idx) => (
                                    <p key={`biz-explain-${idx}`}>{line}</p>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "content" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">条文内容</p>
                              <div style={{ color: "#e8eefc" }}>
                                {selectedClauseKnowledgeObject.content.slice(0, 8).map((line, idx) => (
                                  <p key={`biz-content-${idx}`} className="mb-1">{line}</p>
                                ))}
                              </div>
                              {!selectedClauseKnowledgeObject.parse_integrity.is_complete ? (
                                <p className="mt-2 text-xs" style={{ color: "#fbbf24" }}>
                                  当前条文正文疑似截断，页面仅展示已解析片段。
                                </p>
                              ) : null}
                              <div className="mt-2 rounded p-2 text-sm" style={{ background: "rgba(51,65,85,0.6)", color: "#dbeafe", border: "1px solid rgba(148,163,184,0.35)" }}>
                                重点内容高亮：{selectedClauseKnowledgeObject.analysis.key_points[0] || "暂无重点内容"}
                              </div>
                              <p className="mt-2 text-sm text-slate-300">条文说明：{selectedClauseKnowledgeObject.analysis.engineering_interpretation}</p>
                            </div>
                          ) : null}

                          {normWorkbenchTab === "analysis" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">条文解析</p>
                              <p style={{ color: "#e8eefc" }}>条文要点：{selectedClauseKnowledgeObject.analysis.key_points.join("；") || "-"}</p>
                              <p style={{ color: "#e8eefc" }}>工程解释：{selectedClauseKnowledgeObject.analysis.engineering_interpretation}</p>
                              <p style={{ color: "#e8eefc" }}>适用场景：{selectedClauseKnowledgeObject.analysis.scenarios.join("、") || "-"}</p>
                              <p style={{ color: "#e8eefc" }}>常见问题：{selectedClauseKnowledgeObject.analysis.common_issues.join("、") || "-"}</p>
                            </div>
                          ) : null}

                          {normWorkbenchTab === "indicator" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">控制指标</p>
                              <div className="overflow-auto">
                                <table className="w-full min-w-[680px] text-left text-sm" style={{ color: "#e8eefc" }}>
                                  <thead>
                                    <tr style={{ background: "rgba(51,65,85,0.65)" }}>
                                      <th className="px-2 py-1">控制项</th>
                                      <th className="px-2 py-1">指标值</th>
                                      <th className="px-2 py-1">单位</th>
                                      <th className="px-2 py-1">检查方法</th>
                                      <th className="px-2 py-1">检查频率</th>
                                      <th className="px-2 py-1">验收要求</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedClauseKnowledgeObject.control_items.map((row, idx) => (
                                      <tr key={`biz-ind-${idx}`} style={{ borderTop: "1px solid rgba(148,163,184,0.25)" }}>
                                        <td className="px-2 py-1">{row.item}</td>
                                        <td className="px-2 py-1">{row.threshold}</td>
                                        <td className="px-2 py-1">{row.unit}</td>
                                        <td className="px-2 py-1">{row.method}</td>
                                        <td className="px-2 py-1">{row.frequency}</td>
                                        <td className="px-2 py-1">{row.acceptance}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}

                          {normWorkbenchTab === "forms" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">关联表单</p>
                              {selectedClauseKnowledgeObject.related_forms.slice(0, 6).map((card, idx) => (
                                <div key={`biz-form-${idx}`} className="mb-2 rounded p-2" style={{ background: "rgba(30,41,59,0.72)", border: "1px solid rgba(148,163,184,0.25)" }}>
                                  <p style={{ color: "#e8eefc" }}>表单名称：{card.title}</p>
                                  <p style={{ color: "#e8eefc" }}>表单编号：{card.id || `FM-${idx + 1}`}</p>
                                  <p style={{ color: "#e8eefc" }}>适用工序：{card.process}</p>
                                  <p style={{ color: "#e8eefc" }}>关联字段数量：{card.fieldCount}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "mapping" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">字段映射</p>
                              <div className="overflow-auto">
                                <table className="w-full min-w-[520px] text-left text-sm" style={{ color: "#e8eefc" }}>
                                  <thead>
                                    <tr style={{ background: "rgba(51,65,85,0.65)" }}>
                                      <th className="px-2 py-1">表单字段</th>
                                      <th className="px-2 py-1">中文名称</th>
                                      <th className="px-2 py-1">对应控制项</th>
                                      <th className="px-2 py-1">是否自动取值</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedClauseKnowledgeObject.field_mappings.map((row, idx) => (
                                      <tr key={`biz-map-${idx}`} style={{ borderTop: "1px solid rgba(148,163,184,0.25)" }}>
                                        <td className="px-2 py-1">{row.field}</td>
                                        <td className="px-2 py-1">{row.nameZh}</td>
                                        <td className="px-2 py-1">{row.mapped}</td>
                                        <td className="px-2 py-1">{row.autoValue}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}

                          {normWorkbenchTab === "formula" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">计算公式</p>
                              {(selectedClauseKnowledgeObject.formulas.length > 0 ? selectedClauseKnowledgeObject.formulas : selectedClauseKnowledgeObject.acceptance_rules).slice(0, 4).map((line, idx) => (
                                <div key={`biz-fml-card-${idx}`} className="mb-2 rounded p-2 text-sm" style={{ background: "#154a3d", border: "1px solid #2c7a68", color: "#e8fff6" }}>
                                  {line}
                                </div>
                              ))}
                              {selectedClauseKnowledgeObject.formulas.slice(0, 2).map((line, idx) => (
                                <p key={`biz-fml-${idx}`} className="mt-1 font-mono text-sm" style={{ color: "#9fb0d0" }}>{line}</p>
                              ))}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "refs" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">引用规范</p>
                              {selectedClauseKnowledgeObject.references.slice(0, 8).map((row, idx) => (
                                <div key={`biz-ref-${idx}`} className="mb-2 rounded p-2" style={{ background: "rgba(30,41,59,0.72)", border: "1px solid rgba(148,163,184,0.25)", color: "#e8eefc" }}>
                                  <p>规范名称：{row.normName}</p>
                                  <p>章节：{row.clause}</p>
                                  <p>normRef：{String(row.normRef || "-")}</p>
                                  <p>引用目的：{row.purpose}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {normWorkbenchTab === "spec_table" ? (
                            <div className="rounded-lg p-3" style={{ background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <p className="mb-2 font-semibold text-slate-200">规范表格</p>
                              {selectedClauseKnowledgeObject.spec_tables.map((table, tIdx) => (
                                <div key={`biz-spec-table-${tIdx}`} className="mb-3 rounded border p-2" style={{ borderColor: "rgba(148,163,184,0.35)", background: "rgba(30,41,59,0.72)" }}>
                                  <div className="mb-2 text-sm" style={{ color: "#e8eefc" }}>
                                    <p><strong>{table.table_no}</strong> {table.table_name}</p>
                                    <p>来源条文：{table.source_clause}</p>
                                    <p>关键项：{table.has_key_items ? "是" : "否"} ｜ 强制项：{table.has_mandatory_items ? "是" : "否"}</p>
                                  </div>
                                  <div className="overflow-auto">
                                    <table className="w-full min-w-[760px] text-left text-sm" style={{ color: "#e8eefc", borderCollapse: "collapse" }}>
                                      <thead>
                                        {table.header_rows.map((headRow, hIdx) => (
                                          <tr key={`spec-head-${tIdx}-${hIdx}`} style={{ background: "rgba(51,65,85,0.65)" }}>
                                            {headRow.map((col, cIdx) => (
                                              <th key={`spec-head-cell-${tIdx}-${hIdx}-${cIdx}`} className="px-2 py-1" style={{ border: "1px solid rgba(148,163,184,0.25)" }}>{col}</th>
                                            ))}
                                          </tr>
                                        ))}
                                      </thead>
                                      <tbody>
                                        {table.rows.map((row, rIdx) => (
                                          <tr key={`spec-row-${tIdx}-${rIdx}`} style={{ borderTop: "1px solid rgba(148,163,184,0.25)" }}>
                                            <td className="px-2 py-1" style={{ border: "1px solid rgba(148,163,184,0.25)" }}>
                                              {row.index_raw}
                                              {row.is_key_item ? <span className="ml-1 rounded px-1 text-[10px]" style={{ background: "#f59e0b", color: "#1f2937" }}>关键项</span> : null}
                                            </td>
                                            {row.check_item ? (
                                              <td rowSpan={Math.max(1, row.row_span)} className="px-2 py-1 align-top" style={{ border: "1px solid rgba(148,163,184,0.25)" }}>
                                                {row.check_item || "—"}
                                              </td>
                                            ) : null}
                                            <td className="px-2 py-1" style={{ border: "1px solid rgba(148,163,184,0.25)" }}>
                                              {row.sub_item || "—"}
                                            </td>
                                            <td className="px-2 py-1 font-semibold" style={{ border: "1px solid rgba(148,163,184,0.25)", color: "#fcd34d" }}>
                                              {row.tolerance}
                                              <span className="ml-1 text-xs text-slate-300">{row.unit && row.unit !== "-" ? `(${row.unit})` : ""}</span>
                                            </td>
                                            <td className="px-2 py-1" style={{ border: "1px solid rgba(148,163,184,0.25)" }}>
                                              <p>{row.inspection_method}</p>
                                              <p className="text-xs text-slate-300">{row.inspection_frequency}</p>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="mt-2 text-xs text-slate-300">
                                    {table.remarks.map((remark, ridx) => <p key={`spec-remark-${tIdx}-${ridx}`}>{remark}</p>)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <details
          id="section-review"
          ref={(el) => {
            reviewSectionRef.current = el;
          }}
          className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6"
        >
          <summary className="cursor-pointer text-lg font-semibold">E. 人工校验与签字</summary>
          <h2 className="mb-4 mt-4 text-lg font-semibold">E. 人工校验与签字</h2>
          <div className="grid gap-4 md:grid-cols-[1.5fr_1fr_auto]">
            <label className="field">
              <span>Job ID</span>
              <input value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} placeholder="ingest-xxxx" />
            </label>
            <label className="field">
              <span>审批人 ID</span>
              <input value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} placeholder="expert.001" />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void loadReviewJob()}
                disabled={reviewLoading}
                className="w-full rounded-xl border border-brand-400 px-4 py-2.5 text-sm text-brand-200 hover:bg-brand-500/10 disabled:opacity-60"
              >
                {reviewLoading ? "加载中..." : "加载资产"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="field">
              <span>审批人姓名</span>
              <input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} placeholder="领域专家" />
            </label>
            <label className="field">
              <span>审批备注（可选）</span>
              <input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="例如：条款核对通过" />
            </label>
          </div>

          {reviewError ? <p className="mt-4 rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200">{reviewError}</p> : null}
          {reviewSuccess ? <p className="mt-4 rounded-xl bg-emerald-500/15 p-3 text-sm text-emerald-200">{reviewSuccess}</p> : null}
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
            <h3 className="mb-2 text-sm font-semibold text-rose-100">规范语义冲突检测（同 slotKey）</h3>
            <p className="text-xs text-slate-300">
              未 override 冲突：<strong className={unresolvedSemanticConflicts.length > 0 ? "text-rose-300" : "text-emerald-300"}>{unresolvedSemanticConflicts.length}</strong> / 总冲突：{semanticConflicts.length}
            </p>
            {semanticConflicts.length === 0 ? (
              <p className="mt-2 text-xs text-emerald-200">当前未检测到冲突。</p>
            ) : (
              <div className="mt-2 max-h-60 overflow-auto rounded border border-slate-700">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="bg-slate-900/80 text-left text-slate-200">
                    <tr>
                      <th className="px-2 py-1">type</th>
                      <th className="px-2 py-1">slotKey</th>
                      <th className="px-2 py-1">condition</th>
                      <th className="px-2 py-1">left</th>
                      <th className="px-2 py-1">right</th>
                      <th className="px-2 py-1">override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {semanticConflicts.map((c) => {
                      const overridden = Boolean(conflictOverrideById[c.conflict_id]);
                      return (
                        <tr key={c.conflict_id} className="border-t border-slate-700/60">
                          <td className="px-2 py-1">{c.conflict_type}</td>
                          <td className="px-2 py-1 font-mono">{c.slotKey}</td>
                          <td className="px-2 py-1">{c.condition}</td>
                          <td className="px-2 py-1">{c.left_operator} {c.left_threshold} {c.left_unit} / v{c.left_version || "-"}</td>
                          <td className="px-2 py-1">{c.right_operator} {c.right_threshold} {c.right_unit} / v{c.right_version || "-"}</td>
                          <td className="px-2 py-1">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setConflictOverrideById((prev) => ({ ...prev, [c.conflict_id]: !prev[c.conflict_id] }))}
                                className={`rounded px-2 py-1 text-white ${overridden ? "bg-emerald-700" : "bg-amber-700"}`}
                              >
                                {overridden ? "已 override" : "确认 override"}
                              </button>
                              <input
                                value={conflictOverrideCommentById[c.conflict_id] || ""}
                                onChange={(e) => setConflictOverrideCommentById((prev) => ({ ...prev, [c.conflict_id]: e.target.value }))}
                                placeholder="override 说明"
                                className="min-w-[180px] rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!currentJobId ? (
            <p className="text-sm text-slate-400">{missingJobTip}</p>
          ) : reviewLoading ? (
            <p className="text-sm text-slate-400">loading / pending...</p>
          ) : reviewPackage ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                  <p>标准编号：{currentJobSpec.stdCode || reviewPackage.std_code || "-"}</p>
                  <p>标准版本：{reviewPackage.standard_version || artifactIndex?.spec_version || artifactIndex?.version || "-"}</p>
                  <p>任务ID：{currentJobId || reviewPackage.job_id || "-"}</p>
                  <p>源文件哈希：{reviewPackage.source_doc_hash || reviewPackage.source_artifacts?.source_doc_hash || artifactIndex?.source_doc_hash || "-"}</p>
                  <p>当前任务绑定表单：{rulePackMeta?.form_code || rulePackFormCode || "-"}</p>
                  <p>规范名称：{currentJobSpec.name || reviewPackage.title || "-"}</p>
                  <p>类型：{currentJobSpec.type || reviewPackage.spec_type || "-"}</p>
                  <p>条款节点数：{clauseTreeNodeCount}</p>
                  <p>资产校验对象数：{assetReviewRows.length}</p>
                  <p>Review Completion Rate：{reviewCompletionRate}%</p>
                  <p>已确认通过项数：{manualAssetApprovedCount}</p>
                  <p>需修改项数：{assetReviewSummaryFromApi ? assetReviewSummaryFromApi.needs_edit : "-"}</p>
                  <p>驳回项数：{assetReviewSummaryFromApi ? assetReviewSummaryFromApi.rejected : "-"}</p>
                  <p>clause_count：{layerOverview.components.clause_count}</p>
                  <p>specir_count：{layerOverview.components.specir_count}</p>
                  <p>component_count：{layerOverview.components.component_count}</p>
                  <p>component_blocked_count：{layerOverview.components.blocked_component_count}</p>
                  <p>已生成 Rule：{artifactRules.length}</p>
                  <p>已生成 Gate：{artifactGates.length}</p>
                  <p>ready_gate_count：{readyGateCountDisplay}</p>
                  <p>partial_gate_count：{partialGateCountDisplay}</p>
                  <p>blocked_gate_count：{blockedGateCountDisplay}</p>
                  <p>已生成 DTO：{artifactDtos.length}</p>
                  <p>条款树深度：{reviewPackage.clause_tree_stats?.max_depth ?? 0}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <h3 className="mb-3 text-base font-semibold text-cyan-100">规范库四层视图（以 SpecIR 为主资产）</h3>
                <p className="mb-3 text-xs text-cyan-200/90">核心原则：SpecIR 是主资产；Rule/Gate 是 SpecIR 派生产物。</p>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-100">1. Document IR</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-300">
                      <p>page_count：{layerOverview.documentIR.pageCount}</p>
                      <p>block_count：{layerOverview.documentIR.blockCount}</p>
                      <p>heading_count：{layerOverview.documentIR.headingCount}</p>
                      <p>clause_count：{layerOverview.documentIR.clauseCount}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-100">2. SpecIR 主资产</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-300">
                      <p>specir_count：{layerOverview.specIR.specirCount}</p>
                      <p>approved_count：{layerOverview.specIR.approvedSpecirCount}</p>
                      <p>unresolved_count：{layerOverview.specIR.unresolvedSpecirCount}</p>
                      <p>confidence_distribution：high={layerOverview.specIR.confidenceDistribution.high}, medium={layerOverview.specIR.confidenceDistribution.medium}, low={layerOverview.specIR.confidenceDistribution.low}</p>
                      <p>component_count：{layerOverview.components.component_count}</p>
                      <p>blocked_component_count：{layerOverview.components.blocked_component_count}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-100">3. 单表 rulepack</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-300">
                      <p>form_code：{layerOverview.rulepack.formCode}</p>
                      <p>selected_specir_count：{layerOverview.rulepack.selectedSpecirCount}</p>
                      <p>rule_count：{layerOverview.rulepack.ruleCount}</p>
                      <p>gate_count：{layerOverview.rulepack.gateCount}</p>
                      <p>publishable：{layerOverview.rulepack.publishable ? "true" : "false"}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-100">4. 人工校验签字</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-300">
                      <p>pending_review：{layerOverview.reviewSign.pending_review}</p>
                      <p>approved：{layerOverview.reviewSign.approved}</p>
                      <p>rejected：{layerOverview.reviewSign.rejected}</p>
                      <p>signed：{layerOverview.reviewSign.signed}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
                <h3 className="mb-3 text-base font-semibold text-fuchsia-100">Confidence 分布</h3>
                <div className="grid gap-3 md:grid-cols-3 text-xs text-slate-200">
                  <div className="rounded border border-slate-700 bg-slate-950/60 p-3">
                    <p className="font-semibold">总体</p>
                    <p>high: {confidenceSummary.totals.high}</p>
                    <p>medium: {confidenceSummary.totals.medium}</p>
                    <p>low: {confidenceSummary.totals.low}</p>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-950/60 p-3">
                    <p className="font-semibold">核心对象</p>
                    <p>SpecIR: H{confidenceSummary.specIR.high}/M{confidenceSummary.specIR.medium}/L{confidenceSummary.specIR.low}</p>
                    <p>Rule: H{confidenceSummary.rule.high}/M{confidenceSummary.rule.medium}/L{confidenceSummary.rule.low}</p>
                    <p>Gate: H{confidenceSummary.gate.high}/M{confidenceSummary.gate.medium}/L{confidenceSummary.gate.low}</p>
                    <p>Component: H{confidenceSummary.component.high}/M{confidenceSummary.component.medium}/L{confidenceSummary.component.low}</p>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-950/60 p-3">
                    <p className="font-semibold">解析链路</p>
                    <p>Document IR: H{confidenceSummary.docIR.high}/M{confidenceSummary.docIR.medium}/L{confidenceSummary.docIR.low}</p>
                    <p>Catalog: H{confidenceSummary.catalog.high}/M{confidenceSummary.catalog.medium}/L{confidenceSummary.catalog.low}</p>
                    <p>normRef: H{confidenceSummary.normRef.high}/M{confidenceSummary.normRef.medium}/L{confidenceSummary.normRef.low}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-300">规则：low 进入人工校验；medium 可生成但发布前抽检；high 自动通过并记录审计。</p>
              </div>
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <h3 className="mb-3 text-base font-semibold text-amber-100">完整规范资产流水线</h3>
                {!pipelineStatus ? (
                  <p className="text-xs text-slate-300">未加载流水线状态。</p>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="grid gap-2 md:grid-cols-3">
                      <p>当前阶段：<strong>{pipelineStatus.current_stage || "-"}</strong></p>
                      <p>当前 blocker：<strong>{pipelineStatus.current_blocker || "-"}</strong></p>
                      <p>下一步操作：<strong>{pipelineStatus.next_action || "-"}</strong></p>
                    </div>
                    <div className="max-h-56 overflow-auto rounded border border-slate-700">
                      <table className="w-full text-left">
                        <thead className="bg-slate-900/80 text-slate-200">
                          <tr>
                            <th className="px-2 py-1">阶段</th>
                            <th className="px-2 py-1">状态</th>
                            <th className="px-2 py-1">artifact</th>
                            <th className="px-2 py-1">失败可回溯</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(pipelineStatus.pipeline || []).map((row) => (
                            <tr key={String(row.key || row.name || "")} className="border-t border-slate-700/60">
                              <td className="px-2 py-1">{row.name || row.key || "-"}</td>
                              <td className="px-2 py-1">{row.status || "-"}</td>
                              <td className="px-2 py-1">{Array.isArray(row.artifacts) && row.artifacts.length > 0 ? row.artifacts.join(", ") : "-"}</td>
                              <td className="px-2 py-1">{Array.isArray(row.blockers) && row.blockers.length > 0 ? row.blockers.join(" | ") : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-lime-500/30 bg-lime-500/5 p-4">
                <h3 className="mb-2 text-base font-semibold text-lime-100">Production Release Pipeline</h3>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={productionReleaseDryRun} onChange={(e) => setProductionReleaseDryRun(e.target.checked)} />
                    <span>Dry Run</span>
                  </label>
                  <button
                    type="button"
                    disabled={productionReleaseRunning}
                    className="rounded border border-lime-400 px-3 py-1 text-lime-200 hover:bg-lime-500/10 disabled:opacity-60"
                    onClick={() => void runProductionReleasePipeline(String(selectedJobId || reviewPackage?.job_id || ""))}
                  >
                    {productionReleaseRunning ? "执行中..." : "执行完整发布流程"}
                  </button>
                </div>
                {!productionReleaseReport ? (
                  <p className="text-xs text-slate-300">未生成发布链报告。</p>
	                ) : (
	                  <div className="space-y-2 text-xs">
	                    <p>status: <strong>{productionReleaseReport.status || "-"}</strong> | publish_state: <strong>{productionReleaseReport.publish_state || "-"}</strong> | stopped_at: <strong>{productionReleaseReport.stopped_at || "-"}</strong> | generated_at: <strong>{productionReleaseReport.generated_at || "-"}</strong></p>
	                    <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-amber-100">
	                      <p className="font-semibold">为什么不能发布</p>
	                      <p>{Array.isArray(productionReleaseReport.blocked_reason) && productionReleaseReport.blocked_reason.length > 0 ? productionReleaseReport.blocked_reason.join(" | ") : "-"}</p>
	                    </div>
	                    <div className="rounded border border-slate-700 bg-slate-950/60 p-2 text-slate-200">
	                      <p>impacted_forms: {Array.isArray(productionReleaseReport.impacted_forms) ? productionReleaseReport.impacted_forms.join(", ") : "-"}</p>
	                      <p>missing_dependencies: {Array.isArray(productionReleaseReport.missing_dependencies) ? productionReleaseReport.missing_dependencies.join(", ") : "-"}</p>
	                    </div>
	                    {productionReleaseDryRun ? (
	                      <div className="rounded border border-lime-500/30 bg-lime-500/10 p-2 text-lime-100">
	                        <p className="font-semibold">Dry Run Report</p>
	                        <p>publish_report: {productionReleaseReport.dry_run_report?.publish_report ? "ok" : "-"}</p>
	                        <p>blocked_reason: {Array.isArray(productionReleaseReport.dry_run_report?.blocked_reason) ? productionReleaseReport.dry_run_report?.blocked_reason?.join(" | ") : "-"}</p>
	                        <p>impacted_forms: {Array.isArray(productionReleaseReport.dry_run_report?.impacted_forms) ? productionReleaseReport.dry_run_report?.impacted_forms?.join(", ") : "-"}</p>
	                        <p>missing_dependencies: {Array.isArray(productionReleaseReport.dry_run_report?.missing_dependencies) ? productionReleaseReport.dry_run_report?.missing_dependencies?.join(", ") : "-"}</p>
	                      </div>
	                    ) : null}
	                    <div className="max-h-72 overflow-auto rounded border border-slate-700 bg-slate-950/60">
                      <table className="w-full min-w-[1100px] text-left">
                        <thead className="bg-slate-900/80 text-slate-200">
                          <tr>
                            <th className="px-2 py-1">step</th>
                            <th className="px-2 py-1">status</th>
                            <th className="px-2 py-1">logs</th>
                            <th className="px-2 py-1">artifacts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(productionReleaseReport.steps || []).map((s, idx) => (
                            <tr key={`${String(s.name || "step")}-${idx}`} className="border-t border-slate-700/60 align-top">
                              <td className="px-2 py-1">{s.name || "-"}</td>
                              <td className="px-2 py-1">{s.status || "-"}</td>
                              <td className="px-2 py-1">{Array.isArray(s.logs) && s.logs.length > 0 ? s.logs.join(" | ") : "-"}</td>
                              <td className="px-2 py-1">{Array.isArray(s.artifacts) && s.artifacts.length > 0 ? s.artifacts.join(" | ") : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <h3 className="mb-2 text-base font-semibold text-cyan-100">Production Audit Center</h3>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <input
                    className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1"
                    value={productionAuditEventId}
                    onChange={(e) => setProductionAuditEventId(e.target.value)}
                    placeholder="event_id（用于 diff）"
                  />
                  <button
                    type="button"
                    className="rounded border border-cyan-400 px-2 py-1 text-cyan-200 hover:bg-cyan-500/10"
                    onClick={() => void loadProductionAuditCenter()}
                  >
                    {productionAuditBusy ? "加载中..." : "刷新时间线"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-emerald-400 px-2 py-1 text-emerald-200 hover:bg-emerald-500/10"
                    onClick={() => void exportProductionAuditReport()}
                  >
                    导出审计报告
                  </button>
                </div>
                {!productionAuditTimeline ? (
                  <p className="text-xs text-slate-300">未加载审计时间线。</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    <p>
                      immutable: <strong>{productionAuditTimeline.immutable ? "true" : "false"}</strong>
                      {" | "}chain_valid: <strong>{productionAuditTimeline.chain_valid ? "true" : "false"}</strong>
                      {" | "}events: <strong>{Number(productionAuditTimeline.items?.length || 0)}</strong>
                    </p>
                    <div className="max-h-52 overflow-auto rounded border border-slate-700 bg-slate-950/60">
                      <table className="w-full min-w-[920px] text-left">
                        <thead className="bg-slate-900/80 text-slate-200">
                          <tr>
                            <th className="px-2 py-1">time</th>
                            <th className="px-2 py-1">event_type</th>
                            <th className="px-2 py-1">actor</th>
                            <th className="px-2 py-1">target</th>
                            <th className="px-2 py-1">event_id</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(productionAuditTimeline.items || []).map((it, idx) => (
                            <tr key={`${String(it.event_id || "")}-${idx}`} className="border-t border-slate-700/60">
                              <td className="px-2 py-1">{it.time || "-"}</td>
                              <td className="px-2 py-1">{it.event_type || "-"}</td>
                              <td className="px-2 py-1">{it.actor || "-"}</td>
                              <td className="px-2 py-1">{it.target || "-"}</td>
                              <td className="px-2 py-1">
                                <button type="button" className="rounded border border-slate-500 px-2 py-0.5" onClick={() => setProductionAuditEventId(String(it.event_id || ""))}>
                                  {it.event_id || "-"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {productionAuditDiff ? (
                  <div className="mt-3 rounded border border-slate-700 bg-slate-950/60 p-2 text-xs">
                    <p>event_id: <strong>{productionAuditDiff.event_id || "-"}</strong> | type: <strong>{productionAuditDiff.event_type || "-"}</strong> | actor: <strong>{productionAuditDiff.actor || "-"}</strong></p>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-slate-200">{JSON.stringify(productionAuditDiff.diff || {}, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h3 className="mb-2 text-base font-semibold text-emerald-100">SpecIR Knowledge Graph</h3>
                <div className="mb-3 grid gap-2 md:grid-cols-4">
                  <input className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs" value={specirGraphQuery} onChange={(e) => setSpecirGraphQuery(e.target.value)} placeholder="query (q)" />
                  <input className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs" value={specirGraphNodeType} onChange={(e) => setSpecirGraphNodeType(e.target.value)} placeholder="node_type" />
                  <input className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs" value={specirGraphNodeId} onChange={(e) => setSpecirGraphNodeId(e.target.value)} placeholder="node_id (impact seed)" />
                  <button
                    type="button"
                    className="rounded border border-emerald-400 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10"
                    onClick={() => void loadReviewJob(String(selectedJobId || reviewPackage?.job_id || ""))}
                  >
                    查询子图
                  </button>
                </div>
                <div className="mb-3 grid gap-2 md:grid-cols-4">
                  <input className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs" value={specirImpactNormRef} onChange={(e) => setSpecirImpactNormRef(e.target.value)} placeholder="normRef（影响查询）" />
                  <input className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs" value={specirImpactSlotKey} onChange={(e) => setSpecirImpactSlotKey(e.target.value)} placeholder="slotKey（影响查询）" />
                  <input className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs" value={specirImpactSpecirId} onChange={(e) => setSpecirImpactSpecirId(e.target.value)} placeholder="specir_id（变更影响）" />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-cyan-400 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-500/10"
                      onClick={() => void runSpecIRImpactQuery(String(selectedJobId || reviewPackage?.job_id || ""))}
                    >
                      查询影响范围
                    </button>
                    <button
                      type="button"
                      className="rounded border border-fuchsia-400 px-2 py-1 text-xs text-fuchsia-200 hover:bg-fuchsia-500/10"
                      onClick={() => void runSpecIRPublishImpactReport(String(selectedJobId || reviewPackage?.job_id || ""))}
                    >
                      发布前影响报告
                    </button>
                  </div>
                </div>
                {!specirGraph?.graph ? (
                  <p className="text-xs text-slate-300">未加载知识图谱。</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    <p>nodes: <strong>{Number(specirGraph.graph.node_count || specirGraph.graph.nodes?.length || 0)}</strong> | edges: <strong>{Number(specirGraph.graph.edge_count || specirGraph.graph.edges?.length || 0)}</strong></p>
                    <div className="overflow-auto rounded border border-slate-700 bg-slate-950/60 p-2">
                      <svg width={760} height={360}>
                        {(() => {
                          const nodes = (specirGraph.graph?.nodes || []).slice(0, 48);
                          const edges = (specirGraph.graph?.edges || []).slice(0, 120);
                          const cx = 380;
                          const cy = 180;
                          const r = 130;
                          const pos: Record<string, { x: number; y: number }> = {};
                          nodes.forEach((n, i) => {
                            const a = (Math.PI * 2 * i) / Math.max(nodes.length, 1);
                            pos[String(n.id || "")] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
                          });
                          return (
                            <>
                              {edges.map((e, i) => {
                                const p1 = pos[String(e.source || "")];
                                const p2 = pos[String(e.target || "")];
                                if (!p1 || !p2) return null;
                                return <line key={`e-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#64748b" strokeWidth="1" opacity="0.65" />;
                              })}
                              {nodes.map((n, i) => {
                                const p = pos[String(n.id || "")];
                                if (!p) return null;
                                return (
                                  <g key={`n-${i}`}>
                                    <circle cx={p.x} cy={p.y} r={7} fill="#22d3ee" />
                                    <text x={p.x + 9} y={p.y + 3} fill="#e2e8f0" fontSize="10">{String(n.type || "")}:{String(n.label || n.id || "").slice(0, 22)}</text>
                                  </g>
                                );
                              })}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded border border-cyan-400 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-500/10"
                        onClick={() => void runSpecIRGraphImpact(String(selectedJobId || reviewPackage?.job_id || ""))}
                      >
                        影响分析
                      </button>
                      <button
                        type="button"
                        className="rounded border border-indigo-400 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/10"
                        onClick={() => void runFormImpactPropagation(String(selectedJobId || reviewPackage?.job_id || ""))}
                      >
                        自动传播
                      </button>
                      <button
                        type="button"
                        className="rounded border border-amber-400 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/10"
                        onClick={() => void runFormImpactDiff(String(selectedJobId || reviewPackage?.job_id || ""))}
                      >
                        版本 Diff
                      </button>
                    </div>
                    {specirImpact ? (
                      <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-2">
                        <p>impact: nodes=<strong>{Number(specirImpact.summary?.node_count || 0)}</strong>, edges=<strong>{Number(specirImpact.summary?.edge_count || 0)}</strong></p>
                        <p>Form={Number(specirImpact.summary?.affected_forms?.length || 0)} | Rule={Number(specirImpact.summary?.affected_rules?.length || 0)} | Gate={Number(specirImpact.summary?.affected_gates?.length || 0)} | Rulepack={Number(specirImpact.summary?.affected_rulepacks?.length || 0)} | NormDoc={Number(specirImpact.summary?.affected_normdocs?.length || 0)}</p>
                      </div>
                    ) : null}
                    {specirPublishImpactReport ? (
                      <div className="rounded border border-fuchsia-500/30 bg-fuchsia-500/5 p-2">
                        <p>publish impact report: {String((specirPublishImpactReport.generated_at as string) || "-")}</p>
                        <p>affected forms: <strong>{Number((specirPublishImpactReport.affected_forms as unknown[] | undefined)?.length || 0)}</strong></p>
                        <p>affected rules: <strong>{Number((specirPublishImpactReport.affected_rules as unknown[] | undefined)?.length || 0)}</strong></p>
                        <p>affected gates: <strong>{Number((specirPublishImpactReport.affected_gates as unknown[] | undefined)?.length || 0)}</strong></p>
                        <p>affected rulepacks: <strong>{Number((specirPublishImpactReport.affected_rulepacks as unknown[] | undefined)?.length || 0)}</strong></p>
                        <p>affected normdocs: <strong>{Number((specirPublishImpactReport.affected_normdocs as unknown[] | undefined)?.length || 0)}</strong></p>
                      </div>
                    ) : null}
                    {formImpactPropagation ? (
                      <div className="rounded border border-indigo-500/30 bg-indigo-500/5 p-2">
                        <p>propagation affected_forms: <strong>{Number(formImpactPropagation.count || formImpactPropagation.affected_forms?.length || 0)}</strong></p>
                        <div className="mt-1 max-h-32 overflow-auto text-[11px]">
                          {(formImpactPropagation.affected_forms || []).slice(0, 12).map((row, idx) => (
                            <p key={`${String(row.form_code || "")}-${idx}`}>
                              {String(row.form_code || "-")} | confidence={Number(row.confidence || 0).toFixed(4)}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {formImpactDiff ? (
                      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
                        <p>diff: <strong>{formImpactDiff.left_rulepack || "-"}</strong>{" -> "}<strong>{formImpactDiff.right_rulepack || "-"}</strong></p>
                        <p>
                          +nodes=<strong>{Number(formImpactDiff.summary?.added_node_count || 0)}</strong>, -nodes=<strong>{Number(formImpactDiff.summary?.removed_node_count || 0)}</strong>,
                          +edges=<strong>{Number(formImpactDiff.summary?.added_edge_count || 0)}</strong>, -edges=<strong>{Number(formImpactDiff.summary?.removed_edge_count || 0)}</strong>
                        </p>
                      </div>
                    ) : null}
                    {specirCrossNorm ? (
                      <p>跨规范关系: <strong>{Number(specirCrossNorm.summary?.total || 0)}</strong>（当前 norm_version: {specirCrossNorm.current_norm_version || "-"})</p>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h3 className="mb-2 text-base font-semibold text-emerald-100">Rulepack Golden Set（黄金样本库）</h3>
                {!goldenSet ? (
                  <p className="text-xs text-slate-300">未加载黄金样本。</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    <p>form_code: <strong>{goldenSet.form_code || "-"}</strong> | version: <strong>{goldenSet.version || "-"}</strong> | total: <strong>{goldenSet.total || 0}</strong> | normRef绑定: <strong>{goldenSet.normref_bound || 0}</strong> / 缺失: <strong>{goldenSet.normref_missing || 0}</strong></p>
                    <div className="max-h-56 overflow-auto rounded border border-slate-700">
                      <table className="w-full min-w-[1200px] text-left">
                        <thead className="bg-slate-900/80 text-slate-200">
                          <tr>
                            <th className="px-2 py-1">field_name</th>
                            <th className="px-2 py-1">expected_specir</th>
                            <th className="px-2 py-1">expected_rule</th>
                            <th className="px-2 py-1">expected_gate</th>
                            <th className="px-2 py-1">expected_threshold</th>
                            <th className="px-2 py-1">expected_operator</th>
                            <th className="px-2 py-1">expected_unit</th>
                            <th className="px-2 py-1">normRef</th>
                            <th className="px-2 py-1">source_clause</th>
                            <th className="px-2 py-1">source_text</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(goldenSet.items || []).map((row, idx) => (
                            <tr key={`${String(row.field_name || "-")}-${idx}`} className="border-t border-slate-700/60">
                              <td className="px-2 py-1">{row.field_name || "-"}</td>
                              <td className="px-2 py-1">{row.expected_specir || "-"}</td>
                              <td className="px-2 py-1">{row.expected_rule || "-"}</td>
                              <td className="px-2 py-1">{row.expected_gate || "-"}</td>
                              <td className="px-2 py-1">{String(row.expected_threshold ?? "-")}</td>
                              <td className="px-2 py-1">{row.expected_operator || "-"}</td>
                              <td className="px-2 py-1">{row.expected_unit || "-"}</td>
                              <td className="px-2 py-1">{row.normRef || "-"}</td>
                              <td className="px-2 py-1">{row.source_clause || "-"}</td>
                              <td className="px-2 py-1">{row.source_text || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="mt-3 rounded border border-slate-700 bg-slate-950/50 p-2 text-xs">
                  <p className="mb-2 text-slate-200">Baseline 历史版本</p>
                  {!goldenHistory || !Array.isArray(goldenHistory.history) || goldenHistory.history.length === 0 ? (
                    <p className="text-slate-400">暂无 baseline 历史。</p>
                  ) : (
                    <div className="max-h-40 overflow-auto">
                      <table className="w-full text-left">
                        <thead className="text-slate-300">
                          <tr>
                            <th className="px-2 py-1">version</th>
                            <th className="px-2 py-1">from</th>
                            <th className="px-2 py-1">updated_by</th>
                            <th className="px-2 py-1">updated_at</th>
                            <th className="px-2 py-1">diff(old→new)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {goldenHistory.history.map((h, idx) => (
                            <tr key={`${String(h.version || "-")}-${idx}`} className="border-t border-slate-700/60">
                              <td className="px-2 py-1">{h.version || "-"}</td>
                              <td className="px-2 py-1">{h.from_version || "-"}</td>
                              <td className="px-2 py-1">{h.updated_by || "-"}</td>
                              <td className="px-2 py-1">{h.updated_at || "-"}</td>
                              <td className="px-2 py-1">{String(h.diff?.old_sample_count ?? "-")} → {String(h.diff?.new_sample_count ?? "-")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <h3 className="mb-2 text-base font-semibold text-cyan-100">Build Artifact Registry</h3>
                {!artifactRegistry || !artifactRegistry.artifacts ? (
                  <p className="text-xs text-slate-300">未加载 artifact registry。</p>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="max-h-64 overflow-auto rounded border border-slate-700">
                      <table className="w-full min-w-[1000px] text-left">
                        <thead className="bg-slate-900/80 text-slate-200">
                          <tr>
                            <th className="px-2 py-1">artifact</th>
                            <th className="px-2 py-1">latest version</th>
                            <th className="px-2 py-1">created_at</th>
                            <th className="px-2 py-1">created_by</th>
                            <th className="px-2 py-1">hash</th>
                            <th className="px-2 py-1">actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(artifactRegistry.artifacts || {}).map(([name, versions]) => {
                            const rows = Array.isArray(versions) ? versions : [];
                            const latest = rows.length > 0 ? rows[rows.length - 1] : undefined;
                            return (
                              <tr key={name} className="border-t border-slate-700/60">
                                <td className="px-2 py-1">{name}</td>
                                <td className="px-2 py-1">{latest?.version || "-"}</td>
                                <td className="px-2 py-1">{latest?.created_at || "-"}</td>
                                <td className="px-2 py-1">{latest?.created_by || "-"}</td>
                                <td className="px-2 py-1">{latest?.hash || "-"}</td>
                                <td className="px-2 py-1">
                                  <div className="flex gap-2">
                                    <button type="button" className="rounded border border-cyan-400 px-2 py-1" onClick={() => latest?.artifact_id && void downloadArtifactVersion(String(artifactRegistry.job_id || selectedJobId || ""), String(latest.artifact_id || ""))}>download</button>
                                    <button type="button" className="rounded border border-amber-400 px-2 py-1" onClick={() => void diffArtifactLatestTwo(String(artifactRegistry.job_id || selectedJobId || ""), name, rows)}>diff</button>
                                    <button type="button" className="rounded border border-rose-400 px-2 py-1" onClick={() => latest?.artifact_id && void rollbackArtifactVersion(String(artifactRegistry.job_id || selectedJobId || ""), name, String(latest.artifact_id || ""))}>rollback</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {artifactRegistryDiff.length > 0 ? (
                      <pre className="max-h-52 overflow-auto rounded border border-slate-700 bg-slate-950/70 p-2 text-[11px] text-slate-200">{artifactRegistryDiff.join("\n")}</pre>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                <h3 className="mb-2 text-base font-semibold text-indigo-100">Norm Version Registry（规范版本历史）</h3>
                {!normVersionHistory || !Array.isArray(normVersionHistory.history) || normVersionHistory.history.length === 0 ? (
                  <p className="text-xs text-slate-300">暂无规范版本历史。</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    <p>norm_id：<strong>{normVersionHistory.norm_id || "-"}</strong> | versions：<strong>{normVersionHistory.history.length}</strong></p>
                    <div className="max-h-56 overflow-auto rounded border border-slate-700">
                      <table className="w-full min-w-[1100px] text-left">
                        <thead className="bg-slate-900/80 text-slate-200">
                          <tr>
                            <th className="px-2 py-1">norm_name</th>
                            <th className="px-2 py-1">version</th>
                            <th className="px-2 py-1">effective_date</th>
                            <th className="px-2 py-1">source_hash</th>
                            <th className="px-2 py-1">parent_version</th>
                            <th className="px-2 py-1">status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {normVersionHistory.history.map((row, idx) => (
                            <tr key={`${String(row.version || "-")}-${idx}`} className="border-t border-slate-700/60">
                              <td className="px-2 py-1">{row.norm_name || "-"}</td>
                              <td className="px-2 py-1">{row.version || "-"}</td>
                              <td className="px-2 py-1">{row.effective_date || "-"}</td>
                              <td className="px-2 py-1">{row.source_hash || row.source_file_hash || "-"}</td>
                              <td className="px-2 py-1">{row.parent_version || "-"}</td>
                              <td className="px-2 py-1">{row.status || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
                <h3 className="mb-2 text-base font-semibold text-rose-100">Rulepack Rollback</h3>
                <div className="mb-3 grid gap-2 text-xs md:grid-cols-3">
                  <p>form_code：<strong>{String(rulePackMeta?.form_code || rulePackFormCode || "-")}</strong></p>
                  <p>当前 active version：<strong>{String(releaseHistory?.active_version || releaseHistory?.current?.active_version || "-")}</strong></p>
                  <p>历史发布记录：<strong>{Array.isArray(releaseHistory?.history) ? releaseHistory?.history?.length : (Array.isArray(releaseHistory?.current?.history) ? releaseHistory?.current?.history?.length : 0)}</strong></p>
                </div>
                <div className="mb-3 grid gap-2 md:grid-cols-3">
                  <label className="field">
                    <span>rollback_reason</span>
                    <input value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} placeholder="manual rollback" />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={rollbackBusy}
                      onClick={() => void triggerRollback(true, false)}
                      className="w-full rounded-xl border border-amber-400 px-4 py-2.5 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
                    >
                      {rollbackBusy ? "处理中..." : "Dry Run"}
                    </button>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={rollbackBusy}
                      onClick={() => void triggerRollback(false, false)}
                      className="w-full rounded-xl border border-rose-400 px-4 py-2.5 text-sm text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
                    >
                      {rollbackBusy ? "处理中..." : "一键回滚"}
                    </button>
                  </div>
                </div>
                <div className="mb-2">
                  <button
                    type="button"
                    disabled={rollbackBusy}
                    onClick={() => void triggerRollback(false, true)}
                    className="rounded-xl border border-fuchsia-400 px-3 py-1.5 text-xs text-fuchsia-200 hover:bg-fuchsia-500/10 disabled:opacity-60"
                  >
                    Force Rollback
                  </button>
                </div>
                <div className="max-h-44 overflow-auto rounded border border-slate-700 bg-slate-950/50 p-2 text-xs">
                  {!releaseHistory || !(Array.isArray(releaseHistory.history) || Array.isArray(releaseHistory.current?.history)) ? (
                    <p className="text-slate-400">暂无发布历史。</p>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="text-slate-300">
                        <tr>
                          <th className="px-2 py-1">action</th>
                          <th className="px-2 py-1">from</th>
                          <th className="px-2 py-1">to</th>
                          <th className="px-2 py-1">operator</th>
                          <th className="px-2 py-1">time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(releaseHistory.history) ? releaseHistory.history : (releaseHistory.current?.history || [])).map((h, idx) => (
                          <tr key={`${String(h.time || "-")}-${idx}`} className="border-t border-slate-700/60">
                            <td className="px-2 py-1">{h.action || "-"}</td>
                            <td className="px-2 py-1">{h.from_version || "-"}</td>
                            <td className="px-2 py-1">{h.to_version || h.version || "-"}</td>
                            <td className="px-2 py-1">{h.operator || "-"}</td>
                            <td className="px-2 py-1">{h.time || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <h3 className="mb-2 text-base font-semibold text-cyan-100">Rulepack Quality Dashboard</h3>
                {!qualityDashboard?.dashboard ? (
                  <p className="text-xs text-slate-300">未加载质量看板。</p>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="grid gap-2 md:grid-cols-3">
                      <p>今日构建 build_count：<strong>{Number(qualityDashboard.dashboard.today_build?.build_count || 0)}</strong></p>
                      <p>success_count：<strong>{Number(qualityDashboard.dashboard.today_build?.success_count || 0)}</strong></p>
                      <p>failed_count：<strong>{Number(qualityDashboard.dashboard.today_build?.failed_count || 0)}</strong></p>
                    </div>
                    <div className="grid gap-2 md:grid-cols-4">
                      <p>rule_count：<strong>{Number(qualityDashboard.dashboard.rule_quality?.rule_count || 0)}</strong></p>
                      <p>gate_count：<strong>{Number(qualityDashboard.dashboard.rule_quality?.gate_count || 0)}</strong></p>
                      <p>missing_gate_count：<strong>{Number(qualityDashboard.dashboard.rule_quality?.missing_gate_count || 0)}</strong></p>
                      <p>unresolved_count：<strong>{Number(qualityDashboard.dashboard.rule_quality?.unresolved_count || 0)}</strong></p>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <p>publish_success_rate：<strong>{Number(qualityDashboard.dashboard.publish_quality?.publish_success_rate || 0).toFixed(4)}</strong></p>
                      <p>rollback_count：<strong>{Number(qualityDashboard.dashboard.publish_quality?.rollback_count || 0)}</strong></p>
                      <p>gray_release_count：<strong>{Number(qualityDashboard.dashboard.publish_quality?.gray_release_count || 0)}</strong></p>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <p>form_coverage_rate：<strong>{Number(qualityDashboard.dashboard.form_quality?.form_coverage_rate || 0).toFixed(4)}</strong></p>
                      <p>auto_gate_rate：<strong>{Number(qualityDashboard.dashboard.form_quality?.auto_gate_rate || 0).toFixed(4)}</strong></p>
                      <p>manual_review_rate：<strong>{Number(qualityDashboard.dashboard.form_quality?.manual_review_rate || 0).toFixed(4)}</strong></p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
                        <p className="mb-1 text-slate-200">Top unresolved</p>
                        {(qualityDashboard.dashboard.top_issues?.top_unresolved || []).slice(0, 5).map((r, idx) => (
                          <p key={`u-${idx}`}>{r.reason || "-"}: {Number(r.count || 0)}</p>
                        ))}
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
                        <p className="mb-1 text-slate-200">Top missing_gate</p>
                        {(qualityDashboard.dashboard.top_issues?.top_missing_gate || []).slice(0, 5).map((r, idx) => (
                          <p key={`m-${idx}`}>{r.field || "-"}: {Number(r.count || 0)}</p>
                        ))}
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-950/50 p-2">
                        <p className="mb-1 text-slate-200">Top regression_failures</p>
                        {(qualityDashboard.dashboard.top_issues?.top_regression_failures || []).slice(0, 5).map((r, idx) => (
                          <p key={`r-${idx}`}>{r.target || "-"}: {Number(r.count || 0)}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
                <h3 className="mb-2 text-base font-semibold text-sky-100">Quality Trend Analytics</h3>
                <div className="mb-3 grid gap-2 md:grid-cols-4">
                  <label className="field">
                    <span>granularity</span>
                    <select value={trendGranularity} onChange={(e) => setTrendGranularity(e.target.value as "day" | "week" | "month")}>
                      <option value="day">day</option>
                      <option value="week">week</option>
                      <option value="month">month</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>compare_norm_version</span>
                    <input value={trendCompareNormVersion} onChange={(e) => setTrendCompareNormVersion(e.target.value)} placeholder="可选，对比版本" />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => void loadReviewJob(currentJobId || selectedJobId)}
                      className="w-full rounded-xl border border-sky-400 px-4 py-2.5 text-sm text-sky-200 hover:bg-sky-500/10"
                    >
                      刷新趋势
                    </button>
                  </div>
                </div>
                {!qualityTrend?.analytics ? (
                  <p className="text-xs text-slate-300">未加载趋势分析。</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    <p>quality_report：<strong>{qualityTrend.analytics.quality_report_path || "-"}</strong></p>
                    <div className="max-h-64 overflow-auto rounded border border-slate-700">
                      <table className="w-full min-w-[900px] text-left">
                        <thead className="bg-slate-900/80 text-slate-200">
                          <tr>
                            <th className="px-2 py-1">bucket</th>
                            <th className="px-2 py-1">rule_count</th>
                            <th className="px-2 py-1">gate_coverage</th>
                            <th className="px-2 py-1">unresolved</th>
                            <th className="px-2 py-1">publish_success_rate</th>
                            <th className="px-2 py-1">rollback</th>
                            <th className="px-2 py-1">compare_rule_count</th>
                            <th className="px-2 py-1">compare_unresolved</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(qualityTrend.analytics.trends || []).map((row, idx) => {
                            const cmp = (qualityTrend.analytics?.compare_trends || []).find((x) => String(x.bucket || "") === String(row.bucket || ""));
                            return (
                              <tr key={`${String(row.bucket || "-")}-${idx}`} className="border-t border-slate-700/60">
                                <td className="px-2 py-1">{row.bucket || "-"}</td>
                                <td className="px-2 py-1">{Number(row.rule_count || 0)}</td>
                                <td className="px-2 py-1">{Number(row.gate_coverage || 0).toFixed(4)}</td>
                                <td className="px-2 py-1">{Number(row.unresolved_count || 0)}</td>
                                <td className="px-2 py-1">{Number(row.publish_success_rate || 0).toFixed(4)}</td>
                                <td className="px-2 py-1">{Number(row.rollback_count || 0)}</td>
                                <td className="px-2 py-1">{Number(cmp?.rule_count || 0)}</td>
                                <td className="px-2 py-1">{Number(cmp?.unresolved_count || 0)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                <h3 className="mb-2 text-sm font-semibold">人工确认对象（SpecIR 主资产）</h3>
                <p className="mb-2 text-xs text-slate-400">
                  说明：每条可执行 SpecIR 均按 body/gate/cal 三段校验；`通过/需修改/驳回` 是审核结论；`展开修复` 后应用 patch 才会真正改写 SpecIR 主资产。
                </p>
                <p className="mb-2 text-xs text-amber-300">排序规则：low confidence 优先。</p>
                {assetReviewRows.length === 0 ? (
                  <p className="text-xs text-slate-400">暂无可人工确认资产。</p>
                ) : (
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400">当前列表：{filteredAssetReviewRows.length} / {assetReviewRows.length}</span>
                      <select
                        value={assetReviewDecisionFilter}
                        onChange={(e) => setAssetReviewDecisionFilter(e.target.value as "all" | "unsubmitted" | "approved" | "needs_edit" | "rejected")}
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
                      >
                        <option value="all">全部</option>
                        <option value="unsubmitted">仅未提交</option>
                        <option value="approved">仅通过</option>
                        <option value="needs_edit">仅需修改</option>
                        <option value="rejected">仅驳回</option>
                      </select>
                      <button
                        type="button"
                        disabled={assetBatchBusy || filteredAssetReviewRows.length === 0}
                        onClick={() => void submitAssetReviewBatch(filteredAssetReviewRows, "approve")}
                        className="rounded bg-emerald-700 px-2 py-1 text-white disabled:opacity-60"
                      >
                        {assetBatchBusy ? "批量提交中..." : "批量通过当前列表"}
                      </button>
                      <button
                        type="button"
                        disabled={assetBatchBusy || filteredAssetReviewRows.length === 0}
                        onClick={() => void submitAssetReviewBatch(filteredAssetReviewRows, "needs_edit")}
                        className="rounded bg-amber-700 px-2 py-1 text-white disabled:opacity-60"
                      >
                        批量需修改当前列表
                      </button>
                      <button
                        type="button"
                        disabled={assetBatchBusy || filteredAssetReviewRows.length === 0}
                        onClick={() => void submitAssetReviewBatch(filteredAssetReviewRows, "reject")}
                        className="rounded bg-rose-700 px-2 py-1 text-white disabled:opacity-60"
                      >
                        批量驳回当前列表
                      </button>
                      <label className="ml-1 inline-flex items-center gap-1 text-slate-300">
                        <input
                          type="checkbox"
                          checked={onlyUnclosedAssets}
                          onChange={(e) => setOnlyUnclosedAssets(e.target.checked)}
                        />
                        <span>仅未闭环项</span>
                      </label>
                    </div>
                  <div className="max-h-80 overflow-auto rounded-lg border border-slate-700">
                    <table className="w-full min-w-[920px] text-xs">
                      <thead className="bg-slate-900/80 text-left text-slate-200">
                        <tr>
                          <th className="px-3 py-2">类型</th>
                          <th className="px-3 py-2">ID</th>
                          <th className="px-3 py-2">对象</th>
                          <th className="px-3 py-2">人工检查项</th>
                          <th className="px-3 py-2">confidence</th>
                          <th className="px-3 py-2">闭环提示</th>
                          <th className="px-3 py-2">当前结论</th>
                          <th className="px-3 py-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssetReviewRows.map((row) => {
                          const key = `${row.assetType}:${row.assetId}`;
                          const busy = Boolean(assetReviewBusy[key]);
                          const decision = String(manualAssetDecisionByKey[key] || "").toLowerCase();
                          return (
                            <tr key={key} className="border-t border-slate-700/70">
                              <td className="px-3 py-2">{row.assetType.toUpperCase()}</td>
                              <td className="px-3 py-2 font-mono text-slate-100">{row.assetId}</td>
                              <td className="px-3 py-2">{row.title}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap text-slate-300">{row.checks.split(" | ").join("\n")}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded px-2 py-1 text-xs ${row.confidenceLevel === "low" ? "bg-rose-500/20 text-rose-200" : row.confidenceLevel === "medium" ? "bg-amber-500/20 text-amber-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                                  {row.confidenceLevel || "high"} ({Number(row.confidence ?? 0).toFixed(3)})
                                </span>
                              </td>
                              <td className={`px-3 py-2 ${row.unclosed ? "text-amber-300" : "text-emerald-300"}`}>{row.unclosed ? row.unclosedReason || "未闭环" : "已闭环"}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded px-2 py-1 text-xs ${
                                  decision === "approve" || decision === "approved"
                                    ? "bg-emerald-500/20 text-emerald-200"
                                    : decision === "needs_edit"
                                      ? "bg-amber-500/20 text-amber-200"
                                      : decision === "reject" || decision === "rejected"
                                        ? "bg-rose-500/20 text-rose-200"
                                        : "bg-slate-700/50 text-slate-300"
                                }`}>
                                  {decision ? statusLabel(decision) : "未提交"}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" disabled={busy} onClick={() => void submitAssetReview(row, "approve")} className="rounded bg-emerald-600 px-2 py-1 text-white disabled:opacity-60">{busy ? "提交中" : "通过"}</button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setAssetPatchExpandedByKey((prev) => ({ ...prev, [key]: true }));
                                      void submitAssetReview(row, "needs_edit");
                                    }}
                                    className="rounded bg-amber-600 px-2 py-1 text-white disabled:opacity-60"
                                  >
                                    需修改
                                  </button>
                                  <button type="button" disabled={busy} onClick={() => void submitAssetReview(row, "reject")} className="rounded bg-rose-600 px-2 py-1 text-white disabled:opacity-60">驳回</button>
                                  {(row.unclosed || decision === "needs_edit") ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => setAssetPatchExpandedByKey((prev) => ({ ...prev, [key]: !prev[key] }))}
                                      className="rounded bg-slate-700 px-2 py-1 text-white disabled:opacity-60"
                                    >
                                      {assetPatchExpandedByKey[key] ? "收起修复" : "展开修复"}
                                    </button>
                                  ) : null}
                                </div>
                                {assetPatchExpandedByKey[key] ? (
                                  <div className="mt-2 rounded border border-slate-700 bg-slate-950/60 p-2">
                                    <p className="mb-2 text-[11px] text-slate-400">可修改 SpecIR 的 body/gate/cal 字段。先选模板，再按需改。</p>
                                    <div className="mb-2 rounded border border-slate-700 bg-slate-900/40 p-2 text-[11px]">
                                      <p className="mb-2 text-slate-300">表单修复（推荐）</p>
                                      {row.assetType === "specir" ? (
                                        <div className="grid gap-2 md:grid-cols-5">
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="normRef" onChange={(e) => setPatchFormValue(key, "normRef", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="slotKey" onChange={(e) => setPatchFormValue(key, "slotKey", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="operator" onChange={(e) => setPatchFormValue(key, "operator", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="value/min/max" onChange={(e) => setPatchFormValue(key, "value", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="unit" onChange={(e) => setPatchFormValue(key, "unit", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 md:col-span-2" placeholder="formula" onChange={(e) => setPatchFormValue(key, "formula", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="gate.logic: AND/OR" onChange={(e) => setPatchFormValue(key, "logic", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="gate.decision: pass/fail" onChange={(e) => setPatchFormValue(key, "decision", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="gate.on_fail" onChange={(e) => setPatchFormValue(key, "on_fail", e.target.value)} />
                                        </div>
                                      ) : row.assetType === "rule" ? (
                                        <div className="grid gap-2 md:grid-cols-5">
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="norm_ref" onChange={(e) => setPatchFormValue(key, "norm_ref", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="field" onChange={(e) => setPatchFormValue(key, "field", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="operator" onChange={(e) => setPatchFormValue(key, "operator", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="value" onChange={(e) => setPatchFormValue(key, "value", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="unit" onChange={(e) => setPatchFormValue(key, "unit", e.target.value)} />
                                        </div>
                                      ) : row.assetType === "gate" ? (
                                        <div className="grid gap-2 md:grid-cols-3">
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="logic: AND/OR" onChange={(e) => setPatchFormValue(key, "logic", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="decision: pass/fail" onChange={(e) => setPatchFormValue(key, "decision", e.target.value)} />
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="rule_ids: rule1,rule2" onChange={(e) => setPatchFormValue(key, "rule_ids", e.target.value)} />
                                        </div>
                                      ) : (
                                        <div className="grid gap-2 md:grid-cols-3">
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="source_clause_ids: 4.2.1,4.2.2" onChange={(e) => setPatchFormValue(key, "source_clause_ids", e.target.value)} />
                                          <select className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" onChange={(e) => setPatchFormValue(key, "executable", e.target.value)}>
                                            <option value="true">executable=true</option>
                                            <option value="false">executable=false</option>
                                          </select>
                                          <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" placeholder="reason" onChange={(e) => setPatchFormValue(key, "reason", e.target.value)} />
                                        </div>
                                      )}
                                      <button
                                        type="button"
                                        className="mt-2 rounded border border-sky-500 px-2 py-1 text-sky-200"
                                        onClick={() => buildPatchFromForm(row, key)}
                                      >
                                        表单生成 patch
                                      </button>
                                    </div>
                                    <div className="mb-2 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:border-brand-400"
                                        onClick={() => setAssetPatchByKey((prev) => ({ ...prev, [key]: patchTemplateForAsset(row.assetType) }))}
                                      >
                                        填入模板
                                      </button>
                                      {row.assetType === "rule" ? (
                                        <>
                                          <button
                                            type="button"
                                            className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:border-brand-400"
                                            onClick={() => setAssetPatchByKey((prev) => ({ ...prev, [key]: '{"norm_ref":"v://std/...","unresolved":false,"reason":"修正来源绑定"}' }))}
                                          >
                                            修来源绑定
                                          </button>
                                          <button
                                            type="button"
                                            className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:border-brand-400"
                                            onClick={() => setAssetPatchByKey((prev) => ({ ...prev, [key]: '{"slot_key":"bridge.compaction.degree","condition":{"operator":">=","value":95,"unit":"%"},"semantic_status":"understood","execution_status":"executable"}' }))}
                                          >
                                            修执行条件
                                          </button>
                                        </>
                                      ) : null}
                                      {row.assetType === "gate" ? (
                                        <button
                                          type="button"
                                          className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:border-brand-400"
                                          onClick={() => setAssetPatchByKey((prev) => ({ ...prev, [key]: '{"logic":"AND","decision":"pass","rule_ids":["rule.xxx"]}' }))}
                                        >
                                          修判定逻辑
                                        </button>
                                      ) : null}
                                      {row.assetType === "specir" ? (
                                        <>
                                          <button
                                            type="button"
                                            className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:border-brand-400"
                                            onClick={() => setAssetPatchByKey((prev) => ({ ...prev, [key]: '{"slotKey":"bridge.grouting.pressure","execution_status":"executable","review_status":"modified"}' }))}
                                          >
                                            修 slot/execution
                                          </button>
                                          <button
                                            type="button"
                                            className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:border-brand-400"
                                            onClick={() => setAssetPatchByKey((prev) => ({ ...prev, [key]: '{"constraint":{"operator":">=","value":0.5,"unit":"MPa","formula":"P>=0.5"},"outputUnit":"MPa"}' }))}
                                          >
                                            修 gate/cal
                                          </button>
                                        </>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:border-brand-400"
                                        onClick={() => setAssetPatchByKey((prev) => ({ ...prev, [key]: "{}" }))}
                                      >
                                        清空
                                      </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <input
                                        value={assetPatchByKey[key] || ""}
                                        onChange={(e) => setAssetPatchByKey((prev) => ({ ...prev, [key]: e.target.value }))}
                                        placeholder='JSON patch，例如 {"source_clause_ids":["4.2.1"],"reason":"修正条款绑定"}'
                                        className="min-w-[360px] flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                                      />
                                      <button
                                        type="button"
                                        disabled={busy || !String(assetPatchByKey[key] || "").trim()}
                                        onClick={() => void submitAssetPatch(row)}
                                        className="rounded bg-sky-700 px-2 py-1 text-white disabled:opacity-60"
                                      >
                                        应用修改
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  </div>
                )}
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={showMetadataNodes}
                  onChange={(e) => setShowMetadataNodes(e.target.checked)}
                />
                <span>显示元数据</span>
              </label>
              <ClauseTreePanel title="条款树来源查看（非人工确认对象）" roots={step2ClauseTreeRoots} showMetadata={showMetadataNodes} />
              <p className="text-xs text-slate-400">条款树仅用于来源追溯；人工确认对象以主线资产（SpecIR）为主，Rule/Gate/DTO 属执行层派生产物。</p>
            </div>
          ) : null}
        </details>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <h2 className="mb-4 text-lg font-semibold">附加区：规则候选构件（可选）</h2>
          <p className="mb-3 text-xs text-slate-400">本区仅展示规则候选推断层（中间产物，非核心资产）。</p>
          <p className="mb-3 text-xs text-slate-300">
            资产策略：
            {isConstructionSpec
              ? "施工技术规范优先生成 ProcessComponent / MaterialComponent / MethodComponent。"
              : isQualityEvalSpec
                ? "质量检验评定标准优先生成 MeasuredItem 与 threshold/range/sampling 规则。"
                : "按条款语义自动选择构件与规则类型。"}
          </p>
          {!currentJobId ? (
            <p className="text-sm text-slate-400">{missingJobTip}</p>
          ) : artifactLoading ? (
            <p className="text-sm text-slate-400">loading / pending...</p>
          ) : normalizedComponentRows.length === 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p>未生成规则候选结构。</p>
              <p className="mt-1 text-xs text-amber-200">
                可能由于：未解析出结构化字段，或 normRef 未建立。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-sm font-semibold text-slate-100">规范分析面板</p>
                <div className="mt-2 grid gap-2 text-xs text-slate-200 md:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                    <p className="text-slate-400">Component总数</p>
                    <p className="mt-1 text-base font-semibold">{componentQualityStats.total}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                    <p className="text-slate-400">可执行</p>
                    <p className="mt-1 text-base font-semibold">{componentQualityStats.executableCount}（{componentQualityStats.executableRatio}%）</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                    <p className="text-slate-400">有Gate</p>
                    <p className="mt-1 text-base font-semibold">{componentQualityStats.withGateCount}（{componentQualityStats.gateRatio}%）</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                    <p className="text-slate-400">已校验</p>
                    <p className="mt-1 text-base font-semibold">{componentQualityStats.reviewedCount}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                    <p className="text-slate-400">未完成</p>
                    <p className="mt-1 text-base font-semibold">{componentQualityStats.incompleteCount}</p>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-300">
                  <p>未校验：{componentQualityStats.unreviewedCount}</p>
                  {componentQualityStats.riskHints.length > 0 ? (
                    <div className="mt-1 space-y-1 text-amber-200">
                      {componentQualityStats.riskHints.map((hint) => <p key={hint}>{hint}</p>)}
                    </div>
                  ) : (
                    <p className="mt-1 text-emerald-300">当前未发现显著质量风险。</p>
                  )}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="field">
                  <span>按类型</span>
                  <select value={componentTypeFilter} onChange={(e) => setComponentTypeFilter(e.target.value)}>
                    <option value="all">全部</option>
                    {componentTypesOrdered.map((type) => <option key={type} value={type}>{getComponentTypeLabel(type)}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>按 executable</span>
                  <select value={componentExecutableFilter} onChange={(e) => setComponentExecutableFilter(e.target.value)}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                    <option value="all">全部</option>
                  </select>
                </label>
                <label className="field">
                  <span>按 source clause</span>
                  <input value={componentClauseFilter} onChange={(e) => setComponentClauseFilter(e.target.value)} placeholder="例如：17.9" />
                </label>
                <label className="field">
                  <span>按校验状态</span>
                  <select value={componentReviewFilter} onChange={(e) => setComponentReviewFilter(e.target.value)}>
                    <option value="all">全部</option>
                    <option value="unreviewed">未校验</option>
                    <option value="reviewed">已校验</option>
                    <option value="issue">有问题</option>
                  </select>
                </label>
              </div>
              <div className="rounded-lg border border-slate-700/70 bg-slate-950/50 p-3 text-xs text-slate-300">
                默认仅展示可执行摘要。左侧选择 Component，右侧查看 Rule / Gate / Evidence（原文默认折叠）。Debug 字段已隔离。
              </div>
              <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-2">
                  <p className="mb-2 px-2 text-xs text-slate-400">Component 列表（{componentListRows.length}）</p>
                  <ComponentVirtualList
                    rows={componentListRows}
                    selectedId={componentDetailId}
                    onSelect={setComponentDetailId}
                  />
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                  {!componentDetailRow ? (
                    <p className="text-sm text-slate-400">请选择左侧 Component 查看详情。</p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="grid gap-2 md:grid-cols-4">
                        <div className={`rounded-lg border p-2 text-xs ${selectedComponentDecision?.canExecute ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
                          <p className="text-slate-300">执行结论</p>
                          <p className="mt-1 text-sm font-semibold">{selectedComponentDecision?.canExecute ? "可执行" : "不可执行"}</p>
                        </div>
                        <div className={`rounded-lg border p-2 text-xs ${selectedComponentDecision?.riskLevel === "high" ? "border-rose-500/40 bg-rose-500/10 text-rose-200" : selectedComponentDecision?.riskLevel === "medium" ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"}`}>
                          <p className="text-slate-300">风险级别</p>
                          <p className="mt-1 text-sm font-semibold">{selectedComponentDecision?.riskLevel === "high" ? "高" : selectedComponentDecision?.riskLevel === "medium" ? "中" : "低"}</p>
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-xs text-slate-200">
                          <p className="text-slate-300">Rule / Gate</p>
                          <p className="mt-1 text-sm font-semibold">{selectedComponentDecision?.hasRule ? "Rule 就绪" : "缺 Rule"} · {selectedComponentDecision?.hasGate ? "Gate 就绪" : "缺 Gate"}</p>
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-xs text-slate-200">
                          <p className="text-slate-300">建议动作</p>
                          <p className="mt-1 text-sm font-semibold">{selectedComponentDecision?.nextAction || "-"}</p>
                        </div>
                      </div>
                      {selectedComponentGateStatus ? (
                        <div className={`rounded-lg border p-3 text-xs ${selectedComponentGateStatus.badgeClass}`}>
                          <p className="font-semibold">Gate状态：{selectedComponentGateStatus.title}</p>
                          <p className="mt-1">{selectedComponentGateStatus.detail}</p>
                          {selectedComponentGateStatus.key === "missing" ? (
                            <p className="mt-1 font-semibold">⚠️ 不完整规则（Rule存在但Gate缺失）</p>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                        <p className="font-mono text-slate-100">{componentDetailRow.component_id}</p>
                        <p className="mt-1 text-slate-200">{componentDetailRow.name}</p>
                        <p className="mt-1 rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-300">
                          摘要：{summarizeConstraintText(componentDetailRow.original_text)}
                        </p>
                        <p className="text-slate-300">catalog_path: {componentDetailRow.catalog_path}</p>
                        <p className="text-slate-300">executable: {String(componentDetailRow.executable)}</p>
                        <p className="text-slate-300">
                          校验状态：
                          <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${
                            (componentReviewStatusById[componentDetailRow.component_id] || "unreviewed") === "reviewed"
                              ? "bg-emerald-600/20 text-emerald-200"
                              : (componentReviewStatusById[componentDetailRow.component_id] || "unreviewed") === "issue"
                                ? "bg-rose-600/20 text-rose-200"
                                : "bg-slate-700/70 text-slate-300"
                          }`}>
                            {(componentReviewStatusById[componentDetailRow.component_id] || "unreviewed") === "reviewed"
                              ? "已校验"
                              : (componentReviewStatusById[componentDetailRow.component_id] || "unreviewed") === "issue"
                                ? "有问题"
                                : "未校验"}
                          </span>
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded border border-sky-700 px-2 py-1 text-xs text-sky-200 hover:bg-sky-900/30"
                            onClick={() => setComponentClauseFilter(componentDetailRow.catalog_path)}
                          >
                            定位到原文条款
                          </button>
                          <button
                            type="button"
                            className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/30"
                            onClick={() => markComponentReview(componentDetailRow.component_id, "reviewed")}
                          >
                            标记已校验
                          </button>
                          <button
                            type="button"
                            className="rounded border border-rose-700 px-2 py-1 text-xs text-rose-200 hover:bg-rose-900/30"
                            onClick={() => markComponentReview(componentDetailRow.component_id, "issue")}
                          >
                            标记有问题
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                            onClick={() => markComponentReview(componentDetailRow.component_id, "reset")}
                          >
                            重置未校验
                          </button>
                        </div>
                        <div className="mt-3 rounded border border-slate-700 bg-slate-950/50 p-2">
                          <p className="mb-2 text-xs font-semibold text-slate-200">校验Checklist</p>
                          <div className="grid gap-1 text-xs text-slate-300 md:grid-cols-3">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={componentReviewChecklist.rule_correct}
                                onChange={(e) => setComponentReviewChecklist((prev) => ({ ...prev, rule_correct: e.target.checked }))}
                              />
                              <span>Rule是否正确</span>
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={componentReviewChecklist.gate_complete}
                                onChange={(e) => setComponentReviewChecklist((prev) => ({ ...prev, gate_complete: e.target.checked }))}
                              />
                              <span>Gate是否完整</span>
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={componentReviewChecklist.evidence_consistent}
                                onChange={(e) => setComponentReviewChecklist((prev) => ({ ...prev, evidence_consistent: e.target.checked }))}
                              />
                              <span>原文是否一致</span>
                            </label>
                          </div>
                        </div>
                        <div className="mt-2">
                          <textarea
                            className="w-full rounded border border-slate-700 bg-slate-950/70 p-2 text-xs text-slate-200"
                            rows={2}
                            value={componentReviewNote}
                            onChange={(e) => setComponentReviewNote(e.target.value)}
                            placeholder="修改建议 / 问题描述 / 修改内容"
                          />
                        </div>
                      </div>
                      <details className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <summary className="cursor-pointer font-semibold text-slate-100">Evidence（原文，默认折叠）</summary>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="rounded border border-sky-700 px-2 py-1 text-xs text-sky-200 hover:bg-sky-900/30"
                            onClick={() => setComponentClauseFilter(componentDetailRow.catalog_path)}
                          >
                            查看原文来源
                          </button>
                          <span className="text-xs text-slate-400">catalog_path: {componentDetailRow.catalog_path}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{componentDetailRow.original_text}</p>
                      </details>
                      <details className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <summary className="cursor-pointer font-semibold text-slate-100">Rule（执行逻辑）</summary>
                        <div className="mt-2 space-y-2 text-xs text-slate-200">
                          {selectedComponentRules.length === 0 ? <p className="text-slate-400">无 Rule</p> : selectedComponentRules.map((r, i) => (
                            <div key={`${String(r.rule_id || "rule")}-${i}`} className="rounded border border-slate-800 bg-slate-950/60 p-2">
                              <p className="mb-1 rounded bg-slate-900 px-1.5 py-1 text-[11px] text-sky-200">
                                解释：{explainRuleNatural({
                                  field: String(r.field || "-"),
                                  op: String(r.operator || (r.condition && typeof r.condition === "object" ? (r.condition as Record<string, unknown>).operator : "-") || "-"),
                                  value: r.value ?? (r.condition && typeof r.condition === "object" ? (r.condition as Record<string, unknown>).value : undefined),
                                  min: r.min,
                                  max: r.max,
                                  unit: String(r.unit || (r.condition && typeof r.condition === "object" ? (r.condition as Record<string, unknown>).unit : "-") || "-"),
                                })}
                              </p>
                              <details className="rounded border border-slate-800 bg-slate-900/40 p-2">
                                <summary className="cursor-pointer text-slate-300">结构化字段</summary>
                                <div className="mt-2 space-y-1 text-slate-300">
                                  <p>field: {String(r.field || "-")}</p>
                                  <p>op: {String(r.operator || (r.condition && typeof r.condition === "object" ? (r.condition as Record<string, unknown>).operator : "-") || "-")}</p>
                                  <p>value: {String(r.value ?? r.min ?? (r.condition && typeof r.condition === "object" ? (r.condition as Record<string, unknown>).value : "-") ?? "-")}</p>
                                  <p>unit: {String(r.unit || (r.condition && typeof r.condition === "object" ? (r.condition as Record<string, unknown>).unit : "-") || "-")}</p>
                                </div>
                              </details>
                            </div>
                          ))}
                        </div>
                      </details>
                      <details className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <summary className="cursor-pointer font-semibold text-slate-100">Gate（判定逻辑）</summary>
                        <div className="mt-2 space-y-2 text-xs text-slate-200">
                          {selectedComponentGates.length === 0 ? <p className="text-slate-400">无 Gate</p> : selectedComponentGates.map((g, i) => (
                            <div key={`${String(g.gate_id || "gate")}-${i}`} className="rounded border border-slate-800 bg-slate-950/60 p-2">
                              <p>gate_id: {String(g.gate_id || "-")}</p>
                              <p>logic: {String(g.logic || g.expression || g.message || "-")}</p>
                              <p>action: {String(g.action || "-")}</p>
                              <p className="mt-1 rounded bg-slate-900 px-1.5 py-1 text-[11px] text-amber-200">
                                解释：当 Rule 条件满足时，执行 {String(g.action || "默认动作")}。
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                      <details className="rounded-lg border border-slate-700 bg-slate-900/60 p-3" open>
                        <summary className="cursor-pointer font-semibold text-slate-100">人工校验记录</summary>
                        {selectedComponentReviewRecords.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-400">暂无校验记录。</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {selectedComponentReviewRecords.map((rec, idx) => (
                              <div key={`${rec.reviewed_at}-${idx}`} className="rounded border border-slate-800 bg-slate-950/60 p-2 text-xs text-slate-300">
                                <p>校验人：{rec.reviewer_name}（{rec.reviewer_id}）</p>
                                <p>时间：{rec.reviewed_at}</p>
                                <p>动作：{rec.action === "reviewed" ? "标记已校验" : rec.action === "issue" ? "标记有问题" : "重置未校验"}</p>
                                <p>Checklist：Rule{rec.checklist?.rule_correct ? "✓" : "✗"} / Gate{rec.checklist?.gate_complete ? "✓" : "✗"} / 原文{rec.checklist?.evidence_consistent ? "✓" : "✗"}</p>
                                <p>修改建议：{rec.suggestion || "-"}</p>
                                <p>修改内容：{rec.note || "-"}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </details>
                      <p className="text-xs text-slate-500">调试字段已隔离至页面底部 Debug 面板。</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section id="section-specir" className="rounded-3xl border border-cyan-500/30 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-cyan-100">C. SpecIR 主资产</h2>
          <p className="mb-3 text-xs text-slate-300">主区仅展示 SpecIR 核心健康度，Rule/Gate 在 D 区作为派生结果展示。</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
              <p>total：<strong>{layerOverview.specIR.specirCount}</strong></p>
              <p>executable：<strong>{specirExecutionStatusSummary.executable}</strong></p>
              <p>partial：<strong>{specirExecutionStatusSummary.partial_executable}</strong></p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
              <p>not_executable：<strong>{specirExecutionStatusSummary.not_executable}</strong></p>
              <p>needs_slot：<strong>{specirExecutionStatusSummary.needs_slot}</strong></p>
              <p>needs_formula：<strong>{specirExecutionStatusSummary.needs_formula}</strong></p>
              <p>needs_runtime：<strong>{specirExecutionStatusSummary.needs_runtime}</strong></p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
              <p>needs_review：<strong>{layerOverview.specIR.unresolvedSpecirCount + confidenceSummary.specIR.low}</strong></p>
              <p>confidence(H/M/L)：<strong>{confidenceSummary.specIR.high} / {confidenceSummary.specIR.medium} / {confidenceSummary.specIR.low}</strong></p>
              <p>body/gate/cal 完整度：<strong>{layerOverview.specIR.bodyGateCalCompleteness}%</strong></p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
              <p className="mb-1 font-semibold text-slate-100">Runtime Mode Matrix</p>
              <p>automatic：<strong>{specirRuntimeCapability.modeSummary.automatic}</strong></p>
              <p>semi_automatic：<strong>{specirRuntimeCapability.modeSummary.semi_automatic}</strong></p>
              <p>manual_confirmed：<strong>{specirRuntimeCapability.modeSummary.manual_confirmed}</strong></p>
              <p>non_executable：<strong>{specirRuntimeCapability.modeSummary.non_executable}</strong></p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
              <p className="mb-1 font-semibold text-slate-100">Runtime Requirements Coverage</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-200">
                {specirRuntimeCapability.requirementKeys.map((k) => (
                  <p key={`runtime-req-${k}`}>{k}: <strong>{specirRuntimeCapability.requirementSummary[k] || 0}</strong></p>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
              <p className="mb-1 font-semibold text-slate-100">Slot Coverage</p>
              <p>total executable specir：<strong>{specirSlotCoverage.totalExecutableSpecir}</strong></p>
              <p>bound slot count：<strong>{specirSlotCoverage.boundSlotCount}</strong></p>
              <p>unbound slot count：<strong>{specirSlotCoverage.unboundSlotCount}</strong></p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs">
              <p className="mb-2 font-semibold text-slate-100">SpecIR Trace Entry</p>
              <div className="max-h-48 space-y-1 overflow-auto">
                {(Array.isArray(specirDoc?.items) ? specirDoc?.items : []).slice(0, 40).map((it, idx) => {
                  const sid = String((it as { specir_id?: unknown }).specir_id || (it as { component_id?: unknown }).component_id || "").trim() || `specir-${idx}`;
                  return (
                    <button
                      key={`specir-trace-${sid}-${idx}`}
                      type="button"
                      onClick={() => void loadSpecIRTrace(String(currentJobId || selectedJobId || ""), sid)}
                      className={`w-full rounded border px-2 py-1 text-left ${selectedSpecirId === sid ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100" : "border-slate-700 bg-slate-900/70 text-slate-200"}`}
                    >
                      {sid}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-200">
              <p className="mb-2 font-semibold text-slate-100">SpecIR 追溯详情</p>
              {specirTraceLoading ? (
                <p>加载中...</p>
              ) : !specirTrace ? (
                <p>点击左侧 SpecIR 查看来源条款、派生 Rule/Gate、form_code。</p>
              ) : (
                <div className="space-y-1">
                  <p>normRef: {specirTrace.source_clause?.normRef || "-"}</p>
                  <p>source_clause_id: {specirTrace.source_clause?.source_clause_id || "-"}</p>
                  <p>derived_rules: {Number(specirTrace.derived_rules?.length || 0)}</p>
                  <p>derived_gates: {Number(specirTrace.derived_gates?.length || 0)}</p>
                  <p>form_codes: {(specirTrace.used_forms || specirTrace.form_codes || []).join(", ") || "-"}</p>
                  <p>published_rulepacks: {(specirTrace.published_rulepacks || []).join(", ") || "-"}</p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-200">
            <p className="mb-2 font-semibold text-slate-100">Traceability Timeline</p>
            {traceabilityLoading ? (
              <p>加载中...</p>
            ) : !traceabilityDoc ? (
              <p>当前 job 暂无 traceability.json，请先构建 Rulepack。</p>
            ) : (
              <div className="space-y-1">
                <p>form_code: {traceabilityDoc.form_code || "-"}</p>
                <p>rulepack: {traceabilityDoc.rulepack_name || "-"}</p>
                <p>events: {Number(traceabilityDoc.timeline?.length || 0)}</p>
                <div className="max-h-36 overflow-auto rounded border border-slate-800 bg-slate-900/60 p-2">
                  {(traceabilityDoc.timeline || []).slice(0, 20).map((row, idx) => (
                    <p key={`trace-tl-${idx}`}>[{row.type || "-"}] {row.id || "-"} @ {row.at || "-"}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section id="section-rulegate" className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <h2 className="mb-4 text-lg font-semibold">D. Rule/Gate 派生产物（Rule）</h2>
          <p className="mb-3 text-xs text-slate-300">Rule 仅由 SpecIR（execution_status=executable/partial_executable）派生，不再直接从 PDF/Catalog 猜测生成。</p>
          <p className="mb-3 text-xs text-cyan-200">仅展示 derived_from reviewed SpecIR 的 Rule。</p>
          {!currentJobId ? (
            <p className="text-sm text-slate-400">{missingJobTip}</p>
          ) : artifactLoading ? (
            <p className="text-sm text-slate-400">loading / pending...</p>
          ) : pipelineStages.rule.status === "blocked" ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p>status = blocked</p>
              <p className="mt-1">
                reason = {catalogStatus !== "success"
                  ? "依赖 Catalog，当前 catalog_status=failed"
                  : "依赖 normRef，当前 normRef_count=0"}
              </p>
            </div>
          ) : rootCauseStageKey && rootCauseStageKey !== "rule" ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              blocked（依赖{stageTitleMap[pipelineStages.rule.blocked_by || "specIR"]}）
            </div>
          ) : normalizedRuleCount === 0 ? (
            <div className={`rounded-xl border p-3 text-sm ${(specirExecutionStatusSummary.not_executable + specirExecutionStatusSummary.needs_slot + specirExecutionStatusSummary.needs_formula + specirExecutionStatusSummary.needs_runtime) > 0 ? "border-sky-500/30 bg-sky-500/10 text-sky-100" : "border-rose-500/30 bg-rose-500/10 text-rose-100"}`}>
              <p>{(specirExecutionStatusSummary.not_executable + specirExecutionStatusSummary.needs_slot + specirExecutionStatusSummary.needs_formula + specirExecutionStatusSummary.needs_runtime) > 0 ? "ℹ 当前无 ready/partial Rule（存在 pending 任务）" : "ℹ 当前暂无 Rule"}</p>
              <p className="mt-1 text-xs">pending_task 数：{specirPendingTasks.length}</p>
              {specirPendingTasks.length > 0 ? (
                <div className="mt-2 space-y-1 text-xs">
                  {specirPendingTasks.slice(0, 6).map((t) => (
                    <p key={t.id}>- {t.specir_id}: {t.pending_task}（slot={t.slotKey}）</p>
                  ))}
                </div>
              ) : (
                <p className="text-xs">- {emptyRuleReason}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
                <p>
                  规则状态：
                  <strong className={
                    ruleAssetState === "completed"
                      ? "text-emerald-300"
                      : ruleAssetState === "partial"
                        ? "text-amber-300"
                        : "text-rose-300"
                  }>
                    {ruleAssetState === "completed" ? " 完成" : ruleAssetState === "partial" ? " 部分完成" : " 失败"}
                  </strong>
                </p>
                <p>rule_count：<strong>{normalizedRuleCount}</strong></p>
                <p>ready：<strong>{ruleReadyCountDisplay}</strong> | partial：<strong>{rulePartialCountDisplay}</strong> | pending：<strong>{rulePendingCountDisplay + specirPendingTasks.length}</strong> | blocked：<strong>{ruleBlockedCountDisplay}</strong> | rejected：<strong>{ruleRejectedCountDisplay}</strong></p>
                <p>含 norm_ref 数：<strong>{ruleWithNormRefCountDisplay}</strong> | 硬约束不通过数：<strong>{ruleHardInvalidCount}</strong></p>
              </div>

              {ruleAssetState === "partial" && unresolvedRuleCountDisplay > 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                  存在语义未决 Rule（semantic unresolved），当前为部分完成。
                </div>
              ) : null}
              {unresolvedRuleCountDisplay > 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <p className="font-semibold">semantic unresolved 原因分布（Top）</p>
                  <div className="mt-2 grid gap-1 md:grid-cols-2">
                    {unresolvedRuleReasonStats.slice(0, 8).map((item) => (
                      <p key={item.reason}>
                        - {item.reason}：<strong>{item.count}</strong>
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-2">
                  <div className="mb-2 flex items-center justify-between px-2 text-xs">
                    <span className="text-slate-400">规则列表（{filteredRuleRows.length}）</span>
                    <select
                      value={ruleListFilter}
                      onChange={(e) => {
                        const value = e.target.value as "all" | "ready" | "partial" | "pending" | "blocked" | "rejected";
                        setRuleListFilter(value);
                        setRuleListScrollTop(0);
                      }}
                      className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
                    >
                      <option value="ready">仅 ready</option>
                      <option value="partial">仅 partial</option>
                      <option value="pending">仅 pending</option>
                      <option value="blocked">仅 blocked</option>
                      <option value="rejected">仅 rejected</option>
                      <option value="all">全部</option>
                    </select>
                  </div>
                  <div
                    className="overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/70"
                    style={{ height: `${RULE_LIST_VIEWPORT_HEIGHT}px` }}
                    onScroll={(e) => setRuleListScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
                  >
                    <div style={{ height: `${filteredRuleRows.length * RULE_ROW_HEIGHT}px`, position: "relative" }}>
                      {virtualRuleRows.map((row, idx) => {
                        const absoluteIndex = ruleVisibleRange.startIndex + idx;
                        const top = absoluteIndex * RULE_ROW_HEIGHT;
                        const selected = row.id === ruleDetailId;
                        return (
                          <button
                            key={row.id}
                            type="button"
                            className={`absolute left-0 right-0 mx-1 my-1 rounded-md border px-2 py-2 text-left text-xs transition ${selected ? "border-sky-400 bg-slate-800/90" : "border-slate-800 bg-slate-900/70 hover:bg-slate-800/70"}`}
                            style={{ top: `${top}px`, height: `${RULE_ROW_HEIGHT - 8}px` }}
                            onClick={() => setRuleDetailId(row.id)}
                          >
                            <p className="truncate text-slate-100">{explainRuleNatural(row)}</p>
                            <p className="mt-1 truncate text-[11px] text-slate-300">{row.normRef || "-"}</p>
                            <p className={`mt-1 text-[11px] ${row.ruleStatus === "rejected" || row.ruleStatus === "blocked" ? "text-rose-300" : row.ruleStatus === "pending" ? "text-sky-300" : row.ruleStatus === "partial" ? "text-amber-300" : "text-emerald-300"}`}>
                              status: {row.ruleStatus}
                            </p>
                            <p className={`mt-1 text-[11px] ${(row.executionStatus === "executable" || row.executionStatus === "partial_executable") ? "text-emerald-300" : "text-sky-300"}`}>
                              execution: {row.executionStatus}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                  {!selectedRuleRow ? (
                    <p className="text-sm text-slate-400">请先从左侧选择一条 Rule。</p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                        <p className="font-mono text-slate-100">{selectedRuleRow.id}</p>
                        <p className="mt-1 text-slate-100">{explainRuleNatural(selectedRuleRow)}</p>
                        <p className="mt-1 text-xs text-slate-300">来源：<span className="font-mono">{selectedRuleRow.normRef || "-"}</span></p>
                        <p className="mt-1 text-xs text-slate-300">页码：{selectedRuleRow.pageNo > 0 ? selectedRuleRow.pageNo : "-"}</p>
                        <p className="mt-2 rounded border border-slate-700 bg-slate-950/70 p-2 text-xs text-slate-200">
                          原文：{selectedRuleRow.sourceText || "暂无可追溯原文"}
                        </p>
                        <p className={`mt-1 text-xs ${selectedRuleRow.ruleStatus === "rejected" || selectedRuleRow.ruleStatus === "blocked" ? "text-rose-300" : selectedRuleRow.ruleStatus === "pending" ? "text-sky-300" : selectedRuleRow.ruleStatus === "partial" ? "text-amber-300" : "text-emerald-300"}`}>
                          rule_status：{selectedRuleRow.ruleStatus}
                        </p>
                        <p className={`mt-1 text-xs ${selectedRuleRow.semanticUnresolved ? "text-amber-300" : "text-emerald-300"}`}>
                          semantic_status：{selectedRuleRow.semanticStatus}
                        </p>
                        <p className={`mt-1 text-xs ${(selectedRuleRow.executionStatus === "executable" || selectedRuleRow.executionStatus === "partial_executable") ? "text-emerald-300" : "text-sky-300"}`}>
                          execution_status：{selectedRuleRow.executionStatus}
                        </p>
                      </div>
                      <details className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <summary className="cursor-pointer font-semibold text-slate-100">结构化字段（折叠）</summary>
                        <div className="mt-2 space-y-1 text-xs text-slate-300">
                          <p>slot_key: {selectedRuleRow.slotKey}</p>
                          <p>field: {selectedRuleRow.field}</p>
                          <p>debug_field(fallback): {selectedRuleRow.debugField}</p>
                          <p>op: {selectedRuleRow.op}</p>
                          <p>value: {String(selectedRuleRow.value ?? selectedRuleRow.min ?? selectedRuleRow.max ?? "-")}</p>
                          <p>unit: {selectedRuleRow.unit}</p>
                          <p>norm_ref: {selectedRuleRow.normRef || "-"}</p>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <h2 className="mb-4 text-lg font-semibold">D. Rule/Gate 派生产物（Gate）</h2>
          <p className="mb-3 text-xs text-slate-300">Gate = 可执行逻辑，不是数据。</p>
          <p className="mb-3 text-xs text-cyan-200">仅展示 derived_from reviewed SpecIR 的 Gate。</p>
          <div className={`mb-3 rounded-xl border p-3 text-sm ${globalGateStatus.className}`}>
            <p className="font-semibold">Gate状态：{globalGateStatus.title}</p>
            <p className="mt-1 text-xs">{globalGateStatus.detail}</p>
            {globalGateStatus.key === "missing" ? <p className="mt-1 text-xs font-semibold">⚠️ 不完整规则（Rule存在但Gate缺失）</p> : null}
          </div>
          {!currentJobId ? (
            <p className="text-sm text-slate-400">{missingJobTip}</p>
          ) : artifactLoading ? (
            <p className="text-sm text-slate-400">loading / pending...</p>
          ) : pipelineStages.gate.status === "blocked" ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p>status = blocked</p>
              <p className="mt-1">reason = 依赖 Rule，当前 rule_count=0</p>
            </div>
          ) : rootCauseStageKey && rootCauseStageKey !== "gate" ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              blocked（依赖{stageTitleMap[pipelineStages.gate.blocked_by || "rule"]}）
            </div>
          ) : normalizedGateRows.length === 0 ? (
            <div className={`rounded-xl border p-3 text-sm ${readyRuleCount > 0 ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : "border-sky-500/30 bg-sky-500/10 text-sky-100"}`}>
              <p>{readyRuleCount > 0 ? "❌ 未生成判定逻辑" : "ℹ 暂无可执行 Gate（非错误）"}</p>
              <p className="mt-1 text-xs">原因：</p>
              <p className="text-xs">- {emptyGateReason}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
                <p>
                  Gate 状态：
                  <strong className={
                    gateAssetStateDisplay === "completed"
                      ? "text-emerald-300"
                      : gateAssetStateDisplay === "partial"
                        ? "text-amber-300"
                        : "text-rose-300"
                  }>
                    {gateAssetStateDisplay === "completed" ? " 完成" : gateAssetStateDisplay === "partial" ? " 部分完成" : " 失败"}
                  </strong>
                </p>
                <p>gate_count：<strong>{gateCountDisplay}</strong></p>
                <p>ready_gate_count：<strong>{readyGateCountDisplay}</strong></p>
                <p>partial_gate_count：<strong>{partialGateCountDisplay}</strong></p>
                <p>blocked_gate_count：<strong>{blockedGateCountDisplay}</strong></p>
                <p>ready_rule_count：<strong>{readyRuleCount}</strong></p>
                <p>覆盖 rule_refs：<strong>{gateCoverRules ? "是" : "否"}</strong></p>
                {gateCountDisplay > 0 && readyRuleCount <= 0 ? (
                  <p className="text-rose-300">检测到异常：Gate 已定义但 ready Rule = 0（应修复为 blocked）。</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-2">
                <p className="px-2 pb-2 text-xs text-slate-400">
                  共 {normalizedGateRows.length} 条 Gate，默认折叠单条详情，列表区域独立滚动。
                </p>
                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {normalizedGateRows.map((gate) => (
                    <details key={gate.gateId} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-mono text-xs text-slate-400">Gate: {gate.gateId}</span>
                          <span className="text-sm text-slate-200">THEN <span className="text-emerald-300">{gate.decision}</span></span>
                          <span className="text-xs text-slate-400">logic: {gate.logic}</span>
                          <span className={`text-xs ${gate.gateStatus === "ready" ? "text-emerald-300" : gate.gateStatus === "partial" ? "text-amber-300" : "text-rose-300"}`}>
                            Gate状态: {gate.gateStatus}
                          </span>
                        </div>
                      </summary>
                      <div className="mt-2 space-y-1 border-t border-slate-700/70 pt-2 text-sm text-slate-100">
                        {gate.ruleRows.length === 0 ? (
                          <p>IF （无可引用规则）</p>
                        ) : (
                          gate.ruleRows.map((rule, idx) => (
                            <p key={`${gate.gateId}-${rule.id}`}>
                              {idx === 0 ? "IF " : `${gate.logic} `}
                              {renderRuleExpr(rule)}
                            </p>
                          ))
                        )}
                        <p className="pt-1 text-emerald-300">THEN {gate.decision}</p>
                      </div>
                      <p className="mt-2 text-xs text-slate-300">rule_refs：{gate.ruleRefs.join(", ") || "-"}</p>
                      <p className="text-xs text-slate-300">decision：{gate.decision}</p>
                      <p className="text-xs text-slate-300">on_pass：{gate.onPass}</p>
                      <p className="text-xs text-slate-300">on_fail：{gate.onFail}</p>
                      <p className="text-xs text-slate-300">confidence：{Number(gate.confidence || 0).toFixed(3)}</p>
                      <p className="text-xs text-slate-300">evidence_refs：{gate.evidenceRefs.join(", ") || "-"}</p>
                      {gate.pendingRefs.length > 0 || gate.partialRefs.length > 0 || gate.blockedRefs.length > 0 ? (
                        <p className="text-xs text-amber-300">包含非 ready Rule：pending={gate.pendingRefs.length}, partial={gate.partialRefs.length}, blocked/rejected={gate.blockedRefs.length}</p>
                      ) : null}
                      {gate.gateStatus === "blocked" ? (
                        <p className="text-xs text-rose-300">Gate blocked root cause: {(gate.blockedRootCauses || []).join(", ") || "manual review required"}</p>
                      ) : null}
                    </details>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <details className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <summary className="cursor-pointer text-base font-semibold">执行派生区（DTO / ExecutorSpec / ProofTemplate）</summary>
          <div className="mt-4 mb-4 grid gap-3 md:grid-cols-4">
            <button
              type="button"
              onClick={() => setShowDtoList((prev) => !prev)}
              className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-left text-xs hover:border-brand-400"
            >
              DTO: {artifactDtos.length}
            </button>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs">ExecutorSpec: {runtimeDerivedStats.executorSpecCount}</div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs">Runtime Core (Rule/Gate): {artifactRules.length}/{artifactGates.length}</div>
            <button
              type="button"
              onClick={() => setShowProofList((prev) => !prev)}
              className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-left text-xs hover:border-brand-400"
            >
              Proof: {artifactProofTemplates.length}
            </button>
          </div>
          {hasDtoProofWithoutExecutable ? (
            <p className="mb-4 rounded-xl bg-amber-500/15 p-3 text-sm text-amber-200">
              已有 DTO/Proof，但尚未生成可执行 Rule/Gate，当前 NormDoc 不可执行。
            </p>
          ) : null}
          {runtimeDerivedPending ? (
            <p className="mb-4 rounded-xl bg-sky-500/15 p-3 text-sm text-sky-200">
              规范库已生成，执行接口尚未派生。
            </p>
          ) : null}
          {showDtoList ? (
            <div className="mb-4 overflow-auto rounded-xl border border-slate-700">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="bg-slate-900/80 text-left text-slate-200">
                  <tr>
                    <th className="px-3 py-2">component_id</th>
                  </tr>
                </thead>
                <tbody>
                  {artifactDtos.map((item, idx) => {
                    return (
                      <tr key={`${String((item as { component_id?: unknown }).component_id || "dto")}-${idx}`} className="border-t border-slate-700/70">
                        <td className="px-3 py-2">{String((item as { component_id?: unknown }).component_id || "-")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {showProofList ? (
            <div className="mb-2 overflow-auto rounded-xl border border-slate-700">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="bg-slate-900/80 text-left text-slate-200">
                  <tr>
                    <th className="px-3 py-2">component_id</th>
                    <th className="px-3 py-2">rule_ids</th>
                    <th className="px-3 py-2">gate_ids</th>
                    <th className="px-3 py-2">required_evidence</th>
                    <th className="px-3 py-2">input_hash_required</th>
                    <th className="px-3 py-2">execution_trace_required</th>
                    <th className="px-3 py-2">signature_required</th>
                    <th className="px-3 py-2">timestamp_required</th>
                  </tr>
                </thead>
                <tbody>
                  {artifactProofTemplates.map((item, idx) => (
                    <tr key={`${String((item as { component_id?: unknown }).component_id || "proof")}-${idx}`} className="border-t border-slate-700/70">
                      <td className="px-3 py-2">{String((item as { component_id?: unknown }).component_id || "-")}</td>
                      <td className="px-3 py-2">{Array.isArray((item as { rule_ids?: unknown }).rule_ids) ? (item as { rule_ids?: unknown[] }).rule_ids?.map((x) => String(x)).join(", ") : "-"}</td>
                      <td className="px-3 py-2">{Array.isArray((item as { gate_ids?: unknown }).gate_ids) ? (item as { gate_ids?: unknown[] }).gate_ids?.map((x) => String(x)).join(", ") : "-"}</td>
                      <td className="px-3 py-2">{Array.isArray((item as { required_evidence?: unknown }).required_evidence) ? (item as { required_evidence?: unknown[] }).required_evidence?.map((x) => String(x)).join(", ") : "-"}</td>
                      <td className="px-3 py-2">{String(Boolean((item as { input_hash_required?: unknown }).input_hash_required))}</td>
                      <td className="px-3 py-2">{String(Boolean((item as { execution_trace_required?: unknown }).execution_trace_required))}</td>
                      <td className="px-3 py-2">{String(Boolean((item as { signature_required?: unknown }).signature_required))}</td>
                      <td className="px-3 py-2">{String(Boolean((item as { timestamp_required?: unknown }).timestamp_required))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </details>

        <section id="section-publish" className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <h2 className="mb-4 text-lg font-semibold">F. Rulepack / NormDoc / 发布</h2>
          <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <p className="text-sm text-slate-300">本区只判断发布：Rulepack 是否闭环、NormDoc 是否有效、最终是否可发布。</p>
            <p className="mt-1 text-xs text-slate-400">闭环：SpecIR → Rule/Gate/rulepack → NormDoc → 发布。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="field">
                <span>专家 ID</span>
                <input value={expertId} onChange={(e) => setExpertId(e.target.value)} placeholder="expert.001" />
              </label>
              <label className="field">
                <span>规则发布签名人</span>
                <input value={expertName} onChange={(e) => setExpertName(e.target.value)} placeholder="领域专家" />
              </label>
              <label className="field">
                <span>规则发布备注</span>
                <input value={expertComment} onChange={(e) => setExpertComment(e.target.value)} placeholder="例如：同意发布" />
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="field">
                <span>NormDoc 名称（表单类型）</span>
                <input value={normDocMeta.name || normDocMeta.formType || ""} readOnly placeholder="来自 11_normdoc.json" />
              </label>
              <label className="field">
                <span>标准编号（当前 Job 绑定）</span>
                <input value={normDocMeta.standardId} readOnly placeholder="来自 11_normdoc.json" />
              </label>
              <label className="field">
                <span>版本</span>
                <input value={normDocMeta.version} readOnly placeholder="来自 11_normdoc.json" />
              </label>
            </div>
            <label className="field mt-3">
              <span>规范名称（当前 Job）</span>
              <input value={currentJobSpec.name || "-"} readOnly />
            </label>
            <label className="field mt-3">
              <span>规范类型（当前 Job）</span>
              <input value={currentJobSpec.type || "-"} readOnly />
            </label>
            <label className="field mt-3">
              <span>输出路径（可选）</span>
              <input value={normDocMeta.outputPath || String(artifactIndex?.files?.["11_normdoc.json"] || "")} readOnly placeholder="来自 11_normdoc.json 或 artifacts path" />
            </label>
            <label className="field mt-3">
              <span>Rule Store API 地址</span>
              <input value={ruleStoreApiBase} onChange={(e) => setRuleStoreApiBase(e.target.value)} placeholder="http://127.0.0.1:8790" />
            </label>
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-200">
              <p>NormDoc 定义：可执行规范包（Header + Body(rules) + Gate + norm_refs）</p>
              <p>
                当前状态：
                {pipelineStages.normDoc.status === "blocked"
                  ? "⛔ blocked"
                  : normdocDisplayStatus === "valid"
                    ? "✅ valid"
                    : "❌ invalid"}
              </p>
              <p>Header：{normdocHeaderPresent ? "是" : "否"}</p>
              <p>Body.rules：{normdocBodyRulesCount}</p>
              <p>Gate：{normdocGateCount}</p>
              <p>norm_refs：{normdocNormRefsCount}</p>
              <p>是否可发布：{pipelineStages.normDoc.status === "blocked" ? "否" : normdocDisplayStatus === "valid" ? "是" : "否"}</p>
              {pipelineStages.normDoc.status === "blocked" ? (
                <p>reason = 依赖 Gate / valid NormDoc 不成立</p>
              ) : null}
            </div>
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-200">
              <p>规范库构建状态：{buildSuccessMetrics.success ? "✅ success" : "❌ not_success"}</p>
              <p>已生成 normRef 数量：{buildSuccessMetrics.normRefCount}</p>
              <p>已生成 Rule 数量：{buildSuccessMetrics.ruleCount}</p>
              <p>已生成 Gate 数量：{buildSuccessMetrics.gateCount}</p>
              <p>unresolved 数量：{buildSuccessMetrics.unresolvedCount}</p>
              <p>NormDoc 状态：{pipelineStages.normDoc.status === "blocked" ? "blocked" : buildSuccessMetrics.normdocStatus}</p>
              <p>publish_status：<strong className={publishGate.publish_status === "ready" ? "text-emerald-300" : "text-rose-300"}>{publishGate.publish_status}</strong></p>
              <p>是否可发布：{publishGate.publish_status === "ready" ? "true" : "false"}</p>
            </div>
            <div className={`mt-3 rounded-lg border p-3 text-xs ${publishGate.publish_status === "ready" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-rose-500/30 bg-rose-500/10 text-rose-100"}`}>
              <p>发布状态机：{publishGate.publish_status === "ready" ? "ready" : "blocked"}</p>
              {publishGate.publish_status === "blocked" ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="font-semibold">资产阻断</p>
                    <p>{publishGate.blockers.asset.length > 0 ? publishGate.blockers.asset.join(" | ") : "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold">规则阻断</p>
                    <p>{publishGate.blockers.rulegate.length > 0 ? publishGate.blockers.rulegate.join(" | ") : "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold">校验阻断</p>
                    <p>{publishGate.blockers.review.length > 0 ? publishGate.blockers.review.join(" | ") : "-"}</p>
                  </div>
                  <div>
                    <p className="font-semibold">审计阻断</p>
                    <p>{publishGate.blockers.audit.length > 0 ? publishGate.blockers.audit.join(" | ") : "-"}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-1">四类门禁已全部满足，可发布。</p>
              )}
            </div>
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-200">
              <p>SpecIR: specir_count={publishGate.checks.specir_count}, low_confidence_pending={publishGate.checks.low_confidence_pending}, semantic_conflict_count={publishGate.checks.semantic_conflict_count}</p>
              <p>Rule/Gate: rule_count={publishGate.checks.rule_count}, gate_count={publishGate.checks.gate_count}, blocked_gate_count={publishGate.checks.blocked_gate_count}</p>
              <p>人工校验: required_review_count={publishGate.checks.required_review_count}, approved_count={publishGate.checks.approved_count}, rejected_count={publishGate.checks.rejected_count}</p>
              <p>Rulepack: schema_valid={String(publishGate.checks.schema_valid)}, business_valid={String(publishGate.checks.business_valid)}, form_scope_valid={String(publishGate.checks.form_scope_valid)}, noise_count={publishGate.checks.noise_count}</p>
            </div>

            <div className="mt-4">
            <label className="mb-2 inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={publishExecutablePackage}
                onChange={(e) => setPublishExecutablePackage(e.target.checked)}
              />
              <span>发布可执行包（额外校验 DTO / ExecutorSpec / ProofTemplate）</span>
            </label>
            <label className="mb-2 ml-4 inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={enforceManualReviewBeforePublish}
                onChange={(e) => setEnforceManualReviewBeforePublish(e.target.checked)}
              />
              <span>发布前要求人工校验全量完成（待提交需为 0）</span>
            </label>
            {enforceManualReviewBeforePublish && assetReviewPendingCount > 0 ? (
              <p className="mb-2 rounded-lg bg-amber-500/15 p-2 text-xs text-amber-200">
                当前仍有 {assetReviewPendingCount} 项人工校验未提交，发布按钮已禁用。
              </p>
            ) : null}
            <p className="mb-2 rounded-lg bg-slate-800/70 p-2 text-xs text-slate-200">
              发布前 low confidence 剩余数量：<strong className={confidenceSummary.lowRemainingBeforePublish > 0 ? "text-rose-300" : "text-emerald-300"}>{confidenceSummary.lowRemainingBeforePublish}</strong>
              {" "}（medium={confidenceSummary.totals.medium}, high={confidenceSummary.totals.high}）
            </p>
            <div className="mb-3 max-w-xs">
              <label className="field">
                <span>规则包表单类型</span>
                <select value={rulePackFormCode} onChange={(e) => setRulePackFormCode(e.target.value)}>
                  <option value="bridge_shi_7">bridge_shi_7（桥施7）</option>
                  <option value="bridge_shi_13">bridge_shi_13（桥施13）</option>
                </select>
              </label>
            </div>
            <div>
            <button
              type="button"
              disabled={publishFlowLoading || publishGate.publish_status !== "ready" || (enforceManualReviewBeforePublish && assetReviewPendingCount > 0)}
              onClick={() => void onGenerateAndPublishNormDoc()}
              className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-60"
            >
              {publishFlowLoading ? "处理中..." : "发布到规则库"}
            </button>
              <button
                type="button"
                disabled={specBundleLoading}
                onClick={() => void buildSpecBundleAndDownload()}
                className="ml-3 rounded-xl border border-slate-500 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:border-brand-400 hover:text-brand-200 disabled:opacity-60"
              >
                {specBundleLoading ? "打包中..." : "生成 specbundle"}
              </button>
              <button
                type="button"
                disabled={rulePackLoading}
                onClick={() => void buildRulePackAndDownload()}
                className="ml-3 rounded-xl border border-slate-500 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:border-brand-400 hover:text-brand-200 disabled:opacity-60"
              >
                {rulePackLoading ? "打包中..." : "下载规则包"}
              </button>
              <button
                type="button"
                disabled={specBundleVerifyLoading || !specBundleName.trim()}
                onClick={() => void verifySpecBundle()}
                className="ml-3 rounded-xl border border-slate-500 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:border-brand-400 hover:text-brand-200 disabled:opacity-60"
              >
                {specBundleVerifyLoading ? "校验中..." : "校验 specbundle"}
              </button>
            </div>
            </div>
            {signMessage ? <p className="mt-3 rounded-lg bg-emerald-500/15 p-2 text-xs text-emerald-200">{signMessage}</p> : null}
            {publishFlowMessage ? <p className="mt-3 rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-200">{publishFlowMessage}</p> : null}
            {specBundleMessage ? <p className="mt-3 rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-200">{specBundleMessage}</p> : null}
            {rulePackMessage ? <p className="mt-3 rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-200">{rulePackMessage}</p> : null}
            {rulePackName ? <p className="mt-2 text-xs text-slate-400">最新规则包：{rulePackName}</p> : null}
            {specBundleVerifyReport ? (
              <div className={`mt-3 rounded-lg p-3 text-sm ${specBundleVerifyReport.valid ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>
                <p>specbundle 校验：{specBundleVerifyReport.valid ? "通过" : "不通过"}</p>
                <p>bundle：{specBundleVerifyReport.bundle_name || specBundleName}</p>
                <p>source_job_id：{specBundleVerifyReport.source_job_id || "-"}</p>
                <p>md_hash_match：{specBundleVerifyReport.checks?.md_hash_match ? "true" : "false"}</p>
                <p>json_hash_match：{specBundleVerifyReport.checks?.json_hash_match ? "true" : "false"}</p>
                <p>specir_hash_match：{specBundleVerifyReport.checks?.specir_hash_match ? "true" : "false"}</p>
                <p>bundle_hash_match：{specBundleVerifyReport.checks?.bundle_hash_match ? "true" : "false"}</p>
              </div>
            ) : null}
          </div>

          {publishSummary ? (
            <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
              <h3 className="mb-2 text-base font-semibold text-emerald-100">发布结果</h3>
              <div className="grid gap-2 md:grid-cols-2">
                <p>NormDoc 名称：{publishSummary.normDocName}</p>
                <p>标准编号：{publishSummary.standardId}</p>
                <p>版本：{publishSummary.version}</p>
                <p>normdoc_id：{publishSummary.normdocId}</p>
                <p>package_id：{publishSummary.packageId}</p>
                <p>bundle_hash：{publishSummary.bundleHash}</p>
                <p>状态：{publishSummary.status}</p>
                <p>规则数量：{publishSummary.ruleCount}</p>
                <p>组件数量：{publishSummary.componentCount}</p>
                <p>规则发布签名人：{publishSummary.signer}</p>
                <p>发布时间：{publishSummary.publishedAt}</p>
              </div>
            </div>
          ) : null}
        </section>

        <details className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-panel backdrop-blur md:p-6">
          <summary className="cursor-pointer text-lg font-semibold">Debug 面板（默认折叠）</summary>
          <p className="mt-2 text-sm text-slate-300">
            深色页面仅保留规则验证能力：单条规则测试与 sandbox 示例执行，不承载正式验收流程。
          </p>
          <p className="mt-1 text-xs text-slate-400">
            已移除项目级检测、验收报告与正式 PASS/FAIL 输出入口。
          </p>
          <section className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <h3 className="mb-2 text-sm font-semibold">Component 调试字段（开发排查）</h3>
            {!componentDetailRow ? (
              <p className="text-xs text-slate-400">请先在主视图选择一个 Component。</p>
            ) : (
              <div className="space-y-1 text-xs text-slate-300">
                <p>component_id: <span className="font-mono">{componentDetailRow.component_id}</span></p>
                <p>dto_id: {String(selectedComponentDto?.dto_id || "-")}</p>
                <p>generated_from_rule_ids: {Array.isArray(selectedComponentDto?.generated_from_rule_ids) ? (selectedComponentDto?.generated_from_rule_ids as unknown[]).map((x) => String(x)).join(", ") : "-"}</p>
                <p>fields数量: {Array.isArray(selectedComponentDto?.fields) ? (selectedComponentDto?.fields as unknown[]).length : 0}</p>
                <p>ProofTemplate: {selectedComponentProofTemplate ? "已生成" : "未生成"}</p>
                <p>Runtime执行信息: {selectedComponentRules.length > 0 && selectedComponentGates.length > 0 ? "可执行" : "不可执行"}</p>
              </div>
            )}
          </section>

          <section className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <h3 className="mb-3 text-sm font-semibold">验证基础配置</h3>
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <label className="field">
                <span>API 地址</span>
                <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="/api（推荐）或 http://127.0.0.1:8081" />
              </label>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => void probeApiEndpoint(false)}
                  disabled={apiProbeBusy}
                  className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:border-brand-400 hover:text-brand-200 disabled:opacity-60"
                >
                  {apiProbeBusy ? "探测中..." : "自动探测"}
                </button>
                <a
                  href={`${endpointBase}/docs`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:border-brand-400 hover:text-brand-200"
                >
                  Swagger
                </a>
              </div>
            </div>
            {apiProbeMessage ? <p className="mt-2 text-xs text-slate-300">{apiProbeMessage}</p> : null}
            <div className="mt-4">
              <p className="mb-2 text-xs text-slate-300">单条规则验证 cURL（sandbox）</p>
              <pre className="max-h-48 overflow-auto rounded-xl bg-slate-950/85 p-3 font-mono text-xs text-slate-200">{chatCurlPreview}</pre>
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <h3 className="mb-3 text-sm font-semibold">单条规则测试（sandbox）</h3>
            <form onSubmit={onChatSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="field">
                  <span>sandbox_project_id（传给 project_id）</span>
                  <input value={chatProjectId} onChange={(e) => setChatProjectId(e.target.value)} placeholder="GXX_2024_XXX" />
                </label>
                <label className="field">
                  <span>sandbox_user_id</span>
                  <input value={chatUserId} onChange={(e) => setChatUserId(e.target.value)} placeholder="inspector_001" />
                </label>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                <label className="field">
                  <span>session_id（多轮测试）</span>
                  <input value={chatSessionId} onChange={(e) => setChatSessionId(e.target.value)} placeholder="留空则自动创建" />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setChatSessionId("")}
                    className="rounded-xl border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:border-brand-400 hover:text-brand-200"
                  >
                    重置会话
                  </button>
                </div>
              </div>
              <label className="field mt-3">
                <span>测试输入</span>
                <textarea
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  className="min-h-20 w-full rounded-xl border border-slate-600 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
                />
              </label>
              <div className="mt-3">
                <button
                  type="submit"
                  disabled={chatLoading}
                  className="rounded-xl border border-brand-400 px-4 py-2 text-sm text-brand-200 hover:bg-brand-500/10 disabled:opacity-60"
                >
                  {chatLoading ? "测试中..." : "执行规则验证（sandbox）"}
                </button>
              </div>
            </form>
            {chatError ? <p className="mt-3 rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200">{chatError}</p> : null}
            {chatResult?.needs_clarification ? (
              <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                <p className="font-semibold">{chatResult.ui_hint || "需要补充信息"}</p>
                {typeof chatResult.question === "string" && chatResult.question.trim() ? (
                  <p className="mt-1 text-xs text-amber-50/95">{chatResult.question.trim()}</p>
                ) : null}
                {Array.isArray(chatResult.clarification_questions) && chatResult.clarification_questions.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-50/95">
                    {chatResult.clarification_questions.map((question, index) => (
                      <li key={`${question}-${index}`}>{question}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {chatResult ? (
              <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                <p className="font-semibold">测试返回</p>
                <p className="mt-1 text-xs text-emerald-50/95">{String(chatResult.natural_reply || chatResult.answer || "-")}</p>
                <p className="mt-1 text-xs text-emerald-50/80">session_id: {String(chatResult.session_id || chatSessionId || "-")}</p>
                <details className="mt-2 rounded-lg border border-emerald-400/20 bg-slate-950/50 p-2">
                  <summary className="cursor-pointer text-xs text-emerald-100">查看调试 JSON（测试）</summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-950/85 p-2 font-mono text-xs text-slate-100">
                    {JSON.stringify(chatResult, null, 2)}
                  </pre>
                </details>
              </div>
            ) : null}
          </section>

          <details className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">Debug JSON（默认折叠）</summary>
          {result ? (
            <section className="mt-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <h3 className="mb-2 text-sm font-semibold">Step 1 返回 JSON（调试）</h3>
              <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950/85 p-3 font-mono text-xs text-slate-200">
                {JSON.stringify(result, null, 2)}
              </pre>
            </section>
          ) : null}

          {reviewPackage ? (
            <section className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <h3 className="mb-2 text-sm font-semibold">任务包 JSON（调试）</h3>
              <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950/85 p-3 font-mono text-xs text-slate-200">
                {JSON.stringify(reviewPackage, null, 2)}
              </pre>
            </section>
          ) : null}

          {artifactIndex ? (
            <section className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <h3 className="mb-2 text-sm font-semibold text-emerald-100">Artifacts（Debug）</h3>
              <p className="text-xs text-emerald-50/90">
                Job: {artifactIndex.job_id || "-"} | 标准: {currentJobSpec.stdCode || artifactIndex.std_code || "-"} | 名称: {currentJobSpec.name || artifactIndex.title || "-"} | 类型: {currentJobSpec.type || artifactIndex.spec_type || "-"} | 版本: {artifactIndex.version || "-"}
              </p>
              <div className="mt-3 overflow-auto rounded-xl border border-emerald-400/20">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-slate-900/80 text-left text-slate-200">
                    <tr>
                      <th className="px-3 py-2">产物</th>
                      <th className="px-3 py-2">生成状态</th>
                      <th className="px-3 py-2">数量</th>
                      <th className="px-3 py-2">schema_valid</th>
                      <th className="px-3 py-2">business_valid</th>
                      <th className="px-3 py-2">路径</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { display: "01_spec.json", artifact: "01_spec.json" },
                      { display: "02_catalog.json", artifact: "02_catalog.json" },
                      { display: "03_clause_tree.json", artifact: "03_clause_tree.json" },
                      { display: "04_classification.json", artifact: "04_clause_classification.json" },
                      { display: "05_components.json", artifact: "05_components.json" },
                      { display: "06_rules.json", artifact: "07_rules.json" },
                      { display: "07_gates.json", artifact: "08_gates.json" },
                      { display: "derived_dto.json", artifact: "06_dto_schema.json" },
                      { display: "derived_proof.json", artifact: "10_proof_templates.json" },
                      { display: "normdoc.json", artifact: "11_normdoc.json" },
                      { display: "pipeline_audit.json", artifact: "12_pipeline_audit.json" },
                    ].map(({ display, artifact }) => {
                      const path = artifactIndex.files?.[artifact];
                      const validation = artifactIndex.validations?.[artifact];
                      const summary = artifactIndex.artifact_summaries?.[artifact];
                      const realCount = artifactArrayCountByName[artifact];
                      const count = typeof realCount === "number" ? realCount : (typeof summary?.count === "number" ? summary.count : 0);
                      const schemaValid = Boolean(validation?.schema_valid ?? validation?.valid);
                      const businessValid = Boolean(validation?.business_valid ?? validation?.valid);
                      const uiState = resolveArtifactUiStatus(String(summary?.status || (summary?.generated ? "ok" : "pending")), schemaValid, businessValid, count);
                      return (
                        <tr key={display} className="border-t border-slate-700/70">
                          <td className="px-3 py-2 font-mono text-slate-100">{display}</td>
                          <td className="px-3 py-2"><span className={uiState.className}>{uiState.text}</span></td>
                          <td className="px-3 py-2 text-slate-200">{typeof realCount === "number" ? realCount : (typeof summary?.count === "number" ? summary.count : "-")}</td>
                          <td className="px-3 py-2">
                            {schemaValid ? (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-200">PASS</span>
                            ) : (
                              <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-rose-200">FAIL</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {businessValid ? (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-200">PASS</span>
                            ) : (
                              <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-rose-200">FAIL</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-300">{String(path || "-")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          {artifactPipelineAudit ? (
            <section className="mt-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <h3 className="mb-2 text-sm font-semibold text-cyan-100">Pipeline Debug</h3>
              {(() => {
                const debug = (artifactPipelineAudit as { pipeline_debug?: Record<string, unknown> }).pipeline_debug;
                if (!debug || typeof debug !== "object") {
                  return <p className="text-xs text-slate-300">暂无 pipeline_debug 数据。</p>;
                }
                const cls = (debug as { classification_stats?: Record<string, unknown> }).classification_stats || {};
                const comp = (debug as { component_stats?: Record<string, unknown> }).component_stats || {};
                const rule = (debug as { rule_generation_stats?: Record<string, unknown> }).rule_generation_stats || {};
                const gate = (debug as { gate_generation_stats?: Record<string, unknown> }).gate_generation_stats || {};
                const byType = (comp as { by_type?: Record<string, unknown> }).by_type || {};
                const ruleReasons = Array.isArray((rule as { skipped_reasons_top10?: unknown }).skipped_reasons_top10)
                  ? (rule as { skipped_reasons_top10?: Array<Record<string, unknown>> }).skipped_reasons_top10 || []
                  : [];
                const gateReasons = Array.isArray((gate as { skipped_reasons_top10?: unknown }).skipped_reasons_top10)
                  ? (gate as { skipped_reasons_top10?: Array<Record<string, unknown>> }).skipped_reasons_top10 || []
                  : [];
                return (
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="font-semibold text-cyan-100">1) classification 统计</p>
                      <pre className="mt-1 overflow-auto rounded bg-slate-950/70 p-2 text-slate-200">{JSON.stringify(cls, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="font-semibold text-cyan-100">2) component 统计</p>
                      <pre className="mt-1 overflow-auto rounded bg-slate-950/70 p-2 text-slate-200">
                        {JSON.stringify({
                          by_type: byType,
                          executable_true_count: (comp as { executable_true_count?: unknown }).executable_true_count ?? 0,
                          executable_false_count: (comp as { executable_false_count?: unknown }).executable_false_count ?? 0,
                        }, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="font-semibold text-cyan-100">3) rule 生成统计</p>
                      <pre className="mt-1 overflow-auto rounded bg-slate-950/70 p-2 text-slate-200">
                        {JSON.stringify({
                          attempted_rule_count: (rule as { attempted_rule_count?: unknown }).attempted_rule_count ?? 0,
                          generated_rule_count: (rule as { generated_rule_count?: unknown }).generated_rule_count ?? 0,
                          unresolved_rule_count: (rule as { unresolved_rule_count?: unknown }).unresolved_rule_count ?? 0,
                          skipped_rule_count: (rule as { skipped_rule_count?: unknown }).skipped_rule_count ?? 0,
                          skipped_reasons_top10: ruleReasons,
                        }, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="font-semibold text-cyan-100">4) gate 生成统计</p>
                      <pre className="mt-1 overflow-auto rounded bg-slate-950/70 p-2 text-slate-200">
                        {JSON.stringify({
                          attempted_gate_count: (gate as { attempted_gate_count?: unknown }).attempted_gate_count ?? 0,
                          generated_gate_count: (gate as { generated_gate_count?: unknown }).generated_gate_count ?? 0,
                          unresolved_gate_count: (gate as { unresolved_gate_count?: unknown }).unresolved_gate_count ?? 0,
                          skipped_gate_count: (gate as { skipped_gate_count?: unknown }).skipped_gate_count ?? 0,
                          skipped_reasons_top10: gateReasons,
                        }, null, 2)}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </section>
          ) : null}
          </details>
          {artifactError ? <p className="mt-3 rounded-xl bg-amber-500/15 p-3 text-xs text-amber-200">{artifactError}</p> : null}
        </details>
      </main>
    </div>
  );
}

function buildNormRefFromMeta(standardId: string, clauseOrTable: string, field: string): string {
  const spec = String(standardId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const clause = String(clauseOrTable || "table").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const fld = String(field || "debug_field").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return `v://std/${spec || "unknown-spec"}/${clause || "table"}/${fld || "debug_field"}`;
}










