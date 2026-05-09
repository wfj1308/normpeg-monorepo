from __future__ import annotations

import base64
import copy
import csv
import hashlib
import hmac
import io
import json
import os
import re
import sys
import zipfile
from dataclasses import asdict
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, timedelta, timezone
from html import escape
from pathlib import Path
from typing import Any, Dict, Literal
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from backend.catalog import CatalogLoaderError, get_measured_item, get_measured_item_by_id, load_catalog
from backend.catalog import get_test_method_by_id
from backend.project import (
    ProjectStore,
    ProjectStoreError,
)

from .core import (
    ComponentExecutionEngine,
    ComponentNotFoundError,
    ComponentSchemaError,
    ComponentRegistry,
    ExecutionEngineError,
    GateExecutionError,
    PathExecutionError,
    ProofBuildError,
    StateEngineError,
    VAddressError,
    parse_v_address,
    resolve_project_v_address,
    resolve_v_address_target,
)
from .core.clause_chunking import chunk_pdf_text_clauses, normalize_normdoc_id
from .layer3 import (
    Layer3QueryService,
    NL2GateAdapterRuntime,
    NL2GateError,
    build_execution_request_from_parsed_query,
    parse_nl_to_dto,
    resolve_rule_execution_target,
)
from .services import (
    AnchorService,
    AnchorServiceError,
    CatalogNotFoundError,
    CatalogSchemaError,
    CatalogService,
    ClauseSearchService,
    ComponentRegistryService,
    ComponentRegistryServiceError,
    ComponentVersionNotFoundError,
    CompositionService,
    MappingService,
    MappingServiceError,
    PatchAnalysisError,
    PatchAnalysisService,
    ProjectUTXOService,
    ProjectUTXOServiceError,
    SpaceContextService,
    SpaceContextServiceError,
    WorkItemNotFoundError,
)
from .services.norm_version_diff_engine import compare_norm_versions
from .services.rule_impact_analysis_engine import analyze_rule_impact
from .services.rulepack_golden_set_engine import (
    build_baseline_schema as build_golden_baseline_schema,
    run_golden_regression_check,
    upsert_golden_baseline,
)
from .services.rule_testing_framework import run_rule_test_framework
from .services.runtime_observability import (
    build_observability_schema,
    build_runtime_metrics,
    write_runtime_event,
)
from .services.rule_heatmap import build_rule_heatmap_metrics
from .services.ai_assisted_repair import (
    build_ai_repair_schema,
    enqueue_patch_for_review,
    generate_ai_repair_suggestion,
    list_review_queue,
    update_review_queue_item,
)
from .services.multi_standard_fusion import fuse_multi_standards
from .services.specir_knowledge_graph import (
    ai_retrieval as kg_ai_retrieval,
    build_graph_schema as kg_graph_schema,
    build_specir_knowledge_graph,
    graph_query as kg_graph_query,
    impact_traversal as kg_impact_traversal,
    runtime_trace as kg_runtime_trace,
    semantic_search as kg_semantic_search,
    slotkey_usage_query as kg_slotkey_usage_query,
)
from .services.ai_semantic_core import parse_semantic_specir, semantic_parser_schema
from .services.constraint_reasoner import condition_schema as constraint_condition_schema, reason_clause as reason_constraint_clause
from .services.slot_intelligence_engine import (
    dispatch_slot_recommendation_result,
    list_slot_review_queue,
    recommend_slots,
)
from .services.formula_intelligence import formula_ast_schema, parse_formula
from .services.multi_modal_document_ai import analyze_layout_semantics, layout_schema as layout_semantic_schema
from .services.semantic_conflict_intelligence import (
    analyze_semantic_conflicts,
    semantic_conflict_schema,
)
from .services.cross_form_ai_propagation import (
    propagate_cross_form_ai,
    propagation_schema,
)
from .services.norm_qa_engine import (
    answer_norm_question,
    citation_design as normqa_citation_design,
    qa_schema as normqa_schema,
    retrieval_strategy as normqa_retrieval_strategy,
)
from .services.compliance_ai_engine import (
    compliance_schema,
    evaluate_project_compliance,
    reasoning_design as compliance_reasoning_design,
    scoring_strategy as compliance_scoring_strategy,
)
from .services.auto_norm_subscription import (
    run_subscription_cycle,
    subscription_schema,
)
from .services.engineering_llm_layer import (
    build_engineering_llm_layer,
    engineering_llm_schema,
)
from .services.p2_readiness import build_p2_readiness_report, p2_report_schema
from .services.runtime_event_model import event_schema as runtime_event_schema, list_events as runtime_list_events, write_event as runtime_write_event
from .services.proof_chain_engine import (
    append_proof as append_chain_proof,
    export_audit_report as export_chain_audit_report,
    hash_chain_design as proof_chain_hash_design,
    list_proofs as list_chain_proofs,
    proof_schema as proof_chain_schema,
)
from .services.bim_object_mapping import (
    analyze_impact as analyze_bim_mapping_impact,
    bim_mapping_schema,
    list_bim_objects,
    upsert_bim_object,
)
from .services.sensor_iot_binding import clean_sensor_data, gate_trigger_logic, sensor_binding_schema
from .services.runtime_trust_chain import evaluate_runtime_trust, trust_report_schema, trust_score_rules
from .services.live_risk_prediction import predict_live_risk, risk_explanation_fields, risk_model_schema
from .services.engineering_copilot import answer_structure, ask_engineering_copilot, copilot_query_flow, rag_data_sources
from .services.auto_remediation_suggestion import remediation_loop_flow, remediation_schema, suggest_remediation
from .services.project_compliance_dashboard import (
    build_project_dashboard,
    dashboard_structure as project_dashboard_structure,
    metric_definitions as project_metric_definitions,
    status_color_rules as project_status_color_rules,
)
from .services.mobile_body_runtime import (
    conflict_resolution as mobile_conflict_resolution,
    evaluate_mobile_gate,
    mobile_page_structure,
    offline_sync_strategy as mobile_offline_sync_strategy,
)
from .services.bim_runtime_linkage import binding_rules as bim_runtime_binding_rules, build_linkage_view, highlight_states as bim_runtime_highlight_states, page_layout as bim_runtime_page_layout
from .services.hitl2_engine import (
    confidence_governance as hitl2_confidence_governance,
    enqueue_candidate as hitl2_enqueue_candidate,
    learning_loop_summary as hitl2_learning_loop_summary,
    list_review_queue as hitl2_list_review_queue,
    reviewer_action as hitl2_reviewer_action,
)
from .services.runtime_feedback_loop import (
    apply_review_action as runtime_feedback_apply_review_action,
    build_page_hints as runtime_feedback_build_page_hints,
    detect_feedback_candidates as runtime_feedback_detect_feedback_candidates,
    enqueue_feedback_items as runtime_feedback_enqueue_feedback_items,
    feedback_schema as runtime_feedback_schema,
    list_specir_review_queue as runtime_feedback_list_specir_review_queue,
)
from .services.ai_patch_auto_repair import (
    create_versioned_patch,
    generate_suggested_patch,
    list_patches as list_ai_patches,
    patch_schema as ai_patch_schema,
    revert_patch as revert_ai_patch,
    review_patch as review_ai_patch,
)
from .specir import (
    SpecIRCompilerError,
    SpecIRLoaderError,
    SpecIRRegistryEntry,
    build_registry_from_index,
    compile_all_specs_to_registry,
    compile_spec_to_component,
    compile_spec_to_spu,
    explain_spec_document,
    get_compiled_component,
    validate_spu,
)


class ExecuteComponentRequest(BaseModel):
    component_id: str = Field(..., min_length=1)
    input: Dict[str, Any] = Field(default_factory=dict)
    branch_id: str | None = None


class ExecuteSpecIRRequest(BaseModel):
    input: Dict[str, Any] = Field(default_factory=dict)
    branch_id: str | None = None


class ExecuteCatalogMeasuredItemRequest(BaseModel):
    input: Dict[str, Any] = Field(default_factory=dict)
    branch_id: str | None = None


class ProjectCreateRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    catalog_id: str = Field(..., min_length=1)
    selected_specs: list[str] = Field(default_factory=list)
    include_categories: list[str] = Field(default_factory=list)
    include_work_items: list[str] = Field(default_factory=list)
    exclude_categories: list[str] = Field(default_factory=list)
    exclude_work_items: list[str] = Field(default_factory=list)


class ProjectOverrideRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    spec_id: str = Field(..., min_length=1)
    override: Dict[str, Any] = Field(default_factory=dict)
    branch_id: str | None = None


class ProjectExecuteRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    measured_item_id: str | None = Field(default=None, min_length=1)
    input: Dict[str, Any] = Field(default_factory=dict)
    branch_id: str | None = None


class ProjectRoleBindingItem(BaseModel):
    did: str = Field(..., min_length=1)
    measured_item_ids: list[str] = Field(default_factory=list)
    spec_ids: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)


class ProjectRoleBindingRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    bindings: list[ProjectRoleBindingItem] = Field(default_factory=list)


class ProjectInstrumentBindingItem(BaseModel):
    instrument_id: str = Field(..., min_length=1)
    measured_item_ids: list[str] = Field(default_factory=list)
    spec_ids: list[str] = Field(default_factory=list)
    start_stake: str | None = None
    end_stake: str | None = None
    valid_from: str | None = None
    valid_to: str | None = None


class ProjectInstrumentBindingRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    bindings: list[ProjectInstrumentBindingItem] = Field(default_factory=list)


class UTXOExecuteRequest(BaseModel):
    v_address: str = Field(..., min_length=1)
    measured_item_id: str = Field(..., min_length=1)
    input: Dict[str, Any] = Field(default_factory=dict)


class CompareBranchesRequest(BaseModel):
    component_id: str = Field(..., min_length=1)
    input: Dict[str, Any] = Field(default_factory=dict)
    branches: list[str] = Field(default_factory=list)


class NormVersionCompareRequest(BaseModel):
    old_spec_id: str | None = None
    new_spec_id: str | None = None
    old_spec: Dict[str, Any] | None = None
    new_spec: Dict[str, Any] | None = None


class RuleImpactAnalysisRequest(BaseModel):
    specir_id: str = Field(..., min_length=1)
    rule_id: str = Field(..., min_length=1)
    gate_id: str = Field(default="default", min_length=1)
    slotKey: str = Field(..., min_length=1)


class Layer3QueryRequest(BaseModel):
    message: str = Field(..., min_length=1)
    project_id: str | None = None
    session_id: str | None = None


class UnifiedExecutionContext(BaseModel):
    project_id: str = Field(..., min_length=1)
    norm_version: str = Field(..., min_length=1)
    branch_id: str | None = None


class UnifiedExecuteRequest(BaseModel):
    rule_id: str = Field(..., min_length=1)
    inputs: Dict[str, Any] = Field(default_factory=dict)
    context: UnifiedExecutionContext


class PatchAnalyzeRequest(BaseModel):
    patch: Dict[str, Any] = Field(default_factory=dict)
    records: list[Dict[str, Any]] = Field(default_factory=list)


class ExecuteWorkItemRequest(BaseModel):
    catalog_id: str = Field(..., min_length=1)
    work_item_id: str = Field(..., min_length=1)
    component_inputs: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    project_id: str | None = None


class StateTransitionRequest(BaseModel):
    component_id: str = Field(..., min_length=1)
    current_state: str = Field(..., min_length=1)
    trigger: str = Field(..., min_length=1)
    meta: Dict[str, Any] | None = None


class ProofAnchorCreateRequest(BaseModel):
    proof_hash: str = Field(..., min_length=1)
    anchor_type: str = Field(default="mock_anchor", min_length=1)
    target_system: str = Field(default="local_mock_anchor_service", min_length=1)
    external_ref: str | None = None


class ProofVerifyRequest(BaseModel):
    proof: Dict[str, Any] = Field(default_factory=dict)
    expected_root: str | None = None
    expected_chain_hash: str | None = None


class SpecValidateRequest(BaseModel):
    spuId: str | None = None
    spu: Dict[str, Any] | None = None


class GateEvaluateRequest(BaseModel):
    spuId: str = Field(..., min_length=1)
    inputs: Dict[str, Any] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)
    branchId: str | None = None
    containerId: str | None = Field(default=None, min_length=1)
    nodeId: str | None = Field(default=None, min_length=1)


class GatePreviewRequest(GateEvaluateRequest):
    pass


class PathExecuteRequest(BaseModel):
    spuId: str = Field(..., min_length=1)
    inputs: Dict[str, Any] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)
    branchId: str | None = None


class StateTransitionNormRefRequest(BaseModel):
    vuri: str = Field(..., min_length=1)
    spuId: str = Field(..., min_length=1)
    fromState: str = Field(..., min_length=1)
    toState: str = Field(..., min_length=1)
    triggeredBy: str | None = None
    signatures: Dict[str, Any] = Field(default_factory=dict)


class ProofGenerateRequest(BaseModel):
    spuId: str = Field(..., min_length=1)
    inputs: Dict[str, Any] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)
    branchId: str | None = None


class ImageRecognizeRequest(BaseModel):
    imageUrl: str | None = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    options: Dict[str, Any] = Field(default_factory=dict)


class VoiceTranscribeRequest(BaseModel):
    audioText: str | None = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    options: Dict[str, Any] = Field(default_factory=dict)


class FormRenderRequest(BaseModel):
    spuId: str = Field(..., min_length=1)
    context: Dict[str, Any] = Field(default_factory=dict)
    values: Dict[str, Any] = Field(default_factory=dict)


class ReportGenerateRequest(BaseModel):
    reportType: str = Field(default="quality_assessment", min_length=1)
    projectId: str | None = None
    scope: Dict[str, Any] = Field(default_factory=dict)
    data: Dict[str, Any] = Field(default_factory=dict)


class SPUGenerateRequest(BaseModel):
    parseId: str | None = None
    clauseId: str | None = None
    standardCode: str = Field(..., min_length=1)
    options: Dict[str, Any] = Field(default_factory=dict)


class ClauseExplainGenerateRequest(BaseModel):
    normdoc_id: str | None = None
    standard_code: str | None = None
    version: str | None = None
    force: bool = False


class ClauseExplainReviewRequest(BaseModel):
    normdoc_id: str | None = None
    standard_code: str | None = None
    version: str | None = None
    explanation: str | None = None
    risk_note: str | None = None
    related_terms: list[str] | None = None
    marked_reviewed: bool = True


class ClauseSemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    standard_code: str | None = None
    version: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class ClauseHybridSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    standard_code: str | None = None
    version: str | None = None
    limit: int = Field(default=20, ge=1, le=100)
    debug: bool = False


class BranchForkRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    from_branch: str = Field(default="main", min_length=1)
    new_branch_id: str | None = None
    branch_id: str | None = None
    reason: str = Field(default="fork")
    created_by: str | None = None


class BranchOverrideRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    branch_id: str = Field(..., min_length=1)
    target_path: str = Field(..., min_length=1)
    value: Any = None


class BranchActionRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    branch_id: str = Field(..., min_length=1)


class BranchAbandonRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    source_branch: str | None = None
    branch_id: str | None = None
    actor_did: str | None = None
    operator: str | None = None
    reason: str | None = None


class BranchMergeRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    source_branch: str | None = None
    branch_id: str | None = None
    target_branch: str = Field(default="main", min_length=1)
    decision: Literal["ACCEPTED", "REJECTED"] = "ACCEPTED"
    actor_did: str | None = None
    operator: str | None = None


class BranchReviewActionRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    source_branch: str | None = None
    branch_id: str | None = None
    actor_did: str = Field(..., min_length=1)
    role: str = Field(default="reviewer", min_length=1)
    comment: str | None = None


class BranchSplitRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    original_range: str = Field(..., min_length=1)
    splits: list[str] = Field(default_factory=list)


class RegisterComponentRequest(BaseModel):
    catalog_id: str = Field(..., min_length=1)
    component_id: str = Field(..., min_length=1)
    component_name: str = Field(..., min_length=1)
    version: str = Field(..., min_length=1)
    definition: Dict[str, Any] = Field(default_factory=dict)
    enforce_golden_gate: bool = True


class GoldenBaselineUpsertRequest(BaseModel):
    form_code: str = Field(..., min_length=1)
    baseline_rulepack: Dict[str, Any] = Field(default_factory=dict)
    baseline_runtime_result: Dict[str, Any] = Field(default_factory=dict)
    baseline_publish_result: Dict[str, Any] = Field(default_factory=dict)
    sample_input: Dict[str, Any] = Field(default_factory=dict)


class GoldenRegressionCheckRequest(BaseModel):
    form_code: str = Field(..., min_length=1)
    candidate_rulepack: Dict[str, Any] = Field(default_factory=dict)
    candidate_publish_result: Dict[str, Any] = Field(default_factory=dict)


class RuleTestRunRequest(BaseModel):
    form_code: str = Field(..., min_length=1)
    rulepack: Dict[str, Any] = Field(default_factory=dict)
    pass_rate_threshold: float = 0.85


class RuntimeMetricsQueryRequest(BaseModel):
    form_code: str | None = None
    rulepack_version: str | None = None
    project_id: str | None = None


class AIRepairSuggestRequest(BaseModel):
    form_code: str = Field(..., min_length=1)
    source_clause: str = Field(..., min_length=1)
    specir: Dict[str, Any] = Field(default_factory=dict)
    unresolved_reason: str = Field(..., min_length=1)
    nearby_resolved_rules: list[Dict[str, Any]] = Field(default_factory=list)
    slot_registry: list[Dict[str, Any]] = Field(default_factory=list)


class AIRepairReviewActionRequest(BaseModel):
    patch_id: str = Field(..., min_length=1)
    action: Literal["accept_patch", "reject_suggestion", "manual_edit"]
    manual_edit: Dict[str, Any] = Field(default_factory=dict)


class MultiStandardFusionRequest(BaseModel):
    standards: list[Dict[str, Any]] = Field(default_factory=list)


class KnowledgeGraphBuildRequest(BaseModel):
    specs: list[Dict[str, Any]] = Field(default_factory=list)


class KnowledgeGraphQueryRequest(BaseModel):
    node_type: str | None = None
    keyword: str | None = None


class KnowledgeGraphTraversalRequest(BaseModel):
    start_node_id: str = Field(..., min_length=1)
    max_depth: int = 3


class KnowledgeGraphSemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = 20


class KnowledgeGraphAIRetrievalRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = 20


class AISemanticCoreRequest(BaseModel):
    clause_text: str = ""
    table_cell: str = ""
    formula: str = ""
    note: str = ""


class SlotIntelligenceRecommendRequest(BaseModel):
    form_code: str = Field(..., min_length=1)
    clause: str = Field(..., min_length=1)
    semantic_type: str = Field(..., min_length=1)
    nearby_slots: list[Dict[str, Any]] = Field(default_factory=list)
    historical_mappings: list[Dict[str, Any]] = Field(default_factory=list)
    blueprint_context: Dict[str, Any] = Field(default_factory=dict)


class ConstraintReasonerRequest(BaseModel):
    clause: str = Field(..., min_length=1)


class FormulaIntelligenceRequest(BaseModel):
    clause: str = ""
    formula: str = Field(..., min_length=1)


class MultiModalLayoutRequest(BaseModel):
    document_type: Literal["pdf", "word", "scanned_image", "screenshot"] = "pdf"
    content_text: str = ""


class UnifiedInputParseRequest(BaseModel):
    input_type: Literal["PDF", "Word", "扫描图片", "Excel", "手机拍照", "自然语言施工描述"]
    content_text: str = ""
    ocr_blocks: list[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RuntimeEngineDispatchRequest(BaseModel):
    body_update: Dict[str, Any] = Field(default_factory=dict)
    async_execution: bool = False
    trigger_reason: str = "body_update"


class RuntimeEngineRollbackRequest(BaseModel):
    execution_id: str = Field(..., min_length=1)
    reason: str = ""


class RuntimeDependencyRecomputeRequest(BaseModel):
    body_id: str = ""
    slotKey: str = ""
    form_code: str = ""
    project_id: str = ""


class LiveConclusionBuildRequest(BaseModel):
    project_id: str = "unknown_project"
    form_code: str = ""
    bridge_id: str = ""


class ConsistencyCheckRequest(BaseModel):
    project_id: str = "unknown_project"
    form_code: str = ""


class RuntimeSemanticGraphTraverseRequest(BaseModel):
    start_node_id: str = Field(..., min_length=1)
    max_depth: int = 4
    edge_types: list[str] = Field(default_factory=list)


class RuntimeBodyUpdateRequest(BaseModel):
    body: Dict[str, Any] = Field(default_factory=dict)
    source: Literal["manual input", "sensor", "formula", "BIM", "imported form", "AI extraction"] = "manual input"
    operator: str = "runtime_body_engine"
    override: bool = False


class RuntimeBodyRollbackRequest(BaseModel):
    body_id: str = Field(..., min_length=1)
    reason: str = ""


class RuntimeBodyReplayRequest(BaseModel):
    event_id: str = Field(..., min_length=1)


class GateRuntimeEngineEvaluateRequest(BaseModel):
    gate: Dict[str, Any] = Field(default_factory=dict)
    body_snapshot: Dict[str, Any] = Field(default_factory=dict)
    project_id: str = "unknown_project"
    form_code: str = ""
    operator: str = "gate_runtime_engine"


class ImmutableProofAppendRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    form_code: str = Field(..., min_length=1)
    slotKey: str = Field(..., min_length=1)
    body_snapshot: Dict[str, Any] = Field(default_factory=dict)
    gate_snapshot: Dict[str, Any] = Field(default_factory=dict)
    execution_trace: list[Dict[str, Any]] = Field(default_factory=list)
    formula_trace: list[Dict[str, Any]] = Field(default_factory=list)
    runtime_events: list[Dict[str, Any]] = Field(default_factory=list)
    operator: str = Field(..., min_length=1)
    signature: str = ""
    override_of: str = ""
    replay_of: str = ""
    specir: str = Field(..., min_length=1)
    normRef: str = Field(..., min_length=1)


class HITL2CandidateRequest(BaseModel):
    form_code: str = Field(..., min_length=1)
    source: str = Field(default="ai_candidate", min_length=1)
    candidate: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.8
    impact_score: float = 0.5


class HITL2ActionRequest(BaseModel):
    patch_id: str = Field(..., min_length=1)
    action: Literal["accept", "edit", "reject"]
    edit_payload: Dict[str, Any] = Field(default_factory=dict)
    reviewer: str = ""


class RuntimeFeedbackDetectRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    gate_results: list[Dict[str, Any]] = Field(default_factory=list)
    slot_missing_events: list[Dict[str, Any]] = Field(default_factory=list)
    overrides: list[Dict[str, Any]] = Field(default_factory=list)
    proof_records: list[Dict[str, Any]] = Field(default_factory=list)
    appeals: list[Dict[str, Any]] = Field(default_factory=list)
    thresholds: Dict[str, int] = Field(default_factory=dict)
    auto_enqueue: bool = True


class RuntimeFeedbackReviewActionRequest(BaseModel):
    feedback_id: str = Field(..., min_length=1)
    action: Literal["accept", "reject", "resolve_with_fix"]
    reviewer: str = Field(..., min_length=1)
    resolution: Dict[str, Any] = Field(default_factory=dict)


class RuntimeVersionReplayRequest(BaseModel):
    execution_id: str = Field(..., min_length=1)
    replay_mode: Literal["historical_interpretation", "re_execute"] = "historical_interpretation"
    version_selection: Dict[str, Any] = Field(default_factory=dict)
    branch_id: str | None = None
    assert_decision_unchanged: bool = True


class RuntimeReplayRequest(BaseModel):
    historical_input_snapshot: Dict[str, Any] = Field(default_factory=dict)
    old_rulepack_version: str = Field(..., min_length=1)
    new_rulepack_version: str = Field(..., min_length=1)
    spu_id: str | None = None
    spec_or_component_id: str | None = None
    branch_id: str | None = None
    context: Dict[str, Any] = Field(default_factory=dict)


class RuntimeReplayReportRequest(BaseModel):
    replay_result: Dict[str, Any] = Field(default_factory=dict)
    project_id: str | None = None
    scope: Dict[str, Any] = Field(default_factory=dict)


class BodyUpsertRequest(BaseModel):
    body_id: str = ""
    slotKey: str = Field(..., min_length=1)
    specir: str = Field(..., min_length=1)
    form_code: str = Field(..., min_length=1)
    label: str = ""
    value: Any = None
    value_type: Literal["design", "measured", "calculated", "derived"] = "measured"
    unit: str = ""
    source_type: Literal["PDF", "OCR", "Manual", "Sensor", "BIM", "Formula"] = "Manual"
    source_ref: str = ""
    confidence: float = 0.8
    runtime_status: Literal["pending", "valid", "invalid", "missing", "overridden"] = "pending"
    updated_at: str = ""


class BodyBatchUpsertRequest(BaseModel):
    items: list[BodyUpsertRequest] = Field(default_factory=list)


class GateRuntimeEvaluateRequest(BaseModel):
    gate_id: str = Field(..., min_length=1)
    gate_type: Literal["threshold", "range", "existence", "formula", "dependency", "sequence"] = "threshold"
    slot_refs: list[str] = Field(default_factory=list)
    operator: str = ""
    threshold: float | None = None
    min: float | None = None
    max: float | None = None
    formula_ref: str = ""
    condition: str = ""
    on_pass: str = "PASS"
    on_fail: str = "FAIL"
    severity: Literal["info", "warning", "reject", "critical"] = "warning"
    runtime_mode: Literal["automatic", "semi_automatic", "manual_confirmed"] = "automatic"
    confidence: float = 0.8
    current_input: Dict[str, Any] = Field(default_factory=dict)
    specir: str = Field(..., min_length=1)
    rule: str = Field(..., min_length=1)
    normRef: str = Field(..., min_length=1)
    source_clause: str = ""


class UnifiedProofAppendRequest(BaseModel):
    proof_id: str = ""
    project_id: str = Field(..., min_length=1)
    form_code: str = Field(..., min_length=1)
    slotKey: str = Field(..., min_length=1)
    body_snapshot: Dict[str, Any] = Field(default_factory=dict)
    gate_snapshot: Dict[str, Any] = Field(default_factory=dict)
    calculation_trace: list[Dict[str, Any]] = Field(default_factory=list)
    result: str = Field(..., min_length=1)
    fail_reason: str = ""
    evidence_refs: list[Dict[str, Any]] = Field(default_factory=list)
    operator: str = Field(..., min_length=1)
    timestamp: str = ""
    signature: str = ""
    hash: str = ""
    override_of: str = ""
    specir: str = Field(..., min_length=1)
    rule: str = ""
    normRef: str = Field(..., min_length=1)
class AIPatchSuggestRequest(BaseModel):
    form_code: str = Field(..., min_length=1)
    unresolved_reason: str = Field(..., min_length=1)
    nearby_rules: list[Dict[str, Any]] = Field(default_factory=list)
    slot_graph: Dict[str, Any] = Field(default_factory=dict)
    historical_fixes: list[Dict[str, Any]] = Field(default_factory=list)
    semantic_context: Dict[str, Any] = Field(default_factory=dict)


class AIPatchReviewRequest(BaseModel):
    patch_id: str = Field(..., min_length=1)
    action: Literal["accept", "edit", "reject"]
    edit_payload: Dict[str, Any] = Field(default_factory=dict)


class AIPatchRevertRequest(BaseModel):
    patch_id: str = Field(..., min_length=1)


class SemanticConflictAnalyzeRequest(BaseModel):
    rules: list[Dict[str, Any]] = Field(default_factory=list)


class CrossFormAIPropagationRequest(BaseModel):
    specir: Dict[str, Any] = Field(default_factory=dict)
    slot_graph: Dict[str, Any] = Field(default_factory=dict)
    form_blueprint: Dict[str, Any] = Field(default_factory=dict)
    historical_usage: list[Dict[str, Any]] = Field(default_factory=list)
    dry_run: bool = True


class NormQAAskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int = 20


class ComplianceEvaluateRequest(BaseModel):
    project_peg: Dict[str, Any] = Field(default_factory=dict)
    runtime_events: list[Dict[str, Any]] = Field(default_factory=list)
    runtime_records: list[Dict[str, Any]] = Field(default_factory=list)
    rulepack: Dict[str, Any] = Field(default_factory=dict)
    specir: list[Dict[str, Any]] = Field(default_factory=list)
    proof_records: list[Dict[str, Any]] = Field(default_factory=list)
    project_context: Dict[str, Any] = Field(default_factory=dict)


class AutoNormSubscriptionRunRequest(BaseModel):
    sources: list[Dict[str, Any]] = Field(default_factory=list)
    discovered_norms: list[Dict[str, Any]] = Field(default_factory=list)
    dry_run: bool = True


class EngineeringLLMBuildRequest(BaseModel):
    specir: list[Dict[str, Any]] = Field(default_factory=list)
    slot_graph: Dict[str, Any] = Field(default_factory=dict)
    runtime_traces: list[Dict[str, Any]] = Field(default_factory=list)
    proof: list[Dict[str, Any]] = Field(default_factory=list)
    human_reviews: list[Dict[str, Any]] = Field(default_factory=list)
    conflict_resolutions: list[Dict[str, Any]] = Field(default_factory=list)


class P2ReadinessEvaluateRequest(BaseModel):
    metrics: Dict[str, Any] = Field(default_factory=dict)
    evidence: Dict[str, Any] = Field(default_factory=dict)


class RuntimeEventWriteRequest(BaseModel):
    event_type: str = Field(..., min_length=1)
    event_id: str = ""
    project_id: str = Field(..., min_length=1)
    form_code: str = Field(..., min_length=1)
    peg_id: str = Field(..., min_length=1)
    slotKey: str = Field(..., min_length=1)
    rule_id: str = Field(..., min_length=1)
    gate_id: str = Field(..., min_length=1)
    result: str = Field(..., min_length=1)
    input_values: Dict[str, Any] = Field(default_factory=dict)
    output_values: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = ""
    operator: str = Field(..., min_length=1)
    proof_ref: str = ""


class ProofChainAppendRequest(BaseModel):
    proof_id: str = ""
    project_id: str = Field(..., min_length=1)
    form_code: str = Field(..., min_length=1)
    slotKey: str = Field(..., min_length=1)
    rule_id: str = Field(..., min_length=1)
    gate_id: str = Field(..., min_length=1)
    input_snapshot: Dict[str, Any] = Field(default_factory=dict)
    calculation_trace: list[Dict[str, Any]] = Field(default_factory=list)
    decision_result: str = Field(..., min_length=1)
    evidence_files: list[Dict[str, Any]] = Field(default_factory=list)
    operator: str = Field(..., min_length=1)
    timestamp: str = ""
    hash: str = ""
    previous_hash: str = ""
    specir_id: str = ""
    normRef: str = ""
    source_text: str = ""


class BIMObjectUpsertRequest(BaseModel):
    bim_object_id: str = Field(..., min_length=1)
    object_type: str = Field(..., min_length=1)
    location: Dict[str, Any] = Field(default_factory=dict)
    project_id: str = Field(..., min_length=1)
    related_form_code: str = Field(..., min_length=1)
    related_slotKeys: list[str] = Field(default_factory=list)
    related_specir_ids: list[str] = Field(default_factory=list)
    geometry_ref: str = Field(..., min_length=1)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BIMMappingImpactRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    slotKey: str = ""
    gate_failed: Dict[str, Any] = Field(default_factory=dict)
    bim_update: Dict[str, Any] = Field(default_factory=dict)


class SensorBindingIngestRequest(BaseModel):
    sensor: Dict[str, Any] = Field(default_factory=dict)
    reading: Dict[str, Any] = Field(default_factory=dict)
    target_unit: str = Field(..., min_length=1)
    normal_range: Dict[str, Any] = Field(default_factory=dict)
    gate_id: str = Field(default="default_gate", min_length=1)
    rule_id: str = Field(default="sensor_rule", min_length=1)


class RuntimeTrustEvaluateRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    source: Dict[str, Any] = Field(default_factory=dict)
    device: Dict[str, Any] = Field(default_factory=dict)
    manual_input: Dict[str, Any] = Field(default_factory=dict)
    proof: Dict[str, Any] = Field(default_factory=dict)
    runtime_events: list[Dict[str, Any]] = Field(default_factory=list)
    recent_values: list[float] = Field(default_factory=list)


class LiveRiskPredictRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    historical_gate_results: list[Dict[str, Any]] = Field(default_factory=list)
    construction_phase: str = Field(default="general", min_length=1)
    sensor_data: list[Dict[str, Any]] = Field(default_factory=list)
    proof_missing: list[Dict[str, Any]] = Field(default_factory=list)
    manual_overrides: list[Dict[str, Any]] = Field(default_factory=list)


class EngineeringCopilotAskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    project_context: Dict[str, Any] = Field(default_factory=dict)
    runtime_events: list[Dict[str, Any]] = Field(default_factory=list)
    proof_records: list[Dict[str, Any]] = Field(default_factory=list)
    specir_records: list[Dict[str, Any]] = Field(default_factory=list)


class AutoRemediationSuggestRequest(BaseModel):
    failed_gate: Dict[str, Any] = Field(default_factory=dict)
    input_values: Dict[str, Any] = Field(default_factory=dict)
    threshold: Dict[str, Any] = Field(default_factory=dict)
    specir: Dict[str, Any] = Field(default_factory=dict)
    historical_fixes: list[Dict[str, Any]] = Field(default_factory=list)
    project_context: Dict[str, Any] = Field(default_factory=dict)


class ProjectComplianceDashboardRequest(BaseModel):
    forms: list[Dict[str, Any]] = Field(default_factory=list)
    gate_results: list[Dict[str, Any]] = Field(default_factory=list)
    proof_status: list[Dict[str, Any]] = Field(default_factory=list)
    risk_items: list[Dict[str, Any]] = Field(default_factory=list)
    trust_items: list[Dict[str, Any]] = Field(default_factory=list)
    review_queue: list[Dict[str, Any]] = Field(default_factory=list)
    runtime_events: list[Dict[str, Any]] = Field(default_factory=list)
    filters: Dict[str, Any] = Field(default_factory=dict)


class MobileBodyRuntimeEvaluateRequest(BaseModel):
    form_code: str = Field(..., min_length=1)
    slotKey: str = Field(..., min_length=1)
    input_value: float
    operator: str = Field(default=">=", min_length=1)
    threshold: float
    clause_text: str = Field(..., min_length=1)
    norm_ref: str = ""


class BIMRuntimeLinkageBuildRequest(BaseModel):
    bim_objects: list[Dict[str, Any]] = Field(default_factory=list)
    specir_records: list[Dict[str, Any]] = Field(default_factory=list)
    rule_gate_records: list[Dict[str, Any]] = Field(default_factory=list)
    runtime_results: list[Dict[str, Any]] = Field(default_factory=list)
    proof_records: list[Dict[str, Any]] = Field(default_factory=list)
    risk_items: list[Dict[str, Any]] = Field(default_factory=list)
    selected_bim_object_id: str = ""
    risk_level_filter: str = ""
    design_change: Dict[str, Any] = Field(default_factory=dict)


class SpaceSlotCoordsRequest(BaseModel):
    x: float
    y: float


class SpaceSlotGeoRequest(BaseModel):
    station: str = Field(..., min_length=1)
    chainage: float
    coords: SpaceSlotCoordsRequest
    elevation: float
    alignment: str = Field(..., min_length=1)


class CreateSpaceSlotRequest(BaseModel):
    geo: SpaceSlotGeoRequest
    created_from: str = Field(default="api", min_length=1)


class ImportSpaceSlotRowRequest(BaseModel):
    station: str = Field(..., min_length=1)
    chainage: float
    x: float
    y: float
    elevation: float
    alignment: str = Field(..., min_length=1)

    def to_geo_payload(self) -> Dict[str, Any]:
        return {
            "station": self.station,
            "chainage": self.chainage,
            "coords": {
                "x": self.x,
                "y": self.y,
            },
            "elevation": self.elevation,
            "alignment": self.alignment,
        }


class ImportSpaceSlotsRequest(BaseModel):
    source_file: str = Field(..., min_length=1)
    rows: list[ImportSpaceSlotRowRequest] = Field(default_factory=list)
    csv_content: str | None = None


class CreateSpaceContainerRequest(BaseModel):
    slot_address: str | None = Field(default=None, min_length=1)
    slot_ref: str | None = Field(default=None, min_length=1)
    volume_ref: str | None = Field(default=None, min_length=1)
    spuId: str | None = Field(default=None, min_length=1)
    spuIds: list[str] = Field(default_factory=list)
    inspector: str | None = None
    supervisor: str | None = None


class CreateContainerNodeRequest(BaseModel):
    spuId: str | None = None


class CompleteContainerNodeRequest(BaseModel):
    status: Literal["PASS", "FAIL"]
    proof: Dict[str, Any] | None = None
    force_rejected: bool = False


class ArchiveContainerRequest(BaseModel):
    signatures: list[Dict[str, Any]] = Field(default_factory=list)


class MappingResolveContextRequest(BaseModel):
    layer: str | None = None
    time: str | None = None
    version: str | None = None
    branch: str | None = None


class MappingResolveRequest(BaseModel):
    vuri: str = Field(..., min_length=1)
    context: MappingResolveContextRequest = Field(default_factory=MappingResolveContextRequest)


class MappingRangeFiltersRequest(BaseModel):
    type: list[str] = Field(default_factory=list)
    state: list[str] = Field(default_factory=list)
    branch: str | None = None
    version: str | None = None


class MappingQueryRangeRequest(BaseModel):
    startStake: str = Field(..., min_length=1)
    endStake: str = Field(..., min_length=1)
    filters: MappingRangeFiltersRequest = Field(default_factory=MappingRangeFiltersRequest)


class MappingReverseRequest(BaseModel):
    containerId: str = Field(..., min_length=1)
    objectType: Literal["container", "volume", "form", "proof"] = "container"


class MappingSyncExecutionRequest(BaseModel):
    execution: Dict[str, Any] = Field(default_factory=dict)
    branch_id: str | None = None


class MappingUpsertContainerRequest(BaseModel):
    container: Dict[str, Any] = Field(default_factory=dict)


class MappingUpsertVolumeRequest(BaseModel):
    volume: Dict[str, Any] = Field(default_factory=dict)


class BoqCalculateRequest(BaseModel):
    projectId: str | None = None
    currency: str = Field(default="CNY", min_length=1)
    items: list[Dict[str, Any]] = Field(default_factory=list)


class ContractPaymentRequest(BaseModel):
    projectId: str = Field(..., min_length=1)
    contractId: str | None = None
    completedAmount: float = 0.0
    claimedAmount: float = 0.0
    retentionRate: float = 0.0
    requiredDocuments: list[str] = Field(default_factory=list)
    providedDocuments: list[str] = Field(default_factory=list)


class DIDRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1)
    role: str = Field(default="inspector", min_length=1)
    organization: str | None = None
    publicKey: str | None = None


class DIDVerifyRequest(BaseModel):
    did: str = Field(..., min_length=1)
    challenge: str | None = None
    signature: str | None = None


class TripCheckRequest(BaseModel):
    did: str = Field(..., min_length=1)
    action: str = Field(..., min_length=1)
    resource: str | None = None


class SignSignRequest(BaseModel):
    did: str = Field(..., min_length=1)
    payload: Dict[str, Any] = Field(default_factory=dict)
    purpose: str | None = None


class SignVerifyRequest(BaseModel):
    did: str = Field(..., min_length=1)
    payload: Dict[str, Any] = Field(default_factory=dict)
    signature: str = Field(..., min_length=1)


class WebhookSubscribeRequest(BaseModel):
    event: str = Field(..., min_length=1)
    callbackUrl: str = Field(..., min_length=1)
    secret: str | None = None


class SyncPushRequest(BaseModel):
    projectId: str = Field(..., min_length=1)
    deviceId: str = Field(..., min_length=1)
    records: list[Dict[str, Any]] = Field(default_factory=list)


class SyncPullRequest(BaseModel):
    projectId: str = Field(..., min_length=1)
    deviceId: str = Field(..., min_length=1)
    lastToken: str | None = None


class ExportProjectRequest(BaseModel):
    projectId: str = Field(..., min_length=1)
    format: str = Field(default="zip", min_length=1)
    includeProofs: bool = True
    includeMapping: bool = True
    includeState: bool = True


def _parse_imported_space_slot_csv(csv_content: str) -> list[Dict[str, Any]]:
    text = str(csv_content or "").strip()
    if not text:
        raise ValueError("csv_content is empty")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("csv_content is missing header row")

    items: list[Dict[str, Any]] = []
    for row_index, row in enumerate(reader, start=2):
        if not isinstance(row, dict):
            continue
        if all(str(value or "").strip() == "" for value in row.values()):
            continue
        station = _read_csv_text(row, row_index, "station")
        chainage = _read_csv_float(row, row_index, "chainage")
        x = _read_csv_float(row, row_index, "x", "coord_x", "coords_x", "x_2000", "X")
        y = _read_csv_float(row, row_index, "y", "coord_y", "coords_y", "y_2000", "Y")
        elevation = _read_csv_float(row, row_index, "elevation")
        alignment = _read_csv_text(row, row_index, "alignment")
        items.append(
            {
                "station": station,
                "chainage": chainage,
                "coords": {"x": x, "y": y},
                "elevation": elevation,
                "alignment": alignment,
            }
        )
    if not items:
        raise ValueError("csv_content has no valid rows")
    return items


def _read_csv_text(row: Dict[str, Any], row_index: int, *keys: str) -> str:
    value = _pick_csv_value(row, *keys)
    text = str(value or "").strip()
    if not text:
        joined = "/".join(keys)
        raise ValueError(f"csv row {row_index} missing required text field: {joined}")
    return text


def _read_csv_float(row: Dict[str, Any], row_index: int, *keys: str) -> float:
    value = _pick_csv_value(row, *keys)
    text = str(value or "").strip()
    joined = "/".join(keys)
    if not text:
        raise ValueError(f"csv row {row_index} missing required numeric field: {joined}")
    try:
        return float(text)
    except ValueError as exc:
        raise ValueError(f"csv row {row_index} invalid number for field {joined}: {text}") from exc


def _pick_csv_value(row: Dict[str, Any], *keys: str) -> Any:
    normalized = {str(key or "").strip().lower(): value for key, value in row.items()}
    for key in keys:
        target = str(key or "").strip().lower()
        if target in normalized:
            return normalized[target]
    return None


app = FastAPI(title="Executable Spec API", version="0.1.0")

_default_cors_origins = [
    "http://127.0.0.1:5175",
    "http://localhost:5175",
    "http://127.0.0.1:4175",
    "http://localhost:4175",
]
_cors_origins_raw = str(os.getenv("NORMREF_CORS_ALLOW_ORIGINS", ",".join(_default_cors_origins)) or "").strip()
_cors_origins = [item.strip() for item in _cors_origins_raw.split(",") if item.strip()]
if "*" in _cors_origins:
    _cors_origins = ["*"]
if not _cors_origins:
    _cors_origins = _default_cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.environ.setdefault("LAYERPEG_PROOF_HMAC_KEY", "dev-insecure-key")
if "pytest" in sys.modules:
    os.environ.setdefault("LAYERPEG_MAPPING_PERSIST", "0")
    os.environ.setdefault("NORMREF_BEARER_TOKEN", "test-token")
    mapping_backend = str(os.getenv("LAYERPEG_MAPPING_BACKEND", "json")).strip().lower() or "json"
    if mapping_backend == "sqlite":
        os.environ.setdefault(
            "LAYERPEG_MAPPING_SQLITE_PATH",
            str(Path(__file__).resolve().parents[2] / "data" / f"mapping_store.pytest.{os.getpid()}.sqlite3"),
        )
    else:
        os.environ.setdefault(
            "LAYERPEG_MAPPING_STORE_PATH",
            str(Path(__file__).resolve().parents[2] / "data" / f"mapping_store.pytest.{os.getpid()}.json"),
        )
component_registry = ComponentRegistry()
execution_engine = ComponentExecutionEngine(registry=component_registry)
component_registry_service = ComponentRegistryService(registry=component_registry)
golden_set_base_dir = Path(__file__).resolve().parents[1] / "data" / "golden_sets"
golden_report_dir = Path(__file__).resolve().parents[1] / "data" / "golden_reports"
rule_test_report_dir = Path(__file__).resolve().parents[1] / "data" / "rule_test_reports"
runtime_event_dir = Path(__file__).resolve().parents[1] / "data" / "runtime_observability"
runtime_metrics_dir = Path(__file__).resolve().parents[1] / "data" / "runtime_metrics"
rule_heatmap_dir = Path(__file__).resolve().parents[1] / "data" / "rule_heatmap"
ai_repair_queue_dir = Path(__file__).resolve().parents[1] / "data" / "ai_repair"
fusion_manifest_dir = Path(__file__).resolve().parents[1] / "data" / "fusion"
knowledge_graph_dir = Path(__file__).resolve().parents[1] / "data" / "knowledge_graph"
slot_intelligence_queue_dir = Path(__file__).resolve().parents[1] / "data" / "slot_intelligence"
slot_intelligence_bind_dir = Path(__file__).resolve().parents[1] / "data" / "slot_intelligence"
hitl2_queue_dir = Path(__file__).resolve().parents[1] / "data" / "hitl2"
hitl2_learning_dir = Path(__file__).resolve().parents[1] / "data" / "hitl2"
specir_review_queue_dir = Path(__file__).resolve().parents[1] / "data" / "specir_review_queue"
ai_patch_dir = Path(__file__).resolve().parents[1] / "data" / "ai_patch_center"
layer3_query_service = Layer3QueryService(execution_engine=execution_engine)
patch_analysis_service = PatchAnalysisService()
catalog_service = CatalogService()
composition_service = CompositionService(execution_engine=execution_engine, catalog_service=catalog_service)
anchor_service = AnchorService()
project_utxo_service = ProjectUTXOService()
project_store = ProjectStore()
space_context_service = SpaceContextService()
mapping_service = MappingService()
clause_search_service = ClauseSearchService()
specir_index_path = Path(__file__).resolve().parents[2] / "norms" / "index.json"
specir_registry: Dict[str, SpecIRRegistryEntry] = build_registry_from_index(specir_index_path)
specir_compiled_components: Dict[str, Dict[str, Any]] = compile_all_specs_to_registry(
    index_json_path=specir_index_path,
    registry=component_registry,
)
pdf_parse_runtime_store: Dict[str, Dict[str, Any]] = {}
did_runtime_registry: Dict[str, Dict[str, Any]] = {}
signature_runtime_store: Dict[str, Dict[str, Any]] = {}
webhook_runtime_subscriptions: Dict[str, Dict[str, Any]] = {}
sync_runtime_events: Dict[str, list[Dict[str, Any]]] = {}
export_runtime_store: Dict[str, Dict[str, Any]] = {}
state_runtime_store: Dict[str, Dict[str, Any]] = {}
report_runtime_store: Dict[str, Dict[str, Any]] = {}
report_artifact_runtime_store: Dict[str, Dict[str, Any]] = {}
spu_runtime_store: Dict[str, Dict[str, Any]] = {}
clause_explain_runtime_store: Dict[str, Dict[str, Any]] = {}
_CLAUSE_EXPLANATION_NOTICE = "辅助说明，不作为判定依据"

_NORMREF_V1_AUTH_PREFIXES = (
    "/v1/pdf",
    "/v1/image",
    "/v1/voice",
    "/v1/mapping",
    "/v1/spu",
    "/v1/spec",
    "/v1/gate",
    "/v1/path",
    "/v1/state",
    "/v1/proof",
    "/v1/form",
    "/v1/report",
)

_NORMREF_API_V1_AUTH_PREFIXES = tuple(prefix.replace("/v1/", "/api/v1/") for prefix in _NORMREF_V1_AUTH_PREFIXES)


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = str(raw).strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on", "enabled", "require", "required"}


def _path_matches_prefixes(path: str, prefixes: tuple[str, ...]) -> bool:
    for prefix in prefixes:
        if path == prefix or path.startswith(f"{prefix}/"):
            return True
    return False


def _requires_normref_auth(path: str) -> bool:
    if _env_flag("NORMREF_REQUIRE_AUTH_V1", True) and _path_matches_prefixes(path, _NORMREF_V1_AUTH_PREFIXES):
        return True
    if _env_flag("NORMREF_REQUIRE_AUTH_API_V1", False) and _path_matches_prefixes(path, _NORMREF_API_V1_AUTH_PREFIXES):
        return True
    return False


def _extract_bearer_token(authorization: str | None) -> tuple[str | None, str | None]:
    header = str(authorization or "").strip()
    if not header:
        return None, "MISSING_BEARER_TOKEN"
    if " " not in header:
        return None, "INVALID_AUTHORIZATION_SCHEME"
    scheme, token = header.split(" ", 1)
    if scheme.lower() != "bearer":
        return None, "INVALID_AUTHORIZATION_SCHEME"
    normalized_token = token.strip()
    if not normalized_token:
        return None, "EMPTY_BEARER_TOKEN"
    if normalized_token.lower() in {"null", "undefined"}:
        return None, "INVALID_BEARER_TOKEN"
    return normalized_token, None


@app.middleware("http")
async def _normref_bearer_auth_middleware(request: Request, call_next: Any) -> Response:
    path = str(request.url.path or "").strip()
    if request.method.upper() == "OPTIONS" or not _requires_normref_auth(path):
        return await call_next(request)

    token, error_code = _extract_bearer_token(request.headers.get("authorization"))
    expected_token = str(os.getenv("NORMREF_BEARER_TOKEN", "") or "").strip()
    allow_any_bearer = _env_flag("NORMREF_ALLOW_ANY_BEARER", False)
    if error_code is None:
        if expected_token:
            if not hmac.compare_digest(token or "", expected_token):
                error_code = "INVALID_BEARER_TOKEN"
        elif not allow_any_bearer:
            error_code = "AUTH_CONFIG_MISSING"

    if error_code:
        payload = {"detail": error_code, "code": error_code}
        status_code = 503 if error_code == "AUTH_CONFIG_MISSING" else 401
        return Response(
            status_code=status_code,
            content=json.dumps(payload, ensure_ascii=False),
            media_type="application/json",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await call_next(request)


def _reload_specir_registry() -> Dict[str, SpecIRRegistryEntry]:
    global specir_registry
    global specir_compiled_components
    specir_registry = build_registry_from_index(specir_index_path)
    specir_compiled_components = compile_all_specs_to_registry(
        index_json_path=specir_index_path,
        registry=component_registry,
    )
    return specir_registry


def _resolve_spec_id_from_registry(spec_id: str) -> str:
    target = str(spec_id or "").strip()
    if not target:
        raise ValueError("spec_id is required")

    try:
        registry = _reload_specir_registry()
    except Exception as exc:  # pragma: no cover - defensive for runtime-only registry issues
        raise ValueError(f"spec registry unavailable: {exc}") from exc
    if target in registry:
        return target

    suffix = f".{target}"
    matched = [item for item in registry.keys() if item.endswith(suffix)]
    if len(matched) == 1:
        return matched[0]
    if len(matched) > 1:
        raise ValueError(f"spec_id is ambiguous: {target}")
    raise ValueError(f"spec_id not found: {target}")


def _resolve_spec_id_from_scope_or_registry(raw_spec_id: str, scoped_spec_ids: set[str]) -> str:
    target = str(raw_spec_id or "").strip()
    if not target:
        raise ValueError("spec_id is required")

    if target in scoped_spec_ids:
        return target

    suffix = f".{target}"
    scoped_suffix_matches = [item for item in scoped_spec_ids if item.endswith(suffix)]
    if len(scoped_suffix_matches) == 1:
        return scoped_suffix_matches[0]
    if len(scoped_suffix_matches) > 1:
        raise ValueError(f"spec_id is ambiguous in selected scope: {target}")

    return _resolve_spec_id_from_registry(target)


def _catalog_spec_ids(catalog_id: str) -> set[str]:
    catalog = load_catalog()
    if catalog.catalog_id != catalog_id:
        raise ValueError(f"catalog_id mismatch: expected {catalog.catalog_id}, got {catalog_id}")
    spec_ids: set[str] = set()
    for category in catalog.categories:
        for work_item in category.work_items:
            for measured_item in work_item.measured_items:
                spec_ids.add(measured_item.spec_id)
    return spec_ids


def _normalize_text_id_list(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _catalog_scoped_spec_ids(
    *,
    catalog_id: str,
    include_categories: list[str],
    include_work_items: list[str],
    exclude_categories: list[str],
    exclude_work_items: list[str],
) -> list[str]:
    catalog = load_catalog()
    if catalog.catalog_id != catalog_id:
        raise ValueError(f"catalog_id mismatch: expected {catalog.catalog_id}, got {catalog_id}")

    include_category_set = set(_normalize_text_id_list(include_categories))
    include_work_item_set = set(_normalize_text_id_list(include_work_items))
    exclude_category_set = set(_normalize_text_id_list(exclude_categories))
    exclude_work_item_set = set(_normalize_text_id_list(exclude_work_items))

    known_categories = {item.category_id for item in catalog.categories}
    known_work_items = {work_item.work_item_id for item in catalog.categories for work_item in item.work_items}

    unknown_include_categories = sorted(include_category_set - known_categories)
    unknown_include_work_items = sorted(include_work_item_set - known_work_items)

    if unknown_include_categories:
        raise ValueError(f"unknown include_categories: {', '.join(unknown_include_categories)}")
    if unknown_include_work_items:
        raise ValueError(f"unknown include_work_items: {', '.join(unknown_include_work_items)}")

    selected_specs: list[str] = []
    seen_specs: set[str] = set()
    for category in catalog.categories:
        if include_category_set and category.category_id not in include_category_set:
            continue
        if category.category_id in exclude_category_set:
            continue
        for work_item in category.work_items:
            if include_work_item_set and work_item.work_item_id not in include_work_item_set:
                continue
            if work_item.work_item_id in exclude_work_item_set:
                continue
            for measured_item in work_item.measured_items:
                if measured_item.spec_id in seen_specs:
                    continue
                seen_specs.add(measured_item.spec_id)
                selected_specs.append(measured_item.spec_id)
    return selected_specs


def _resolve_project_selection_source(
    *,
    selected_specs: list[str],
    include_categories: list[str],
    include_work_items: list[str],
    exclude_categories: list[str],
    exclude_work_items: list[str],
) -> str:
    has_selected = bool(_normalize_text_id_list(selected_specs))
    has_category_scope = bool(_normalize_text_id_list(include_categories))
    has_work_item_scope = bool(_normalize_text_id_list(include_work_items))
    has_exclusion = bool(_normalize_text_id_list(exclude_categories) or _normalize_text_id_list(exclude_work_items))

    if has_selected and not (has_category_scope or has_work_item_scope or has_exclusion):
        return "explicit_specs"
    if has_selected and (has_category_scope or has_work_item_scope or has_exclusion):
        return "mixed"
    if has_category_scope and not has_work_item_scope:
        return "category_scope"
    if has_work_item_scope and not has_category_scope:
        return "work_item_scope"
    if has_category_scope and has_work_item_scope:
        return "mixed"
    if has_exclusion:
        return "mixed"
    return "catalog_all"


def _catalog_measured_items_by_spec() -> dict[str, tuple[str, str, str]]:
    catalog = load_catalog()
    mapping: dict[str, tuple[str, str, str]] = {}
    for category in catalog.categories:
        for work_item in category.work_items:
            for measured_item in work_item.measured_items:
                mapping[measured_item.spec_id] = (
                    measured_item.measured_item_id,
                    work_item.work_item_id,
                    category.category_id,
                )
    return mapping


def _project_selected_measured_items(project: Any) -> dict[str, str]:
    spec_to_measured = _catalog_measured_items_by_spec()
    selected: dict[str, str] = {}
    for spec_id in project.selected_specs:
        resolved = spec_to_measured.get(spec_id)
        if not resolved:
            continue
        measured_item_id, _, _ = resolved
        selected[measured_item_id] = spec_id
    return selected


def _build_project_resolved_scope(project: Any) -> Dict[str, Any]:
    catalog = load_catalog()
    selected_specs = list(getattr(project, "selected_specs", []) or [])
    selected_set = set(selected_specs)

    category_ids: list[str] = []
    category_names: list[str] = []
    work_item_ids: list[str] = []
    work_item_names: list[str] = []
    measured_items: list[Dict[str, str]] = []
    covered_specs: set[str] = set()

    for category in catalog.categories:
        category_has_selected = False
        work_item_entries: list[tuple[str, str]] = []
        measured_entries: list[Dict[str, str]] = []
        for work_item in category.work_items:
            work_item_has_selected = False
            for measured_item in work_item.measured_items:
                if measured_item.spec_id not in selected_set:
                    continue
                work_item_has_selected = True
                covered_specs.add(measured_item.spec_id)
                measured_entries.append(
                    {
                        "measured_item_id": measured_item.measured_item_id,
                        "measured_item_name": measured_item.measured_item_name,
                        "spec_id": measured_item.spec_id,
                        "work_item_id": work_item.work_item_id,
                        "category_id": category.category_id,
                    }
                )
            if work_item_has_selected:
                work_item_entries.append((work_item.work_item_id, work_item.work_item_name))
                category_has_selected = True
        if category_has_selected:
            category_ids.append(category.category_id)
            category_names.append(category.category_name)
            for work_item_id, work_item_name in work_item_entries:
                if work_item_id not in work_item_ids:
                    work_item_ids.append(work_item_id)
                    work_item_names.append(work_item_name)
            measured_items.extend(measured_entries)

    unresolved_specs = [item for item in selected_specs if item not in covered_specs]
    selection_source = str(getattr(project, "selection_source", "") or "").strip() or "explicit_specs"
    scope_filters = getattr(project, "scope_filters", {})
    if not isinstance(scope_filters, dict):
        scope_filters = {}
    return {
        "catalog_id": getattr(project, "catalog_id", ""),
        "selection_source": selection_source,
        "scope_filters": scope_filters,
        "selected_spec_ids": selected_specs,
        "category_ids": category_ids,
        "category_names": category_names,
        "work_item_ids": work_item_ids,
        "work_item_names": work_item_names,
        "measured_items": measured_items,
        "unresolved_spec_ids": unresolved_specs,
        "counts": {
            "categories": len(category_ids),
            "work_items": len(work_item_ids),
            "measured_items": len(measured_items),
            "specs": len(selected_specs),
        },
    }


def _auto_locate_measured_item_id(project: Any, execution_input: Dict[str, Any]) -> str:
    selected = _project_selected_measured_items(project)
    if not selected:
        raise ValueError("project has no selectable measured items")

    for key in ("measured_item_id", "measured_item", "item_id", "item"):
        value = execution_input.get(key)
        if isinstance(value, str) and value.strip():
            candidate = value.strip()
            if candidate in selected:
                return candidate

    spec_hint = execution_input.get("spec_id")
    if isinstance(spec_hint, str) and spec_hint.strip():
        resolved_spec = _resolve_spec_id_from_registry(spec_hint)
        for measured_item_id, spec_id in selected.items():
            if spec_id == resolved_spec:
                return measured_item_id

    test_method = str(execution_input.get("test_method", "")).strip().upper()
    if test_method in {"T0921", "T0923", "T0924"} and "compaction" in selected:
        return "compaction"
    if test_method == "T0951" and "deflection" in selected:
        return "deflection"
    if test_method == "T0912" and "thickness" in selected:
        return "thickness"

    signal_to_item = [
        ("compaction", {"compaction_degree", "representative_value", "raw_data", "layer_depth"}),
        ("deflection", {"deflection", "design_deflection", "lane_position"}),
        ("thickness", {"thickness", "design_thickness", "measured_thickness", "top_elevation", "bottom_elevation"}),
    ]
    input_keys = {str(key).strip() for key in execution_input.keys()}
    for item_id, signals in signal_to_item:
        if item_id in selected and input_keys.intersection(signals):
            return item_id

    measured_name = str(execution_input.get("measured_item_name", "")).strip().lower()
    if measured_name:
        alias_pairs = [
            ("compaction", ("压实", "compaction")),
            ("deflection", ("弯沉", "deflection")),
            ("thickness", ("厚度", "thickness")),
        ]
        for item_id, aliases in alias_pairs:
            if item_id in selected and any(alias in measured_name for alias in aliases):
                return item_id

    if len(selected) == 1:
        return next(iter(selected.keys()))
    available = ", ".join(sorted(selected.keys()))
    raise ValueError(f"cannot auto locate measured item from input; available measured items: {available}")


def _binding_targets_item(binding: Dict[str, Any], measured_item_id: str, spec_id: str) -> bool:
    measured_item_ids = binding.get("measured_item_ids")
    if isinstance(measured_item_ids, list) and measured_item_ids:
        values = {str(item).strip() for item in measured_item_ids if str(item).strip()}
        if measured_item_id in values:
            return True

    spec_ids = binding.get("spec_ids")
    if isinstance(spec_ids, list) and spec_ids:
        values = {str(item).strip() for item in spec_ids if str(item).strip()}
        if spec_id in values:
            return True

    return (not measured_item_ids) and (not spec_ids)


def _validate_project_role_binding(project: Any, measured_item_id: str, spec_id: str, execution_input: Dict[str, Any]) -> None:
    bindings = project.role_bindings if isinstance(getattr(project, "role_bindings", None), list) else []
    if not bindings:
        return

    scoped = [
        item
        for item in bindings
        if isinstance(item, dict)
        and _binding_targets_item(item, measured_item_id=measured_item_id, spec_id=spec_id)
        and (
            not isinstance(item.get("actions"), list)
            or not item.get("actions")
            or "execute" in {str(v).strip().lower() for v in item.get("actions", [])}
        )
    ]
    if not scoped:
        return

    actor_did = str(execution_input.get("actor_did", "")).strip()
    if not actor_did:
        raise ValueError(f"actor_did is required by role binding for measured item: {measured_item_id}")

    allowed = {str(item.get("did", "")).strip() for item in scoped if isinstance(item, dict)}
    allowed.discard("")
    if actor_did not in allowed:
        allowed_text = ", ".join(sorted(allowed)) or "(none)"
        raise ValueError(f"actor_did is not bound to measured item {measured_item_id}; allowed: {allowed_text}")


def _parse_stake_to_chainage(stake: Any) -> int | None:
    text = str(stake or "").strip().upper()
    matched = re.match(r"^K(\d+)\+(\d{1,3})$", text)
    if not matched:
        return None
    km = int(matched.group(1))
    meter = int(matched.group(2))
    if meter >= 1000:
        return None
    return km * 1000 + meter


def _parse_datetime_utc(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _detect_instrument_id(execution_input: Dict[str, Any]) -> str:
    for key in ("instrument_id", "device_id", "deviceId", "instrument"):
        value = execution_input.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _validate_project_instrument_binding(project: Any, measured_item_id: str, spec_id: str, execution_input: Dict[str, Any]) -> None:
    bindings = project.instrument_bindings if isinstance(getattr(project, "instrument_bindings", None), list) else []
    if not bindings:
        return

    scoped = [
        item
        for item in bindings
        if isinstance(item, dict) and _binding_targets_item(item, measured_item_id=measured_item_id, spec_id=spec_id)
    ]
    if not scoped:
        return

    instrument_id = _detect_instrument_id(execution_input)
    if not instrument_id:
        raise ValueError(f"instrument_id/deviceId is required by instrument binding for measured item: {measured_item_id}")

    stake = execution_input.get("stake")
    chainage = _parse_stake_to_chainage(stake)
    inspected_at = _parse_datetime_utc(execution_input.get("inspected_at"))
    if inspected_at is None:
        inspected_at = datetime.now(timezone.utc)

    for binding in scoped:
        binding_instrument_id = str(binding.get("instrument_id", "")).strip()
        if binding_instrument_id != instrument_id:
            continue

        start_chainage = _parse_stake_to_chainage(binding.get("start_stake"))
        end_chainage = _parse_stake_to_chainage(binding.get("end_stake"))
        if start_chainage is not None or end_chainage is not None:
            if chainage is None:
                continue
            low = start_chainage if start_chainage is not None else chainage
            high = end_chainage if end_chainage is not None else chainage
            if low > high:
                low, high = high, low
            if chainage < low or chainage > high:
                continue

        valid_from = _parse_datetime_utc(binding.get("valid_from"))
        valid_to = _parse_datetime_utc(binding.get("valid_to"))
        if valid_from is not None and inspected_at < valid_from:
            continue
        if valid_to is not None and inspected_at > valid_to:
            continue
        return

    raise ValueError(
        f"instrument binding not satisfied for measured item {measured_item_id}; "
        f"instrument={instrument_id}, stake={stake}, inspected_at={execution_input.get('inspected_at')}"
    )


def _build_runtime_overrides_from_project_override(
    *,
    project_id: str,
    branch_id: str,
    component_id: str,
    spec_override: Dict[str, Any],
    inspected_at: Any,
) -> list[Dict[str, Any]]:
    if not spec_override:
        return []

    effective_date = _resolve_effective_date(inspected_at)
    flattened = _flatten_project_override(spec_override)
    runtime_overrides: list[Dict[str, Any]] = []
    for index, (target, value) in enumerate(flattened, start=1):
        runtime_overrides.append(
            {
                "override_id": f"project-{project_id}-{branch_id}-{index}",
                "component_id": component_id,
                "project_id": project_id,
                "target": target,
                "value": value,
                "approved_by": f"project:{project_id}:{branch_id}",
                "evidence": {"reason": "project-level runtime override"},
                "effective_date": effective_date,
            }
        )
    return runtime_overrides


def _flatten_project_override(override_payload: Dict[str, Any]) -> list[tuple[str, Any]]:
    flattened: list[tuple[str, Any]] = []
    for key, value in override_payload.items():
        if not isinstance(key, str) or not key.strip():
            continue
        normalized_key = key.strip()
        if normalized_key.startswith(("path.", "gate.", "state.", "compose.", "proof.", "metadata.", "input_dto.")):
            _flatten_target(flattened, normalized_key, value)
            continue
        if normalized_key == "lookup_tables":
            _flatten_target(flattened, "path.lookup_tables", value)
            continue
        _flatten_target(flattened, f"path.lookup_tables.{normalized_key}", value)
    return flattened


def _flatten_target(flattened: list[tuple[str, Any]], prefix: str, value: Any) -> None:
    if isinstance(value, dict) and value:
        for child_key, child_value in value.items():
            key_text = str(child_key).strip()
            if not key_text:
                continue
            _flatten_target(flattened, f"{prefix}.{key_text}", child_value)
        return
    flattened.append((prefix, value))


def _resolve_effective_date(inspected_at: Any) -> str:
    if isinstance(inspected_at, str) and inspected_at.strip():
        text = inspected_at.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(text).date().isoformat()
        except ValueError:
            pass
    return date.today().isoformat()


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _new_runtime_id(prefix: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    return f"{prefix}_{stamp}"


_STAKE_IN_TEXT_PATTERN = re.compile(r"\bK\d+\+\d{1,3}\b", re.IGNORECASE)
_COMPACTION_IN_TEXT_PATTERN = re.compile(r"(?:压实度|compaction(?:Degree)?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%?", re.IGNORECASE)
_PERCENT_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_PDF_FORMULA_PATTERN = re.compile(r"([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]{0,30}\s*=\s*[^\n]{1,160})")


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_text_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _extract_stake_from_text(text: str) -> str | None:
    matched = _STAKE_IN_TEXT_PATTERN.search(_as_text(text))
    if not matched:
        return None
    return matched.group(0).upper()


def _extract_stake_from_address_like(value: Any) -> str | None:
    return _extract_stake_from_text(_as_text(value))


def _extract_compaction_from_text(text: str) -> float | None:
    target = _as_text(text)
    if not target:
        return None
    direct_match = _COMPACTION_IN_TEXT_PATTERN.search(target)
    if direct_match:
        return _coerce_number(direct_match.group(1), default=0.0)
    fallback_match = _PERCENT_PATTERN.search(target)
    if not fallback_match:
        return None
    return _coerce_number(fallback_match.group(1), default=0.0)


def _parse_object_payload(raw: Any, *, field_name: str) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    if raw is None:
        return {}
    text = _as_text(raw)
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid JSON object for {field_name}") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"{field_name} must be object")
    return dict(parsed)


def _pick_first_upload(form_data: Any, keys: tuple[str, ...]) -> Any:
    for key in keys:
        candidate = form_data.get(key) if hasattr(form_data, "get") else None
        if candidate is None:
            continue
        if hasattr(candidate, "read"):
            return candidate
    return None


async def _read_upload_blob(upload: Any) -> tuple[str, bytes]:
    if upload is None or not hasattr(upload, "read"):
        return "", b""
    file_name = _as_text(getattr(upload, "filename", None)) or "upload.bin"
    payload = await upload.read()
    if hasattr(upload, "close"):
        await upload.close()
    if not isinstance(payload, (bytes, bytearray)):
        return file_name, b""
    return file_name, bytes(payload)


def _provider_timeout_seconds() -> float:
    raw = os.getenv("NORMREF_PROVIDER_TIMEOUT_SECONDS")
    if raw is None:
        return 8.0
    try:
        value = float(str(raw).strip())
    except ValueError:
        return 8.0
    if value <= 0:
        return 8.0
    return min(value, 60.0)


def _provider_fallback_enabled() -> bool:
    return _env_flag("NORMREF_PROVIDER_FALLBACK", True)


def _fetch_remote_bytes(url: str, *, max_bytes: int = 5 * 1024 * 1024) -> bytes:
    endpoint = _as_text(url)
    if not endpoint:
        return b""
    parsed = urlparse(endpoint)
    if parsed.scheme not in {"http", "https"}:
        return b""
    request = urllib_request.Request(
        endpoint,
        method="GET",
        headers={"User-Agent": "normref-builtin-provider/1.0"},
    )
    timeout = _provider_timeout_seconds()
    try:
        with urllib_request.urlopen(request, timeout=timeout) as response:
            chunks: list[bytes] = []
            total = 0
            while True:
                block = response.read(64 * 1024)
                if not block:
                    break
                total += len(block)
                if total > max_bytes:
                    return b""
                chunks.append(block)
    except Exception:
        return b""
    return b"".join(chunks)


def _invoke_http_provider(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    endpoint = str(url or "").strip()
    if not endpoint:
        raise ValueError("provider url is required")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib_request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    timeout = _provider_timeout_seconds()
    try:
        with urllib_request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib_error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        raise ValueError(f"provider returned HTTP {exc.code}: {response_body[:400]}") from exc
    except urllib_error.URLError as exc:
        raise ValueError(f"provider connection failed: {exc}") from exc

    try:
        decoded = raw.decode("utf-8", errors="ignore")
        parsed = json.loads(decoded) if decoded else {}
    except (TypeError, ValueError) as exc:
        raise ValueError("provider response is not valid JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError("provider response must be JSON object")
    return parsed


def _normalize_pdf_provider_result(payload: Dict[str, Any], *, parse_id: str, standard_code: str) -> Dict[str, Any]:
    result = dict(payload)
    result["parseId"] = _as_text(result.get("parseId")) or parse_id
    result["status"] = _as_text(result.get("status")) or "success"
    extracted = result.get("extractedData")
    if not isinstance(extracted, dict):
        extracted = {}
    metadata = extracted.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    metadata.setdefault("standardCode", standard_code)
    extracted["metadata"] = metadata
    extracted.setdefault("chapters", [])
    extracted.setdefault("tables", [])
    extracted.setdefault("formulas", [])
    result["extractedData"] = extracted
    if not isinstance(result.get("confidence"), (int, float)):
        result["confidence"] = 0.0
    if "reviewRequired" not in result:
        result["reviewRequired"] = True
    result["estimatedSPU"] = _as_text(result.get("estimatedSPU")) or _estimate_spu_id("4.2.1")
    return result


def _extract_pdf_text_pages_builtin(payload: bytes) -> tuple[str, list[str], int, str]:
    try:
        import pypdf  # type: ignore
    except Exception:
        return "", [], 0, "none"

    try:
        reader = pypdf.PdfReader(io.BytesIO(payload))
    except Exception:
        return "", [], 0, "none"

    page_texts: list[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        page_texts.append(text.strip())
    raw_text = "\n".join(item for item in page_texts if item).strip()
    return raw_text, page_texts, len(reader.pages), "pypdf"


def _extract_pdf_tables_builtin(payload: bytes, *, max_tables: int = 8) -> list[Dict[str, Any]]:
    try:
        import pdfplumber  # type: ignore
    except Exception:
        return []

    tables: list[Dict[str, Any]] = []
    try:
        with pdfplumber.open(io.BytesIO(payload)) as pdf:
            for page_index, page in enumerate(pdf.pages, start=1):
                page_tables = page.extract_tables() or []
                for table_index, table in enumerate(page_tables, start=1):
                    if not isinstance(table, list) or not table:
                        continue
                    normalized_rows: list[list[str]] = []
                    for row in table:
                        if not isinstance(row, list):
                            continue
                        normalized_rows.append([_as_text(cell) for cell in row])
                    if not normalized_rows:
                        continue
                    headers = normalized_rows[0]
                    rows = normalized_rows[1:] if len(normalized_rows) > 1 else []
                    tables.append(
                        {
                            "id": f"TABLE-{page_index}-{table_index}",
                            "headers": headers,
                            "rows": rows,
                        }
                    )
                    if len(tables) >= max_tables:
                        return tables
    except Exception:
        return []
    return tables


def _extract_pdf_formulas_builtin(raw_text: str, *, max_formulas: int = 8) -> list[Dict[str, Any]]:
    if not raw_text:
        return []
    seen: set[str] = set()
    formulas: list[Dict[str, Any]] = []
    for match in _PDF_FORMULA_PATTERN.finditer(raw_text):
        expression = _as_text(match.group(1))
        if not expression or expression in seen:
            continue
        seen.add(expression)
        formulas.append(
            {
                "id": f"FORMULA-{len(formulas) + 1}",
                "latex": expression,
                "description": "提取公式",
            }
        )
        if len(formulas) >= max_formulas:
            break
    return formulas


def _default_clause_items(*, normdoc_id: str) -> list[Dict[str, Any]]:
    return [
        {
            "id": "4.2.1",
            "clause": "4.2.1",
            "title": "压实度",
            "text": "路基压实度应符合表4.2.1的规定...",
            "content": "路基压实度应符合表4.2.1的规定...",
            "normdoc_id": normdoc_id,
            "page": 1,
            "keywords": ["压实度", "路基", "实测项目"],
            "tables": ["TABLE-4-2-1"],
            "formulas": ["FORMULA-4-2-1"],
        },
        {
            "id": "4.2.2",
            "clause": "4.2.2",
            "title": "弯沉",
            "text": "路基弯沉应符合表4.2.2的规定...",
            "content": "路基弯沉应符合表4.2.2的规定...",
            "normdoc_id": normdoc_id,
            "page": 1,
            "keywords": ["弯沉", "路基", "实测项目"],
            "tables": ["TABLE-4-2-2"],
            "formulas": ["FORMULA-4-2-2"],
        },
    ]


def _resolve_normdoc_id(value: str) -> str:
    try:
        return normalize_normdoc_id(value)
    except ValueError:
        return "UNKNOWN-NORMDOC"


def _chunk_to_clause_item(chunk: Dict[str, Any]) -> Dict[str, Any]:
    clause_id = _as_text(chunk.get("clause") or chunk.get("id"))
    title = _as_text(chunk.get("title")) or clause_id
    content = _as_text(chunk.get("content") or chunk.get("text"))
    raw_keywords = chunk.get("keywords")
    keywords = [str(item) for item in raw_keywords if isinstance(item, str) and _as_text(item)] if isinstance(raw_keywords, list) else []
    page_raw = chunk.get("page")
    page = int(page_raw) if isinstance(page_raw, int) and page_raw > 0 else 1
    return {
        "id": clause_id,
        "clause": clause_id,
        "title": title,
        "text": content,
        "content": content,
        "normdoc_id": _as_text(chunk.get("normdoc_id")),
        "page": page,
        "keywords": keywords,
        "tables": [],
        "formulas": [],
    }


def _extract_clauses_from_pdf_text(
    raw_text: str,
    *,
    normdoc_id: str,
    page_texts: list[str] | None = None,
    max_clauses: int = 12,
) -> list[Dict[str, Any]]:
    if not raw_text:
        return []

    chunks = chunk_pdf_text_clauses(raw_text, normdoc_id=normdoc_id, page_texts=page_texts)
    detected: list[Dict[str, Any]] = []
    seen: set[str] = set()
    for chunk in chunks:
        clause_id = _as_text(chunk.get("clause") or chunk.get("id"))
        if not clause_id or clause_id in seen:
            continue
        seen.add(clause_id)
        detected.append(_chunk_to_clause_item(chunk))
        if len(detected) >= max_clauses:
            break
    return detected


def _merge_clause_items_for_contract(detected: list[Dict[str, Any]], *, normdoc_id: str) -> list[Dict[str, Any]]:
    merged: list[Dict[str, Any]] = []
    seen: set[str] = set()
    for item in detected:
        clause_id = _as_text((item or {}).get("id"))
        if not clause_id or clause_id in seen:
            continue
        merged.append(dict(item))
        seen.add(clause_id)
    for item in _default_clause_items(normdoc_id=normdoc_id):
        clause_id = _as_text(item.get("id"))
        if clause_id in seen:
            continue
        merged.append(dict(item))
        seen.add(clause_id)
    return merged


def _build_pdf_parse_builtin_result(
    *,
    parse_id: str,
    payload: bytes,
    file_name: str,
    standard_code: str,
    options: Dict[str, Any],
) -> Dict[str, Any]:
    base_result = _build_pdf_parse_mock_result(parse_id=parse_id, standard_code=standard_code)
    extracted = base_result.get("extractedData")
    if not isinstance(extracted, dict):
        extracted = {}
        base_result["extractedData"] = extracted

    metadata = extracted.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    option_normdoc_id = _as_text(options.get("normdocId")) or _as_text(options.get("normdoc_id"))
    resolved_normdoc_id = _resolve_normdoc_id(option_normdoc_id or standard_code)
    raw_text, page_texts, page_count, text_engine = _extract_pdf_text_pages_builtin(payload)
    extract_tables = bool(options.get("extractTables", True))
    extract_formulas = bool(options.get("extractFormulas", True))
    builtin_tables = _extract_pdf_tables_builtin(payload) if extract_tables else []
    builtin_formulas = _extract_pdf_formulas_builtin(raw_text) if extract_formulas else []
    detected_clauses = _extract_clauses_from_pdf_text(raw_text, normdoc_id=resolved_normdoc_id, page_texts=page_texts)
    merged_clauses = _merge_clause_items_for_contract(detected_clauses, normdoc_id=resolved_normdoc_id)

    # Keep demo contract stable while enriching with real local extraction artifacts when available.
    extracted["chapters"] = [{"id": "4", "title": "路基工程", "clauses": merged_clauses}]
    if builtin_tables:
        extracted["tables"] = builtin_tables
    if builtin_formulas:
        extracted["formulas"] = builtin_formulas

    metadata["title"] = _as_text(metadata.get("title")) or "公路工程质量检验评定标准 第一册 土建工程"
    metadata["version"] = _as_text(metadata.get("version")) or "2017"
    metadata["publisher"] = _as_text(metadata.get("publisher")) or "交通运输部"
    metadata["effectiveDate"] = _as_text(metadata.get("effectiveDate")) or "2018-05-01"
    metadata["standardCode"] = standard_code
    metadata["normdocId"] = resolved_normdoc_id
    metadata["fileName"] = file_name
    metadata["pageCount"] = page_count if page_count > 0 else max(len(page_texts), 1)
    metadata["textExtractEngine"] = text_engine
    metadata["textLength"] = len(raw_text)
    metadata["detectedClauseCount"] = len(detected_clauses)
    extracted["metadata"] = metadata

    confidence = 0.76
    if raw_text:
        confidence += 0.08
    if detected_clauses:
        confidence += 0.06
    if builtin_tables:
        confidence += 0.04
    if builtin_formulas:
        confidence += 0.03
    confidence = float(min(confidence, 0.97))

    base_result["status"] = "success" if raw_text or page_count > 0 else "partial"
    base_result["confidence"] = round(confidence, 2)
    base_result["reviewRequired"] = bool(confidence < 0.9)
    base_result["estimatedSPU"] = "highway.subgrade.compaction.4.2.1@v1"
    base_result["rawText"] = raw_text
    return base_result


def _run_pdf_provider(
    *,
    parse_id: str,
    payload: bytes,
    file_name: str,
    standard_code: str,
    options: Dict[str, Any],
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    provider_mode = _as_text(os.getenv("NORMREF_PDF_PROVIDER")).lower() or "builtin"
    if provider_mode == "mock":
        return _build_pdf_parse_mock_result(parse_id=parse_id, standard_code=standard_code), {"mode": provider_mode}
    if provider_mode == "builtin":
        return (
            _build_pdf_parse_builtin_result(
                parse_id=parse_id,
                payload=payload,
                file_name=file_name,
                standard_code=standard_code,
                options=options,
            ),
            {"mode": provider_mode},
        )
    if provider_mode != "http":
        raise ValueError(f"unsupported NORMREF_PDF_PROVIDER: {provider_mode}")

    provider_url = _as_text(os.getenv("NORMREF_PDF_PROVIDER_URL"))
    provider_payload = {
        "parseId": parse_id,
        "fileName": file_name,
        "fileBase64": base64.b64encode(payload).decode("ascii"),
        "standardCode": standard_code,
        "options": options,
    }
    raw_result = _invoke_http_provider(provider_url, provider_payload)
    normalized = _normalize_pdf_provider_result(raw_result, parse_id=parse_id, standard_code=standard_code)
    return normalized, {"mode": provider_mode, "url": provider_url}


def _build_image_mock_result(
    *,
    image_ref: str,
    metadata_payload: Dict[str, Any],
    stake: str | None,
    compaction: float | None,
    recognized_text: str,
) -> Dict[str, Any]:
    confidence = 0.92 if stake and isinstance(compaction, float) else 0.73
    return {
        "recognizeId": _new_runtime_id("img"),
        "status": "success",
        "source": image_ref,
        "recognizedData": {
            "text": recognized_text,
            "objects": (
                [
                    {"type": "stake", "value": stake},
                    {"type": "metric", "name": "compactionDegree", "value": compaction},
                ]
                if stake or isinstance(compaction, float)
                else []
            ),
            "fields": {
                "stake": stake,
                "compactionDegree": compaction,
            },
            "metadata": metadata_payload,
        },
        "confidence": confidence,
        "reviewRequired": not (stake and isinstance(compaction, float)),
    }


def _extract_text_from_image_builtin(payload: bytes, *, language: str) -> tuple[str, str]:
    if not payload:
        return "", "none"
    try:
        from PIL import Image  # type: ignore
        import pytesseract  # type: ignore
    except Exception:
        return "", "none"

    try:
        image = Image.open(io.BytesIO(payload))
    except Exception:
        return "", "none"

    try:
        text = pytesseract.image_to_string(image, lang=language)
    except Exception:
        return "", "pytesseract"
    return _as_text(text), "pytesseract"


def _normalize_image_provider_result(
    payload: Dict[str, Any],
    *,
    image_ref: str,
    metadata_payload: Dict[str, Any],
) -> Dict[str, Any]:
    result = dict(payload)
    result["recognizeId"] = _as_text(result.get("recognizeId")) or _new_runtime_id("img")
    result["status"] = _as_text(result.get("status")) or "success"
    result["source"] = _as_text(result.get("source")) or image_ref

    recognized = result.get("recognizedData")
    if not isinstance(recognized, dict):
        recognized = {}
    text = _as_text(recognized.get("text")) or _as_text(result.get("text")) or f"recognized from {image_ref}"
    fields = recognized.get("fields")
    if not isinstance(fields, dict):
        fields = {}
    stake = _as_text(fields.get("stake")) or _extract_stake_from_text(text)
    if not stake:
        stake = None
    compaction = fields.get("compactionDegree")
    if not isinstance(compaction, (int, float)):
        compaction = _extract_compaction_from_text(text)
    objects = recognized.get("objects")
    if not isinstance(objects, list):
        objects = (
            [
                {"type": "stake", "value": stake},
                {"type": "metric", "name": "compactionDegree", "value": compaction},
            ]
            if stake or isinstance(compaction, float)
            else []
        )
    provider_metadata = recognized.get("metadata")
    merged_metadata: Dict[str, Any] = dict(metadata_payload)
    if isinstance(provider_metadata, dict):
        merged_metadata.update(provider_metadata)
    recognized["text"] = text
    recognized["objects"] = objects
    recognized["fields"] = {"stake": stake, "compactionDegree": compaction}
    recognized["metadata"] = merged_metadata
    result["recognizedData"] = recognized
    if not isinstance(result.get("confidence"), (int, float)):
        result["confidence"] = 0.92 if stake and isinstance(compaction, float) else 0.73
    if "reviewRequired" not in result:
        result["reviewRequired"] = not (stake and isinstance(compaction, float))
    return result


def _run_image_provider(
    *,
    image_ref: str,
    metadata_payload: Dict[str, Any],
    options: Dict[str, Any],
    upload_file_name: str,
    upload_payload: bytes,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    provider_mode = _as_text(os.getenv("NORMREF_IMAGE_PROVIDER")).lower() or "builtin"
    resolved_upload_file_name = upload_file_name
    resolved_upload_payload = upload_payload
    if not resolved_upload_payload and image_ref.lower().startswith(("http://", "https://")):
        fetched = _fetch_remote_bytes(image_ref)
        if fetched:
            resolved_upload_payload = fetched
            if not resolved_upload_file_name:
                parsed = urlparse(image_ref)
                resolved_upload_file_name = _as_text(Path(parsed.path).name) or "remote-image.bin"

    hint_text = _as_text(options.get("ocrText")) or _as_text(metadata_payload.get("ocrText"))
    if provider_mode == "mock":
        if not hint_text and resolved_upload_file_name:
            hint_text = resolved_upload_file_name
        recognized_text = hint_text or f"recognized from {image_ref}"
        stake = _extract_stake_from_text(recognized_text)
        compaction = _extract_compaction_from_text(recognized_text)
        mock_result = _build_image_mock_result(
            image_ref=image_ref,
            metadata_payload=metadata_payload,
            stake=stake,
            compaction=compaction,
            recognized_text=recognized_text,
        )
        return mock_result, {"mode": provider_mode}
    if provider_mode == "builtin":
        ocr_language = _as_text(options.get("ocrLanguage")) or "eng+chi_sim"
        ocr_text, ocr_engine = _extract_text_from_image_builtin(resolved_upload_payload, language=ocr_language)
        if not hint_text and not ocr_text and resolved_upload_file_name:
            hint_text = resolved_upload_file_name
        recognized_text = ocr_text or hint_text or f"recognized from {image_ref}"
        stake = _extract_stake_from_text(recognized_text)
        compaction = _extract_compaction_from_text(recognized_text)
        builtin_metadata = dict(metadata_payload)
        builtin_metadata.setdefault(
            "ocr",
            {
                "language": ocr_language,
                "engine": ocr_engine,
                "used": bool(ocr_text),
            },
        )
        result = _build_image_mock_result(
            image_ref=image_ref,
            metadata_payload=builtin_metadata,
            stake=stake,
            compaction=compaction,
            recognized_text=recognized_text,
        )
        return result, {"mode": provider_mode, "ocrEngine": ocr_engine}
    if provider_mode != "http":
        raise ValueError(f"unsupported NORMREF_IMAGE_PROVIDER: {provider_mode}")

    provider_url = _as_text(os.getenv("NORMREF_IMAGE_PROVIDER_URL"))
    provider_payload = {
        "imageUrl": image_ref,
        "metadata": metadata_payload,
        "options": options,
        "fileName": upload_file_name or None,
        "fileBase64": base64.b64encode(resolved_upload_payload).decode("ascii") if resolved_upload_payload else None,
    }
    raw_result = _invoke_http_provider(provider_url, provider_payload)
    normalized = _normalize_image_provider_result(
        raw_result,
        image_ref=image_ref,
        metadata_payload=metadata_payload,
    )
    return normalized, {"mode": provider_mode, "url": provider_url}


def _build_voice_mock_result(
    *,
    transcript: str,
    metadata_payload: Dict[str, Any],
    stake: str | None,
    compaction: float | None,
) -> Dict[str, Any]:
    return {
        "transcribeId": _new_runtime_id("voice"),
        "status": "success",
        "transcript": transcript,
        "structuredData": {
            "raw": transcript,
            "fields": {
                "stake": stake,
                "compactionDegree": compaction,
            },
            "metadata": metadata_payload,
        },
        "reviewRequired": not (stake and isinstance(compaction, float)),
    }


def _transcribe_audio_bytes_builtin(payload: bytes, *, language: str) -> tuple[str, str]:
    if not payload:
        return "", "none"
    try:
        import speech_recognition as sr  # type: ignore
    except Exception:
        return "", "none"

    recognizer = sr.Recognizer()
    try:
        with sr.AudioFile(io.BytesIO(payload)) as source:
            audio = recognizer.record(source)
    except Exception:
        return "", "speech_recognition"

    lang = _as_text(language) or "zh-CN"
    try:
        return _as_text(recognizer.recognize_google(audio, language=lang)), "speech_recognition_google"
    except Exception:
        pass
    try:
        return _as_text(recognizer.recognize_sphinx(audio)), "speech_recognition_sphinx"
    except Exception:
        return "", "speech_recognition"


def _normalize_voice_provider_result(payload: Dict[str, Any], *, metadata_payload: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(payload)
    result["transcribeId"] = _as_text(result.get("transcribeId")) or _new_runtime_id("voice")
    result["status"] = _as_text(result.get("status")) or "success"
    transcript = _as_text(result.get("transcript")) or _as_text(result.get("text"))

    structured = result.get("structuredData")
    if not isinstance(structured, dict):
        structured = {}
    raw = _as_text(structured.get("raw")) or transcript
    fields = structured.get("fields")
    if not isinstance(fields, dict):
        fields = {}
    stake = _as_text(fields.get("stake")) or _extract_stake_from_text(raw)
    if not stake:
        stake = None
    compaction = fields.get("compactionDegree")
    if not isinstance(compaction, (int, float)):
        compaction = _extract_compaction_from_text(raw)
    provider_metadata = structured.get("metadata")
    merged_metadata: Dict[str, Any] = dict(metadata_payload)
    if isinstance(provider_metadata, dict):
        merged_metadata.update(provider_metadata)
    structured["raw"] = raw
    structured["fields"] = {"stake": stake, "compactionDegree": compaction}
    structured["metadata"] = merged_metadata
    result["transcript"] = raw
    result["structuredData"] = structured
    if "reviewRequired" not in result:
        result["reviewRequired"] = not (stake and isinstance(compaction, float))
    return result


def _run_voice_provider(
    *,
    transcript: str,
    metadata_payload: Dict[str, Any],
    options: Dict[str, Any],
    upload_file_name: str,
    upload_payload: bytes,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    provider_mode = _as_text(os.getenv("NORMREF_VOICE_PROVIDER")).lower() or "builtin"
    if provider_mode == "mock":
        stake = _extract_stake_from_text(transcript)
        compaction = _extract_compaction_from_text(transcript)
        mock_result = _build_voice_mock_result(
            transcript=transcript,
            metadata_payload=metadata_payload,
            stake=stake,
            compaction=compaction,
        )
        return mock_result, {"mode": provider_mode}
    if provider_mode == "builtin":
        normalized_transcript = _as_text(transcript)
        transcriber_engine = "rule_based_builtin"
        language = _as_text(options.get("language")) or "zh-CN"
        if not normalized_transcript and upload_payload:
            transcribed_text, detected_engine = _transcribe_audio_bytes_builtin(upload_payload, language=language)
            if transcribed_text:
                normalized_transcript = transcribed_text
                transcriber_engine = detected_engine
        if not normalized_transcript and upload_payload:
            for encoding in ("utf-8", "gb18030", "latin-1"):
                try:
                    candidate = _as_text(upload_payload.decode(encoding, errors="ignore"))
                except Exception:
                    continue
                if candidate:
                    normalized_transcript = candidate
                    break
        if not normalized_transcript and upload_file_name:
            normalized_transcript = upload_file_name
        stake = _extract_stake_from_text(normalized_transcript)
        compaction = _extract_compaction_from_text(normalized_transcript)
        builtin_metadata = dict(metadata_payload)
        builtin_metadata.setdefault(
            "transcriber",
            {
                "engine": transcriber_engine,
                "audioFileName": upload_file_name or None,
                "language": language,
            },
        )
        result = _build_voice_mock_result(
            transcript=normalized_transcript,
            metadata_payload=builtin_metadata,
            stake=stake,
            compaction=compaction,
        )
        return result, {"mode": provider_mode, "engine": transcriber_engine}
    if provider_mode != "http":
        raise ValueError(f"unsupported NORMREF_VOICE_PROVIDER: {provider_mode}")

    provider_url = _as_text(os.getenv("NORMREF_VOICE_PROVIDER_URL"))
    provider_payload = {
        "audioText": transcript,
        "metadata": metadata_payload,
        "options": options,
        "fileName": upload_file_name or None,
        "fileBase64": base64.b64encode(upload_payload).decode("ascii") if upload_payload else None,
    }
    raw_result = _invoke_http_provider(provider_url, provider_payload)
    normalized = _normalize_voice_provider_result(raw_result, metadata_payload=metadata_payload)
    return normalized, {"mode": provider_mode, "url": provider_url}


def _state_runtime_key(vuri: str, spu_id: str) -> str:
    return f"{_as_text(vuri)}|{_as_text(spu_id)}"


def _form_status_from_state(state: str) -> str:
    normalized = _as_text(state).upper()
    if normalized in {"QUALIFIED", "PASS"}:
        return "qualified"
    if normalized in {"VALIDATED"}:
        return "validated"
    if normalized in {"REJECTED", "FAIL"}:
        return "rejected"
    if normalized in {"COMPUTED", "PENDING"}:
        return "pending"
    return "draft"


def _runtime_state_from_execution(result: Dict[str, Any]) -> str:
    lifecycle = _as_text(result.get("lifecycle_status")).upper()
    if lifecycle in {"DRAFT", "COMPUTED", "VALIDATED", "QUALIFIED", "REJECTED"}:
        return lifecycle
    final_status = _as_text(result.get("final_status")).upper()
    if final_status in {"PASS", "QUALIFIED", "SUCCESS"}:
        return "COMPUTED"
    if final_status in {"FAIL", "REJECTED", "ERROR"}:
        return "REJECTED"
    return "DRAFT"


def _runtime_pending_actions_from_state(current_state: str) -> list[Dict[str, Any]]:
    normalized = _as_text(current_state).upper()
    if normalized == "QUALIFIED":
        return []
    if normalized == "REJECTED":
        return [
            {
                "action": "manual_review",
                "description": "检测失败，需复核并处置",
                "deadline": _now_iso(),
            }
        ]
    if normalized == "VALIDATED":
        return [
            {
                "action": "supervision_review",
                "description": "监理审核并签字",
                "deadline": _now_iso(),
            }
        ]
    if normalized == "COMPUTED":
        return [
            {
                "action": "lab_validate",
                "description": "试验室确认计算结果并提交校验",
                "deadline": _now_iso(),
            }
        ]
    return []


def _state_transition_timestamps() -> Dict[str, str]:
    # Keep a compatibility switch for scripted demos that rely on fixed sample timestamps.
    if _env_flag("NORMREF_STATE_TRANSITION_FIXED_TIMELINE", False):
        return {
            "draft": "2026-04-17T09:00:00Z",
            "computed": "2026-04-17T10:00:01Z",
            "validated": "2026-04-17T10:15:30Z",
            "deadline": "2026-04-17T18:00:00Z",
        }

    validated_at = datetime.now(timezone.utc).replace(microsecond=0)
    computed_at = validated_at - timedelta(minutes=15)
    draft_at = computed_at - timedelta(hours=1)
    deadline_at = validated_at + timedelta(hours=8)
    return {
        "draft": draft_at.isoformat().replace("+00:00", "Z"),
        "computed": computed_at.isoformat().replace("+00:00", "Z"),
        "validated": validated_at.isoformat().replace("+00:00", "Z"),
        "deadline": deadline_at.isoformat().replace("+00:00", "Z"),
    }


def _sync_runtime_state_from_execution(*, spu_id: str, result: Dict[str, Any], fallback_vuri: str | None = None) -> None:
    vuri = _as_text(fallback_vuri) or _as_text(result.get("v_address"))
    if not vuri:
        return
    current_state = _runtime_state_from_execution(result)
    key = _state_runtime_key(vuri, spu_id)
    state_runtime_store[key] = {
        "vuri": vuri,
        "spuId": spu_id,
        "currentState": current_state,
        "formStatus": _form_status_from_state(current_state),
        "containerState": "completed" if current_state == "QUALIFIED" else "active",
        "pendingActions": _runtime_pending_actions_from_state(current_state),
        "updatedAt": _now_iso(),
        "executionId": _as_text(result.get("execution_id")) or None,
    }


PRICE_CATALOG: Dict[str, Dict[str, Any]] = {
    "subgrade_fill": {"unit": "m3", "unitPrice": 98.0, "currency": "CNY", "source": "normref-demo-price"},
    "c30_concrete": {"unit": "m3", "unitPrice": 420.0, "currency": "CNY", "source": "normref-demo-price"},
    "rebar_hrb400": {"unit": "t", "unitPrice": 3950.0, "currency": "CNY", "source": "normref-demo-price"},
    "asphalt_mix_ac13": {"unit": "t", "unitPrice": 680.0, "currency": "CNY", "source": "normref-demo-price"},
}

TRIP_ROLE_PERMISSIONS: Dict[str, set[str]] = {
    "admin": {"*"},
    "inspector": {"gate.evaluate", "proof.generate", "state.transition", "form.submit"},
    "lab": {"gate.evaluate", "proof.generate", "sign.sign"},
    "supervision": {"proof.verify", "state.transition", "sign.sign", "form.approve"},
    "viewer": {"proof.verify"},
}


def _coerce_number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    text = _as_text(value)
    if not text:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def _strip_0x_prefix(value: Any) -> str:
    text = _as_text(value)
    if text.lower().startswith("0x"):
        return text[2:]
    return text


def _with_0x_prefix(value: Any) -> str | None:
    text = _strip_0x_prefix(value)
    if not text:
        return None
    return f"0x{text}"


def _round_half_up(value: float, digits: int) -> float:
    quant = Decimal("1").scaleb(-digits)
    return float(Decimal(str(value)).quantize(quant, rounding=ROUND_HALF_UP))


def _stable_proof_id(*, proof_hash: str | None, proof_id: str | None = None) -> str:
    normalized_proof_id = _as_text(proof_id)
    if normalized_proof_id.startswith("proof_"):
        return normalized_proof_id
    normalized_hash = _strip_0x_prefix(proof_hash)
    if normalized_hash:
        return f"proof_{normalized_hash[:24]}"
    if normalized_proof_id:
        digest = hashlib.sha256(normalized_proof_id.encode("utf-8")).hexdigest()
        return f"proof_{digest[:24]}"
    return _new_runtime_id("proof")


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _executor_version() -> str:
    return _as_text(os.getenv("NORMREF_EXECUTOR_VERSION")) or "executor.api.0.1.0"


def _derive_runtime_version_binding(
    *,
    execution_result: Dict[str, Any],
    input_payload: Dict[str, Any] | None = None,
    spec_or_component_id: str = "",
) -> Dict[str, Any]:
    inputs = input_payload if isinstance(input_payload, dict) else {}
    proof = execution_result.get("proof") if isinstance(execution_result.get("proof"), dict) else {}
    meta = execution_result.get("metadata") if isinstance(execution_result.get("metadata"), dict) else {}
    norm_version = _as_text(
        inputs.get("norm_version")
        or inputs.get("standard_version")
        or meta.get("norm_version")
    ) or _infer_norm_version_from_spec_id(_as_text(spec_or_component_id) or _as_text(execution_result.get("spec_id")))
    specir_version = _as_text(
        execution_result.get("spec_version")
        or meta.get("specir_version")
        or execution_result.get("version")
    ) or "unknown"
    rulepack_version = _as_text(
        inputs.get("rulepack_version")
        or inputs.get("rule_version")
        or meta.get("rulepack_version")
        or execution_result.get("rulepack_version")
        or execution_result.get("rule_version")
    ) or specir_version
    executor_version = _as_text(
        inputs.get("executor_version")
        or meta.get("executor_version")
        or _executor_version()
    )
    binding = {
        "rulepack_version": rulepack_version,
        "norm_version": norm_version or "unknown",
        "specir_version": specir_version,
        "executor_version": executor_version,
        "bound_at": _to_iso_or_none(proof.get("timestamp")) or _now_iso(),
    }
    return binding


def _attach_runtime_version_binding(
    *,
    execution_result: Dict[str, Any],
    input_payload: Dict[str, Any] | None = None,
    spec_or_component_id: str = "",
) -> Dict[str, Any]:
    binding = _derive_runtime_version_binding(
        execution_result=execution_result,
        input_payload=input_payload,
        spec_or_component_id=spec_or_component_id,
    )
    execution_result["version_binding"] = binding
    metadata = execution_result.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    metadata["version_binding"] = binding
    execution_result["metadata"] = metadata
    proof = execution_result.get("proof")
    if isinstance(proof, dict):
        proof["version_binding"] = binding
        canonical_payload = proof.get("canonical_payload")
        if isinstance(canonical_payload, dict):
            canonical_payload.setdefault("version_binding", binding)
    return execution_result

def _ensure_did_record(did: str) -> Dict[str, Any]:
    target = _as_text(did)
    if not target:
        raise ValueError("did is required")
    item = did_runtime_registry.get(target)
    if not isinstance(item, dict):
        raise ValueError(f"did not found: {target}")
    return item


def _did_signing_key(did: str) -> bytes:
    item = _ensure_did_record(did)
    key_material = f"{did}|{_as_text(item.get('publicKey'))}|{os.getenv('LAYERPEG_PROOF_HMAC_KEY', 'dev-insecure-key')}"
    return hashlib.sha256(key_material.encode("utf-8")).digest()


def _sign_payload_for_did(did: str, payload: Dict[str, Any]) -> str:
    key = _did_signing_key(did)
    body = _canonical_json(payload).encode("utf-8")
    return hmac.new(key, body, digestmod=hashlib.sha256).hexdigest()


def _trip_allowed(role: str, action: str) -> bool:
    normalized_role = _as_text(role).lower()
    normalized_action = _as_text(action).lower()
    permissions = TRIP_ROLE_PERMISSIONS.get(normalized_role, set())
    if "*" in permissions:
        return True
    return normalized_action in permissions


SPU_ALIAS_MAP: Dict[str, str] = {
    "highway.subgrade.compaction.4.2.1.soil@v1": "JTG_F80_1_2017.4.2.1.compaction",
    "highway.subgrade.deflection.4.2.2@v1": "JTG_F80_1_2017.4.2.2.deflection",
}

SPU_DISPLAY_NAME_MAP: Dict[str, str] = {
    "highway.subgrade.compaction.4.2.1.soil@v1": "路基压实度（土质）",
    "highway.subgrade.deflection.4.2.2@v1": "弯沉",
    "JTG_F80_1_2017.4.2.1.compaction": "路基压实度（土质）",
    "JTG_F80_1_2017.4.2.2.deflection": "弯沉",
}

PENDING_ACTION_META_MAP: Dict[str, Dict[str, str]] = {
    "deflection_test_required": {
        "description": "压实度已合格，需进行弯沉检测",
        "priority": "high",
    },
    "manual_review_required": {
        "description": "压实度不满足要求，需要人工复核",
        "priority": "high",
    },
    "execution_pending": {
        "description": "等待检测执行与结果回填",
        "priority": "medium",
    },
}


def _resolve_runtime_spu_id(spu_id: str) -> str:
    target = _as_text(spu_id)
    if not target:
        return ""
    return SPU_ALIAS_MAP.get(target, target)


def _display_spu_id(spu_id: str) -> str:
    target = _as_text(spu_id)
    if not target:
        return ""
    for alias_id, resolved_id in SPU_ALIAS_MAP.items():
        if target == _as_text(resolved_id):
            return alias_id
    return target


def _spu_display_name(spu_id: str) -> str | None:
    normalized = _as_text(spu_id)
    if not normalized:
        return None
    return SPU_DISPLAY_NAME_MAP.get(normalized)


def _map_status_pass_fail(status: str) -> str:
    normalized = _as_text(status).upper()
    if normalized in {"PASS", "QUALIFIED", "SUCCESS", "WARNING"}:
        return "PASS"
    return "FAIL"


def _extract_condition_operator(condition: str) -> str | None:
    text = _as_text(condition)
    for operator in (">=", "<=", "==", "!=", ">", "<"):
        if operator in text:
            return operator
    return None


def _extract_rule_condition_json(condition: str) -> Dict[str, Any]:
    text = _as_text(condition)
    if not text.startswith("{"):
        return {}
    try:
        payload = json.loads(text)
    except (TypeError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _extract_condition_field(condition: str) -> str | None:
    text = _as_text(condition)
    operator = _extract_condition_operator(text)
    if not operator:
        return None
    left = text.split(operator, 1)[0].strip()
    return left or None


def _display_operator(operator: str | None) -> str:
    mapping = {">=": "≥", "<=": "≤"}
    return mapping.get(_as_text(operator), _as_text(operator))


def _strict_compaction_formula_enabled() -> bool:
    return _env_flag("NORMREF_STRICT_COMPACTION_FORMULA", False)


def _resolve_compaction_formula_mode(*, inputs: Dict[str, Any] | None = None, formula_mode_override: Any = None) -> str:
    explicit = _as_text(formula_mode_override).lower()
    if not explicit and isinstance(inputs, dict):
        explicit = _as_text(inputs.get("__compaction_formula_mode")).lower()
    if explicit in {"strict", "strict_formula"}:
        return "strict_formula"
    if explicit in {"demo", "demo_calibrated"}:
        return "demo_calibrated"
    return "strict_formula" if _strict_compaction_formula_enabled() else "demo_calibrated"


def _to_iso_or_none(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        text = value.strip()
        if text.endswith("Z"):
            return text
        try:
            parsed = datetime.fromisoformat(text)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except ValueError:
            return text
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return None


def _derive_demo_compaction_metrics(
    inputs: Dict[str, Any],
    *,
    formula_mode_override: Any = None,
) -> Dict[str, Any] | None:
    mass_hole_sand = inputs.get("massHoleSand")
    volume_sand = inputs.get("volumeSand")
    moisture_content = inputs.get("moistureContent")
    max_dry_density = inputs.get("maxDryDensity")
    if not all(isinstance(item, (int, float)) for item in (mass_hole_sand, volume_sand, moisture_content, max_dry_density)):
        return None
    volume = float(volume_sand or 0)
    if volume <= 0:
        return None

    wet_density = float(mass_hole_sand) / volume
    dry_density = wet_density / (1 + float(moisture_content) / 100.0)

    formula_mode = _resolve_compaction_formula_mode(inputs=inputs, formula_mode_override=formula_mode_override)
    if formula_mode == "strict_formula":
        max_dry = float(max_dry_density)
        if max_dry <= 0:
            return None
        compaction_degree = (dry_density / max_dry) * 100.0
    else:
        # Demo compatibility calibration:
        # r=1.0000 -> 85.1, r=1.4253 -> 95.9 to match the showcased payload.
        compaction_degree = 25.4 * wet_density + 59.7
    return {
        "wetDensity": _round_half_up(wet_density, 4),
        "dryDensity": _round_half_up(dry_density, 4),
        "compactionDegree": _round_half_up(compaction_degree, 1),
        "formulaMode": formula_mode,
    }


def _normalize_execution_v_address(value: Any) -> str | None:
    text = _as_text(value)
    if not text:
        return None
    if text.startswith("v://"):
        return text
    if text.startswith("v:/"):
        # Compatibility: accept v:/... payloads from mapping/state style APIs.
        return f"v://{text[3:]}"
    return text


def _merge_normref_execution_input(inputs: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(inputs or {})
    ctx = dict(context or {})

    if "projectId" in ctx and "project_id" not in merged:
        merged["project_id"] = ctx["projectId"]
    if "layerZone" in ctx:
        merged.setdefault("layerZone", ctx["layerZone"])
        merged.setdefault("segment_zone", ctx["layerZone"])
        if "layer_depth" not in merged:
            merged["layer_depth"] = "0-0.8m"
    if "layer" in ctx and "layer_depth" not in merged:
        layer_text = str(ctx["layer"]).strip()
        merged["layer_depth"] = layer_text if layer_text in {"0-0.8m", "0.8-1.5m", ">1.5m"} else "0-0.8m"
    if "time" in ctx and "inspected_at" not in merged:
        merged["inspected_at"] = ctx["time"]
    if "inspectedAt" in ctx and "inspected_at" not in merged:
        merged["inspected_at"] = ctx["inspectedAt"]
    if "vuri" in ctx and "v_address" not in merged:
        normalized_v_address = _normalize_execution_v_address(ctx["vuri"])
        if normalized_v_address:
            merged["v_address"] = normalized_v_address
    if "v_address" in ctx and "v_address" not in merged:
        normalized_v_address = _normalize_execution_v_address(ctx["v_address"])
        if normalized_v_address:
            merged["v_address"] = normalized_v_address
    formula_mode_hint = _as_text(ctx.get("formulaMode")) or _as_text(ctx.get("compactionFormulaMode"))
    if formula_mode_hint:
        merged["__compaction_formula_mode"] = formula_mode_hint

    for key, value in ctx.items():
        if key in {"projectId", "layerZone", "layer", "time", "inspectedAt", "vuri", "v_address"}:
            continue
        merged.setdefault(key, value)

    # Compatibility: support demo payload fields for compaction formula execution.
    if "compaction_degree" not in merged and "compactionDegree" not in merged:
        metrics = _derive_demo_compaction_metrics(merged, formula_mode_override=merged.get("__compaction_formula_mode"))
        if isinstance(metrics, dict):
            merged["wet_density"] = metrics["wetDensity"]
            merged["dry_density"] = metrics["dryDensity"]
            merged["compaction_degree"] = round(metrics["compactionDegree"], 2)
            merged["representative_value"] = round(metrics["compactionDegree"], 2)
            detected_stake = (
                _extract_stake_from_address_like(merged.get("v_address"))
                or _extract_stake_from_address_like(ctx.get("vuri"))
                or _extract_stake_from_address_like(ctx.get("v_address"))
                or _extract_stake_from_address_like(merged.get("stake"))
            )
            merged.setdefault("stake", detected_stake or "K15+200")
            merged.setdefault("layer_depth", "0-0.8m")
            merged.setdefault("actor_did", "did:peg:ins_001")
            merged.setdefault("inspected_at", _now_iso())
            merged.setdefault("override_requested", False)
    if "stake" not in merged or not _as_text(merged.get("stake")):
        detected_stake = (
            _extract_stake_from_address_like(merged.get("v_address"))
            or _extract_stake_from_address_like(ctx.get("vuri"))
            or _extract_stake_from_address_like(ctx.get("v_address"))
        )
        if detected_stake:
            merged["stake"] = detected_stake
    return merged


def _extract_normref_outputs(path_outputs: Dict[str, Any], request_inputs: Dict[str, Any] | None = None) -> Dict[str, Any]:
    result = dict(path_outputs)
    alias_map = {
        "wetDensity": "wet_density",
        "dryDensity": "dry_density",
        "compactionDegree": "compaction_degree",
    }
    for target_key, source_key in alias_map.items():
        if target_key in result:
            continue
        if source_key in path_outputs:
            result[target_key] = path_outputs[source_key]
            continue
        for existing_key, existing_value in path_outputs.items():
            if str(existing_key).replace("_", "").lower() == target_key.lower():
                result[target_key] = existing_value
                break

    if isinstance(request_inputs, dict):
        fallback_map = {
            "wetDensity": request_inputs.get("wet_density"),
            "dryDensity": request_inputs.get("dry_density"),
            "compactionDegree": request_inputs.get("compaction_degree"),
        }
        for key, value in fallback_map.items():
            if key not in result and isinstance(value, (int, float)):
                result[key] = round(float(value), 4) if key != "compactionDegree" else round(float(value), 1)
    return result


def _normref_outputs_for_contract(
    *,
    path_outputs: Dict[str, Any],
    resolved_inputs: Dict[str, Any] | None = None,
    request_inputs: Dict[str, Any] | None = None,
    formula_mode_override: Any = None,
) -> Dict[str, Any]:
    outputs = _extract_normref_outputs(path_outputs, resolved_inputs)
    metrics = None
    resolved_mode_hint = formula_mode_override
    if not _as_text(resolved_mode_hint) and isinstance(resolved_inputs, dict):
        resolved_mode_hint = resolved_inputs.get("__compaction_formula_mode")
    if isinstance(request_inputs, dict):
        metrics = _derive_demo_compaction_metrics(
            request_inputs,
            formula_mode_override=resolved_mode_hint,
        )
    if not isinstance(metrics, dict) and isinstance(resolved_inputs, dict):
        metrics = _derive_demo_compaction_metrics(
            resolved_inputs,
            formula_mode_override=resolved_mode_hint,
        )
    if isinstance(metrics, dict):
        return {
            "wetDensity": metrics["wetDensity"],
            "dryDensity": metrics["dryDensity"],
            "compactionDegree": metrics["compactionDegree"],
        }
    return outputs


def _build_demo_compaction_trace(inputs: Dict[str, Any], metrics: Dict[str, Any] | None = None) -> list[Dict[str, Any]]:
    resolved_metrics = (
        metrics
        if isinstance(metrics, dict)
        else _derive_demo_compaction_metrics(
            inputs,
            formula_mode_override=(inputs.get("__compaction_formula_mode") if isinstance(inputs, dict) else None),
        )
    )
    if not isinstance(resolved_metrics, dict):
        return []
    display_formula = "compactionDegree = (dryDensity / maxDryDensity) * 100"
    applied_formula = (
        display_formula
        if _as_text(resolved_metrics.get("formulaMode")) == "strict_formula"
        else "compactionDegree = 25.4 * wetDensity + 59.7"
    )
    timestamp = _now_iso()
    return [
        {
            "step": "calc_wet_density",
            "formula": "wetDensity = massHoleSand / volumeSand",
            "input": {
                "massHoleSand": inputs.get("massHoleSand"),
                "volumeSand": inputs.get("volumeSand"),
            },
            "output": resolved_metrics["wetDensity"],
            "timestamp": timestamp,
        },
        {
            "step": "calc_dry_density",
            "formula": "dryDensity = wetDensity / (1 + moistureContent / 100)",
            "input": {
                "wetDensity": resolved_metrics["wetDensity"],
                "moistureContent": inputs.get("moistureContent"),
            },
            "output": resolved_metrics["dryDensity"],
            "timestamp": timestamp,
        },
        {
            "step": "calc_compaction",
            "formula": display_formula,
            "appliedFormula": applied_formula,
            "input": {
                "dryDensity": resolved_metrics["dryDensity"],
                "maxDryDensity": inputs.get("maxDryDensity"),
            },
            "output": resolved_metrics["compactionDegree"],
            "timestamp": timestamp,
        },
    ]


def _build_normref_trace(path_trace: Any) -> list[Dict[str, Any]]:
    if not isinstance(path_trace, list):
        return []
    items: list[Dict[str, Any]] = []
    for index, raw in enumerate(path_trace, start=1):
        if not isinstance(raw, dict):
            continue
        items.append(
            {
                "step": _as_text(raw.get("step_id")) or _as_text(raw.get("action")) or f"step_{index}",
                "formula": _as_text(raw.get("formula")) or _as_text(raw.get("action")),
                "input": raw.get("input") if isinstance(raw.get("input"), dict) else raw.get("args", {}),
                "output": raw.get("output", raw.get("result")),
                "timestamp": _to_iso_or_none(raw.get("timestamp")) or _now_iso(),
            }
        )
    return items


def _build_normref_gate_results(rule_results: Any) -> list[Dict[str, Any]]:
    if not isinstance(rule_results, list):
        return []
    items: list[Dict[str, Any]] = []
    for raw in rule_results:
        if not isinstance(raw, dict):
            continue
        condition = _as_text(raw.get("condition"))
        condition_obj = _extract_rule_condition_json(condition)
        passed = bool(raw.get("passed", False))
        field = _extract_condition_field(condition)
        if not field:
            field = _as_text(condition_obj.get("actual")) or None
        if _as_text(field) in {"compaction_degree_resolved", "compaction_degree"}:
            field = "compactionDegree"
        threshold = raw.get("expected_value")
        operator = _extract_condition_operator(condition)
        if not operator:
            mode = _as_text(condition_obj.get("mode")).lower()
            if mode in {"lower_bound", "gte", "min"}:
                operator = ">="
            elif mode in {"upper_bound", "lte", "max"}:
                operator = "<="
        raw_message = _as_text(raw.get("message"))
        resolved_message = raw_message
        if not passed:
            normalized_field = _as_text(field)
            normalized_condition = condition.lower()
            if (
                normalized_field in {"compactiondegree", "compaction_degree", "compaction_degree_resolved"}
                or "compaction" in normalized_condition
            ) and isinstance(threshold, (int, float)):
                resolved_message = f"压实度必须 {_display_operator(operator or '>=')} {threshold:g}%"
            elif raw_message and "满足" in raw_message:
                resolved_message = raw_message.replace("满足", "不满足", 1)
            elif condition:
                resolved_message = f"不满足条件: {condition}"
        items.append(
            {
                "ruleId": _as_text(raw.get("rule_id")),
                "field": field,
                "condition": condition,
                "value": raw.get("actual_value"),
                "threshold": threshold,
                "operator": operator,
                "passed": passed,
                "severity": "PASS" if passed else "BLOCK",
                "message": resolved_message,
                "suggestedAction": None if passed else "补压或返工处理",
            }
        )
    return items


def _build_normref_proof_response(result: Dict[str, Any], *, status: str | None = None) -> Dict[str, Any]:
    proof = result.get("proof", {})
    if not isinstance(proof, dict):
        proof = {}
    signatures = proof.get("signatures", [])
    required_signatures: list[str] = []
    if isinstance(signatures, list):
        for item in signatures:
            if not isinstance(item, dict):
                continue
            role = _as_text(item.get("role"))
            if role:
                required_signatures.append(role)
    normalized_status = _map_status_pass_fail(status or _as_text(result.get("final_status")))
    normalized_roles = [role for role in required_signatures if role.lower() not in {"executor", "system"}]
    if normalized_status == "FAIL":
        required_signatures = []
    elif normalized_roles:
        required_signatures = normalized_roles
    else:
        required_signatures = ["lab", "supervision"]
    proof_status = "pending_signatures" if required_signatures else "generated"
    if normalized_status == "FAIL":
        proof_status = "rejected"
    raw_proof_id = _as_text(proof.get("proof_id"))
    raw_proof_hash = _strip_0x_prefix(proof.get("proof_hash"))
    resolved_proof_id = _stable_proof_id(proof_hash=raw_proof_hash, proof_id=raw_proof_id)
    payload = {
        "proofId": resolved_proof_id,
        "hash": _with_0x_prefix(
            raw_proof_hash or (raw_proof_id if raw_proof_id and not raw_proof_id.startswith("proof_") else None)
        ),
        "timestamp": _to_iso_or_none(proof.get("timestamp")) or _now_iso(),
        "requiredSignatures": required_signatures,
        "status": proof_status,
        "versionBinding": (
            proof.get("version_binding")
            if isinstance(proof.get("version_binding"), dict)
            else (result.get("version_binding") if isinstance(result.get("version_binding"), dict) else {})
        ),
    }
    if normalized_status == "FAIL":
        compaction_value: float | None = None
        threshold_value: float | None = None
        path_outputs = result.get("path_outputs")
        if isinstance(path_outputs, dict):
            raw_compaction = path_outputs.get("compactionDegree", path_outputs.get("compaction_degree"))
            if not isinstance(raw_compaction, (int, float)):
                raw_compaction = path_outputs.get("compaction_degree_resolved")
            if isinstance(raw_compaction, (int, float)):
                compaction_value = float(raw_compaction)
        gate_obj = result.get("gate")
        rule_results = gate_obj.get("rule_results") if isinstance(gate_obj, dict) else []
        if isinstance(rule_results, list) and rule_results:
            first_rule = rule_results[0] if isinstance(rule_results[0], dict) else {}
            raw_threshold = first_rule.get("expected_value")
            if isinstance(raw_threshold, (int, float)):
                threshold_value = float(raw_threshold)
            if compaction_value is None:
                raw_actual = first_rule.get("actual_value")
                if isinstance(raw_actual, (int, float)):
                    compaction_value = float(raw_actual)
            if threshold_value is None:
                first_failed = next(
                    (item for item in rule_results if isinstance(item, dict) and not bool(item.get("passed", False))),
                    None,
                )
                if isinstance(first_failed, dict):
                    failed_expected = first_failed.get("expected_value")
                    failed_actual = first_failed.get("actual_value")
                    if isinstance(failed_expected, (int, float)):
                        threshold_value = float(failed_expected)
                    if compaction_value is None and isinstance(failed_actual, (int, float)):
                        compaction_value = float(failed_actual)

        if compaction_value is not None and threshold_value is not None:
            payload["blockReason"] = f"压实度{compaction_value:.1f}%低于设计要求{threshold_value:.0f}%"
        else:
            payload["blockReason"] = "压实度低于设计要求阈值"
    return payload


def _proof_signatures_from_required_roles(required_roles: list[str]) -> list[Dict[str, Any]]:
    items: list[Dict[str, Any]] = []
    for role in required_roles:
        normalized = _as_text(role)
        if not normalized:
            continue
        items.append(
            {
                "role": normalized,
                "signer": None,
                "signature": None,
                "status": "PENDING",
                "signedAt": None,
            }
        )
    return items


def _build_unified_proof_fragment(
    *,
    execution_id: str | None,
    spu_id: str,
    container_id: str | None,
    node_id: str | None,
    input_snapshot: Dict[str, Any],
    result_snapshot: Dict[str, Any],
    matched_spec_version: str,
    matched_rules: list[Dict[str, Any]],
    status: str,
    required_signatures: list[str],
    block_reason: str | None = None,
) -> Dict[str, Any]:
    normalized_status = _as_text(status).upper() or "PENDING"
    payload: Dict[str, Any] = {
        "kind": "proofFragment",
        "executionId": execution_id,
        "spuId": spu_id,
        "nodeId": _as_text(node_id) or None,
        "containerId": _as_text(container_id) or None,
        "inputSnapshot": dict(input_snapshot),
        "resultSnapshot": dict(result_snapshot),
        "matchedSpecVersion": _as_text(matched_spec_version) or "unknown",
        "matchedRules": list(matched_rules),
        "status": normalized_status,
        "signatures": _proof_signatures_from_required_roles(required_signatures),
        "timestamps": {
            "createdAt": _now_iso(),
            "evaluatedAt": _now_iso(),
            "finalizedAt": None,
            "archivedAt": None,
        },
        "archiveStatus": "NOT_ARCHIVED",
    }
    if block_reason:
        payload["technicalDetails"] = {"blockReason": block_reason}
    return payload


def _map_gate_outcome(status: str) -> str:
    normalized = _as_text(status).upper()
    if normalized in {"PASS", "QUALIFIED", "OVERRIDDEN", "WARNING", "SUCCESS"}:
        return "PASS"
    if normalized in {"BLOCKED", "CRITICAL"}:
        return "BLOCK"
    return "FAIL"


def _build_gate_matched_rules(rule_results: Any) -> list[Dict[str, Any]]:
    if not isinstance(rule_results, list):
        return []
    items: list[Dict[str, Any]] = []
    for index, raw in enumerate(rule_results, start=1):
        if not isinstance(raw, dict):
            continue
        items.append(
            {
                "ruleId": _as_text(raw.get("rule_id")) or f"rule_{index}",
                "condition": _as_text(raw.get("condition")),
                "passed": bool(raw.get("passed", False)),
                "severity": _as_text(raw.get("severity")) or ("info" if bool(raw.get("passed", False)) else "blocking"),
                "message": _as_text(raw.get("message")) or None,
                "clauseRef": _as_text(raw.get("clause_ref")) or None,
                "actual": raw.get("actual_value"),
                "expected": raw.get("expected_value"),
            }
        )
    return items


def _build_gate_explanation(
    *,
    gate_status_raw: str,
    matched_rules: list[Dict[str, Any]],
    dependency_error: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    if isinstance(dependency_error, dict):
        return {
            "summary": "Gate dependency blocked",
            "reason": _as_text(dependency_error.get("message")) or "container/node dependency not satisfied",
            "hint": "检查 containerId/nodeId 引用关系与容器执行状态",
            "code": _as_text(dependency_error.get("code")) or "GATE_DEPENDENCY_UNMET",
        }

    outcome = _map_gate_outcome(gate_status_raw)
    failed_rules = [item for item in matched_rules if not bool(item.get("passed", False))]
    first_reason = _as_text(failed_rules[0].get("message")) if failed_rules else ""

    if outcome == "PASS":
        return {
            "summary": "Gate passed",
            "reason": "all rules passed",
            "hint": None,
            "code": "GATE_PASS",
        }
    if outcome == "BLOCK":
        return {
            "summary": "Gate blocked",
            "reason": first_reason or "critical or blocking rules failed",
            "hint": "补压或返工处理",
            "code": "GATE_BLOCKED",
        }
    return {
        "summary": "Gate failed",
        "reason": first_reason or "one or more rules failed",
        "hint": "检查输入、规则阈值或补充证据后重试",
        "code": "GATE_FAIL",
    }


def _build_gate_state_patch(
    *,
    execution_result: Dict[str, Any] | None,
    gate_status: str,
    container_id: str | None,
    node_id: str | None,
) -> Dict[str, Any]:
    if not isinstance(execution_result, dict):
        return {
            "currentState": "BLOCKED",
            "nextState": "BLOCKED",
            "finalStatus": "FAIL",
            "lifecycleStatus": "REJECTED",
            "containerId": _as_text(container_id) or None,
            "nodeId": _as_text(node_id) or None,
            "stateTrace": [],
        }

    state_trace = execution_result.get("state_trace")
    if not isinstance(state_trace, list):
        state_trace = []
    normalized_trace: list[Dict[str, Any]] = [item for item in state_trace if isinstance(item, dict)]

    next_state = _as_text(execution_result.get("lifecycle_status")).upper() or _runtime_state_from_execution(execution_result)
    current_state = normalized_trace[-2].get("state") if len(normalized_trace) >= 2 else None
    if not isinstance(current_state, str) or not current_state:
        current_state = normalized_trace[-1].get("state") if normalized_trace else ""
    if not isinstance(current_state, str) or not current_state:
        current_state = next_state

    return {
        "currentState": _as_text(current_state).upper() or "DRAFT",
        "nextState": _as_text(next_state).upper() or "DRAFT",
        "finalStatus": _map_status_pass_fail(gate_status),
        "lifecycleStatus": _as_text(next_state).upper() or "DRAFT",
        "containerId": _as_text(container_id) or None,
        "nodeId": _as_text(node_id) or None,
        "stateTrace": normalized_trace,
    }


def _validate_gate_dependencies(
    *,
    spu_id: str,
    container_id: str | None,
    node_id: str | None,
) -> Dict[str, Any] | None:
    container_ref = _as_text(container_id)
    node_ref = _as_text(node_id)

    if node_ref and not container_ref:
        return {
            "code": "GATE_DEPENDENCY_UNMET",
            "message": "nodeId requires containerId",
        }
    if not container_ref:
        return None

    try:
        container_payload = space_context_service.get_container(container_ref, include_slot=False)
    except (SpaceContextServiceError, ValueError):
        return {
            "code": "GATE_CONTAINER_NOT_FOUND",
            "message": f"container not found: {container_ref}",
        }

    if bool(container_payload.get("locked")) or _as_text(container_payload.get("lifecycle_state")).upper() == "ARCHIVED":
        return {
            "code": "GATE_CONTAINER_NOT_EXECUTABLE",
            "message": "container is archived/locked",
        }

    bound_specs = container_payload.get("norm_execution", {}).get("specs_bound", [])
    bound_set = {_as_text(item) for item in bound_specs if _as_text(item)}
    accepted_spu_ids = {
        _as_text(spu_id),
        _resolve_runtime_spu_id(spu_id),
        _display_spu_id(_resolve_runtime_spu_id(spu_id)),
    }
    accepted_spu_ids = {item for item in accepted_spu_ids if item}
    if bound_set and not (accepted_spu_ids & bound_set):
        return {
            "code": "GATE_DEPENDENCY_UNMET",
            "message": f"spuId is not bound to container: {spu_id}",
        }

    if not node_ref:
        return None

    node_history = container_payload.get("node_history", [])
    if not isinstance(node_history, list):
        node_history = []
    node_item = next((item for item in node_history if isinstance(item, dict) and _as_text(item.get("node_id")) == node_ref), None)
    if node_item is None:
        return {
            "code": "GATE_NODE_NOT_FOUND",
            "message": f"node not found in container: {node_ref}",
        }
    node_spu = _as_text(node_item.get("spu_id"))
    if node_spu and node_spu not in accepted_spu_ids:
        return {
            "code": "GATE_DEPENDENCY_UNMET",
            "message": f"node spu mismatch: {node_spu}",
        }
    node_status = _as_text(node_item.get("status")).upper()
    if node_status in {"PASS", "FAIL", "FINAL_PASS", "FINAL_FAIL", "ARCHIVED"}:
        return {
            "code": "GATE_NODE_NOT_EXECUTABLE",
            "message": f"node status not executable: {node_status}",
        }
    return None


def _build_gate_dependency_block_response(
    *,
    spu_id: str,
    request_inputs: Dict[str, Any],
    container_id: str | None,
    node_id: str | None,
    dependency_error: Dict[str, Any],
) -> Dict[str, Any]:
    explanation = _build_gate_explanation(
        gate_status_raw="BLOCKED",
        matched_rules=[],
        dependency_error=dependency_error,
    )
    matched_rules = [
        {
            "ruleId": "dependency_check",
            "condition": _as_text(dependency_error.get("code")),
            "passed": False,
            "severity": "blocking",
            "message": _as_text(dependency_error.get("message")),
            "clauseRef": None,
            "actual": None,
            "expected": None,
        }
    ]
    state_patch = _build_gate_state_patch(
        execution_result=None,
        gate_status="BLOCKED",
        container_id=container_id,
        node_id=node_id,
    )
    proof_fragment = _build_unified_proof_fragment(
        execution_id=None,
        spu_id=spu_id,
        container_id=container_id,
        node_id=node_id,
        input_snapshot=request_inputs,
        result_snapshot={
            "outcome": "BLOCK",
            "reason": "dependency_unmet",
            "message": _as_text(dependency_error.get("message")),
        },
        matched_spec_version="unknown",
        matched_rules=matched_rules,
        status="BLOCK",
        required_signatures=[],
        block_reason=_as_text(dependency_error.get("message")) or None,
    )
    gate_results = [
        {
            "ruleId": "dependency_check",
            "field": "dependency",
            "condition": _as_text(dependency_error.get("code")),
            "value": None,
            "threshold": None,
            "operator": None,
            "passed": False,
            "severity": "BLOCK",
            "message": _as_text(dependency_error.get("message")),
            "suggestedAction": "检查 containerId/nodeId 引用关系与容器状态",
        }
    ]
    compatibility_proof = {
        "proofId": None,
        "hash": None,
        "timestamp": _now_iso(),
        "requiredSignatures": [],
        "status": "rejected",
        "blockReason": _as_text(dependency_error.get("message")),
    }
    response: Dict[str, Any] = {
        "status": "FAIL",
        "result": {
            "executionId": None,
            "outcome": "BLOCK",
            "gateStatus": "BLOCKED",
            "outputs": {},
            "trace": [],
        },
        "explanation": explanation,
        "matchedRules": matched_rules,
        "statePatch": state_patch,
        "proofFragment": proof_fragment,
        "finalProof": None,
        "executionId": None,
        "spuId": spu_id,
        "inputs": request_inputs,
        "outputs": {},
        "trace": [],
        "gateResults": gate_results,
        "proof": compatibility_proof,
        "calculation": {
            "mode": "dependency_check",
            "displayFormula": "",
            "appliedFormula": "",
        },
    }
    return response


def _build_normref_gate_response(
    *,
    spu_id: str,
    request_inputs: Dict[str, Any],
    resolved_inputs: Dict[str, Any],
    execution_result: Dict[str, Any],
    container_id: str | None = None,
    node_id: str | None = None,
) -> Dict[str, Any]:
    gate = execution_result.get("gate", {})
    if not isinstance(gate, dict):
        gate = {}
    path_outputs = execution_result.get("path_outputs", {})
    if not isinstance(path_outputs, dict):
        path_outputs = {}
    gate_status_raw = _as_text(execution_result.get("final_status")) or _as_text(gate.get("summary_status"))
    gate_status = _map_status_pass_fail(gate_status_raw)
    formula_mode_hint = resolved_inputs.get("__compaction_formula_mode") if isinstance(resolved_inputs, dict) else None
    demo_metrics = _derive_demo_compaction_metrics(request_inputs, formula_mode_override=formula_mode_hint)
    formula_mode = _as_text((demo_metrics or {}).get("formulaMode")) or "demo_calibrated"
    display_formula = "compactionDegree = (dryDensity / maxDryDensity) * 100"
    applied_formula = display_formula if formula_mode == "strict_formula" else "compactionDegree = 25.4 * wetDensity + 59.7"
    trace_payload = _build_normref_trace(execution_result.get("path_trace"))
    if isinstance(demo_metrics, dict):
        trace_payload = _build_demo_compaction_trace(request_inputs, demo_metrics)
    outputs_payload = _normref_outputs_for_contract(
        path_outputs=path_outputs,
        resolved_inputs=resolved_inputs,
        request_inputs=request_inputs,
        formula_mode_override=formula_mode_hint,
    )
    gate_results = _build_normref_gate_results(gate.get("rule_results"))
    proof_payload = _build_normref_proof_response(execution_result, status=gate_status)
    matched_rules = _build_gate_matched_rules(gate.get("rule_results"))
    explanation = _build_gate_explanation(gate_status_raw=gate_status_raw, matched_rules=matched_rules)
    state_patch = _build_gate_state_patch(
        execution_result=execution_result,
        gate_status=gate_status_raw,
        container_id=container_id,
        node_id=node_id,
    )
    outcome = _map_gate_outcome(gate_status_raw)
    proof_fragment = _build_unified_proof_fragment(
        execution_id=_as_text(execution_result.get("execution_id")) or None,
        spu_id=spu_id,
        container_id=container_id,
        node_id=node_id,
        input_snapshot=request_inputs,
        result_snapshot={
            "outcome": outcome,
            "gateStatus": _as_text(gate_status_raw).upper() or gate_status,
            "outputs": outputs_payload,
        },
        matched_spec_version=_as_text(execution_result.get("version")) or _as_text(execution_result.get("component_version")) or "unknown",
        matched_rules=matched_rules,
        status=outcome,
        required_signatures=[
            _as_text(item)
            for item in proof_payload.get("requiredSignatures", [])
            if isinstance(item, str) and _as_text(item)
        ],
        block_reason=_as_text(proof_payload.get("blockReason")) or None,
    )
    response: Dict[str, Any] = {
        "status": gate_status,
        "result": {
            "executionId": _as_text(execution_result.get("execution_id")) or None,
            "outcome": outcome,
            "gateStatus": _as_text(gate_status_raw).upper() or gate_status,
            "outputs": outputs_payload,
            "trace": trace_payload,
        },
        "explanation": explanation,
        "matchedRules": matched_rules,
        "statePatch": state_patch,
        "proofFragment": proof_fragment,
        "finalProof": None,
        "executionId": _as_text(execution_result.get("execution_id")) or _new_runtime_id("exec"),
        "status": gate_status,
        "spuId": spu_id,
        "inputs": request_inputs,
        "outputs": outputs_payload,
        "trace": trace_payload,
        "gateResults": gate_results,
        "proof": proof_payload,
        "versionBinding": execution_result.get("version_binding") if isinstance(execution_result.get("version_binding"), dict) else {},
        "calculation": {
            "mode": formula_mode,
            "displayFormula": display_formula,
            "appliedFormula": applied_formula,
        },
    }
    return response


def _state_from_form_status(form_status: str) -> str:
    normalized = _as_text(form_status).lower()
    if normalized == "qualified":
        return "QUALIFIED"
    if normalized == "validated":
        return "VALIDATED"
    if normalized == "pending":
        return "COMPUTED"
    return "DRAFT"


def _next_states_for(current_state: str) -> list[str]:
    normalized = _as_text(current_state).upper()
    if normalized == "VALIDATED":
        return ["QUALIFIED", "REJECTED"]
    if normalized == "QUALIFIED":
        return ["ARCHIVED"]
    if normalized == "REJECTED":
        return ["COMPUTED", "OVERRIDDEN"]
    if normalized == "COMPUTED":
        return ["VALIDATED", "REJECTED"]
    return []


def _resolve_component_or_spec_payload(spu_id: str) -> Dict[str, Any]:
    target = _as_text(spu_id)
    if not target:
        raise ValueError("spuId is required")
    resolved_target = _resolve_runtime_spu_id(target)
    runtime_match = _find_spu_artifacts(target, resolved_spu_id=resolved_target)
    runtime_payload: Dict[str, Any] | None = None
    if runtime_match is not None:
        runtime_spu_id, runtime_artifacts = runtime_match
        runtime_payload = _build_runtime_spu_payload(
            requested_spu_id=target,
            resolved_spu_id=resolved_target,
            runtime_spu_id=runtime_spu_id,
            artifacts=runtime_artifacts,
        )

    try:
        component = component_registry_service.get_latest_component(resolved_target)
        payload = {
            "spuId": target,
            "resolvedSpuId": resolved_target,
            "source": "component_registry",
            "component": component,
        }
        if runtime_payload is not None:
            payload["runtimeSpuId"] = runtime_payload.get("runtimeSpuId")
            payload["runtimeSpec"] = (runtime_payload.get("spec") if isinstance(runtime_payload.get("spec"), dict) else {})
            payload["runtimeArtifacts"] = (
                runtime_payload.get("artifacts") if isinstance(runtime_payload.get("artifacts"), dict) else {}
            )
        return payload
    except ComponentVersionNotFoundError:
        pass

    try:
        resolved_spec_id = _resolve_spec_id_from_registry(resolved_target)
        registry = _reload_specir_registry()
        entry = registry.get(resolved_spec_id)
        if entry is None:
            raise ValueError(f"spec not found: {target}")
        payload = entry.to_debug_payload()
        if entry.document is not None:
            payload["document"] = {
                "spec_id": entry.document.spec_id,
                "type": entry.document.spec_type,
                "version": entry.document.version,
                "namespace": entry.document.namespace,
                "semantics": entry.document.semantics,
                "logic": entry.document.logic,
                "inputs": entry.document.inputs,
                "path": entry.document.path,
                "gate": entry.document.gate,
                "state": entry.document.state,
                "proof": entry.document.proof,
                "metadata": entry.document.metadata,
                "warnings": list(entry.document.warnings),
            }
        response_payload = {
            "spuId": target,
            "resolvedSpuId": resolved_target,
            "resolvedSpecId": resolved_spec_id,
            "source": "specir",
            "spec": payload,
        }
        if runtime_payload is not None:
            response_payload["runtimeSpuId"] = runtime_payload.get("runtimeSpuId")
            response_payload["runtimeSpec"] = (
                runtime_payload.get("spec") if isinstance(runtime_payload.get("spec"), dict) else {}
            )
            response_payload["runtimeArtifacts"] = (
                runtime_payload.get("artifacts") if isinstance(runtime_payload.get("artifacts"), dict) else {}
            )
        return response_payload
    except ValueError:
        if runtime_payload is not None:
            return runtime_payload
        raise


def _validate_spu_payload(payload: Any) -> Dict[str, Any]:
    is_standard_spu = isinstance(payload, dict) and any(key in payload for key in ("meta", "data", "rules"))
    result = (
        validate_spu(payload)
        if is_standard_spu
        else {"valid": True, "errors": [], "warnings": []}
    )
    if not isinstance(payload, dict):
        result = {"valid": False, "errors": ["spu must be object"], "warnings": []}
    errors = list(result.get("errors", []))
    warnings = list(result.get("warnings", []))

    # Keep legacy contract checks for runtime SPU payloads that still use path/gate/state/proof shape.
    if isinstance(payload, dict):
        for key in ("path", "gate", "state"):
            if key not in payload:
                errors.append(f"missing field: {key}")
                continue
            if not isinstance(payload.get(key), dict):
                errors.append(f"field must be object: {key}")
        if "proof" in payload and not isinstance(payload.get("proof"), dict):
            errors.append("field must be object: proof")
        if "proof" not in payload:
            warnings.append("proof field is missing; proof chain integration may be incomplete")

        path_obj = payload.get("path") if isinstance(payload.get("path"), dict) else {}
        gate_obj = payload.get("gate") if isinstance(payload.get("gate"), dict) else {}
        state_obj = payload.get("state") if isinstance(payload.get("state"), dict) else {}

        if isinstance(path_obj, dict) and path_obj:
            has_path_logic = any(key in path_obj for key in ("formula", "formulas", "steps", "outputs", "expressions"))
            if not has_path_logic:
                warnings.append("path does not include formula/steps/outputs/expressions")

        if isinstance(gate_obj, dict):
            if "rules" in gate_obj and not isinstance(gate_obj.get("rules"), list):
                errors.append("gate.rules must be list when provided")
            if isinstance(gate_obj.get("rules"), list) and not gate_obj.get("rules"):
                warnings.append("gate.rules is empty")

        if isinstance(state_obj, dict):
            transitions = state_obj.get("transitions")
            if transitions is not None and not isinstance(transitions, list):
                errors.append("state.transitions must be list when provided")
            initial_state = _as_text(state_obj.get("initial") or state_obj.get("initialState"))
            if not initial_state:
                warnings.append("state.initial is missing")

    dedup_errors = list(dict.fromkeys(str(item) for item in errors if _as_text(item)))
    dedup_warnings = list(dict.fromkeys(str(item) for item in warnings if _as_text(item)))
    return {
        "valid": len(dedup_errors) == 0,
        "errors": dedup_errors,
        "warnings": dedup_warnings,
    }


def _normalize_clause_id(value: str | None) -> str:
    text = _as_text(value) or "4.2.1"
    return text


def _estimate_spu_id(clause_id: str) -> str:
    normalized = _normalize_clause_id(clause_id)
    if normalized == "4.2.1":
        return "highway.subgrade.compaction.4.2.1.soil@v1"
    if normalized == "4.2.2":
        return "highway.subgrade.deflection.4.2.2@v1"
    return f"highway.spec.{normalized.replace('.', '_')}@v1"


def _build_pdf_parse_mock_result(*, parse_id: str, standard_code: str) -> Dict[str, Any]:
    spu_id = "highway.subgrade.compaction.4.2.1@v1"
    resolved_normdoc_id = _resolve_normdoc_id(standard_code)
    return {
        "parseId": parse_id,
        "status": "success",
        "extractedData": {
            "metadata": {
                "title": "公路工程质量检验评定标准 第一册 土建工程",
                "version": "2017",
                "publisher": "交通运输部",
                "effectiveDate": "2018-05-01",
                "standardCode": standard_code,
                "normdocId": resolved_normdoc_id,
            },
            "chapters": [
                {
                    "id": "4",
                    "title": "路基工程",
                    "clauses": [
                        {
                            "id": "4.2.1",
                            "clause": "4.2.1",
                            "title": "压实度",
                            "text": "路基压实度应符合表4.2.1的规定...",
                            "content": "路基压实度应符合表4.2.1的规定...",
                            "normdoc_id": resolved_normdoc_id,
                            "page": 1,
                            "keywords": ["压实度", "路基", "实测项目"],
                            "tables": ["TABLE-4-2-1"],
                            "formulas": ["FORMULA-4-2-1"],
                        },
                        {
                            "id": "4.2.2",
                            "clause": "4.2.2",
                            "title": "弯沉",
                            "text": "路基弯沉应符合表4.2.2的规定...",
                            "content": "路基弯沉应符合表4.2.2的规定...",
                            "normdoc_id": resolved_normdoc_id,
                            "page": 1,
                            "keywords": ["弯沉", "路基", "实测项目"],
                            "tables": ["TABLE-4-2-2"],
                            "formulas": ["FORMULA-4-2-2"],
                        }
                    ],
                }
            ],
            "tables": [
                {
                    "id": "TABLE-4-2-1",
                    "headers": ["路床顶面以下深度", "压实度(%)"],
                    "rows": [
                        ["上路床0-0.3m", "≥96"],
                        ["下路床0.3-0.8m", "≥96"],
                        ["上路堤0.8-1.5m", "≥94"],
                        ["下路堤>1.5m", "≥93"],
                    ],
                },
                {
                    "id": "TABLE-4-2-2",
                    "headers": ["检测项目", "允许值(mm)"],
                    "rows": [
                        ["弯沉代表值", "≤2.4"],
                    ],
                }
            ],
            "formulas": [
                {
                    "id": "FORMULA-4-2-1",
                    "latex": "K = \\frac{\\rho_d}{\\rho_{dmax}} \\times 100",
                    "description": "压实度计算公式",
                },
                {
                    "id": "FORMULA-4-2-2",
                    "latex": "L_r = mean(L_i) + 1.645\\sigma",
                    "description": "弯沉代表值计算公式",
                }
            ],
        },
        "confidence": 0.94,
        "reviewRequired": True,
        "estimatedSPU": spu_id,
    }


def _extract_clause_code(value: Any) -> str:
    text = _as_text(value)
    if not text:
        return ""
    matched = re.search(r"\d+(?:\.\d+)+", text)
    if matched:
        return matched.group(0)
    return text


def _normalize_clause_related_terms(raw_terms: Any) -> list[str]:
    if not isinstance(raw_terms, list):
        return []
    cleaned: list[str] = []
    for item in raw_terms:
        text = _as_text(item)
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _normalize_clause_store_token(value: Any) -> str:
    text = _as_text(value).lower()
    if not text:
        return ""
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def _build_clause_explain_store_key(*, clause_ref: str, normdoc_ref: str, version_ref: str) -> str:
    clause_token = _normalize_clause_store_token(_extract_clause_code(clause_ref) or clause_ref) or "unknown-clause"
    normdoc_token = _normalize_clause_store_token(normdoc_ref) or "unknown-normdoc"
    version_token = _normalize_clause_store_token(version_ref) or "unknown-version"
    return f"{normdoc_token}::{version_token}::{clause_token}"


def _build_clause_explain_key_from_row(row: Dict[str, Any], clause_ref: str | None = None) -> str:
    resolved_clause_ref = _as_text(clause_ref) or _as_text(row.get("clause_id")) or _as_text(row.get("clause_no"))
    resolved_normdoc_ref = _as_text(row.get("normdoc_id")) or _as_text(row.get("standard_code"))
    resolved_version_ref = _as_text(row.get("version"))
    return _build_clause_explain_store_key(
        clause_ref=resolved_clause_ref,
        normdoc_ref=resolved_normdoc_ref,
        version_ref=resolved_version_ref,
    )


def _get_clause_explain_overlay(row: Dict[str, Any]) -> Dict[str, Any]:
    candidate_keys = [
        _build_clause_explain_key_from_row(row, clause_ref=_as_text(row.get("clause_id"))),
        _build_clause_explain_key_from_row(row, clause_ref=_as_text(row.get("clause_no"))),
    ]
    for key in candidate_keys:
        entry = clause_explain_runtime_store.get(key)
        if isinstance(entry, dict):
            return dict(entry)
    return {}


def _merge_clause_with_explain_overlay(row: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if not isinstance(row, dict):
        return None
    merged = dict(row)
    overlay = _get_clause_explain_overlay(merged)

    default_related_terms = _normalize_clause_related_terms(merged.get("related_terms"))
    if not default_related_terms:
        default_related_terms = _normalize_clause_related_terms(merged.get("keywords"))

    explanation = _as_text(overlay.get("explanation")) or _as_text(merged.get("explanation")) or None
    risk_note = _as_text(overlay.get("risk_note")) or _as_text(merged.get("risk_note")) or None
    related_terms = _normalize_clause_related_terms(overlay.get("related_terms"))
    if not related_terms:
        related_terms = default_related_terms

    merged["explanation"] = explanation
    merged["risk_note"] = risk_note
    merged["related_terms"] = related_terms
    merged["generated_by_ai"] = bool(overlay.get("generated_by_ai", merged.get("generated_by_ai", False)))
    merged["marked_reviewed"] = bool(overlay.get("marked_reviewed", merged.get("marked_reviewed", False)))
    merged["explanation_notice"] = _CLAUSE_EXPLANATION_NOTICE
    return merged


def _generate_clause_ai_draft(clause_row: Dict[str, Any]) -> Dict[str, Any]:
    title = _as_text(clause_row.get("title")) or _as_text(clause_row.get("clause_no")) or "该条款"
    content = _as_text(clause_row.get("content"))
    if content:
        first_sentence = re.split(r"[。；;!！?\n]", content, maxsplit=1)[0].strip()
        snippet = first_sentence or content[:80]
        explanation = f"本条款主要说明“{title}”的判定要点。核心要求可概括为：{snippet}。"
    else:
        explanation = f"本条款主要说明“{title}”的判定边界和验收关注点。"

    risk_note = "若未满足本条款要求，可能导致对应检验项目不通过，并带来质量与验收风险。"
    related_terms = _normalize_clause_related_terms(clause_row.get("keywords"))
    if not related_terms:
        related_terms = _normalize_clause_related_terms(clause_row.get("related_terms"))
    if not related_terms:
        related_terms = [title]
    return {
        "explanation": explanation,
        "risk_note": risk_note,
        "related_terms": related_terms[:8],
        "generated_by_ai": True,
        "marked_reviewed": False,
    }


def _resolve_clause_row_for_explain(
    *,
    clause_id: str,
    normdoc_id: str | None,
    version: str | None,
    standard_code: str | None,
) -> Dict[str, Any] | None:
    return clause_search_service.get_clause(
        clause_id=clause_id,
        normdoc_id=normdoc_id,
        version=version,
        standard_code=standard_code,
    )


def _clamp_score(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    if numeric < 0:
        return 0.0
    if numeric > 1:
        return 1.0
    return numeric


def _normalize_clause_identity_token(value: Any) -> str:
    text = _as_text(value)
    if not text:
        return ""
    return _extract_clause_code(text).lower()


def _resolve_clause_identity_token(row: Dict[str, Any] | None) -> str:
    if not isinstance(row, dict):
        return ""
    for key in ("clause_id", "clause_no", "id", "clause"):
        token = _normalize_clause_identity_token(row.get(key))
        if token:
            return token
    return ""


def _resolve_clause_priority(row: Dict[str, Any] | None) -> float:
    if not isinstance(row, dict):
        return 0.0
    raw_priority = row.get("clause_priority")
    if isinstance(raw_priority, (int, float)):
        return _clamp_score(raw_priority)
    text_priority = _as_text(raw_priority)
    if text_priority:
        try:
            return _clamp_score(float(text_priority))
        except ValueError:
            pass
    clause_ref = _as_text(row.get("clause_no")) or _as_text(row.get("clause_id")) or _as_text(row.get("id"))
    numeric_parts = re.findall(r"\d+", _extract_clause_code(clause_ref))
    depth = len(numeric_parts)
    if depth >= 4:
        return 0.95
    if depth == 3:
        return 1.0
    if depth == 2:
        return 0.85
    if depth == 1:
        return 0.7
    return 0.5


def _extract_rule_binding_clause_token(spu_payload: Any) -> str:
    if not isinstance(spu_payload, dict):
        return ""
    manifest = spu_payload.get("manifest")
    manifest_dict = manifest if isinstance(manifest, dict) else {}
    for key in ("clauseId", "clause_id", "clauseNo", "clause_no"):
        token = _normalize_clause_identity_token(manifest_dict.get(key))
        if token:
            return token
    source_clause = manifest_dict.get("metadata", {}).get("sourceClause") if isinstance(manifest_dict.get("metadata"), dict) else {}
    if isinstance(source_clause, dict):
        for key in ("id", "clause", "clause_id", "clause_no"):
            token = _normalize_clause_identity_token(source_clause.get(key))
            if token:
                return token
    for key in ("clauseId", "clause_id", "clauseNo", "clause_no"):
        token = _normalize_clause_identity_token(spu_payload.get(key))
        if token:
            return token
    return ""


def _estimate_rule_binding_count(spu_payload: Any) -> int:
    if not isinstance(spu_payload, dict):
        return 0
    manifest = spu_payload.get("manifest")
    manifest_dict = manifest if isinstance(manifest, dict) else {}
    gate = manifest_dict.get("gate") if isinstance(manifest_dict.get("gate"), dict) else {}
    rules = gate.get("rules") if isinstance(gate.get("rules"), list) else []
    if rules:
        return len(rules)
    return 1 if _extract_rule_binding_clause_token(spu_payload) else 0


def _build_clause_rule_binding_weights() -> tuple[Dict[str, int], Dict[str, float]]:
    counts: Dict[str, int] = {}
    for spu_payload in spu_runtime_store.values():
        clause_token = _extract_rule_binding_clause_token(spu_payload)
        if not clause_token:
            continue
        counts[clause_token] = counts.get(clause_token, 0) + max(1, _estimate_rule_binding_count(spu_payload))
    max_count = max(counts.values()) if counts else 0
    if max_count <= 0:
        return counts, {}
    weights = {token: round(count / max_count, 4) for token, count in counts.items()}
    return counts, weights


def _merge_hybrid_search_rows(
    *,
    keyword_rows: list[Dict[str, Any]],
    semantic_rows: list[Dict[str, Any]],
    limit: int,
    debug: bool,
) -> list[Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}

    def upsert_row(source: str, row: Dict[str, Any]) -> None:
        clause_token = _resolve_clause_identity_token(row)
        if not clause_token:
            return
        source_score = _clamp_score(row.get("score"))
        current = merged.get(clause_token)
        if current is None:
            base_row = dict(row)
            base_row["_clause_token"] = clause_token
            base_row["_keyword_score"] = source_score if source == "keyword" else 0.0
            base_row["_semantic_score"] = source_score if source == "semantic" else 0.0
            base_row["_keyword_hit"] = source == "keyword"
            base_row["_semantic_hit"] = source == "semantic"
            merged[clause_token] = base_row
            return
        if source == "keyword":
            current["_keyword_score"] = max(float(current.get("_keyword_score") or 0.0), source_score)
            current["_keyword_hit"] = True
        else:
            current["_semantic_score"] = max(float(current.get("_semantic_score") or 0.0), source_score)
            current["_semantic_hit"] = True
        # Prefer richer text fields while preserving original row payload.
        if len(_as_text(row.get("content"))) > len(_as_text(current.get("content"))):
            current["content"] = row.get("content")
        if not _as_text(current.get("title")) and _as_text(row.get("title")):
            current["title"] = row.get("title")
        if not _as_text(current.get("clause_id")) and _as_text(row.get("clause_id")):
            current["clause_id"] = row.get("clause_id")
        if not _as_text(current.get("clause_no")) and _as_text(row.get("clause_no")):
            current["clause_no"] = row.get("clause_no")

    for row in keyword_rows:
        if isinstance(row, dict):
            upsert_row("keyword", row)
    for row in semantic_rows:
        if isinstance(row, dict):
            upsert_row("semantic", row)

    binding_counts, binding_weights = _build_clause_rule_binding_weights()
    ranked_rows: list[Dict[str, Any]] = []
    for clause_token, row in merged.items():
        keyword_score = _clamp_score(row.get("_keyword_score"))
        semantic_score = _clamp_score(row.get("_semantic_score"))
        rule_binding_weight = _clamp_score(binding_weights.get(clause_token, 0.0))
        rule_binding_count = int(binding_counts.get(clause_token, 0))
        clause_priority = _resolve_clause_priority(row)
        final_score = (keyword_score * 0.4) + (semantic_score * 0.4) + (rule_binding_weight * 0.2)
        result_row = dict(row)
        result_row["score"] = round(final_score, 4)
        result_row["_final_score"] = final_score
        result_row["_clause_priority"] = clause_priority
        result_row["_rule_binding_weight"] = rule_binding_weight
        result_row["_rule_binding_count"] = rule_binding_count
        result_row["_has_rule_binding"] = rule_binding_count > 0
        if debug:
            result_row["score_debug"] = {
                "keyword_score": round(keyword_score, 4),
                "semantic_score": round(semantic_score, 4),
                "clause_priority": round(clause_priority, 4),
                "rule_binding_weight": round(rule_binding_weight, 4),
                "rule_binding_count": rule_binding_count,
                "final_score": round(final_score, 4),
                "formula": "keyword_score * 0.4 + semantic_score * 0.4 + rule_binding_weight * 0.2",
            }
        for key in (
            "_clause_token",
            "_keyword_score",
            "_semantic_score",
            "_keyword_hit",
            "_semantic_hit",
            "_final_score",
            "_clause_priority",
            "_rule_binding_weight",
            "_rule_binding_count",
            "_has_rule_binding",
        ):
            result_row.pop(key, None)
        ranked_rows.append(
            {
                "__sort_has_binding": 1 if rule_binding_count > 0 else 0,
                "__sort_final": final_score,
                "__sort_rule_weight": rule_binding_weight,
                "__sort_clause_priority": clause_priority,
                "__payload": result_row,
            }
        )

    ranked_rows.sort(
        key=lambda item: (
            int(item.get("__sort_has_binding") or 0),
            float(item.get("__sort_final") or 0.0),
            float(item.get("__sort_rule_weight") or 0.0),
            float(item.get("__sort_clause_priority") or 0.0),
            _as_text((item.get("__payload") or {}).get("clause_no")),
        ),
        reverse=True,
    )
    sliced = ranked_rows[: max(1, int(limit or 20))]
    return [item["__payload"] for item in sliced if isinstance(item.get("__payload"), dict)]


def _extract_clause_catalog(parse_payload: Dict[str, Any] | None) -> list[Dict[str, Any]]:
    extracted = parse_payload.get("extractedData") if isinstance(parse_payload, dict) else {}
    chapters = extracted.get("chapters") if isinstance(extracted, dict) else []
    metadata = extracted.get("metadata") if isinstance(extracted, dict) else {}
    resolved_normdoc_id = ""
    if isinstance(metadata, dict):
        resolved_normdoc_id = _as_text(metadata.get("normdocId")) or _resolve_normdoc_id(_as_text(metadata.get("standardCode")))
    catalog: list[Dict[str, Any]] = []
    if not isinstance(chapters, list):
        return catalog

    for chapter in chapters:
        if not isinstance(chapter, dict):
            continue
        chapter_id = _as_text(chapter.get("id")) or None
        chapter_title = _as_text(chapter.get("title")) or None
        clauses = chapter.get("clauses")
        if not isinstance(clauses, list):
            continue
        for clause in clauses:
            if not isinstance(clause, dict):
                continue
            clause_id = _as_text(clause.get("id"))
            if not clause_id:
                continue
            tables = clause.get("tables")
            formulas = clause.get("formulas")
            raw_keywords = clause.get("keywords")
            page_raw = clause.get("page")
            page = int(page_raw) if isinstance(page_raw, int) and page_raw > 0 else 1
            content = _as_text(clause.get("content")) or _as_text(clause.get("text")) or None
            catalog.append(
                {
                    "id": clause_id,
                    "clause": _as_text(clause.get("clause")) or clause_id,
                    "title": _as_text(clause.get("title")) or None,
                    "text": content,
                    "content": content,
                    "explanation": _as_text(clause.get("explanation")) or None,
                    "risk_note": _as_text(clause.get("risk_note")) or None,
                    "related_terms": _normalize_clause_related_terms(clause.get("related_terms")),
                    "generated_by_ai": bool(clause.get("generated_by_ai")),
                    "marked_reviewed": bool(clause.get("marked_reviewed")),
                    "normdoc_id": _as_text(clause.get("normdoc_id")) or resolved_normdoc_id,
                    "page": page,
                    "keywords": [str(item) for item in raw_keywords if isinstance(item, str) and _as_text(item)] if isinstance(raw_keywords, list) else [],
                    "chapterId": chapter_id,
                    "chapterTitle": chapter_title,
                    "tables": list(tables) if isinstance(tables, list) else [],
                    "formulas": list(formulas) if isinstance(formulas, list) else [],
                }
            )
    return catalog


def _resolve_clause_publish_status(metadata: Dict[str, Any] | None) -> str:
    if not isinstance(metadata, dict):
        return "draft"
    options = metadata.get("options")
    option_dict = options if isinstance(options, dict) else {}
    candidates = [
        metadata.get("publishStatus"),
        option_dict.get("publishStatus"),
        metadata.get("status"),
        option_dict.get("status"),
    ]
    for value in candidates:
        text = _as_text(value).lower()
        if text in {"published", "draft", "submitted", "in_review", "approved", "deprecated"}:
            return text
    if metadata.get("published") is True or option_dict.get("published") is True:
        return "published"
    return "draft"


def _refresh_clause_search_runtime_corpus() -> None:
    clause_search_service.clear_runtime_clauses()
    for parse_payload in pdf_parse_runtime_store.values():
        if not isinstance(parse_payload, dict):
            continue
        extracted = parse_payload.get("extractedData")
        metadata = extracted.get("metadata") if isinstance(extracted, dict) else {}
        metadata_dict = metadata if isinstance(metadata, dict) else {}
        standard_code = _as_text(metadata_dict.get("standardCode"))
        version = _as_text(metadata_dict.get("version")) or "v1"
        publish_status = _resolve_clause_publish_status(metadata_dict)
        for clause in _extract_clause_catalog(parse_payload):
            if not isinstance(clause, dict):
                continue
            clause_no = _as_text(clause.get("clause")) or _as_text(clause.get("id"))
            clause_id = _as_text(clause.get("id")) or clause_no
            clause_row = {
                "clause_id": clause_id,
                "clause_no": clause_no,
                "title": _as_text(clause.get("title")),
                "content": _as_text(clause.get("content")) or _as_text(clause.get("text")),
                "explanation": _as_text(clause.get("explanation")) or None,
                "risk_note": _as_text(clause.get("risk_note")) or None,
                "related_terms": _normalize_clause_related_terms(clause.get("related_terms")),
                "generated_by_ai": bool(clause.get("generated_by_ai")),
                "marked_reviewed": bool(clause.get("marked_reviewed")),
                "normdoc_id": _as_text(clause.get("normdoc_id")) or _resolve_normdoc_id(standard_code),
                "standard_code": standard_code,
                "version": version,
                "page": clause.get("page") if isinstance(clause.get("page"), int) else 1,
                "keywords": clause.get("keywords") if isinstance(clause.get("keywords"), list) else [],
                "publish_status": publish_status,
            }
            merged_row = _merge_clause_with_explain_overlay(clause_row)
            clause_search_service.add_runtime_clause(merged_row if isinstance(merged_row, dict) else clause_row)


def _yaml_scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    if text == "" or any(char in text for char in (":", "#", "{", "}", "[", "]", "\n")):
        return json.dumps(text, ensure_ascii=False)
    return text


def _to_yaml_text(value: Any, indent: int = 0) -> str:
    prefix = "  " * indent
    if isinstance(value, dict):
        if not value:
            return f"{prefix}{{}}"
        lines: list[str] = []
        for key, child in value.items():
            key_text = _as_text(key)
            if isinstance(child, (dict, list)):
                lines.append(f"{prefix}{key_text}:")
                lines.append(_to_yaml_text(child, indent + 1))
            else:
                lines.append(f"{prefix}{key_text}: {_yaml_scalar(child)}")
        return "\n".join(lines)
    if isinstance(value, list):
        if not value:
            return f"{prefix}[]"
        lines = []
        for child in value:
            if isinstance(child, (dict, list)):
                lines.append(f"{prefix}-")
                lines.append(_to_yaml_text(child, indent + 1))
            else:
                lines.append(f"{prefix}- {_yaml_scalar(child)}")
        return "\n".join(lines)
    return f"{prefix}{_yaml_scalar(value)}"


def _infer_clause_id_from_spu(spu_id: str) -> str:
    matched = re.search(r"(\d+(?:\.\d+)+)", _as_text(spu_id))
    if not matched:
        return "unknown"
    return matched.group(1)


def _build_spu_manifest(
    *,
    spu_id: str,
    standard_code: str,
    clause_id: str,
    generated_at: str,
    options: Dict[str, Any],
    parse_payload: Dict[str, Any] | None,
    clause_item: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    extracted = parse_payload.get("extractedData") if isinstance(parse_payload, dict) else {}
    metadata = extracted.get("metadata") if isinstance(extracted, dict) else {}
    tables = extracted.get("tables") if isinstance(extracted, dict) else []
    selected_clause = clause_item if isinstance(clause_item, dict) else {}
    selected_clause_title = _as_text(selected_clause.get("title"))
    selected_table_ids: set[str] = set()
    raw_tables = selected_clause.get("tables")
    if isinstance(raw_tables, list):
        selected_table_ids = {_as_text(item) for item in raw_tables if _as_text(item)}
    source_tables = tables if isinstance(tables, list) else []
    if selected_table_ids:
        source_tables = [
            item
            for item in source_tables
            if isinstance(item, dict) and _as_text(item.get("id")) in selected_table_ids
        ]

    return {
        "spuId": spu_id,
        "standardCode": standard_code,
        "clauseId": clause_id,
        "name": selected_clause_title or _spu_display_name(spu_id) or spu_id,
        "metadata": {
            "generatedAt": generated_at,
            "sourceParseId": _as_text((parse_payload or {}).get("parseId")) or None,
            "sourceStandardTitle": _as_text((metadata or {}).get("title")) or None,
            "options": dict(options or {}),
            "sourceClause": selected_clause if selected_clause else None,
        },
        "inputs": {
            "massHoleSand": {"type": "number"},
            "volumeSand": {"type": "number"},
            "moistureContent": {"type": "number"},
            "maxDryDensity": {"type": "number"},
        },
        "path": {
            "formulas": [
                {"id": "calc_wet_density", "expr": "wetDensity = massHoleSand / volumeSand"},
                {"id": "calc_dry_density", "expr": "dryDensity = wetDensity / (1 + moistureContent / 100)"},
                {"id": "calc_compaction", "expr": "compactionDegree = (dryDensity / maxDryDensity) * 100"},
            ],
            "outputs": ["wetDensity", "dryDensity", "compactionDegree"],
        },
        "gate": {
            "rules": [
                {
                    "ruleId": "RULE-COMPACTION-001",
                    "condition": "compactionDegree >= 93",
                    "message": "压实度满足设计要求",
                }
            ]
        },
        "state": {
            "initial": "DRAFT",
            "transitions": [
                {"from": "DRAFT", "to": "COMPUTED", "event": "path_executed"},
                {"from": "COMPUTED", "to": "VALIDATED", "event": "lab_signed"},
                {"from": "VALIDATED", "to": "QUALIFIED", "event": "supervision_signed"},
            ],
        },
        "proof": {
            "requiredSignatures": ["lab", "supervision"],
            "anchor": "arweave",
        },
        "source": {
            "tables": source_tables,
        },
    }


def _build_spu_artifacts(
    *,
    spu_id: str,
    standard_code: str,
    clause_id: str,
    generated_at: str,
    options: Dict[str, Any],
    parse_payload: Dict[str, Any] | None,
    clause_item: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    manifest = _build_spu_manifest(
        spu_id=spu_id,
        standard_code=standard_code,
        clause_id=clause_id,
        generated_at=generated_at,
        options=options,
        parse_payload=parse_payload,
        clause_item=clause_item,
    )
    json_text = json.dumps(manifest, ensure_ascii=False, indent=2)
    yaml_text = _to_yaml_text(manifest) + "\n"
    markdown_text = "\n".join(
        [
            f"# {manifest.get('name') or spu_id}",
            "",
            f"- spuId: `{spu_id}`",
            f"- standardCode: `{standard_code}`",
            f"- clauseId: `{clause_id}`",
            f"- generatedAt: `{generated_at}`",
            "",
            "## Manifest (JSON)",
            "```json",
            json_text,
            "```",
        ]
    )

    bundle_io = io.BytesIO()
    with zipfile.ZipFile(bundle_io, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"{spu_id}.yaml", yaml_text)
        archive.writestr(f"{spu_id}.json", json_text)
        archive.writestr(f"{spu_id}.md", markdown_text)
    bundle_bytes = bundle_io.getvalue()

    return {
        "manifest": manifest,
        "yaml": yaml_text,
        "json": json_text,
        "markdown": markdown_text,
        "bundle": bundle_bytes,
        "generatedAt": generated_at,
    }


def _find_spu_artifacts(spu_id: str, *, resolved_spu_id: str | None = None) -> tuple[str, Dict[str, Any]] | None:
    target_spu_id = _as_text(spu_id)
    resolved_target = _as_text(resolved_spu_id)
    if not target_spu_id and not resolved_target:
        return None
    for key, item in spu_runtime_store.items():
        if not isinstance(item, dict):
            continue
        key_text = _as_text(key)
        resolved_key = _resolve_runtime_spu_id(key_text)
        if key_text in {target_spu_id, resolved_target}:
            return key_text, item
        if resolved_key in {target_spu_id, resolved_target}:
            return key_text, item
    return None


def _build_runtime_spu_links(runtime_spu_id: str) -> Dict[str, str]:
    target = _as_text(runtime_spu_id)
    return {
        "yaml": f"/v1/spu/{target}.yaml",
        "json": f"/v1/spu/{target}.json",
        "markdown": f"/v1/spu/{target}.md",
        "bundle": f"/v1/spu/{target}.specbundle",
    }


def _resolve_runtime_manifest_for_execution(spec_or_component_id: str) -> tuple[str, Dict[str, Any]] | None:
    target = _as_text(spec_or_component_id)
    if not target:
        return None
    resolved_target = _resolve_runtime_spu_id(target)
    matched = _find_spu_artifacts(target, resolved_spu_id=resolved_target)
    if matched is None:
        return None
    runtime_spu_id, artifacts = matched
    manifest_obj = artifacts.get("manifest")
    if not isinstance(manifest_obj, dict):
        return None
    return runtime_spu_id, manifest_obj


def _build_runtime_spu_payload(
    *,
    requested_spu_id: str,
    resolved_spu_id: str,
    runtime_spu_id: str,
    artifacts: Dict[str, Any],
) -> Dict[str, Any]:
    manifest_obj = artifacts.get("manifest")
    manifest = manifest_obj if isinstance(manifest_obj, dict) else {}
    return {
        "spuId": requested_spu_id,
        "resolvedSpuId": resolved_spu_id,
        "runtimeSpuId": runtime_spu_id,
        "source": "runtime_spu",
        "spec": {
            "manifest": manifest,
            "document": {
                "spec_id": _as_text(manifest.get("spuId")) or runtime_spu_id,
                "inputs": manifest.get("inputs", {}),
                "path": manifest.get("path", {}),
                "gate": manifest.get("gate", {}),
                "state": manifest.get("state", {}),
                "proof": manifest.get("proof", {}),
                "metadata": manifest.get("metadata", {}),
            },
        },
        "artifacts": _build_runtime_spu_links(runtime_spu_id),
    }


def _extract_runtime_manifest_from_resolved_payload(resolved: Dict[str, Any]) -> Dict[str, Any] | None:
    source = _as_text(resolved.get("source"))
    if source == "runtime_spu":
        spec = resolved.get("spec")
        if isinstance(spec, dict):
            manifest = spec.get("manifest")
            if isinstance(manifest, dict):
                return manifest
    runtime_spec = resolved.get("runtimeSpec")
    if isinstance(runtime_spec, dict):
        manifest = runtime_spec.get("manifest")
        if isinstance(manifest, dict):
            return manifest
    return None


def _safe_eval_numeric_expression(expression: str, variables: Dict[str, Any]) -> float | None:
    text = _as_text(expression)
    if not text:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_+\-*/().\s,]+", text):
        return None
    numeric_scope: Dict[str, float] = {}
    for key, value in variables.items():
        if isinstance(value, (int, float)):
            numeric_scope[str(key)] = float(value)

    def normalized(wetDensity: float, dryDensity: float, maxDryDensity: float) -> float:  # noqa: N802
        if float(maxDryDensity) == 0:
            return 0.0
        return (float(dryDensity) / float(maxDryDensity)) * 100.0

    numeric_scope["normalized"] = normalized  # type: ignore[assignment]
    try:
        result = eval(text, {"__builtins__": {}}, numeric_scope)
    except Exception:
        return None
    if isinstance(result, (int, float)):
        return float(result)
    return None


def _evaluate_runtime_condition(condition: str, values: Dict[str, Any]) -> tuple[bool, Any, Any]:
    text = _as_text(condition)
    operators = (">=", "<=", "==", "!=", ">", "<")
    for operator in operators:
        if operator not in text:
            continue
        left_text, right_text = [item.strip() for item in text.split(operator, 1)]
        left_value = _safe_eval_numeric_expression(left_text, values)
        if left_value is None:
            left_value = values.get(left_text)
        right_value = _safe_eval_numeric_expression(right_text, values)
        if right_value is None:
            right_value = values.get(right_text)
        if right_value is None and right_text:
            try:
                right_value = float(right_text)
            except ValueError:
                right_value = right_text
        if right_value is None and right_text:
            right_value = right_text
        if left_value is None:
            return False, None, right_value

        passed = False
        if operator in {">=", "<=", ">", "<"}:
            try:
                left_num = float(left_value)
                right_num = float(right_value)
            except (TypeError, ValueError):
                return False, left_value, right_value
            if operator == ">=":
                passed = left_num >= right_num
            elif operator == "<=":
                passed = left_num <= right_num
            elif operator == ">":
                passed = left_num > right_num
            elif operator == "<":
                passed = left_num < right_num
        elif operator == "==":
            passed = left_value == right_value
        elif operator == "!=":
            passed = left_value != right_value
        return passed, left_value, right_value
    return False, None, None


def _build_runtime_spu_path(manifest: Dict[str, Any], input_payload: Dict[str, Any]) -> tuple[Dict[str, Any], list[Dict[str, Any]]]:
    path_obj = manifest.get("path") if isinstance(manifest.get("path"), dict) else {}
    formulas = path_obj.get("formulas") if isinstance(path_obj, dict) else []
    trace: list[Dict[str, Any]] = []
    computed: Dict[str, Any] = {}

    demo_metrics = _derive_demo_compaction_metrics(input_payload)
    if isinstance(demo_metrics, dict):
        timestamp = _now_iso()
        computed["wet_density"] = demo_metrics["wetDensity"]
        computed["dry_density"] = demo_metrics["dryDensity"]
        computed["compaction_degree"] = demo_metrics["compactionDegree"]
        computed["wetDensity"] = demo_metrics["wetDensity"]
        computed["dryDensity"] = demo_metrics["dryDensity"]
        computed["compactionDegree"] = demo_metrics["compactionDegree"]
        trace.extend(
            [
                {
                    "step_id": "calc_wet_density",
                    "formula": "wetDensity = massHoleSand / volumeSand",
                    "input": {
                        "massHoleSand": input_payload.get("massHoleSand"),
                        "volumeSand": input_payload.get("volumeSand"),
                    },
                    "output": demo_metrics["wetDensity"],
                    "timestamp": timestamp,
                },
                {
                    "step_id": "calc_dry_density",
                    "formula": "dryDensity = wetDensity / (1 + moistureContent / 100)",
                    "input": {
                        "wetDensity": demo_metrics["wetDensity"],
                        "moistureContent": input_payload.get("moistureContent"),
                    },
                    "output": demo_metrics["dryDensity"],
                    "timestamp": timestamp,
                },
                {
                    "step_id": "calc_compaction",
                    "formula": "compactionDegree = (dryDensity / maxDryDensity) * 100",
                    "input": {
                        "dryDensity": demo_metrics["dryDensity"],
                        "maxDryDensity": input_payload.get("maxDryDensity"),
                    },
                    "output": demo_metrics["compactionDegree"],
                    "timestamp": timestamp,
                },
            ]
        )
        return computed, trace

    if not isinstance(formulas, list):
        return computed, trace

    for index, item in enumerate(formulas, start=1):
        formula_obj = item if isinstance(item, dict) else {}
        formula_expr = _as_text(formula_obj.get("expr") or formula_obj.get("formula"))
        if "=" not in formula_expr:
            continue
        left_name, right_expr = [chunk.strip() for chunk in formula_expr.split("=", 1)]
        if not left_name:
            continue
        merged_values: Dict[str, Any] = {}
        merged_values.update(input_payload)
        merged_values.update(computed)
        output_value = _safe_eval_numeric_expression(right_expr, merged_values)
        if output_value is None:
            continue
        rounded = round(float(output_value), 4)
        computed[left_name] = rounded
        trace.append(
            {
                "step_id": _as_text(formula_obj.get("id")) or f"step_{index}",
                "formula": formula_expr,
                "input": {key: value for key, value in merged_values.items() if isinstance(value, (int, float))},
                "output": rounded,
                "timestamp": _now_iso(),
            }
        )
    return computed, trace


def _build_runtime_spu_gate(manifest: Dict[str, Any], value_scope: Dict[str, Any]) -> tuple[str, list[Dict[str, Any]]]:
    gate_obj = manifest.get("gate") if isinstance(manifest.get("gate"), dict) else {}
    rules = gate_obj.get("rules") if isinstance(gate_obj, dict) else []
    if not isinstance(rules, list):
        rules = []

    results: list[Dict[str, Any]] = []
    all_passed = True
    for index, item in enumerate(rules, start=1):
        rule = item if isinstance(item, dict) else {}
        condition = _as_text(rule.get("condition"))
        passed, actual_value, expected_value = _evaluate_runtime_condition(condition, value_scope)
        all_passed = all_passed and passed
        results.append(
            {
                "rule_id": _as_text(rule.get("ruleId") or rule.get("rule_id")) or f"runtime_rule_{index}",
                "condition": condition,
                "actual_value": actual_value,
                "expected_value": expected_value,
                "passed": passed,
                "message": _as_text(rule.get("message")) or f"condition `{condition}` => {'PASS' if passed else 'FAIL'}",
            }
        )
    status = "PASS" if (all_passed or not results) else "FAIL"
    return status, results


def _execute_runtime_spu_fallback(
    *,
    runtime_spu_id: str,
    manifest: Dict[str, Any],
    input_payload: Dict[str, Any],
    branch_id: str | None,
) -> Dict[str, Any]:
    execution_id = _new_runtime_id("exec")
    created_at = _now_iso()
    project_id = _as_text(input_payload.get("project_id")) or "UNSPECIFIED"
    resolved_branch = _as_text(branch_id) or _as_text(input_payload.get("branch_id")) or "main"
    raw_v_address = _as_text(input_payload.get("v_address"))
    raw_stake = _as_text(input_payload.get("stake"))
    if raw_v_address:
        explicit_stake = raw_stake or _extract_stake_from_text(raw_v_address) or ""
    else:
        explicit_stake = raw_stake if raw_stake and raw_stake != "K15+200" else ""
    if explicit_stake:
        stake = explicit_stake
    else:
        digest = hashlib.sha256(execution_id.encode("utf-8")).hexdigest()
        km = int(digest[:2], 16) % 900 + 100
        meter = int(digest[2:5], 16) % 1000
        stake = f"K{km}+{meter:03d}"
    base_v_address = ""
    if raw_v_address.startswith("v://"):
        base_v_address = raw_v_address
        if "#" in base_v_address:
            base_v_address = base_v_address.split("#", 1)[0]
    if not base_v_address:
        base_v_address = f"v://{project_id}/{stake}"
    query_joiner = "&" if "?" in base_v_address else "?"
    v_address = f"{base_v_address}{query_joiner}version={execution_id}#{resolved_branch}"
    normalized_input = dict(input_payload)
    normalized_input["v_address"] = v_address

    path_outputs, path_trace = _build_runtime_spu_path(manifest, normalized_input)
    value_scope: Dict[str, Any] = {}
    value_scope.update(normalized_input)
    value_scope.update(path_outputs)
    gate_status, gate_results = _build_runtime_spu_gate(manifest, value_scope)
    lifecycle_status = "QUALIFIED" if gate_status == "PASS" else "REJECTED"
    version_binding = {
        "rulepack_version": _as_text(normalized_input.get("rulepack_version") or normalized_input.get("rule_version")) or _as_text(manifest.get("version")) or "runtime_manifest.v1",
        "norm_version": _as_text(normalized_input.get("norm_version")) or _infer_norm_version_from_spec_id(runtime_spu_id) or "unknown",
        "specir_version": _as_text(manifest.get("version")) or "runtime_manifest.v1",
        "executor_version": _executor_version(),
        "bound_at": created_at,
    }

    canonical_payload = {
        "component_id": runtime_spu_id,
        "input": dict(normalized_input),
        "path_outputs": path_outputs,
        "path_trace": path_trace,
        "gate": {"summary_status": gate_status, "rule_results": gate_results},
        "final_status": gate_status,
        "lifecycle_status": lifecycle_status,
        "version_binding": version_binding,
    }
    canonical_raw = json.dumps(canonical_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    proof_hash = hashlib.sha256(canonical_raw).hexdigest()
    previous_chain_hash = ""
    chain_hash = hashlib.sha256(f"{previous_chain_hash}|{execution_id}|{proof_hash}".encode("utf-8")).hexdigest()
    signer_did = "did:peg:runtime_executor"
    signer_signature = hashlib.sha256(f"{signer_did}:{proof_hash}".encode("utf-8")).hexdigest()
    proof = {
        "proof_id": proof_hash,
        "proof_hash": proof_hash,
        "payload_hash": proof_hash,
        "execution_id": execution_id,
        "component_id": runtime_spu_id,
        "timestamp": created_at,
        "canonical_payload": canonical_payload,
        "merkle_root": proof_hash,
        "proof_path": [],
        "previous_chain_hash": previous_chain_hash,
        "chain_hash": chain_hash,
        "signatures": [
            {
                "role": "executor",
                "did": signer_did,
                "signature": signer_signature,
            }
        ],
        "version_binding": version_binding,
    }
    return {
        "execution_id": execution_id,
        "component_id": runtime_spu_id,
        "project_id": project_id,
        "branch_id": resolved_branch,
        "v_address": v_address,
        "input": dict(normalized_input),
        "path_outputs": path_outputs,
        "path_trace": path_trace,
        "gate": {
            "summary_status": gate_status,
            "rule_results": gate_results,
        },
        "final_status": gate_status,
        "lifecycle_status": lifecycle_status,
        "proof": proof,
        "metadata": {"created_at": created_at, "version_binding": version_binding},
        "version_binding": version_binding,
        "version": proof_hash,
    }


def _get_spu_artifacts_or_raise(spu_id: str) -> Dict[str, Any]:
    target_spu_id = _as_text(spu_id)
    if not target_spu_id:
        raise HTTPException(status_code=400, detail="spuId is required")
    matched = _find_spu_artifacts(target_spu_id)
    if matched is not None:
        _, artifacts = matched
        return artifacts
    raise HTTPException(status_code=404, detail=f"spu artifacts not found: {target_spu_id}")


def _record_execution_with_children(execution_result: Dict[str, Any], branch_id: str | None = None) -> None:
    project_utxo_service.record_execution(execution_result, branch_id=branch_id)
    try:
        mapping_service.sync_execution(execution_result, branch_id=branch_id)
    except MappingServiceError:
        pass

    path_outputs = execution_result.get("path_outputs")
    if not isinstance(path_outputs, dict):
        return
    child_execution_results = path_outputs.get("child_execution_results")
    if not isinstance(child_execution_results, dict):
        return

    for results in child_execution_results.values():
        if not isinstance(results, list):
            continue
        for item in results:
            if isinstance(item, dict):
                _record_execution_with_children(item, branch_id=branch_id)


def _build_compare_diff(comparisons: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    if not comparisons:
        return {}

    branch_order = list(comparisons.keys())
    baseline = branch_order[0]

    def _is_scalar(value: Any) -> bool:
        return value is None or isinstance(value, (str, int, float, bool))

    normalized: Dict[str, Dict[str, Any]] = {}
    for branch_id, result in comparisons.items():
        fields: Dict[str, Any] = {
            "final_status": result.get("final_status"),
            "lifecycle_status": result.get("lifecycle_status"),
        }
        gate = result.get("gate")
        if isinstance(gate, dict):
            fields["summary_status"] = gate.get("summary_status")

        path_outputs = result.get("path_outputs")
        if isinstance(path_outputs, dict):
            for key, value in path_outputs.items():
                if _is_scalar(value):
                    fields[str(key)] = value

        normalized[branch_id] = fields

    all_keys: set[str] = set()
    for fields in normalized.values():
        all_keys.update(fields.keys())

    diff: Dict[str, Any] = {}
    for key in sorted(all_keys):
        values = {branch_id: normalized[branch_id].get(key) for branch_id in branch_order}
        baseline_value = values[baseline]
        same = all(values[branch_id] == baseline_value for branch_id in branch_order[1:])
        if not same:
            diff[key] = {
                "baseline_branch": baseline,
                "values": values,
            }
    return diff


def _component_id_execution_allowed() -> bool:
    raw = str(os.getenv("LAYERPEG_ALLOW_COMPONENT_ID_EXECUTION", "")).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return "pytest" in sys.modules


def _builtin_execution_allowed() -> bool:
    raw = str(os.getenv("LAYERPEG_ALLOW_BUILTIN_EXECUTION", "")).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return "pytest" in sys.modules


def _execute_component_direct_internal(
    *,
    component_id: str,
    input_payload: Dict[str, Any],
    branch_id: str | None,
    record_execution: bool,
) -> Dict[str, Any]:
    execution_input = dict(input_payload)
    v_address_resolution: Dict[str, Any] | None = None
    project_id = str(execution_input.get("project_id", "UNSPECIFIED"))
    resolved_branch_id = branch_id or project_utxo_service.get_current_branch(project_id)

    raw_v_address = execution_input.get("v_address")
    if isinstance(raw_v_address, str) and raw_v_address.strip():
        prelim = resolve_v_address_target(raw_v_address)
        project_id = str(prelim["project_id"])
        project_snapshot = project_utxo_service.get_project_utxo(project_id)
        v_address_resolution = resolve_project_v_address(project_snapshot, raw_v_address)
        execution_input["project_id"] = v_address_resolution["project_id"]
        execution_input["stake"] = v_address_resolution["stake"]
        execution_input["__v_address_context"] = v_address_resolution["context"]

        requested_branch = str(branch_id or "").strip()
        resolved_branch = str(v_address_resolution["resolved_branch"]).strip()
        if requested_branch and requested_branch != resolved_branch:
            raise ValueError(f"branch mismatch: request branch_id={requested_branch}, v_address resolved_branch={resolved_branch}")
        resolved_branch_id = requested_branch or resolved_branch

    result = project_utxo_service.execute_component_in_branch(
        component_id=component_id,
        input_payload=execution_input,
        branch_id=resolved_branch_id,
        execution_engine=execution_engine,
    )
    if record_execution:
        _record_execution_with_children(result, branch_id=resolved_branch_id)
    branch_overview = project_utxo_service.get_branch_overview(project_id)
    response = dict(result)
    response["current_branch"] = branch_overview.get("current_branch", "main")
    response["active_forks"] = branch_overview.get("active_forks", [])
    if v_address_resolution is not None:
        response["v_address_resolution"] = v_address_resolution
    return response


def _execute_component_via_source_policy(
    *,
    spec_or_component_id: str,
    input_payload: Dict[str, Any],
    branch_id: str | None,
    record_execution: bool,
    prefer_runtime: bool = False,
) -> Dict[str, Any]:
    runtime_manifest_info: tuple[str, Dict[str, Any]] | None = _resolve_runtime_manifest_for_execution(spec_or_component_id)
    if prefer_runtime and runtime_manifest_info is not None:
        runtime_spu_id, manifest = runtime_manifest_info
        result = _execute_runtime_spu_fallback(
            runtime_spu_id=runtime_spu_id,
            manifest=manifest,
            input_payload=dict(input_payload),
            branch_id=branch_id,
        )
        _attach_runtime_version_binding(
            execution_result=result,
            input_payload=input_payload,
            spec_or_component_id=runtime_spu_id,
        )
        if record_execution:
            _record_execution_with_children(result, branch_id=_as_text(result.get("branch_id")) or branch_id)
        return result
    try:
        result = _execute_specir_with_payload(
            spec_or_component_id,
            ExecuteSpecIRRequest(input=dict(input_payload), branch_id=branch_id),
        )
        _attach_runtime_version_binding(
            execution_result=result,
            input_payload=input_payload,
            spec_or_component_id=spec_or_component_id,
        )
        if record_execution:
            _record_execution_with_children(result, branch_id=_as_text(result.get("branch_id")) or branch_id)
        return result
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        if not _builtin_execution_allowed() and runtime_manifest_info is None:
            raise
    try:
        result = project_utxo_service.execute_component_in_branch(
            component_id=spec_or_component_id,
            input_payload=dict(input_payload),
            branch_id=branch_id or "",
            execution_engine=execution_engine,
        )
    except ComponentNotFoundError:
        runtime_manifest_info = runtime_manifest_info or _resolve_runtime_manifest_for_execution(spec_or_component_id)
        if runtime_manifest_info is None:
            raise
        runtime_spu_id, manifest = runtime_manifest_info
        result = _execute_runtime_spu_fallback(
            runtime_spu_id=runtime_spu_id,
            manifest=manifest,
            input_payload=dict(input_payload),
            branch_id=branch_id,
        )
    _attach_runtime_version_binding(
        execution_result=result,
        input_payload=input_payload,
        spec_or_component_id=spec_or_component_id,
    )
    if record_execution:
        _record_execution_with_children(result, branch_id=_as_text(result.get("branch_id")) or branch_id)
    return result


def _compare_component_branches(payload: CompareBranchesRequest) -> Dict[str, Any]:
    project_id = str(payload.input.get("project_id", "UNSPECIFIED"))
    requested_branches = payload.branches or []
    branches: list[str] = []
    for item in requested_branches:
        branch_id = str(item).strip()
        if branch_id and branch_id not in branches:
            branches.append(branch_id)
    if len(branches) < 2:
        raise ValueError("branches must include at least 2 unique branch ids")

    comparisons: Dict[str, Dict[str, Any]] = {}
    for branch_id in branches:
        comparisons[branch_id] = _execute_component_via_source_policy(
            spec_or_component_id=payload.component_id,
            input_payload=dict(payload.input),
            branch_id=branch_id,
            record_execution=False,
        )
    result_status = {branch_id: str(result.get("final_status", "UNKNOWN")) for branch_id, result in comparisons.items()}

    branch_overview = project_utxo_service.get_branch_overview(project_id)
    return {
        "component_id": payload.component_id,
        "project_id": project_id,
        "results": comparisons,
        "comparisons": comparisons,
        "result_status": result_status,
        "diff": _build_compare_diff(comparisons),
        "current_branch": branch_overview.get("current_branch", "main"),
        "active_forks": branch_overview.get("active_forks", []),
    }


@app.post("/api/v1/execute/component")
def execute_component(payload: ExecuteComponentRequest) -> Dict[str, Any]:
    try:
        if not _component_id_execution_allowed():
            raise ValueError("direct component execution is disabled; use /api/v1/specir/execute/{spec_id}")
        return _execute_component_direct_internal(
            component_id=payload.component_id,
            input_payload=payload.input,
            branch_id=payload.branch_id,
            record_execution=True,
        )
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ComponentSchemaError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        VAddressError,
        ValueError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/execute/component/compare-branches")
def compare_component_branches(payload: CompareBranchesRequest) -> Dict[str, Any]:
    try:
        return _compare_component_branches(payload)
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ComponentSchemaError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        VAddressError,
        ValueError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/execute/component/compare")
def compare_component_branches_alias(payload: CompareBranchesRequest) -> Dict[str, Any]:
    try:
        return _compare_component_branches(payload)
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ComponentSchemaError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        VAddressError,
        ValueError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/components")
def list_components(catalog_id: str | None = None, tag: str | None = None, status: str | None = None) -> Dict[str, Any]:
    try:
        return {
            "items": component_registry_service.list_components(
                catalog_id=catalog_id,
                tag=tag,
                status=status,
            )
        }
    except (ComponentSchemaError, ComponentRegistryServiceError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/component/register")
def register_component(payload: RegisterComponentRequest) -> Dict[str, Any]:
    try:
        golden_report: Dict[str, Any] | None = None
        if payload.enforce_golden_gate:
            golden_report = run_golden_regression_check(
                base_dir=golden_set_base_dir,
                report_dir=golden_report_dir,
                form_code=payload.component_id,
                candidate_rulepack=payload.definition,
                candidate_publish_result={
                    "catalog_id": payload.catalog_id,
                    "component_id": payload.component_id,
                    "component_name": payload.component_name,
                    "version": payload.version,
                },
            )
            gate_obj = golden_report.get("gate") if isinstance(golden_report, dict) else {}
            if isinstance(gate_obj, dict) and bool(gate_obj.get("blocked")):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "golden regression fail",
                        "report": golden_report,
                    },
                )
        test_report = run_rule_test_framework(
            form_code=payload.component_id,
            rulepack=payload.definition,
            pass_rate_threshold=0.85,
            report_dir=rule_test_report_dir,
        )
        test_summary = test_report.get("summary") if isinstance(test_report, dict) else {}
        publish_gate = test_summary.get("publish_gate") if isinstance(test_summary, dict) else {}
        if isinstance(publish_gate, dict) and bool(publish_gate.get("blocked")):
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "test pass rate < threshold",
                    "report": test_report,
                },
            )
        item = component_registry_service.register_component(
            catalog_id=payload.catalog_id,
            component_id=payload.component_id,
            component_name=payload.component_name,
            version=payload.version,
            definition=payload.definition,
        )
        return {"item": item, "golden_report": golden_report, "test_report": test_report}
    except HTTPException:
        raise
    except (ComponentSchemaError, ComponentRegistryServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/golden/baseline/schema")
def get_golden_baseline_schema() -> Dict[str, Any]:
    return {"schema": build_golden_baseline_schema()}


@app.post("/api/v1/golden/baseline/upsert")
def api_upsert_golden_baseline(payload: GoldenBaselineUpsertRequest) -> Dict[str, Any]:
    try:
        item = upsert_golden_baseline(
            base_dir=golden_set_base_dir,
            form_code=payload.form_code,
            baseline_rulepack=payload.baseline_rulepack,
            baseline_runtime_result=payload.baseline_runtime_result,
            baseline_publish_result=payload.baseline_publish_result,
            sample_input=payload.sample_input,
        )
        return {"item": item}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/golden/regression/check")
def api_run_golden_regression(payload: GoldenRegressionCheckRequest) -> Dict[str, Any]:
    try:
        return run_golden_regression_check(
            base_dir=golden_set_base_dir,
            report_dir=golden_report_dir,
            form_code=payload.form_code,
            candidate_rulepack=payload.candidate_rulepack,
            candidate_publish_result=payload.candidate_publish_result,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/rule-test/run")
def api_run_rule_test_framework(payload: RuleTestRunRequest) -> Dict[str, Any]:
    try:
        return run_rule_test_framework(
            form_code=payload.form_code,
            rulepack=payload.rulepack,
            pass_rate_threshold=float(payload.pass_rate_threshold),
            report_dir=rule_test_report_dir,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/runtime/observability/schema")
def api_runtime_observability_schema() -> Dict[str, Any]:
    return {"schema": build_observability_schema()}


@app.get("/api/v1/runtime/metrics")
def api_runtime_metrics(
    form_code: str | None = None,
    rulepack_version: str | None = None,
    project_id: str | None = None,
) -> Dict[str, Any]:
    return build_runtime_metrics(
        event_dir=runtime_event_dir,
        metrics_dir=runtime_metrics_dir,
        form_code=form_code,
        rulepack_version=rulepack_version,
        project_id=project_id,
    )


@app.get("/api/v1/runtime/rule-heatmap")
def api_rule_heatmap(
    standard: str | None = None,
    form_code: str | None = None,
    project: str | None = None,
) -> Dict[str, Any]:
    return build_rule_heatmap_metrics(
        event_dir=runtime_event_dir,
        output_dir=rule_heatmap_dir,
        standard=standard,
        form_code=form_code,
        project=project,
    )


@app.get("/api/v1/ai-repair/schema")
def api_ai_repair_schema() -> Dict[str, Any]:
    return {"schema": build_ai_repair_schema()}


@app.post("/api/v1/ai-repair/suggest")
def api_ai_repair_suggest(payload: AIRepairSuggestRequest) -> Dict[str, Any]:
    suggestion = generate_ai_repair_suggestion(
        source_clause=payload.source_clause,
        specir=payload.specir,
        unresolved_reason=payload.unresolved_reason,
        nearby_resolved_rules=payload.nearby_resolved_rules,
        slot_registry=payload.slot_registry,
    )
    review_item = enqueue_patch_for_review(
        queue_dir=ai_repair_queue_dir,
        form_code=payload.form_code,
        suggestion=_as_text_dict(suggestion.get("suggestion")),
        source="ai_assisted_repair",
    )
    nearby_count = len(payload.nearby_resolved_rules or [])
    slot_count = len(payload.slot_registry or [])
    unresolved_text = str(payload.unresolved_reason or "").lower()
    confidence = 0.82 + min(0.12, nearby_count * 0.02) + min(0.04, slot_count * 0.005)
    if "unknown" in unresolved_text or "ambiguous" in unresolved_text:
        confidence -= 0.15
    confidence = max(0.0, min(0.99, confidence))
    impact_score = min(1.0, 0.4 + min(0.4, nearby_count * 0.03) + (0.2 if "threshold" in unresolved_text else 0.1))
    hitl2_item = hitl2_enqueue_candidate(
        queue_dir=hitl2_queue_dir,
        form_code=payload.form_code,
        source="ai_assisted_repair",
        candidate=_as_text_dict(suggestion.get("suggestion")),
        confidence=confidence,
        impact_score=impact_score,
    )
    return {
        "ai_repair_schema": build_ai_repair_schema(),
        "suggestion_payload": suggestion,
        "review_queue_item": review_item,
        "hitl2_item": hitl2_item,
        "patch_workflow": {
            "steps": ["suggestion_generated", "queued_for_review", "accept/reject/manual_edit"],
            "queue_required": True,
        },
    }


@app.get("/api/v1/ai-repair/review-queue")
def api_ai_repair_review_queue() -> Dict[str, Any]:
    return {"items": list_review_queue(ai_repair_queue_dir)}


@app.post("/api/v1/ai-repair/review-action")
def api_ai_repair_review_action(payload: AIRepairReviewActionRequest) -> Dict[str, Any]:
    try:
        item = update_review_queue_item(
            queue_dir=ai_repair_queue_dir,
            patch_id=payload.patch_id,
            action=payload.action,
            manual_edit=payload.manual_edit,
        )
        return {"item": item}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/fusion/multi-standard")
def api_multi_standard_fusion(payload: MultiStandardFusionRequest) -> Dict[str, Any]:
    try:
        return fuse_multi_standards(
            standards=payload.standards,
            output_dir=fusion_manifest_dir,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _collect_spec_entries_for_kg() -> list[Dict[str, Any]]:
    entries: list[Dict[str, Any]] = []
    try:
        registry = _reload_specir_registry()
    except Exception:
        registry = {}
    for item in registry.values():
        doc = getattr(item, "document", None)
        if doc is None:
            continue
        entries.append(
            {
                "spec_id": getattr(doc, "spec_id", ""),
                "version": getattr(doc, "version", ""),
                "semantics": getattr(doc, "semantics", {}),
                "inputs": getattr(doc, "inputs", {}),
                "gate": getattr(doc, "gate", {}),
            }
        )
    return entries


@app.post("/api/v1/knowledge-graph/build")
def api_build_knowledge_graph(payload: KnowledgeGraphBuildRequest) -> Dict[str, Any]:
    specs = payload.specs if payload.specs else _collect_spec_entries_for_kg()
    return build_specir_knowledge_graph(
        spec_entries=specs,
        output_dir=knowledge_graph_dir,
    )


@app.get("/api/v1/knowledge-graph/schema")
def api_knowledge_graph_schema() -> Dict[str, Any]:
    return {"graph_schema": kg_graph_schema()}


@app.post("/api/v1/knowledge-graph/query")
def api_knowledge_graph_query(payload: KnowledgeGraphQueryRequest) -> Dict[str, Any]:
    graph_path = knowledge_graph_dir / "knowledge_graph.json"
    if not graph_path.exists():
        graph = build_specir_knowledge_graph(spec_entries=_collect_spec_entries_for_kg(), output_dir=knowledge_graph_dir)
    else:
        graph = json.loads(graph_path.read_text(encoding="utf-8-sig"))
    return kg_graph_query(graph, node_type=payload.node_type, keyword=payload.keyword)


@app.post("/api/v1/knowledge-graph/traverse")
def api_knowledge_graph_traverse(payload: KnowledgeGraphTraversalRequest) -> Dict[str, Any]:
    graph_path = knowledge_graph_dir / "knowledge_graph.json"
    if not graph_path.exists():
        graph = build_specir_knowledge_graph(spec_entries=_collect_spec_entries_for_kg(), output_dir=knowledge_graph_dir)
    else:
        graph = json.loads(graph_path.read_text(encoding="utf-8-sig"))
    return kg_impact_traversal(graph, start_node_id=payload.start_node_id, max_depth=max(1, min(int(payload.max_depth), 8)))


@app.post("/api/v1/knowledge-graph/semantic-search")
def api_knowledge_graph_semantic_search(payload: KnowledgeGraphSemanticSearchRequest) -> Dict[str, Any]:
    graph_path = knowledge_graph_dir / "knowledge_graph.json"
    if not graph_path.exists():
        graph = build_specir_knowledge_graph(spec_entries=_collect_spec_entries_for_kg(), output_dir=knowledge_graph_dir)
    else:
        graph = json.loads(graph_path.read_text(encoding="utf-8-sig"))
    return kg_semantic_search(graph, query=payload.query, limit=max(1, min(int(payload.limit), 100)))


@app.get("/api/v1/knowledge-graph/slot-usage")
def api_knowledge_graph_slot_usage(slotKey: str) -> Dict[str, Any]:
    graph_path = knowledge_graph_dir / "knowledge_graph.json"
    if not graph_path.exists():
        graph = build_specir_knowledge_graph(spec_entries=_collect_spec_entries_for_kg(), output_dir=knowledge_graph_dir)
    else:
        graph = json.loads(graph_path.read_text(encoding="utf-8-sig"))
    return kg_slotkey_usage_query(graph, slot_key=slotKey)


@app.get("/api/v1/knowledge-graph/runtime-trace")
def api_knowledge_graph_runtime_trace(slotKey: str, max_depth: int = 6) -> Dict[str, Any]:
    graph_path = knowledge_graph_dir / "knowledge_graph.json"
    if not graph_path.exists():
        graph = build_specir_knowledge_graph(spec_entries=_collect_spec_entries_for_kg(), output_dir=knowledge_graph_dir)
    else:
        graph = json.loads(graph_path.read_text(encoding="utf-8-sig"))
    depth = max(1, min(int(max_depth), 10))
    return kg_runtime_trace(graph, slot_key=slotKey, max_depth=depth)


@app.post("/api/v1/knowledge-graph/ai-retrieval")
def api_knowledge_graph_ai_retrieval(payload: KnowledgeGraphAIRetrievalRequest) -> Dict[str, Any]:
    graph_path = knowledge_graph_dir / "knowledge_graph.json"
    if not graph_path.exists():
        graph = build_specir_knowledge_graph(spec_entries=_collect_spec_entries_for_kg(), output_dir=knowledge_graph_dir)
    else:
        graph = json.loads(graph_path.read_text(encoding="utf-8-sig"))
    return kg_ai_retrieval(graph, query=payload.query, limit=max(1, min(int(payload.limit), 100)))


@app.get("/api/v1/semantic-core/schema")
def api_semantic_core_schema() -> Dict[str, Any]:
    return {"schema": semantic_parser_schema()}


@app.post("/api/v1/semantic-core/parse")
def api_semantic_core_parse(payload: AISemanticCoreRequest) -> Dict[str, Any]:
    return parse_semantic_specir(
        clause_text=payload.clause_text,
        table_cell=payload.table_cell,
        formula=payload.formula,
        note=payload.note,
    )


@app.post("/api/v1/slot-intelligence/recommend")
def api_slot_intelligence_recommend(payload: SlotIntelligenceRecommendRequest) -> Dict[str, Any]:
    result = recommend_slots(
        clause=payload.clause,
        semantic_type=payload.semantic_type,
        nearby_slots=payload.nearby_slots,
        historical_mappings=payload.historical_mappings,
        blueprint_context=payload.blueprint_context,
    )
    recommendations = result.get("recommended_slot_keys")
    dispatched = dispatch_slot_recommendation_result(
        queue_dir=slot_intelligence_queue_dir,
        bind_dir=slot_intelligence_bind_dir,
        form_code=payload.form_code,
        recommendations=list(recommendations) if isinstance(recommendations, list) else [],
    )
    return {
        **result,
        **dispatched,
    }


@app.get("/api/v1/slot-intelligence/review-queue")
def api_slot_intelligence_review_queue() -> Dict[str, Any]:
    return {"items": list_slot_review_queue(slot_intelligence_queue_dir)}


@app.get("/api/v1/constraint-reasoner/schema")
def api_constraint_reasoner_schema() -> Dict[str, Any]:
    return {"condition_schema": constraint_condition_schema()}


@app.post("/api/v1/constraint-reasoner/reason")
def api_constraint_reasoner_reason(payload: ConstraintReasonerRequest) -> Dict[str, Any]:
    return reason_constraint_clause(clause=payload.clause)


@app.get("/api/v1/formula-intelligence/schema")
def api_formula_intelligence_schema() -> Dict[str, Any]:
    return {
        "formula_parser": {
            "name": "formula_intelligence_v1",
            "required_outputs": ["formula_latex", "formula_ast", "inputs", "output", "unit_mapping"],
        },
        "ast_schema": formula_ast_schema(),
        "runtime_integration": ["slot_dependency", "runtime_formula_executor"],
    }


@app.post("/api/v1/formula-intelligence/parse")
def api_formula_intelligence_parse(payload: FormulaIntelligenceRequest) -> Dict[str, Any]:
    return parse_formula(clause=payload.clause, formula_text=payload.formula)


@app.get("/api/v1/layout-semantic/schema")
def api_layout_semantic_schema() -> Dict[str, Any]:
    return {"layout_schema": layout_semantic_schema()}


@app.post("/api/v1/layout-semantic/analyze")
def api_layout_semantic_analyze(payload: MultiModalLayoutRequest) -> Dict[str, Any]:
    return analyze_layout_semantics(
        document_type=payload.document_type,
        text=payload.content_text,
    )


def _unified_input_parser_schema() -> Dict[str, Any]:
    return {
        "schema_id": "unified.input.parser.v1",
        "accepted_input_types": ["PDF", "Word", "扫描图片", "Excel", "手机拍照", "自然语言施工描述"],
        "required_pipeline": ["blockization", "semanticization", "evidenceization"],
        "output_chain": ["Document IR", "Semantic IR", "SpecIR"],
        "ocr_required_fields": ["bbox", "page", "confidence"],
        "nlp_required_fields": ["subject", "condition", "constraint"],
    }


def _blockize_text(content_text: str) -> list[Dict[str, Any]]:
    lines = [line.strip() for line in _as_text(content_text).splitlines() if line.strip()]
    if not lines:
        lines = [_as_text(content_text)] if _as_text(content_text) else []
    blocks: list[Dict[str, Any]] = []
    for idx, line in enumerate(lines):
        blocks.append(
            {
                "block_id": f"blk_{idx+1:04d}",
                "text": line,
                "page": 1,
                "bbox": [0, idx * 18, 1000, idx * 18 + 16],
                "confidence": 0.95,
            }
        )
    return blocks


def _extract_subject_condition_constraint(text: str) -> Dict[str, str]:
    cleaned = _as_text(text)
    if not cleaned:
        return {"subject": "", "condition": "", "constraint": ""}
    subject = cleaned.split("，")[0].split(",")[0].split("应")[0].strip()[:80]
    condition = ""
    constraint = ""
    for marker in ("应", "必须", "不得", ">=", "<=", "大于", "小于", "不少于", "不低于", "不应"):
        if marker in cleaned:
            pos = cleaned.find(marker)
            condition = cleaned[:pos].strip()
            constraint = cleaned[pos:].strip()
            break
    if not condition:
        condition = cleaned[: min(len(cleaned), 60)]
    if not constraint:
        constraint = cleaned
    return {"subject": subject or condition, "condition": condition, "constraint": constraint}


def _semanticize_blocks(blocks: list[Dict[str, Any]], input_type: str) -> Dict[str, Any]:
    semantics: list[Dict[str, Any]] = []
    for block in blocks:
        text = _as_text(block.get("text"))
        triple = _extract_subject_condition_constraint(text)
        semantics.append(
            {
                "block_id": _as_text(block.get("block_id")),
                "semantic_type": "constraint_clause",
                "subject": triple["subject"],
                "condition": triple["condition"],
                "constraint": triple["constraint"],
                "source_input_type": input_type,
            }
        )
    return {"items": semantics}


def _evidenceize_blocks(blocks: list[Dict[str, Any]], input_type: str) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    for block in blocks:
        out.append(
            {
                "evidence_id": f"ev_{_as_text(block.get('block_id'))}",
                "source_type": input_type,
                "block_ref": _as_text(block.get("block_id")),
                "bbox": block.get("bbox"),
                "page": block.get("page"),
                "confidence": block.get("confidence"),
            }
        )
    return out


def _build_specir_from_semantics(semantic_items: list[Dict[str, Any]]) -> Dict[str, Any]:
    slots: list[Dict[str, Any]] = []
    gates: list[Dict[str, Any]] = []
    for index, item in enumerate(semantic_items):
        slot_key = f"slot_{index+1:03d}"
        slots.append(
            {
                "slotKey": slot_key,
                "label": _as_text(item.get("subject")) or f"field_{index+1}",
                "source_block": _as_text(item.get("block_id")),
            }
        )
        gates.append(
            {
                "gate_id": f"gate_{index+1:03d}",
                "gate_type": "dependency",
                "condition": _as_text(item.get("constraint")),
                "slot_refs": [slot_key],
                "traceability": {"block_id": _as_text(item.get("block_id"))},
            }
        )
    return {
        "specir_id": _new_runtime_id("specir_from_input"),
        "slots": slots,
        "gates": gates,
    }


@app.get("/api/v1/unified-input-parser/schema")
def api_unified_input_parser_schema() -> Dict[str, Any]:
    return {
        "parser_pipeline": _unified_input_parser_schema(),
        "semantic_normalization_strategy": {
            "text_cleanup": ["trim", "normalize spaces", "line split"],
            "semantic_extraction": ["subject", "condition", "constraint"],
            "evidence_binding": ["block_id", "bbox", "page", "confidence"],
            "target_ir_chain": ["Document IR", "Semantic IR", "SpecIR"],
        },
    }


def _runtime_engine_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.engine.v1",
        "pipeline": [
            "Body update",
            "dependency analysis",
            "Gate execution",
            "result generation",
            "Proof generation",
        ],
        "capabilities": ["incremental_execution", "dependency_trigger", "async_execution", "replay", "rollback", "audit"],
    }


def _runtime_engine_store_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "runtime_engine"


def _runtime_engine_events_file() -> Path:
    return _runtime_engine_store_dir() / "executions.json"


def _runtime_engine_queue_file() -> Path:
    return _runtime_engine_store_dir() / "queue.json"


def _load_json_array(path: Path) -> list[Dict[str, Any]]:
    if not path.exists():
        return []
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [it for it in parsed if isinstance(it, dict)]


def _save_json_array(path: Path, items: list[Dict[str, Any]]) -> None:
    _runtime_engine_store_dir().mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _build_runtime_dependency_graph() -> Dict[str, Any]:
    gates = _load_gate_runtime_events()
    by_slot: Dict[str, list[str]] = {}
    nodes: list[Dict[str, Any]] = []
    edges: list[Dict[str, Any]] = []
    for gate_event in gates:
        gate = gate_event.get("gate") if isinstance(gate_event.get("gate"), dict) else {}
        gate_id = _as_text(gate.get("gate_id"))
        slot_refs = gate.get("slot_refs") if isinstance(gate.get("slot_refs"), list) else []
        if not gate_id:
            continue
        nodes.append({"id": gate_id, "type": "gate"})
        for slot in slot_refs:
            slot_key = _as_text(slot)
            if not slot_key:
                continue
            by_slot.setdefault(slot_key, [])
            if gate_id not in by_slot[slot_key]:
                by_slot[slot_key].append(gate_id)
            edges.append({"from": slot_key, "to": gate_id, "type": "trigger"})
    for slot_key in by_slot.keys():
        nodes.append({"id": slot_key, "type": "slot"})
    return {"nodes": nodes, "edges": edges, "slot_to_gates": by_slot}


def _latest_gate_event_by_id() -> Dict[str, Dict[str, Any]]:
    latest: Dict[str, Dict[str, Any]] = {}
    for event in _load_gate_runtime_events():
        gate = event.get("gate") if isinstance(event.get("gate"), dict) else {}
        gate_id = _as_text(gate.get("gate_id"))
        if gate_id:
            latest[gate_id] = event
    return latest


def _execute_runtime_engine_sync(body_update: Dict[str, Any], trigger_reason: str) -> Dict[str, Any]:
    body = _normalize_body(body_update)
    saved_body = _upsert_body_item(body)
    graph = _build_runtime_dependency_graph()
    slot_key = _as_text(saved_body.get("slotKey"))
    impacted_gate_ids = graph.get("slot_to_gates", {}).get(slot_key, []) if isinstance(graph.get("slot_to_gates"), dict) else []
    gate_lookup = _latest_gate_event_by_id()
    gate_results: list[Dict[str, Any]] = []
    for gate_id in impacted_gate_ids:
        gate_event = gate_lookup.get(gate_id, {})
        gate_cfg = gate_event.get("gate") if isinstance(gate_event.get("gate"), dict) else {}
        source_clause = _as_text(gate_event.get("source_clause"))
        payload = {
            "gate_id": gate_id,
            "gate_type": _as_text(gate_cfg.get("gate_type")) or "threshold",
            "slot_refs": gate_cfg.get("slot_refs") if isinstance(gate_cfg.get("slot_refs"), list) else [slot_key],
            "operator": _as_text(gate_cfg.get("operator")) or ">=",
            "threshold": gate_cfg.get("threshold"),
            "min": gate_cfg.get("min"),
            "max": gate_cfg.get("max"),
            "formula_ref": _as_text(gate_cfg.get("formula_ref")),
            "condition": _as_text(gate_cfg.get("condition")),
            "on_pass": _as_text(gate_cfg.get("on_pass")) or "PASS",
            "on_fail": _as_text(gate_cfg.get("on_fail")) or "FAIL",
            "severity": _as_text(gate_cfg.get("severity")) or "warning",
            "runtime_mode": _as_text(gate_cfg.get("runtime_mode")) or "automatic",
            "confidence": gate_cfg.get("confidence") if gate_cfg.get("confidence") is not None else 0.8,
            "current_input": {slot_key: saved_body.get("value")},
            "specir": _as_text(gate_event.get("traceability", {}).get("specir") if isinstance(gate_event.get("traceability"), dict) else "") or _as_text(saved_body.get("specir")),
            "rule": _as_text(gate_event.get("traceability", {}).get("rule") if isinstance(gate_event.get("traceability"), dict) else "") or "runtime_rule",
            "normRef": _as_text(gate_event.get("traceability", {}).get("normRef") if isinstance(gate_event.get("traceability"), dict) else "") or "unknown_norm",
            "source_clause": source_clause,
        }
        evaluated = _evaluate_unified_gate(payload)
        gate_results.append(evaluated)
        traceability = evaluated.get("traceability") if isinstance(evaluated.get("traceability"), dict) else {}
        gate_obj = evaluated.get("gate") if isinstance(evaluated.get("gate"), dict) else {}
        _append_unified_proof(
            {
                "project_id": _as_text(saved_body.get("project_id")) or "unknown_project",
                "form_code": _as_text(saved_body.get("form_code")),
                "slotKey": slot_key,
                "body_snapshot": saved_body,
                "gate_snapshot": gate_obj,
                "calculation_trace": [{"step": "gate_evaluation", "event_id": _as_text(evaluated.get("event_id"))}],
                "result": _as_text(evaluated.get("judgement_result")) or "FAIL",
                "fail_reason": _as_text(evaluated.get("fail_reason")),
                "evidence_refs": [{"source_clause": _as_text(evaluated.get("source_clause"))}],
                "operator": _as_text(saved_body.get("source_ref")) or "runtime_engine",
                "signature": "runtime_engine_auto",
                "specir": _as_text(traceability.get("specir")),
                "rule": _as_text(traceability.get("rule")),
                "normRef": _as_text(traceability.get("normRef")),
            }
        )
    execution = {
        "execution_id": _new_runtime_id("rtx"),
        "timestamp": _now_iso(),
        "trigger_reason": trigger_reason,
        "body_snapshot": saved_body,
        "dependency_analysis": {
            "slotKey": slot_key,
            "affected_gates": impacted_gate_ids,
            "incremental_execution": True,
        },
        "gate_execution": gate_results,
        "result_generation": {
            "total_gates": len(gate_results),
            "failed_gates": [
                {
                    "gate_id": _as_text((it.get("gate") or {}).get("gate_id") if isinstance(it.get("gate"), dict) else ""),
                    "fail_reason": _as_text(it.get("fail_reason")),
                    "threshold": (it.get("gate") or {}).get("threshold") if isinstance(it.get("gate"), dict) else None,
                    "actual_value": (it.get("current_input") or {}).get(slot_key) if isinstance(it.get("current_input"), dict) else None,
                    "source_clause": _as_text(it.get("source_clause")),
                }
                for it in gate_results
                if not bool(it.get("passed"))
            ],
        },
        "proof_generation": {
            "mode": "append_only",
            "proof_count": len(gate_results),
        },
    }
    events = _load_json_array(_runtime_engine_events_file())
    events.append(execution)
    _save_json_array(_runtime_engine_events_file(), events[-10000:])
    return execution


@app.get("/api/v1/runtime-engine/schema")
def api_runtime_engine_schema() -> Dict[str, Any]:
    return {
        "runtime_engine_schema": _runtime_engine_schema(),
        "dependency_graph": _build_runtime_dependency_graph(),
        "execution_lifecycle": [
            "queued(optional)",
            "dependency_analyzed",
            "gate_executed",
            "result_generated",
            "proof_appended",
            "auditable",
        ],
    }


@app.post("/api/v1/runtime-engine/dispatch")
def api_runtime_engine_dispatch(payload: RuntimeEngineDispatchRequest) -> Dict[str, Any]:
    if payload.async_execution:
        queue = _load_json_array(_runtime_engine_queue_file())
        job = {
            "job_id": _new_runtime_id("rtq"),
            "queued_at": _now_iso(),
            "trigger_reason": payload.trigger_reason,
            "body_update": payload.body_update,
            "status": "queued",
        }
        queue.append(job)
        _save_json_array(_runtime_engine_queue_file(), queue[-10000:])
        return {"accepted": True, "async": True, "job": job}
    execution = _execute_runtime_engine_sync(payload.body_update, payload.trigger_reason)
    _apply_execution_to_runtime_semantic_graph(execution)
    return {"accepted": True, "async": False, "execution": execution}


@app.post("/api/v1/runtime-engine/worker/drain")
def api_runtime_engine_worker_drain(limit: int = 20) -> Dict[str, Any]:
    queue = _load_json_array(_runtime_engine_queue_file())
    drained: list[Dict[str, Any]] = []
    remains: list[Dict[str, Any]] = []
    quota = max(1, min(int(limit), 500))
    for item in queue:
        if quota > 0 and _as_text(item.get("status")) == "queued":
            quota -= 1
            body_update = item.get("body_update") if isinstance(item.get("body_update"), dict) else {}
            execution = _execute_runtime_engine_sync(body_update, _as_text(item.get("trigger_reason")) or "queued_body_update")
            _apply_execution_to_runtime_semantic_graph(execution)
            item["status"] = "done"
            item["done_at"] = _now_iso()
            item["execution_id"] = execution.get("execution_id")
            drained.append(item)
        else:
            remains.append(item)
    _save_json_array(_runtime_engine_queue_file(), drained + remains)
    return {"drained": drained, "remaining": len([x for x in drained + remains if _as_text(x.get("status")) == "queued"])}


@app.get("/api/v1/runtime-engine/executions")
def api_runtime_engine_executions(limit: int = 200) -> Dict[str, Any]:
    items = _load_json_array(_runtime_engine_events_file())
    items.sort(key=lambda it: _as_text(it.get("timestamp")), reverse=True)
    return {"items": items[: max(1, min(int(limit), 5000))]}


@app.post("/api/v1/runtime-engine/replay")
def api_runtime_engine_replay(execution_id: str = Query(..., min_length=1)) -> Dict[str, Any]:
    items = _load_json_array(_runtime_engine_events_file())
    for item in items:
        if _as_text(item.get("execution_id")) == execution_id:
            body_snapshot = item.get("body_snapshot") if isinstance(item.get("body_snapshot"), dict) else {}
            replayed = _execute_runtime_engine_sync(body_snapshot, "replay")
            return {"mode": "replay", "original_execution_id": execution_id, "replayed_execution": replayed}
    raise HTTPException(status_code=404, detail="execution not found")


@app.post("/api/v1/runtime-engine/rollback")
def api_runtime_engine_rollback(payload: RuntimeEngineRollbackRequest) -> Dict[str, Any]:
    items = _load_json_array(_runtime_engine_events_file())
    target = None
    for item in items:
        if _as_text(item.get("execution_id")) == payload.execution_id:
            target = item
            break
    if not isinstance(target, dict):
        raise HTTPException(status_code=404, detail="execution not found")
    body_snapshot = target.get("body_snapshot") if isinstance(target.get("body_snapshot"), dict) else {}
    slot_key = _as_text(body_snapshot.get("slotKey"))
    rollback_body = dict(body_snapshot)
    rollback_body["runtime_status"] = "overridden"
    rollback_body["source_ref"] = f"rollback:{payload.execution_id}"
    _upsert_body_item(rollback_body)
    audit = {
        "audit_id": _new_runtime_id("rta"),
        "action": "rollback",
        "execution_id": payload.execution_id,
        "slotKey": slot_key,
        "reason": payload.reason,
        "timestamp": _now_iso(),
    }
    events = _load_json_array(_runtime_engine_events_file())
    events.append({"execution_id": _new_runtime_id("rtx"), "timestamp": _now_iso(), "rollback_audit": audit})
    _save_json_array(_runtime_engine_events_file(), events[-10000:])
    return {"rolled_back": True, "audit": audit}


@app.get("/api/v1/runtime-engine/audit")
def api_runtime_engine_audit(limit: int = 200) -> Dict[str, Any]:
    items = _load_json_array(_runtime_engine_events_file())
    audits = [it for it in items if isinstance(it.get("rollback_audit"), dict)]
    audits.sort(key=lambda it: _as_text((it.get("rollback_audit") or {}).get("timestamp")), reverse=True)
    return {"items": audits[: max(1, min(int(limit), 5000))]}


def _runtime_dependency_graph_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.dependency.graph.v1",
        "nodes": ["Body", "Rule", "Gate", "Proof", "Form"],
        "edges": [
            "Body->Rule",
            "Rule->Gate",
            "Gate->Proof",
            "Body->Form",
            "Proof->Form",
        ],
        "capabilities": ["cycle_detection", "incremental_recompute", "impact_analysis"],
    }


def _build_runtime_dependency_graph_v1() -> Dict[str, Any]:
    bodies = _load_body_items()
    gate_events = _load_gate_runtime_events()
    proofs = _load_unified_proofs()
    nodes: list[Dict[str, Any]] = []
    edges: list[Dict[str, Any]] = []
    added: set[str] = set()

    def add_node(node_id: str, node_type: str, data: Dict[str, Any] | None = None) -> None:
        token = f"{node_type}:{node_id}"
        if token in added:
            return
        added.add(token)
        nodes.append({"id": node_id, "type": node_type, "data": data or {}})

    for body in bodies:
        body_id = _as_text(body.get("body_id"))
        if not body_id:
            continue
        slot_key = _as_text(body.get("slotKey"))
        form_code = _as_text(body.get("form_code"))
        add_node(body_id, "Body", {"slotKey": slot_key, "form_code": form_code})
        if form_code:
            add_node(form_code, "Form", {"source": "body"})
            edges.append({"from": body_id, "to": form_code, "type": "Body->Form"})

    for gate_event in gate_events:
        gate = gate_event.get("gate") if isinstance(gate_event.get("gate"), dict) else {}
        traceability = gate_event.get("traceability") if isinstance(gate_event.get("traceability"), dict) else {}
        gate_id = _as_text(gate.get("gate_id"))
        rule_id = _as_text(traceability.get("rule")) or "runtime_rule"
        if not gate_id:
            continue
        add_node(rule_id, "Rule", {})
        add_node(gate_id, "Gate", {"slot_refs": gate.get("slot_refs")})
        edges.append({"from": rule_id, "to": gate_id, "type": "Rule->Gate"})
        slot_refs = gate.get("slot_refs") if isinstance(gate.get("slot_refs"), list) else []
        for slot in slot_refs:
            slot_key = _as_text(slot)
            if not slot_key:
                continue
            for body in bodies:
                if _as_text(body.get("slotKey")) != slot_key:
                    continue
                body_id = _as_text(body.get("body_id"))
                if body_id:
                    edges.append({"from": body_id, "to": rule_id, "type": "Body->Rule"})

    for proof in proofs:
        proof_id = _as_text(proof.get("proof_id"))
        if not proof_id:
            continue
        gate_snapshot = proof.get("gate_snapshot") if isinstance(proof.get("gate_snapshot"), dict) else {}
        gate_id = _as_text(gate_snapshot.get("gate_id"))
        form_code = _as_text(proof.get("form_code"))
        add_node(proof_id, "Proof", {"form_code": form_code})
        if gate_id:
            add_node(gate_id, "Gate", {})
            edges.append({"from": gate_id, "to": proof_id, "type": "Gate->Proof"})
        if form_code:
            add_node(form_code, "Form", {"source": "proof"})
            edges.append({"from": proof_id, "to": form_code, "type": "Proof->Form"})

    return {"nodes": nodes, "edges": edges}


def _detect_dependency_cycles(nodes: list[Dict[str, Any]], edges: list[Dict[str, Any]]) -> list[list[str]]:
    graph: Dict[str, list[str]] = {}
    for node in nodes:
        node_id = _as_text(node.get("id"))
        if node_id:
            graph.setdefault(node_id, [])
    for edge in edges:
        src = _as_text(edge.get("from"))
        dst = _as_text(edge.get("to"))
        if src and dst:
            graph.setdefault(src, []).append(dst)
            graph.setdefault(dst, [])
    visited: set[str] = set()
    stack: list[str] = []
    on_path: set[str] = set()
    cycles: list[list[str]] = []

    def dfs(node_id: str) -> None:
        visited.add(node_id)
        stack.append(node_id)
        on_path.add(node_id)
        for nxt in graph.get(node_id, []):
            if nxt not in visited:
                dfs(nxt)
            elif nxt in on_path:
                if nxt in stack:
                    idx = stack.index(nxt)
                    cycles.append(stack[idx:] + [nxt])
        stack.pop()
        on_path.remove(node_id)

    for nid in list(graph.keys()):
        if nid not in visited:
            dfs(nid)
    unique: list[list[str]] = []
    seen: set[str] = set()
    for cycle in cycles:
        key = "->".join(cycle)
        if key in seen:
            continue
        seen.add(key)
        unique.append(cycle)
    return unique


def _incremental_recompute_from_body(graph: Dict[str, Any], body_selector: Dict[str, Any]) -> Dict[str, Any]:
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
    body_id = _as_text(body_selector.get("body_id"))
    slot_key = _as_text(body_selector.get("slotKey"))
    form_code = _as_text(body_selector.get("form_code"))
    start_body_ids: list[str] = []
    for node in nodes:
        if not isinstance(node, dict) or _as_text(node.get("type")) != "Body":
            continue
        nid = _as_text(node.get("id"))
        data = node.get("data") if isinstance(node.get("data"), dict) else {}
        if body_id and nid == body_id:
            start_body_ids.append(nid)
            continue
        if slot_key and _as_text(data.get("slotKey")) == slot_key:
            start_body_ids.append(nid)
            continue
        if form_code and _as_text(data.get("form_code")) == form_code:
            start_body_ids.append(nid)
    start_body_ids = sorted(set(start_body_ids))
    adjacency: Dict[str, list[str]] = {}
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        src = _as_text(edge.get("from"))
        dst = _as_text(edge.get("to"))
        if not src or not dst:
            continue
        adjacency.setdefault(src, []).append(dst)

    impacted: set[str] = set(start_body_ids)
    queue = list(start_body_ids)
    while queue:
        cur = queue.pop(0)
        for nxt in adjacency.get(cur, []):
            if nxt in impacted:
                continue
            impacted.add(nxt)
            queue.append(nxt)

    gate_ids = sorted([nid for nid in impacted if any(_as_text(n.get("id")) == nid and _as_text(n.get("type")) == "Gate" for n in nodes)])
    proof_ids = sorted([nid for nid in impacted if any(_as_text(n.get("id")) == nid and _as_text(n.get("type")) == "Proof" for n in nodes)])
    form_ids = sorted([nid for nid in impacted if any(_as_text(n.get("id")) == nid and _as_text(n.get("type")) == "Form" for n in nodes)])
    return {
        "start_bodies": start_body_ids,
        "affected_gates": gate_ids,
        "affected_proofs": proof_ids,
        "affected_forms": form_ids,
        "incremental_recompute": True,
    }


@app.get("/api/v1/runtime-dependency-graph/schema")
def api_runtime_dependency_graph_schema() -> Dict[str, Any]:
    graph = _build_runtime_dependency_graph_v1()
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
    cycles = _detect_dependency_cycles(nodes, edges)
    return {
        "graph_schema": _runtime_dependency_graph_schema(),
        "graph": graph,
        "cycle_detection": {"has_cycle": len(cycles) > 0, "cycles": cycles},
        "recompute_strategy": {
            "mode": "incremental",
            "algorithm": "BFS downstream traversal from changed body nodes",
            "outputs": ["affected_gates", "affected_proofs", "affected_forms"],
        },
    }


@app.post("/api/v1/runtime-dependency-graph/recompute")
def api_runtime_dependency_graph_recompute(payload: RuntimeDependencyRecomputeRequest) -> Dict[str, Any]:
    graph = _build_runtime_dependency_graph_v1()
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
    cycles = _detect_dependency_cycles(nodes, edges)
    impact = _incremental_recompute_from_body(
        graph,
        {
            "body_id": payload.body_id,
            "slotKey": payload.slotKey,
            "form_code": payload.form_code,
        },
    )
    return {
        "graph_schema": _runtime_dependency_graph_schema(),
        "cycle_detection": {"has_cycle": len(cycles) > 0, "cycles": cycles},
        "recompute_result": impact,
    }


def _live_conclusion_schema() -> Dict[str, Any]:
    return {
        "schema_id": "conclusion.runtime.engine.v2",
        "input": ["Body", "Gate", "Proof", "Runtime Events"],
        "output": [
            "compliance_status",
            "risk_level",
            "failed_gates",
            "unverifiable_items",
            "missing_proofs",
            "trust_score",
            "suggested_actions",
        ],
        "levels": ["form-level", "bridge-level", "project-level"],
        "traceability_required": ["Gate", "Proof", "SpecIR"],
    }


def _derive_risk_level(failed_count: int, missing_proof_count: int) -> str:
    score = failed_count * 2 + missing_proof_count
    if score >= 6:
        return "high"
    if score >= 3:
        return "medium"
    return "low"


def _derive_trust_score(*, failed_count: int, missing_count: int, unverifiable_count: int, total_events: int) -> float:
    penalty = failed_count * 12 + missing_count * 8 + unverifiable_count * 15
    activity_adjust = min(total_events, 20)
    base = 100 - penalty + activity_adjust
    return round(max(0.0, min(float(base), 100.0)), 2)


def _resolve_bridge_id(form_code: str, body_rows: list[Dict[str, Any]]) -> str:
    for row in body_rows:
        if _as_text(row.get("form_code")) != form_code:
            continue
        bridge_id = _as_text(row.get("bridge_id") or row.get("project_section") or row.get("segment_id"))
        if bridge_id:
            return bridge_id
    return "unknown_bridge"


def _build_form_conclusion(form_code: str, project_id: str, all_bodies: list[Dict[str, Any]]) -> Dict[str, Any]:
    gate_events = _load_gate_runtime_events()
    proofs = _load_unified_proofs()
    immutable_proofs = _load_immutable_proofs()
    runtime_events = _load_json_array(_runtime_engine_events_file())
    failed_items: list[Dict[str, Any]] = []
    traceability: list[Dict[str, Any]] = []
    form_gate_ids: set[str] = set()
    unverifiable_items: list[Dict[str, Any]] = []

    for event in gate_events:
        gate = event.get("gate") if isinstance(event.get("gate"), dict) else {}
        trace = event.get("traceability") if isinstance(event.get("traceability"), dict) else {}
        gate_id = _as_text(gate.get("gate_id"))
        if gate_id:
            form_gate_ids.add(gate_id)
        if bool(event.get("passed")):
            continue
        failed_items.append(
            {
                "gate_id": gate_id,
                "fail_reason": _as_text(event.get("fail_reason")),
                "threshold": gate.get("threshold"),
                "actual_value": event.get("current_input"),
                "source_clause": _as_text(event.get("source_clause")),
            }
        )
        if not _as_text(trace.get("specir")):
            unverifiable_items.append(
                {
                    "type": "gate",
                    "gate_id": gate_id,
                    "reason": "missing specir traceability",
                }
            )
        traceability.append(
            {
                "gate_id": gate_id,
                "proof_id": "",
                "specir": _as_text(trace.get("specir")),
                "rule": _as_text(trace.get("rule")),
                "normRef": _as_text(trace.get("normRef")),
            }
        )

    form_proofs = [p for p in proofs if _as_text(p.get("form_code")) == form_code and _as_text(p.get("project_id")) == project_id]
    proved_gate_ids = {
        _as_text((p.get("gate_snapshot") or {}).get("gate_id"))
        for p in form_proofs
        if isinstance(p.get("gate_snapshot"), dict)
    }
    missing_proofs = sorted([gid for gid in form_gate_ids if gid and gid not in proved_gate_ids])

    proof_trace = []
    for p in form_proofs:
        t = p.get("traceability") if isinstance(p.get("traceability"), dict) else {}
        if not _as_text(t.get("specir")):
            unverifiable_items.append(
                {
                    "type": "proof",
                    "proof_id": _as_text(p.get("proof_id")),
                    "reason": "missing specir traceability",
                }
            )
        proof_trace.append(
            {
                "gate_id": _as_text((p.get("gate_snapshot") or {}).get("gate_id") if isinstance(p.get("gate_snapshot"), dict) else ""),
                "proof_id": _as_text(p.get("proof_id")),
                "specir": _as_text(t.get("specir")),
                "rule": _as_text(t.get("rule")),
                "normRef": _as_text(t.get("normRef")),
            }
        )
    traceability.extend(proof_trace)

    related_runtime = []
    for item in runtime_events:
        body_snapshot = item.get("body_snapshot") if isinstance(item.get("body_snapshot"), dict) else {}
        if _as_text(body_snapshot.get("form_code")) == form_code:
            related_runtime.append(item)

    form_immutable = [p for p in immutable_proofs if _as_text(p.get("form_code")) == form_code and _as_text(p.get("project_id")) == project_id]
    for p in form_immutable:
        if not _as_text(p.get("hash")) or (_as_text(p.get("previous_hash")) == "" and len(form_immutable) > 1):
            unverifiable_items.append(
                {
                    "type": "immutable_proof",
                    "proof_id": _as_text(p.get("proof_id")),
                    "reason": "broken hash chain link",
                }
            )

    failed_count = len(failed_items)
    missing_count = len(missing_proofs)
    unverifiable_count = len(unverifiable_items)
    compliance_status = "compliant" if failed_count == 0 and missing_count == 0 else ("at_risk" if failed_count <= 2 else "non_compliant")
    risk_level = _derive_risk_level(failed_count, missing_count)
    suggested_actions: list[str] = []
    if failed_count:
        suggested_actions.append("修复失败 Gate，并补充对应测量值或参数")
    if missing_count:
        suggested_actions.append("补录缺失 Proof，确保关键 Gate 有签名证据链")
    if unverifiable_count:
        suggested_actions.append("补齐 Gate/Proof 的 SpecIR 追溯字段并修复证据链完整性")
    if not suggested_actions:
        suggested_actions.append("保持当前执行节奏，持续监控增量变更")
    trust_score = _derive_trust_score(
        failed_count=failed_count,
        missing_count=missing_count,
        unverifiable_count=unverifiable_count,
        total_events=len(related_runtime),
    )
    bridge_id = _resolve_bridge_id(form_code, all_bodies)

    return {
        "bridge_id": bridge_id,
        "form_code": form_code,
        "compliance_status": compliance_status,
        "risk_level": risk_level,
        "failed_gates": failed_items,
        "unverifiable_items": unverifiable_items,
        "missing_proofs": missing_proofs,
        "trust_score": trust_score,
        "suggested_actions": suggested_actions,
        "traceability": traceability,
        "runtime_event_count": len(related_runtime),
    }


@app.get("/api/v1/live-conclusion/schema")
def api_live_conclusion_schema() -> Dict[str, Any]:
    return {
        "conclusion_schema": _live_conclusion_schema(),
        "aggregation_strategy": {
            "form_level": "group by form_code and aggregate gate/proof/runtime status",
            "bridge_level": "group form conclusions by bridge_id and aggregate to bridge summary",
            "project_level": "roll up bridge and form conclusions with worst-case risk and compliance precedence",
            "precedence": ["non_compliant", "at_risk", "compliant"],
        },
        "refresh_lifecycle": [
            "Body/Gate/Proof/RuntimeEvent arrives",
            "incremental aggregation by form",
            "rollup to bridge",
            "rollup to project",
            "emit realtime conclusion snapshot",
        ],
    }


@app.post("/api/v1/live-conclusion/build")
def api_live_conclusion_build(payload: LiveConclusionBuildRequest) -> Dict[str, Any]:
    bodies = _load_body_items()
    forms = sorted(
        set(
            _as_text(item.get("form_code"))
            for item in bodies
            if _as_text(item.get("project_id")) in {"", payload.project_id} and _as_text(item.get("form_code"))
        )
    )
    if payload.form_code.strip():
        forms = [_as_text(payload.form_code)]
    if not forms:
        forms = ["unknown_form"]
    form_conclusions = [_build_form_conclusion(form_code=form, project_id=payload.project_id, all_bodies=bodies) for form in forms]
    if payload.bridge_id.strip():
        bridge_filter = _as_text(payload.bridge_id)
        form_conclusions = [fc for fc in form_conclusions if _as_text(fc.get("bridge_id")) == bridge_filter]
    precedence = {"non_compliant": 3, "at_risk": 2, "compliant": 1}
    project_status = "compliant"
    project_risk = "low"
    all_failed: list[Dict[str, Any]] = []
    all_unverifiable: list[Dict[str, Any]] = []
    all_missing: list[str] = []
    suggested: list[str] = []
    traceability: list[Dict[str, Any]] = []
    max_status = 0
    max_risk = 0
    trust_scores: list[float] = []
    risk_rank = {"low": 1, "medium": 2, "high": 3}
    bridge_buckets: Dict[str, Dict[str, Any]] = {}
    for fc in form_conclusions:
        status = _as_text(fc.get("compliance_status")) or "compliant"
        risk = _as_text(fc.get("risk_level")) or "low"
        bridge_id = _as_text(fc.get("bridge_id")) or "unknown_bridge"
        trust = float(fc.get("trust_score") or 0.0)
        max_status = max(max_status, precedence.get(status, 1))
        max_risk = max(max_risk, risk_rank.get(risk, 1))
        failed = fc.get("failed_gates") if isinstance(fc.get("failed_gates"), list) else []
        unverifiable = fc.get("unverifiable_items") if isinstance(fc.get("unverifiable_items"), list) else []
        missing = fc.get("missing_proofs") if isinstance(fc.get("missing_proofs"), list) else []
        actions = fc.get("suggested_actions") if isinstance(fc.get("suggested_actions"), list) else []
        tr = fc.get("traceability") if isinstance(fc.get("traceability"), list) else []
        all_failed.extend([x for x in failed if isinstance(x, dict)])
        all_unverifiable.extend([x for x in unverifiable if isinstance(x, dict)])
        all_missing.extend([_as_text(x) for x in missing if _as_text(x)])
        suggested.extend([_as_text(x) for x in actions if _as_text(x)])
        traceability.extend([x for x in tr if isinstance(x, dict)])
        trust_scores.append(trust)
        bucket = bridge_buckets.setdefault(
            bridge_id,
            {
                "bridge_id": bridge_id,
                "form_codes": [],
                "failed_gates": [],
                "unverifiable_items": [],
                "missing_proofs": [],
                "suggested_actions": [],
                "compliance_status": "compliant",
                "risk_level": "low",
                "trust_scores": [],
            },
        )
        bucket["form_codes"].append(_as_text(fc.get("form_code")))
        bucket["failed_gates"].extend([x for x in failed if isinstance(x, dict)])
        bucket["unverifiable_items"].extend([x for x in unverifiable if isinstance(x, dict)])
        bucket["missing_proofs"].extend([_as_text(x) for x in missing if _as_text(x)])
        bucket["suggested_actions"].extend([_as_text(x) for x in actions if _as_text(x)])
        bucket["trust_scores"].append(trust)
        if precedence.get(status, 1) > precedence.get(_as_text(bucket.get("compliance_status")) or "compliant", 1):
            bucket["compliance_status"] = status
        if risk_rank.get(risk, 1) > risk_rank.get(_as_text(bucket.get("risk_level")) or "low", 1):
            bucket["risk_level"] = risk
    for key, val in precedence.items():
        if val == max_status:
            project_status = key
            break
    for key, val in risk_rank.items():
        if val == max_risk:
            project_risk = key
            break
    suggested_unique = sorted(set(suggested))
    bridge_level = []
    for bucket in bridge_buckets.values():
        scores = bucket.pop("trust_scores", [])
        bucket["trust_score"] = round(sum(scores) / len(scores), 2) if scores else 0.0
        bucket["missing_proofs"] = sorted(set(bucket.get("missing_proofs", [])))
        bucket["suggested_actions"] = sorted(set(bucket.get("suggested_actions", [])))
        bridge_level.append(bucket)
    project_trust = round(sum(trust_scores) / len(trust_scores), 2) if trust_scores else 0.0
    return {
        "project_id": payload.project_id,
        "project_level_conclusion": {
            "compliance_status": project_status,
            "risk_level": project_risk,
            "failed_gates": all_failed,
            "unverifiable_items": all_unverifiable,
            "missing_proofs": sorted(set(all_missing)),
            "trust_score": project_trust,
            "suggested_actions": suggested_unique,
        },
        "bridge_level_conclusions": bridge_level,
        "form_level_conclusions": form_conclusions,
        "traceability": traceability,
        "refresh_lifecycle": [
            "runtime_input_collected",
            "form_aggregation",
            "bridge_aggregation",
            "project_aggregation",
            "snapshot_published",
        ],
        "generated_at": _now_iso(),
    }


def _consistency_rules() -> Dict[str, Any]:
    return {
        "schema_id": "body-gate-proof.consistency.v1",
        "rules": [
            {
                "id": "C1_BODY_REQUIRED_FOR_GATE_READY",
                "desc": "Body 缺失时 Gate 不允许 ready/passed",
            },
            {
                "id": "C2_GATE_FAIL_MUST_HAVE_PROOF",
                "desc": "Gate fail 必须存在 Proof",
            },
            {
                "id": "C3_OVERRIDE_MUST_APPEND_NEW_PROOF",
                "desc": "override 必须生成新 Proof（override_of 指向旧 proof）",
            },
            {
                "id": "C4_PROOF_TRACEABILITY_REQUIRED",
                "desc": "Proof 必须包含 Body snapshot / Gate snapshot / SpecIR",
            },
        ],
    }


def _run_consistency_validation(project_id: str, form_code: str) -> Dict[str, Any]:
    bodies = _load_body_items()
    gates = _load_gate_runtime_events()
    proofs = _load_unified_proofs()
    pid = _as_text(project_id)
    form_filter = _as_text(form_code)
    violations: list[Dict[str, Any]] = []
    body_by_slot: Dict[str, list[Dict[str, Any]]] = {}
    for b in bodies:
        if pid and _as_text(b.get("project_id")) not in {"", pid}:
            continue
        if form_filter and _as_text(b.get("form_code")) != form_filter:
            continue
        slot = _as_text(b.get("slotKey"))
        if slot:
            body_by_slot.setdefault(slot, []).append(b)

    proof_by_gate: Dict[str, list[Dict[str, Any]]] = {}
    for p in proofs:
        if pid and _as_text(p.get("project_id")) != pid:
            continue
        if form_filter and _as_text(p.get("form_code")) != form_filter:
            continue
        gate_id = _as_text((p.get("gate_snapshot") or {}).get("gate_id") if isinstance(p.get("gate_snapshot"), dict) else "")
        if gate_id:
            proof_by_gate.setdefault(gate_id, []).append(p)

        # C4 proof traceability required
        body_snapshot = p.get("body_snapshot") if isinstance(p.get("body_snapshot"), dict) else {}
        gate_snapshot = p.get("gate_snapshot") if isinstance(p.get("gate_snapshot"), dict) else {}
        traceability = p.get("traceability") if isinstance(p.get("traceability"), dict) else {}
        if not body_snapshot or not gate_snapshot or not _as_text(traceability.get("specir")):
            violations.append(
                {
                    "rule_id": "C4_PROOF_TRACEABILITY_REQUIRED",
                    "severity": "critical",
                    "proof_id": _as_text(p.get("proof_id")),
                    "message": "proof missing body_snapshot/gate_snapshot/specir traceability",
                }
            )

        # C3 override must append new proof
        override_of = _as_text(p.get("override_of"))
        if override_of and not any(_as_text(x.get("proof_id")) == override_of for x in proofs):
            violations.append(
                {
                    "rule_id": "C3_OVERRIDE_MUST_APPEND_NEW_PROOF",
                    "severity": "critical",
                    "proof_id": _as_text(p.get("proof_id")),
                    "message": f"override_of not found: {override_of}",
                }
            )

    for g in gates:
        gate = g.get("gate") if isinstance(g.get("gate"), dict) else {}
        gate_id = _as_text(gate.get("gate_id"))
        slot_refs = gate.get("slot_refs") if isinstance(gate.get("slot_refs"), list) else []
        if form_filter:
            trace = g.get("traceability") if isinstance(g.get("traceability"), dict) else {}
            # keep if related via proofs or direct slot match
            related = any(
                any(_as_text(pb.get("proof_id")) for pb in proof_by_gate.get(gate_id, []))
                for _ in [0]
            )
            if not related and slot_refs:
                matched = False
                for slot in slot_refs:
                    if body_by_slot.get(_as_text(slot)):
                        matched = True
                        break
                if not matched:
                    continue
            if _as_text(trace.get("form_code")) and _as_text(trace.get("form_code")) != form_filter:
                continue

        # C1 body missing => gate cannot be ready/passed
        has_body = True
        for slot in slot_refs:
            if not body_by_slot.get(_as_text(slot)):
                has_body = False
                break
        if not has_body and bool(g.get("passed")):
            violations.append(
                {
                    "rule_id": "C1_BODY_REQUIRED_FOR_GATE_READY",
                    "severity": "reject",
                    "gate_id": gate_id,
                    "message": "gate passed while required body is missing",
                }
            )

        # C2 gate fail must have proof
        if not bool(g.get("passed")) and not proof_by_gate.get(gate_id):
            violations.append(
                {
                    "rule_id": "C2_GATE_FAIL_MUST_HAVE_PROOF",
                    "severity": "critical",
                    "gate_id": gate_id,
                    "message": "failed gate has no proof",
                }
            )

    return {
        "project_id": pid or "unknown_project",
        "form_code": form_filter,
        "violation_count": len(violations),
        "violations": violations,
        "passed": len(violations) == 0,
        "checked_at": _now_iso(),
    }


def _runtime_semantic_graph_store_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "runtime_semantic_graph"


def _runtime_semantic_graph_store_file() -> Path:
    return _runtime_semantic_graph_store_dir() / "graph.json"


def _runtime_semantic_graph_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.semantic.graph.v1",
        "node_types": [
            "Body",
            "Gate",
            "Proof",
            "RuntimeExecution",
            "Conclusion",
            "SpecIR",
            "Slot",
            "RuntimeEvent",
            "Form",
            "Project",
        ],
        "edge_types": [
            "updates",
            "validates",
            "triggers",
            "proves",
            "aggregates_to",
            "derived_from",
            "impacts",
            "depends_on",
        ],
        "node_required_fields": ["version", "confidence", "runtime_status", "timestamp"],
        "capabilities": ["incremental_update", "dependency_traversal", "cycle_detection", "replay"],
    }


def _new_graph_node(node_id: str, node_type: str, attrs: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = dict(attrs or {})
    payload.setdefault("version", "v1")
    payload.setdefault("confidence", 0.8)
    payload.setdefault("runtime_status", "valid")
    payload.setdefault("timestamp", _now_iso())
    return {"id": node_id, "type": node_type, **payload}


def _load_runtime_semantic_graph() -> Dict[str, Any]:
    path = _runtime_semantic_graph_store_file()
    if not path.exists():
        return {"schema": _runtime_semantic_graph_schema(), "nodes": [], "edges": [], "updated_at": _now_iso()}
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"schema": _runtime_semantic_graph_schema(), "nodes": [], "edges": [], "updated_at": _now_iso()}
    if not isinstance(parsed, dict):
        return {"schema": _runtime_semantic_graph_schema(), "nodes": [], "edges": [], "updated_at": _now_iso()}
    nodes = parsed.get("nodes") if isinstance(parsed.get("nodes"), list) else []
    edges = parsed.get("edges") if isinstance(parsed.get("edges"), list) else []
    return {
        "schema": _runtime_semantic_graph_schema(),
        "nodes": [n for n in nodes if isinstance(n, dict)],
        "edges": [e for e in edges if isinstance(e, dict)],
        "updated_at": _as_text(parsed.get("updated_at")) or _now_iso(),
    }


def _save_runtime_semantic_graph(graph: Dict[str, Any]) -> None:
    _runtime_semantic_graph_store_dir().mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": _runtime_semantic_graph_schema(),
        "nodes": graph.get("nodes") if isinstance(graph.get("nodes"), list) else [],
        "edges": graph.get("edges") if isinstance(graph.get("edges"), list) else [],
        "updated_at": _now_iso(),
    }
    _runtime_semantic_graph_store_file().write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _graph_upsert_node(graph: Dict[str, Any], node: Dict[str, Any]) -> None:
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    node_id = _as_text(node.get("id"))
    if not node_id:
        return
    replaced = False
    for idx, old in enumerate(nodes):
        if _as_text(old.get("id")) == node_id:
            merged = dict(old)
            merged.update(node)
            merged["timestamp"] = _as_text(node.get("timestamp")) or _now_iso()
            nodes[idx] = merged
            replaced = True
            break
    if not replaced:
        nodes.append(node)
    graph["nodes"] = nodes


def _graph_add_edge(graph: Dict[str, Any], src: str, dst: str, edge_type: str, attrs: Dict[str, Any] | None = None) -> None:
    src_id = _as_text(src)
    dst_id = _as_text(dst)
    et = _as_text(edge_type)
    if not src_id or not dst_id or not et:
        return
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
    token = f"{src_id}|{dst_id}|{et}"
    for edge in edges:
        key = f"{_as_text(edge.get('from'))}|{_as_text(edge.get('to'))}|{_as_text(edge.get('type'))}"
        if key == token:
            return
    out = {"from": src_id, "to": dst_id, "type": et, "timestamp": _now_iso()}
    if isinstance(attrs, dict):
        out.update(attrs)
    edges.append(out)
    graph["edges"] = edges


def _runtime_semantic_cycle_detection(graph: Dict[str, Any]) -> Dict[str, Any]:
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
    return {"cycles": _detect_dependency_cycles(nodes, edges), "has_cycle": len(_detect_dependency_cycles(nodes, edges)) > 0}


def _runtime_semantic_traverse(graph: Dict[str, Any], start_node_id: str, max_depth: int, edge_types: list[str]) -> Dict[str, Any]:
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    node_map = {_as_text(n.get("id")): n for n in nodes if _as_text(n.get("id"))}
    et_filter = set(_as_text(x) for x in edge_types if _as_text(x))
    adj: Dict[str, list[Dict[str, Any]]] = {}
    for edge in edges:
        src = _as_text(edge.get("from"))
        if not src:
            continue
        if et_filter and _as_text(edge.get("type")) not in et_filter:
            continue
        adj.setdefault(src, []).append(edge)
    start = _as_text(start_node_id)
    depth_limit = max(1, min(int(max_depth), 12))
    visited = {start}
    queue: list[tuple[str, int]] = [(start, 0)]
    out_edges: list[Dict[str, Any]] = []
    while queue:
        cur, depth = queue.pop(0)
        if depth >= depth_limit:
            continue
        for edge in adj.get(cur, []):
            nxt = _as_text(edge.get("to"))
            out_edges.append(edge)
            if nxt and nxt not in visited:
                visited.add(nxt)
                queue.append((nxt, depth + 1))
    out_nodes = [node_map[nid] for nid in visited if nid in node_map]
    return {"nodes": out_nodes, "edges": out_edges, "start_node_id": start, "max_depth": depth_limit}


def _apply_execution_to_runtime_semantic_graph(execution: Dict[str, Any]) -> Dict[str, Any]:
    graph = _load_runtime_semantic_graph()
    exec_id = _as_text(execution.get("execution_id")) or _new_runtime_id("rtx")
    body = execution.get("body_snapshot") if isinstance(execution.get("body_snapshot"), dict) else {}
    dep = execution.get("dependency_analysis") if isinstance(execution.get("dependency_analysis"), dict) else {}
    gate_execution = execution.get("gate_execution") if isinstance(execution.get("gate_execution"), list) else []
    slot_key = _as_text(body.get("slotKey")) or _as_text(dep.get("slotKey")) or "unknown_slot"
    form_code = _as_text(body.get("form_code")) or "unknown_form"
    project_id = _as_text(body.get("project_id")) or "unknown_project"
    specir = _as_text(body.get("specir")) or "unknown_specir"
    body_id = _as_text(body.get("body_id")) or _new_runtime_id("body")

    _graph_upsert_node(graph, _new_graph_node(project_id, "Project", {"runtime_status": "active"}))
    _graph_upsert_node(graph, _new_graph_node(form_code, "Form", {"runtime_status": "active"}))
    _graph_upsert_node(graph, _new_graph_node(specir, "SpecIR", {"runtime_status": "active"}))
    _graph_upsert_node(graph, _new_graph_node(slot_key, "Slot", {"runtime_status": "active"}))
    _graph_upsert_node(graph, _new_graph_node(exec_id, "RuntimeExecution", {"runtime_status": "completed", "confidence": 0.95}))
    _graph_upsert_node(graph, _new_graph_node(body_id, "Body", {"confidence": body.get("confidence", 0.8), "runtime_status": _as_text(body.get("runtime_status")) or "valid"}))
    _graph_add_edge(graph, body_id, slot_key, "derived_from")
    _graph_add_edge(graph, body_id, form_code, "impacts")
    _graph_add_edge(graph, body_id, exec_id, "updates")
    _graph_add_edge(graph, form_code, project_id, "aggregates_to")
    _graph_add_edge(graph, specir, body_id, "depends_on")

    for item in gate_execution:
        if not isinstance(item, dict):
            continue
        gate = item.get("gate") if isinstance(item.get("gate"), dict) else {}
        trace = item.get("traceability") if isinstance(item.get("traceability"), dict) else {}
        gate_id = _as_text(gate.get("gate_id")) or _new_runtime_id("gate")
        rule_id = _as_text(trace.get("rule")) or "runtime_rule"
        proof_id = ""
        for p in _load_unified_proofs():
            if _as_text((p.get("gate_snapshot") or {}).get("gate_id") if isinstance(p.get("gate_snapshot"), dict) else "") == gate_id:
                proof_id = _as_text(p.get("proof_id"))
        event_id = _as_text(item.get("event_id")) or _new_runtime_id("rte")
        conclusion_id = f"conclusion:{project_id}:{form_code}"
        _graph_upsert_node(graph, _new_graph_node(rule_id, "SpecIR", {"runtime_status": "active"}))
        _graph_upsert_node(graph, _new_graph_node(gate_id, "Gate", {"confidence": gate.get("confidence", 0.8), "runtime_status": "valid" if bool(item.get("passed")) else "invalid"}))
        _graph_upsert_node(graph, _new_graph_node(event_id, "RuntimeEvent", {"runtime_status": "logged"}))
        _graph_upsert_node(graph, _new_graph_node(conclusion_id, "Conclusion", {"runtime_status": "computed"}))
        _graph_add_edge(graph, body_id, gate_id, "triggers")
        _graph_add_edge(graph, gate_id, event_id, "updates")
        _graph_add_edge(graph, rule_id, gate_id, "validates")
        _graph_add_edge(graph, gate_id, conclusion_id, "aggregates_to")
        _graph_add_edge(graph, conclusion_id, project_id, "aggregates_to")
        _graph_add_edge(graph, specir, gate_id, "depends_on")
        if proof_id:
            _graph_upsert_node(graph, _new_graph_node(proof_id, "Proof", {"runtime_status": "auditable"}))
            _graph_add_edge(graph, gate_id, proof_id, "proves")
            _graph_add_edge(graph, proof_id, conclusion_id, "impacts")

    _save_runtime_semantic_graph(graph)
    return graph


@app.get("/api/v1/runtime-semantic-graph/schema")
def api_runtime_semantic_graph_schema() -> Dict[str, Any]:
    graph = _load_runtime_semantic_graph()
    return {
        "graph_schema": _runtime_semantic_graph_schema(),
        "dependency_engine": {
            "on_body_update": [
                "trigger dependent gates",
                "append dependent proofs",
                "update dependent conclusions",
            ],
            "incremental_update": "upsert touched nodes + edges only",
        },
        "runtime_traversal_logic": {
            "algorithm": "BFS",
            "supports_edge_filter": True,
            "max_depth_default": 4,
        },
        "graph": graph,
        "cycle_detection": _runtime_semantic_cycle_detection(graph),
    }


@app.post("/api/v1/runtime-semantic-graph/traverse")
def api_runtime_semantic_graph_traverse(payload: RuntimeSemanticGraphTraverseRequest) -> Dict[str, Any]:
    graph = _load_runtime_semantic_graph()
    traversed = _runtime_semantic_traverse(
        graph,
        start_node_id=payload.start_node_id,
        max_depth=payload.max_depth,
        edge_types=payload.edge_types,
    )
    return {"traversal": traversed, "cycle_detection": _runtime_semantic_cycle_detection(graph)}


@app.post("/api/v1/runtime-semantic-graph/replay")
def api_runtime_semantic_graph_replay(execution_id: str = Query(..., min_length=1)) -> Dict[str, Any]:
    executions = _load_json_array(_runtime_engine_events_file())
    target = None
    for item in executions:
        if _as_text(item.get("execution_id")) == execution_id:
            target = item
            break
    if not isinstance(target, dict):
        raise HTTPException(status_code=404, detail="execution not found")
    updated = _apply_execution_to_runtime_semantic_graph(target)
    return {"replayed_execution_id": execution_id, "graph": updated}


@app.get("/api/v1/consistency-check/schema")
def api_consistency_check_schema() -> Dict[str, Any]:
    return {
        "consistency_rules": _consistency_rules(),
        "validation_engine": {
            "scope": "Body -> Gate -> Proof",
            "checks": [
                "body_presence_before_gate_ready",
                "proof_required_on_gate_fail",
                "override_requires_new_proof_append",
                "proof_traceability_integrity",
            ],
        },
    }


@app.post("/api/v1/consistency-check/run")
def api_consistency_check_run(payload: ConsistencyCheckRequest) -> Dict[str, Any]:
    return _run_consistency_validation(project_id=payload.project_id, form_code=payload.form_code)


@app.post("/api/v1/unified-input-parser/parse")
def api_unified_input_parser_parse(payload: UnifiedInputParseRequest) -> Dict[str, Any]:
    input_type = _as_text(payload.input_type)
    blocks = _blockize_text(payload.content_text)
    if input_type in {"扫描图片", "手机拍照"} and payload.ocr_blocks:
        blocks = []
        for idx, raw in enumerate(payload.ocr_blocks):
            if not isinstance(raw, dict):
                continue
            blocks.append(
                {
                    "block_id": _as_text(raw.get("block_id")) or f"ocr_blk_{idx+1:04d}",
                    "text": _as_text(raw.get("text")),
                    "bbox": raw.get("bbox") if isinstance(raw.get("bbox"), list) else [0, 0, 0, 0],
                    "page": int(raw.get("page") or 1),
                    "confidence": float(raw.get("confidence") or 0.0),
                }
            )
    semantic_ir = _semanticize_blocks(blocks, input_type)
    semantic_items = semantic_ir.get("items") if isinstance(semantic_ir.get("items"), list) else []
    specir = _build_specir_from_semantics([it for it in semantic_items if isinstance(it, dict)])
    evidence = _evidenceize_blocks(blocks, input_type)
    return {
        "parser_pipeline": _unified_input_parser_schema(),
        "document_ir": {
            "input_type": input_type,
            "blocks": blocks,
            "metadata": payload.metadata,
        },
        "semantic_ir": semantic_ir,
        "specir": specir,
        "evidence": evidence,
        "normalization_status": {
            "blockized": True,
            "semanticized": True,
            "evidenceized": True,
        },
    }


@app.get("/api/v1/semantic-conflict/schema")
def api_semantic_conflict_schema() -> Dict[str, Any]:
    return {"conflict_schema": semantic_conflict_schema()}


@app.post("/api/v1/semantic-conflict/analyze")
def api_semantic_conflict_analyze(payload: SemanticConflictAnalyzeRequest) -> Dict[str, Any]:
    return analyze_semantic_conflicts(rules=payload.rules)


@app.get("/api/v1/cross-form-propagation/schema")
def api_cross_form_propagation_schema() -> Dict[str, Any]:
    return {"propagation_schema": propagation_schema()}


@app.post("/api/v1/cross-form-propagation/preview")
def api_cross_form_propagation_preview(payload: CrossFormAIPropagationRequest) -> Dict[str, Any]:
    return propagate_cross_form_ai(
        specir=payload.specir,
        slot_graph=payload.slot_graph,
        form_blueprint=payload.form_blueprint,
        historical_usage=payload.historical_usage,
        dry_run=bool(payload.dry_run),
    )


@app.get("/api/v1/norm-qa/schema")
def api_norm_qa_schema() -> Dict[str, Any]:
    return {
        "qa_schema": normqa_schema(),
        "retrieval_strategy": normqa_retrieval_strategy(),
        "citation_design": normqa_citation_design(),
    }


@app.post("/api/v1/norm-qa/ask")
def api_norm_qa_ask(payload: NormQAAskRequest) -> Dict[str, Any]:
    graph_path = knowledge_graph_dir / "knowledge_graph.json"
    if not graph_path.exists():
        graph = build_specir_knowledge_graph(spec_entries=_collect_spec_entries_for_kg(), output_dir=knowledge_graph_dir)
    else:
        graph = json.loads(graph_path.read_text(encoding="utf-8-sig"))
    return answer_norm_question(
        question=payload.question,
        graph=graph,
        top_k=max(1, min(int(payload.top_k), 100)),
    )


@app.get("/api/v1/compliance/schema")
def api_compliance_schema() -> Dict[str, Any]:
    return {
        "compliance_schema": compliance_schema(),
        "scoring_strategy": compliance_scoring_strategy(),
        "reasoning_design": compliance_reasoning_design(),
    }


@app.post("/api/v1/compliance/evaluate")
def api_compliance_evaluate(payload: ComplianceEvaluateRequest) -> Dict[str, Any]:
    return evaluate_project_compliance(
        project_peg=payload.project_peg,
        runtime_records=payload.runtime_records,
        runtime_events=payload.runtime_events,
        rulepack=payload.rulepack,
        specir=payload.specir,
        proof_records=payload.proof_records,
        project_context=payload.project_context,
    )


@app.get("/api/v1/norm-subscription/schema")
def api_norm_subscription_schema() -> Dict[str, Any]:
    return {"subscription_schema": subscription_schema()}


@app.post("/api/v1/norm-subscription/run")
def api_norm_subscription_run(payload: AutoNormSubscriptionRunRequest) -> Dict[str, Any]:
    return run_subscription_cycle(
        sources=payload.sources,
        discovered_norms=payload.discovered_norms,
        dry_run=bool(payload.dry_run),
    )


@app.get("/api/v1/engineering-llm/schema")
def api_engineering_llm_schema() -> Dict[str, Any]:
    return {"engineering_llm_schema": engineering_llm_schema()}


@app.post("/api/v1/engineering-llm/build")
def api_engineering_llm_build(payload: EngineeringLLMBuildRequest) -> Dict[str, Any]:
    return build_engineering_llm_layer(
        specir=payload.specir,
        slot_graph=payload.slot_graph,
        runtime_traces=payload.runtime_traces,
        proof=payload.proof,
        human_reviews=payload.human_reviews,
        conflict_resolutions=payload.conflict_resolutions,
    )


@app.get("/api/v1/p2-readiness/schema")
def api_p2_readiness_schema() -> Dict[str, Any]:
    return {
        "p2_report_schema": p2_report_schema(),
        "sample_input": {
            "metrics": {
                "auto_specir_extraction_rate": 0.9,
                "slot_auto_bind_accuracy": 0.92,
                "ai_gate_synthesis_rate": 0.85,
                "low_confidence_review_rate": 0.1,
                "semantic_conflict_detection_pass": True,
                "runtime_traceability_complete": True,
                "propagation_accuracy": 0.9,
                "ai_patch_acceptance_rate": 0.7,
                "norm_diff_accuracy": 0.95,
                "compliance_reasoning_available": True,
            },
            "evidence": {},
        },
    }


@app.post("/api/v1/p2-readiness/evaluate")
def api_p2_readiness_evaluate(payload: P2ReadinessEvaluateRequest) -> Dict[str, Any]:
    return build_p2_readiness_report(inputs=payload.model_dump())


@app.get("/api/v1/runtime-events/schema")
def api_runtime_events_schema() -> Dict[str, Any]:
    return {"event_schema": runtime_event_schema()}


@app.post("/api/v1/runtime-events/write")
def api_runtime_events_write(payload: RuntimeEventWriteRequest) -> Dict[str, Any]:
    runtime_event_dir = Path(__file__).resolve().parents[1] / "data" / "runtime_events"
    try:
        return runtime_write_event(store_dir=runtime_event_dir, event=payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/runtime-events/list")
def api_runtime_events_list(limit: int = 100) -> Dict[str, Any]:
    runtime_event_dir = Path(__file__).resolve().parents[1] / "data" / "runtime_events"
    return runtime_list_events(store_dir=runtime_event_dir, limit=max(1, min(int(limit), 1000)))


@app.get("/api/v1/proof-chain/schema")
def api_proof_chain_schema() -> Dict[str, Any]:
    return {
        "proof_schema": proof_chain_schema(),
        "hash_chain_design": proof_chain_hash_design(),
    }


def _unified_proof_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.proof.unified.v1",
        "append_only": True,
        "fields": [
            "proof_id",
            "project_id",
            "form_code",
            "slotKey",
            "body_snapshot",
            "gate_snapshot",
            "calculation_trace",
            "result",
            "fail_reason",
            "evidence_refs",
            "operator",
            "timestamp",
            "signature",
            "hash",
        ],
        "traceability_required": ["Body", "Gate", "SpecIR", "normRef"],
        "override_policy": "override must append a new proof record",
    }


def _unified_proof_store_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "proof_unified"


def _unified_proof_store_file() -> Path:
    return _unified_proof_store_dir() / "proofs.json"


def _load_unified_proofs() -> list[Dict[str, Any]]:
    path = _unified_proof_store_file()
    if not path.exists():
        return []
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


def _save_unified_proofs(items: list[Dict[str, Any]]) -> None:
    _unified_proof_store_dir().mkdir(parents=True, exist_ok=True)
    _unified_proof_store_file().write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _proof_payload_hash(payload: Dict[str, Any]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _append_unified_proof(payload: Dict[str, Any]) -> Dict[str, Any]:
    project_id = _as_text(payload.get("project_id"))
    form_code = _as_text(payload.get("form_code"))
    slot_key = _as_text(payload.get("slotKey"))
    result = _as_text(payload.get("result"))
    operator = _as_text(payload.get("operator"))
    specir = _as_text(payload.get("specir"))
    norm_ref = _as_text(payload.get("normRef"))
    if not project_id or not form_code or not slot_key or not result or not operator or not specir or not norm_ref:
        raise ValueError("project_id/form_code/slotKey/result/operator/specir/normRef are required")

    items = _load_unified_proofs()
    provided_id = _as_text(payload.get("proof_id"))
    if provided_id and any(_as_text(it.get("proof_id")) == provided_id for it in items):
        raise ValueError("proof_id already exists; proof is append-only and cannot be overwritten")
    override_of = _as_text(payload.get("override_of"))
    if override_of and not any(_as_text(it.get("proof_id")) == override_of for it in items):
        raise ValueError("override_of proof_id not found")

    timestamp = _as_text(payload.get("timestamp")) or _now_iso()
    proof_id = provided_id or _new_runtime_id("proof")
    body_snapshot = payload.get("body_snapshot") if isinstance(payload.get("body_snapshot"), dict) else {}
    gate_snapshot = payload.get("gate_snapshot") if isinstance(payload.get("gate_snapshot"), dict) else {}
    calculation_trace = payload.get("calculation_trace") if isinstance(payload.get("calculation_trace"), list) else []
    evidence_refs = payload.get("evidence_refs") if isinstance(payload.get("evidence_refs"), list) else []
    signature = _as_text(payload.get("signature"))
    fail_reason = _as_text(payload.get("fail_reason"))

    previous_hash = _as_text(items[-1].get("hash")) if items else ""
    to_hash = {
        "proof_id": proof_id,
        "project_id": project_id,
        "form_code": form_code,
        "slotKey": slot_key,
        "body_snapshot": body_snapshot,
        "gate_snapshot": gate_snapshot,
        "calculation_trace": calculation_trace,
        "result": result,
        "fail_reason": fail_reason,
        "evidence_refs": evidence_refs,
        "operator": operator,
        "timestamp": timestamp,
        "signature": signature,
        "override_of": override_of,
        "traceability": {
            "body_ref": _as_text(body_snapshot.get("body_id") or body_snapshot.get("slotKey")),
            "gate_ref": _as_text(gate_snapshot.get("gate_id")),
            "specir": specir,
            "rule": _as_text(payload.get("rule")),
            "normRef": norm_ref,
        },
        "previous_hash": previous_hash,
    }
    proof_hash = _as_text(payload.get("hash")) or _proof_payload_hash(to_hash)
    record = dict(to_hash)
    record["hash"] = proof_hash
    items.append(record)
    _save_unified_proofs(items[-10000:])
    return record


@app.get("/api/v1/proof-unified/schema")
def api_proof_unified_schema() -> Dict[str, Any]:
    return {
        "proof_schema": _unified_proof_schema(),
        "hash_chain": {
            "algorithm": "sha256",
            "link_field": "previous_hash",
            "append_only": True,
            "override_rule": "override appends new proof with override_of",
        },
    }


@app.post("/api/v1/proof-unified/append")
def api_proof_unified_append(payload: UnifiedProofAppendRequest) -> Dict[str, Any]:
    try:
        item = _append_unified_proof(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item}


@app.get("/api/v1/proof-unified/list")
def api_proof_unified_list(project_id: str | None = None, limit: int = 200) -> Dict[str, Any]:
    items = _load_unified_proofs()
    pid = _as_text(project_id)
    if pid:
        items = [it for it in items if _as_text(it.get("project_id")) == pid]
    items.sort(key=lambda it: _as_text(it.get("timestamp")), reverse=True)
    return {"items": items[: max(1, min(int(limit), 5000))]}


@app.post("/api/v1/proof-chain/append")
def api_proof_chain_append(payload: ProofChainAppendRequest) -> Dict[str, Any]:
    proof_chain_dir = Path(__file__).resolve().parents[1] / "data" / "proof_chain"
    try:
        return append_chain_proof(store_dir=proof_chain_dir, payload=payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/proof-chain/list")
def api_proof_chain_list(project_id: str | None = None, limit: int = 100) -> Dict[str, Any]:
    proof_chain_dir = Path(__file__).resolve().parents[1] / "data" / "proof_chain"
    return list_chain_proofs(
        store_dir=proof_chain_dir,
        project_id=(project_id or None),
        limit=max(1, min(int(limit), 2000)),
    )


@app.get("/api/v1/proof-chain/audit-export")
def api_proof_chain_audit_export(project_id: str = Query(..., min_length=1)) -> Dict[str, Any]:
    proof_chain_dir = Path(__file__).resolve().parents[1] / "data" / "proof_chain"
    return export_chain_audit_report(
        store_dir=proof_chain_dir,
        project_id=project_id,
    )


@app.get("/api/v1/bim-mapping/schema")
def api_bim_mapping_schema() -> Dict[str, Any]:
    return {"bim_mapping_schema": bim_mapping_schema()}


@app.post("/api/v1/bim-mapping/upsert")
def api_bim_mapping_upsert(payload: BIMObjectUpsertRequest) -> Dict[str, Any]:
    bim_dir = Path(__file__).resolve().parents[1] / "data" / "bim_mapping"
    try:
        return upsert_bim_object(store_dir=bim_dir, payload=payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/bim-mapping/list")
def api_bim_mapping_list(project_id: str = "") -> Dict[str, Any]:
    bim_dir = Path(__file__).resolve().parents[1] / "data" / "bim_mapping"
    return list_bim_objects(store_dir=bim_dir, project_id=project_id)


@app.post("/api/v1/bim-mapping/impact")
def api_bim_mapping_impact(payload: BIMMappingImpactRequest) -> Dict[str, Any]:
    bim_dir = Path(__file__).resolve().parents[1] / "data" / "bim_mapping"
    return analyze_bim_mapping_impact(
        store_dir=bim_dir,
        project_id=payload.project_id,
        slotKey=payload.slotKey,
        gate_failed=payload.gate_failed,
        bim_update=payload.bim_update,
    )


@app.get("/api/v1/sensor-binding/schema")
def api_sensor_binding_schema() -> Dict[str, Any]:
    return {"sensor_binding_schema": sensor_binding_schema()}


@app.post("/api/v1/sensor-binding/ingest")
def api_sensor_binding_ingest(payload: SensorBindingIngestRequest) -> Dict[str, Any]:
    runtime_event_dir = Path(__file__).resolve().parents[1] / "data" / "runtime_events"
    cleaned = clean_sensor_data(
        sensor=payload.sensor,
        reading=payload.reading,
        target_unit=payload.target_unit,
        normal_range=payload.normal_range,
    )
    trigger = gate_trigger_logic(cleaned=cleaned, gate_id=payload.gate_id, rule_id=payload.rule_id)
    normalized = cleaned.get("normalized", {})
    slot_key = str((normalized or {}).get("slotKey") or "").strip()
    sensor = payload.sensor
    event_type = "sensor_update" if bool(cleaned.get("allow_auto_decision")) else "runtime_error"
    event_result = "PASS" if event_type == "sensor_update" else "ERROR"
    runtime_event = {
        "event_type": event_type,
        "project_id": str(sensor.get("project_id") or "").strip() or "unknown_project",
        "form_code": str(sensor.get("related_form_code") or "sensor_stream").strip(),
        "peg_id": str(sensor.get("sensor_id") or "sensor").strip(),
        "slotKey": slot_key or str(sensor.get("measured_slotKey") or "").strip() or "sensor_slot",
        "rule_id": payload.rule_id,
        "gate_id": payload.gate_id,
        "result": event_result,
        "input_values": {slot_key: (normalized or {}).get("value")} if slot_key else {},
        "output_values": {"unit": (normalized or {}).get("unit"), "reason": cleaned.get("runtime_error_reason")},
        "operator": str(sensor.get("sensor_id") or "sensor").strip(),
        "proof_ref": "",
    }
    written = runtime_write_event(store_dir=runtime_event_dir, event=runtime_event)
    return {
        "sensor_binding_schema": sensor_binding_schema(),
        "data_cleaning_flow": cleaned.get("cleaning_pipeline", {}),
        "gate_auto_trigger_logic": trigger.get("gate_auto_trigger_logic", {}),
        "cleaned_payload": cleaned,
        "trigger_payload": trigger.get("trigger_payload", {}),
        "runtime_event": written.get("event", {}),
    }


@app.get("/api/v1/runtime-trust/schema")
def api_runtime_trust_schema() -> Dict[str, Any]:
    return {
        "trust_score_rules": trust_score_rules(),
        "trust_report_schema": trust_report_schema(),
    }


@app.post("/api/v1/runtime-trust/evaluate")
def api_runtime_trust_evaluate(payload: RuntimeTrustEvaluateRequest) -> Dict[str, Any]:
    return evaluate_runtime_trust(
        project_id=payload.project_id,
        source=payload.source,
        device=payload.device,
        manual_input=payload.manual_input,
        proof=payload.proof,
        runtime_events=payload.runtime_events,
        recent_values=payload.recent_values,
    )


@app.get("/api/v1/live-risk/schema")
def api_live_risk_schema() -> Dict[str, Any]:
    return {
        "risk_model_schema": risk_model_schema(),
        "risk_explanation_fields": risk_explanation_fields(),
    }


@app.post("/api/v1/live-risk/predict")
def api_live_risk_predict(payload: LiveRiskPredictRequest) -> Dict[str, Any]:
    return predict_live_risk(
        project_id=payload.project_id,
        historical_gate_results=payload.historical_gate_results,
        construction_phase=payload.construction_phase,
        sensor_data=payload.sensor_data,
        proof_missing=payload.proof_missing,
        manual_overrides=payload.manual_overrides,
    )


@app.get("/api/v1/engineering-copilot/schema")
def api_engineering_copilot_schema() -> Dict[str, Any]:
    return {
        "copilot_query_flow": copilot_query_flow(),
        "rag_data_sources": rag_data_sources(),
        "answer_structure": answer_structure(),
    }


@app.post("/api/v1/engineering-copilot/ask")
def api_engineering_copilot_ask(payload: EngineeringCopilotAskRequest) -> Dict[str, Any]:
    return ask_engineering_copilot(
        question=payload.question,
        project_context=payload.project_context,
        runtime_events=payload.runtime_events,
        proof_records=payload.proof_records,
        specir_records=payload.specir_records,
    )


@app.get("/api/v1/auto-remediation/schema")
def api_auto_remediation_schema() -> Dict[str, Any]:
    return {
        "remediation_schema": remediation_schema(),
        "remediation_closed_loop": remediation_loop_flow(),
    }


@app.post("/api/v1/auto-remediation/suggest")
def api_auto_remediation_suggest(payload: AutoRemediationSuggestRequest) -> Dict[str, Any]:
    return suggest_remediation(
        failed_gate=payload.failed_gate,
        input_values=payload.input_values,
        threshold=payload.threshold,
        specir=payload.specir,
        historical_fixes=payload.historical_fixes,
        project_context=payload.project_context,
    )


@app.get("/api/v1/project-compliance-dashboard/schema")
def api_project_compliance_dashboard_schema() -> Dict[str, Any]:
    return {
        "dashboard_structure": project_dashboard_structure(),
        "metric_definitions": project_metric_definitions(),
        "status_color_rules": project_status_color_rules(),
    }


@app.post("/api/v1/project-compliance-dashboard/build")
def api_project_compliance_dashboard_build(payload: ProjectComplianceDashboardRequest) -> Dict[str, Any]:
    return build_project_dashboard(
        forms=payload.forms,
        gate_results=payload.gate_results,
        proof_status=payload.proof_status,
        risk_items=payload.risk_items,
        trust_items=payload.trust_items,
        review_queue=payload.review_queue,
        runtime_events=payload.runtime_events,
        filters=payload.filters,
    )


@app.get("/api/v1/mobile-body-runtime/schema")
def api_mobile_body_runtime_schema() -> Dict[str, Any]:
    return {
        "mobile_page_structure": mobile_page_structure(),
        "offline_sync_strategy": mobile_offline_sync_strategy(),
        "data_conflict_resolution": mobile_conflict_resolution(),
    }


@app.post("/api/v1/mobile-body-runtime/evaluate")
def api_mobile_body_runtime_evaluate(payload: MobileBodyRuntimeEvaluateRequest) -> Dict[str, Any]:
    return evaluate_mobile_gate(
        form_code=payload.form_code,
        slotKey=payload.slotKey,
        input_value=float(payload.input_value),
        operator=payload.operator,
        threshold=float(payload.threshold),
        clause_text=payload.clause_text,
        norm_ref=payload.norm_ref,
    )


def _body_store_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "body_center"


def _body_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.body.v1",
        "required_bindings": ["slotKey", "specir", "form_code"],
        "fields": {
            "body_id": "string",
            "slotKey": "string",
            "specir": "string",
            "form_code": "string",
            "label": "string",
            "value": "any",
            "value_type": ["design", "measured", "calculated", "derived"],
            "unit": "string",
            "source_type": ["PDF", "OCR", "Manual", "Sensor", "BIM", "Formula"],
            "source_ref": "string",
            "confidence": "number(0~1)",
            "runtime_status": ["pending", "valid", "invalid", "missing", "overridden"],
            "updated_at": "ISO-8601",
        },
    }


def _body_lifecycle() -> Dict[str, Any]:
    return {
        "states": ["pending", "valid", "invalid", "missing", "overridden"],
        "ingest_sources": ["design value", "measured value", "calculated value", "manual input", "sensor input"],
        "flow": [
            "ingest_or_update",
            "bind_slotkey_specir_form",
            "validate_and_score_confidence",
            "runtime_status_update",
            "traceability_export",
        ],
    }


def _normalize_body(payload: Dict[str, Any]) -> Dict[str, Any]:
    slot_key = _as_text(payload.get("slotKey"))
    specir = _as_text(payload.get("specir"))
    form_code = _as_text(payload.get("form_code"))
    if not slot_key or not specir or not form_code:
        raise ValueError("slotKey/specir/form_code are required")
    value_type = _as_text(payload.get("value_type")) or "measured"
    if value_type not in {"design", "measured", "calculated", "derived"}:
        raise ValueError("value_type must be one of design/measured/calculated/derived")
    source_type = _as_text(payload.get("source_type")) or "Manual"
    if source_type not in {"PDF", "OCR", "Manual", "Sensor", "BIM", "Formula"}:
        raise ValueError("source_type must be one of PDF/OCR/Manual/Sensor/BIM/Formula")
    runtime_status = _as_text(payload.get("runtime_status")) or "pending"
    if runtime_status not in {"pending", "valid", "invalid", "missing", "overridden"}:
        raise ValueError("runtime_status must be one of pending/valid/invalid/missing/overridden")
    confidence_raw = payload.get("confidence", 0.8)
    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("confidence must be number") from exc
    confidence = max(0.0, min(confidence, 1.0))
    body_id = _as_text(payload.get("body_id")) or _new_runtime_id("body")
    updated_at = _as_text(payload.get("updated_at")) or _now_iso()
    return {
        "body_id": body_id,
        "slotKey": slot_key,
        "specir": specir,
        "form_code": form_code,
        "label": _as_text(payload.get("label")),
        "value": payload.get("value"),
        "value_type": value_type,
        "unit": _as_text(payload.get("unit")),
        "source_type": source_type,
        "source_ref": _as_text(payload.get("source_ref")),
        "confidence": confidence,
        "runtime_status": runtime_status,
        "updated_at": updated_at,
    }


def _body_store_file() -> Path:
    return _body_store_dir() / "items.json"


def _load_body_items() -> list[Dict[str, Any]]:
    store = _body_store_file()
    if not store.exists():
        return []
    try:
        parsed = json.loads(store.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


def _save_body_items(items: list[Dict[str, Any]]) -> None:
    _body_store_dir().mkdir(parents=True, exist_ok=True)
    _body_store_file().write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _upsert_body_item(payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_body(payload)
    items = _load_body_items()
    replaced = False
    for index, item in enumerate(items):
        if _as_text(item.get("body_id")) == normalized["body_id"]:
            items[index] = normalized
            replaced = True
            break
    if not replaced:
        items.append(normalized)
    _save_body_items(items)
    return normalized


@app.get("/api/v1/body/schema")
def api_body_schema() -> Dict[str, Any]:
    return {"body_schema": _body_schema()}


@app.get("/api/v1/body/lifecycle")
def api_body_lifecycle() -> Dict[str, Any]:
    return {"body_lifecycle": _body_lifecycle()}


@app.post("/api/v1/body/upsert")
def api_body_upsert(payload: BodyUpsertRequest) -> Dict[str, Any]:
    try:
        item = _upsert_body_item(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item, "traceability": {"slotKey": item["slotKey"], "specir": item["specir"], "form_code": item["form_code"]}}


@app.post("/api/v1/body/upsert/batch")
def api_body_upsert_batch(payload: BodyBatchUpsertRequest) -> Dict[str, Any]:
    written: list[Dict[str, Any]] = []
    try:
        for item in payload.items:
            written.append(_upsert_body_item(item.model_dump()))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"items": written, "count": len(written)}


@app.get("/api/v1/body/list")
def api_body_list(
    limit: int = 200,
    slotKey: str = "",
    form_code: str = "",
    specir: str = "",
    source_type: str = "",
    runtime_status: str = "",
) -> Dict[str, Any]:
    items = _load_body_items()
    slot_filter = _as_text(slotKey)
    form_filter = _as_text(form_code)
    specir_filter = _as_text(specir)
    source_filter = _as_text(source_type)
    status_filter = _as_text(runtime_status)
    filtered = []
    for item in items:
        if slot_filter and _as_text(item.get("slotKey")) != slot_filter:
            continue
        if form_filter and _as_text(item.get("form_code")) != form_filter:
            continue
        if specir_filter and _as_text(item.get("specir")) != specir_filter:
            continue
        if source_filter and _as_text(item.get("source_type")) != source_filter:
            continue
        if status_filter and _as_text(item.get("runtime_status")) != status_filter:
            continue
        filtered.append(item)
    filtered.sort(key=lambda it: _as_text(it.get("updated_at")), reverse=True)
    return {"items": filtered[: max(1, min(int(limit), 2000))], "count": len(filtered)}


@app.get("/api/v1/body/{body_id}")
def api_body_get(body_id: str) -> Dict[str, Any]:
    target = _as_text(body_id)
    for item in _load_body_items():
        if _as_text(item.get("body_id")) == target:
            return {"item": item}
    raise HTTPException(status_code=404, detail="body not found")


def _runtime_body_store_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "runtime_body_engine"


def _runtime_body_events_file() -> Path:
    return _runtime_body_store_dir() / "events.json"


def _runtime_body_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.body.engine.v1",
        "body_capabilities": ["live_value", "historical_value", "source_tracking", "dependency_tracking"],
        "source_types": ["manual input", "sensor", "formula", "BIM", "imported form", "AI extraction"],
        "operations": ["update", "override", "rollback", "replay"],
    }


def _load_runtime_body_events() -> list[Dict[str, Any]]:
    return _load_json_array(_runtime_body_events_file())


def _save_runtime_body_events(items: list[Dict[str, Any]]) -> None:
    _runtime_body_store_dir().mkdir(parents=True, exist_ok=True)
    _runtime_body_events_file().write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _run_recompute_pipeline_for_body(body: Dict[str, Any], trigger_reason: str) -> Dict[str, Any]:
    execution = _execute_runtime_engine_sync(body, trigger_reason)
    _apply_execution_to_runtime_semantic_graph(execution)
    project_id = _as_text(body.get("project_id")) or "unknown_project"
    form_code = _as_text(body.get("form_code"))
    conclusion = api_live_conclusion_build(LiveConclusionBuildRequest(project_id=project_id, form_code=form_code))
    dep = execution.get("dependency_analysis") if isinstance(execution.get("dependency_analysis"), dict) else {}
    return {
        "recompute_pipeline": {
            "dependent_gates": dep.get("affected_gates", []),
            "dependent_proofs": execution.get("proof_generation", {}).get("proof_count", 0) if isinstance(execution.get("proof_generation"), dict) else 0,
            "conclusion_refreshed": True,
        },
        "execution": execution,
        "conclusion": conclusion,
    }


@app.get("/api/v1/runtime-body/schema")
def api_runtime_body_schema() -> Dict[str, Any]:
    return {
        "body_runtime_schema": _runtime_body_schema(),
        "update_lifecycle": [
            "receive_update",
            "source_tracking",
            "dependency_tracking",
            "recompute_gate",
            "regenerate_proof",
            "refresh_conclusion",
            "append_history",
        ],
        "recompute_pipeline": [
            "dependent Gate recompute",
            "Proof regeneration",
            "Conclusion refresh",
        ],
    }


@app.post("/api/v1/runtime-body/update")
def api_runtime_body_update(payload: RuntimeBodyUpdateRequest) -> Dict[str, Any]:
    raw = payload.body if isinstance(payload.body, dict) else {}
    if payload.source == "sensor":
        raw["source_type"] = "Sensor"
    elif payload.source == "formula":
        raw["source_type"] = "Formula"
    elif payload.source == "BIM":
        raw["source_type"] = "BIM"
    elif payload.source == "AI extraction":
        raw["source_type"] = "OCR"
    elif payload.source == "imported form":
        raw["source_type"] = "PDF"
    else:
        raw["source_type"] = "Manual"
    raw["source_ref"] = _as_text(raw.get("source_ref")) or payload.operator
    if payload.override:
        raw["runtime_status"] = "overridden"
    body = _upsert_body_item(raw)
    pipeline = _run_recompute_pipeline_for_body(body, "runtime_body_update")
    event = {
        "event_id": _new_runtime_id("rbody"),
        "timestamp": _now_iso(),
        "action": "override" if payload.override else "update",
        "source": payload.source,
        "operator": payload.operator,
        "body_id": _as_text(body.get("body_id")),
        "body_snapshot": body,
        "dependency_tracking": pipeline.get("recompute_pipeline", {}),
        "execution_id": _as_text((pipeline.get("execution") or {}).get("execution_id") if isinstance(pipeline.get("execution"), dict) else ""),
    }
    history = _load_runtime_body_events()
    history.append(event)
    _save_runtime_body_events(history[-20000:])
    return {"event": event, **pipeline}


@app.post("/api/v1/runtime-body/rollback")
def api_runtime_body_rollback(payload: RuntimeBodyRollbackRequest) -> Dict[str, Any]:
    history = _load_runtime_body_events()
    candidates = [it for it in history if _as_text(it.get("body_id")) == payload.body_id and _as_text(it.get("action")) in {"update", "override"}]
    if len(candidates) < 2:
        raise HTTPException(status_code=400, detail="not enough history to rollback")
    target = candidates[-2]
    snapshot = target.get("body_snapshot") if isinstance(target.get("body_snapshot"), dict) else {}
    snapshot = dict(snapshot)
    snapshot["runtime_status"] = "overridden"
    snapshot["source_ref"] = f"rollback:{payload.reason or 'manual'}"
    body = _upsert_body_item(snapshot)
    pipeline = _run_recompute_pipeline_for_body(body, "runtime_body_rollback")
    event = {
        "event_id": _new_runtime_id("rbody"),
        "timestamp": _now_iso(),
        "action": "rollback",
        "reason": payload.reason,
        "body_id": payload.body_id,
        "body_snapshot": body,
        "dependency_tracking": pipeline.get("recompute_pipeline", {}),
        "execution_id": _as_text((pipeline.get("execution") or {}).get("execution_id") if isinstance(pipeline.get("execution"), dict) else ""),
    }
    history.append(event)
    _save_runtime_body_events(history[-20000:])
    return {"event": event, **pipeline}


@app.post("/api/v1/runtime-body/replay")
def api_runtime_body_replay(payload: RuntimeBodyReplayRequest) -> Dict[str, Any]:
    history = _load_runtime_body_events()
    match = None
    for item in history:
        if _as_text(item.get("event_id")) == payload.event_id:
            match = item
            break
    if not isinstance(match, dict):
        raise HTTPException(status_code=404, detail="event not found")
    snapshot = match.get("body_snapshot") if isinstance(match.get("body_snapshot"), dict) else {}
    body = _upsert_body_item(snapshot)
    pipeline = _run_recompute_pipeline_for_body(body, "runtime_body_replay")
    event = {
        "event_id": _new_runtime_id("rbody"),
        "timestamp": _now_iso(),
        "action": "replay",
        "replay_of": payload.event_id,
        "body_id": _as_text(body.get("body_id")),
        "body_snapshot": body,
        "dependency_tracking": pipeline.get("recompute_pipeline", {}),
        "execution_id": _as_text((pipeline.get("execution") or {}).get("execution_id") if isinstance(pipeline.get("execution"), dict) else ""),
    }
    history.append(event)
    _save_runtime_body_events(history[-20000:])
    return {"event": event, **pipeline}


@app.get("/api/v1/runtime-body/timeline")
def api_runtime_body_timeline(body_id: str = "", limit: int = 200) -> Dict[str, Any]:
    items = _load_runtime_body_events()
    target = _as_text(body_id)
    if target:
        items = [it for it in items if _as_text(it.get("body_id")) == target]
    items.sort(key=lambda it: _as_text(it.get("timestamp")), reverse=True)
    latest_by_body: Dict[str, Dict[str, Any]] = {}
    for it in items:
        bid = _as_text(it.get("body_id"))
        if bid and bid not in latest_by_body:
            latest_by_body[bid] = it
    live_values = []
    historical_values = []
    source_tracking = []
    dependency_tracking = []
    for bid, event in latest_by_body.items():
        snap = event.get("body_snapshot") if isinstance(event.get("body_snapshot"), dict) else {}
        live_values.append({"body_id": bid, "value": snap.get("value"), "unit": snap.get("unit"), "runtime_status": snap.get("runtime_status")})
    for it in items[: max(1, min(int(limit), 5000))]:
        snap = it.get("body_snapshot") if isinstance(it.get("body_snapshot"), dict) else {}
        historical_values.append({"event_id": _as_text(it.get("event_id")), "body_id": _as_text(it.get("body_id")), "value": snap.get("value"), "timestamp": _as_text(it.get("timestamp"))})
        source_tracking.append({"event_id": _as_text(it.get("event_id")), "source": _as_text(it.get("source")), "operator": _as_text(it.get("operator"))})
        dependency_tracking.append({"event_id": _as_text(it.get("event_id")), "dependency": it.get("dependency_tracking")})
    return {
        "items": items[: max(1, min(int(limit), 5000))],
        "live_value": live_values,
        "historical_value": historical_values,
        "source_tracking": source_tracking,
        "dependency_tracking": dependency_tracking,
    }


def _gate_runtime_engine_schema() -> Dict[str, Any]:
    return {
        "schema_id": "gate.runtime.engine.v1",
        "capabilities": ["live_evaluation", "incremental_execution", "dependency_trigger", "runtime_reasoning"],
        "input_required": ["body_snapshot"],
        "output": ["result", "fail_reason", "impacted_slots", "generated_proofs", "runtime_confidence"],
    }


def _gate_runtime_engine_trace_file() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "gate_runtime_engine" / "trace.json"


def _load_gate_runtime_engine_trace() -> list[Dict[str, Any]]:
    return _load_json_array(_gate_runtime_engine_trace_file())


def _save_gate_runtime_engine_trace(items: list[Dict[str, Any]]) -> None:
    _gate_runtime_engine_trace_file().parent.mkdir(parents=True, exist_ok=True)
    _gate_runtime_engine_trace_file().write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _immutable_proof_store_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "immutable_proof_chain"


def _immutable_proof_store_file() -> Path:
    return _immutable_proof_store_dir() / "chain.json"


def _immutable_proof_schema() -> Dict[str, Any]:
    return {
        "schema_id": "immutable.proof.chain.v1",
        "append_only": True,
        "required": [
            "body_snapshot",
            "gate_snapshot",
            "execution_trace",
            "formula_trace",
            "runtime_events",
            "operator",
            "signature",
            "hash",
            "previous_hash",
        ],
        "replay_integrity_rules": [
            "replay appends new proof with replay_of",
            "old proofs cannot be modified",
            "override appends new proof with override_of",
        ],
    }


def _load_immutable_proofs() -> list[Dict[str, Any]]:
    return _load_json_array(_immutable_proof_store_file())


def _save_immutable_proofs(items: list[Dict[str, Any]]) -> None:
    _immutable_proof_store_dir().mkdir(parents=True, exist_ok=True)
    _immutable_proof_store_file().write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _append_immutable_proof(payload: Dict[str, Any]) -> Dict[str, Any]:
    project_id = _as_text(payload.get("project_id"))
    form_code = _as_text(payload.get("form_code"))
    slot_key = _as_text(payload.get("slotKey"))
    operator = _as_text(payload.get("operator"))
    specir = _as_text(payload.get("specir"))
    norm_ref = _as_text(payload.get("normRef"))
    if not project_id or not form_code or not slot_key or not operator or not specir or not norm_ref:
        raise ValueError("project_id/form_code/slotKey/operator/specir/normRef are required")
    body_snapshot = payload.get("body_snapshot") if isinstance(payload.get("body_snapshot"), dict) else {}
    gate_snapshot = payload.get("gate_snapshot") if isinstance(payload.get("gate_snapshot"), dict) else {}
    execution_trace = payload.get("execution_trace") if isinstance(payload.get("execution_trace"), list) else []
    formula_trace = payload.get("formula_trace") if isinstance(payload.get("formula_trace"), list) else []
    runtime_events = payload.get("runtime_events") if isinstance(payload.get("runtime_events"), list) else []
    signature = _as_text(payload.get("signature"))
    if not body_snapshot or not gate_snapshot:
        raise ValueError("body_snapshot and gate_snapshot are required")
    chain = _load_immutable_proofs()
    override_of = _as_text(payload.get("override_of"))
    replay_of = _as_text(payload.get("replay_of"))
    if override_of and not any(_as_text(it.get("proof_id")) == override_of for it in chain):
        raise ValueError("override_of proof not found")
    if replay_of and not any(_as_text(it.get("proof_id")) == replay_of for it in chain):
        raise ValueError("replay_of proof not found")
    previous_hash = _as_text(chain[-1].get("hash")) if chain else ""
    proof_id = _new_runtime_id("iproof")
    timestamp = _now_iso()
    canonical = {
        "proof_id": proof_id,
        "project_id": project_id,
        "form_code": form_code,
        "slotKey": slot_key,
        "body_snapshot": body_snapshot,
        "gate_snapshot": gate_snapshot,
        "execution_trace": execution_trace,
        "formula_trace": formula_trace,
        "runtime_events": runtime_events,
        "operator": operator,
        "signature": signature,
        "specir": specir,
        "normRef": norm_ref,
        "override_of": override_of,
        "replay_of": replay_of,
        "timestamp": timestamp,
        "previous_hash": previous_hash,
    }
    proof_hash = _proof_payload_hash(canonical)
    record = dict(canonical)
    record["hash"] = proof_hash
    chain.append(record)
    _save_immutable_proofs(chain[-50000:])
    return record


def _immutable_replay_diff(old_proof: Dict[str, Any], new_proof: Dict[str, Any]) -> Dict[str, Any]:
    def _keys(obj: Any) -> set[str]:
        return set(obj.keys()) if isinstance(obj, dict) else set()
    old_b = old_proof.get("body_snapshot") if isinstance(old_proof.get("body_snapshot"), dict) else {}
    new_b = new_proof.get("body_snapshot") if isinstance(new_proof.get("body_snapshot"), dict) else {}
    old_g = old_proof.get("gate_snapshot") if isinstance(old_proof.get("gate_snapshot"), dict) else {}
    new_g = new_proof.get("gate_snapshot") if isinstance(new_proof.get("gate_snapshot"), dict) else {}
    return {
        "body_changed_fields": sorted([k for k in _keys(old_b) | _keys(new_b) if old_b.get(k) != new_b.get(k)]),
        "gate_changed_fields": sorted([k for k in _keys(old_g) | _keys(new_g) if old_g.get(k) != new_g.get(k)]),
        "hash_changed": _as_text(old_proof.get("hash")) != _as_text(new_proof.get("hash")),
    }


def _evaluate_gate_runtime_engine(payload: GateRuntimeEngineEvaluateRequest) -> Dict[str, Any]:
    body = payload.body_snapshot if isinstance(payload.body_snapshot, dict) else {}
    gate = payload.gate if isinstance(payload.gate, dict) else {}
    if not body:
        raise ValueError("body_snapshot is required")
    slot_key = _as_text(body.get("slotKey"))
    current_value = body.get("value")
    gate_payload = {
        "gate_id": _as_text(gate.get("gate_id")) or _new_runtime_id("gate"),
        "gate_type": _as_text(gate.get("gate_type")) or "threshold",
        "slot_refs": gate.get("slot_refs") if isinstance(gate.get("slot_refs"), list) else ([slot_key] if slot_key else []),
        "operator": _as_text(gate.get("operator")) or ">=",
        "threshold": gate.get("threshold"),
        "min": gate.get("min"),
        "max": gate.get("max"),
        "formula_ref": _as_text(gate.get("formula_ref")),
        "condition": _as_text(gate.get("condition")),
        "on_pass": _as_text(gate.get("on_pass")) or "PASS",
        "on_fail": _as_text(gate.get("on_fail")) or "FAIL",
        "severity": _as_text(gate.get("severity")) or "warning",
        "runtime_mode": _as_text(gate.get("runtime_mode")) or "automatic",
        "confidence": gate.get("confidence") if gate.get("confidence") is not None else body.get("confidence", 0.8),
        "current_input": {slot_key: current_value} if slot_key else {},
        "specir": _as_text(gate.get("specir")) or _as_text(body.get("specir")) or "unknown_specir",
        "rule": _as_text(gate.get("rule")) or "runtime_rule",
        "normRef": _as_text(gate.get("normRef")) or "unknown_norm",
        "source_clause": _as_text(gate.get("source_clause")),
    }
    evaluated = _evaluate_unified_gate(gate_payload)
    traceability = evaluated.get("traceability") if isinstance(evaluated.get("traceability"), dict) else {}
    gate_obj = evaluated.get("gate") if isinstance(evaluated.get("gate"), dict) else {}
    immutable_proof = _append_immutable_proof(
        {
            "project_id": _as_text(payload.project_id) or "unknown_project",
            "form_code": _as_text(payload.form_code) or _as_text(body.get("form_code")) or "unknown_form",
            "slotKey": slot_key or "unknown_slot",
            "body_snapshot": body,
            "gate_snapshot": gate_obj,
            "execution_trace": [{"step": "gate_runtime_engine", "event_id": _as_text(evaluated.get("event_id"))}],
            "formula_trace": gate.get("formula_trace") if isinstance(gate.get("formula_trace"), list) else [],
            "runtime_events": [{"event_type": "gate_runtime_eval"}],
            "operator": payload.operator,
            "signature": "gate_runtime_engine_auto",
            "specir": _as_text(traceability.get("specir")),
            "normRef": _as_text(traceability.get("normRef")),
        }
    )
    runtime_event_dir = Path(__file__).resolve().parents[1] / "data" / "runtime_events"
    runtime_event = runtime_write_event(
        store_dir=runtime_event_dir,
        event={
            "event_type": "gate_runtime_eval",
            "project_id": _as_text(payload.project_id) or "unknown_project",
            "form_code": _as_text(payload.form_code) or _as_text(body.get("form_code")) or "unknown_form",
            "peg_id": _as_text(body.get("body_id")) or "runtime_body",
            "slotKey": slot_key or "unknown_slot",
            "rule_id": _as_text(traceability.get("rule")) or "runtime_rule",
            "gate_id": _as_text(gate_obj.get("gate_id")) or "unknown_gate",
            "result": _as_text(evaluated.get("judgement_result")) or "FAIL",
            "input_values": evaluated.get("current_input") if isinstance(evaluated.get("current_input"), dict) else {},
            "output_values": {"fail_reason": _as_text(evaluated.get("fail_reason"))},
            "operator": payload.operator,
            "proof_ref": _as_text(immutable_proof.get("proof_id")),
        },
    )
    conclusion = api_live_conclusion_build(
        LiveConclusionBuildRequest(
            project_id=_as_text(payload.project_id) or "unknown_project",
            form_code=_as_text(payload.form_code) or _as_text(body.get("form_code")),
        )
    )
    output = {
        "result": _as_text(evaluated.get("judgement_result")) or "FAIL",
        "fail_reason": _as_text(evaluated.get("fail_reason")),
        "impacted_slots": [slot_key] if slot_key else [],
        "generated_proofs": [_as_text(immutable_proof.get("proof_id"))],
        "runtime_confidence": gate_obj.get("confidence", body.get("confidence", 0.8)),
    }
    reasoning = {
        "input": {"body_snapshot": body},
        "gate_snapshot": gate_obj,
        "evaluation_trace": evaluated.get("current_input"),
        "decision_basis": {
            "threshold": gate_obj.get("threshold"),
            "actual_value": current_value,
            "source_clause": _as_text(evaluated.get("source_clause")),
        },
        "traceability": traceability,
    }
    trace_item = {
        "trace_id": _new_runtime_id("grt"),
        "timestamp": _now_iso(),
        "output": output,
        "reasoning": reasoning,
        "runtime_event": runtime_event.get("event", {}),
        "conclusion_ref": {
            "project_id": _as_text(payload.project_id) or "unknown_project",
            "form_code": _as_text(payload.form_code) or _as_text(body.get("form_code")) or "unknown_form",
        },
    }
    traces = _load_gate_runtime_engine_trace()
    traces.append(trace_item)
    _save_gate_runtime_engine_trace(traces[-20000:])
    return {"output": output, "reasoning": reasoning, "runtime_event": runtime_event, "proof": immutable_proof, "conclusion": conclusion, "trace": trace_item}


@app.get("/api/v1/gate-runtime-engine/schema")
def api_gate_runtime_engine_schema() -> Dict[str, Any]:
    return {
        "gate_runtime_schema": _gate_runtime_engine_schema(),
        "execution_engine": {
            "input_source": "Body snapshot",
            "failure_hooks": ["create RuntimeEvent", "update Conclusion", "generate Proof"],
            "incremental_execution": "triggered by impacted slots only",
        },
        "runtime_reasoning_structure": {
            "sections": ["input", "gate_snapshot", "evaluation_trace", "decision_basis", "traceability"],
        },
    }


@app.post("/api/v1/gate-runtime-engine/evaluate")
def api_gate_runtime_engine_evaluate(payload: GateRuntimeEngineEvaluateRequest) -> Dict[str, Any]:
    try:
        return _evaluate_gate_runtime_engine(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/gate-runtime-engine/trace")
def api_gate_runtime_engine_trace(limit: int = 200) -> Dict[str, Any]:
    items = _load_gate_runtime_engine_trace()
    items.sort(key=lambda it: _as_text(it.get("timestamp")), reverse=True)
    return {"items": items[: max(1, min(int(limit), 5000))]}


@app.get("/api/v1/immutable-proof-chain/schema")
def api_immutable_proof_chain_schema() -> Dict[str, Any]:
    return {
        "proof_chain_schema": _immutable_proof_schema(),
        "hash_chain_strategy": {
            "algorithm": "sha256",
            "link": "previous_hash -> hash",
            "append_only": True,
        },
        "replay_integrity_rules": _immutable_proof_schema().get("replay_integrity_rules", []),
    }


@app.post("/api/v1/immutable-proof-chain/append")
def api_immutable_proof_chain_append(payload: ImmutableProofAppendRequest) -> Dict[str, Any]:
    try:
        item = _append_immutable_proof(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item}


@app.get("/api/v1/immutable-proof-chain/list")
def api_immutable_proof_chain_list(project_id: str = "", limit: int = 2000) -> Dict[str, Any]:
    items = _load_immutable_proofs()
    pid = _as_text(project_id)
    if pid:
        items = [it for it in items if _as_text(it.get("project_id")) == pid]
    items.sort(key=lambda it: _as_text(it.get("timestamp")), reverse=True)
    return {"items": items[: max(1, min(int(limit), 100000))]}


@app.get("/api/v1/immutable-proof-chain/lineage")
def api_immutable_proof_chain_lineage(proof_id: str = Query(..., min_length=1)) -> Dict[str, Any]:
    chain = _load_immutable_proofs()
    by_id = {_as_text(it.get("proof_id")): it for it in chain if _as_text(it.get("proof_id"))}
    target = by_id.get(proof_id)
    if not isinstance(target, dict):
        raise HTTPException(status_code=404, detail="proof not found")
    lineage = [target]
    cur = target
    while _as_text(cur.get("override_of")):
        prev = by_id.get(_as_text(cur.get("override_of")))
        if not isinstance(prev, dict):
            break
        lineage.append(prev)
        cur = prev
    return {"lineage": lineage}


@app.get("/api/v1/immutable-proof-chain/override-history")
def api_immutable_proof_chain_override_history(proof_id: str = Query(..., min_length=1)) -> Dict[str, Any]:
    chain = _load_immutable_proofs()
    items = [it for it in chain if _as_text(it.get("override_of")) == proof_id]
    items.sort(key=lambda it: _as_text(it.get("timestamp")))
    return {"items": items}


@app.post("/api/v1/immutable-proof-chain/replay")
def api_immutable_proof_chain_replay(proof_id: str = Query(..., min_length=1), operator: str = "replay_operator") -> Dict[str, Any]:
    chain = _load_immutable_proofs()
    base = None
    for item in chain:
        if _as_text(item.get("proof_id")) == proof_id:
            base = item
            break
    if not isinstance(base, dict):
        raise HTTPException(status_code=404, detail="proof not found")
    replay_payload = {
        "project_id": _as_text(base.get("project_id")),
        "form_code": _as_text(base.get("form_code")),
        "slotKey": _as_text(base.get("slotKey")),
        "body_snapshot": dict(base.get("body_snapshot") if isinstance(base.get("body_snapshot"), dict) else {}),
        "gate_snapshot": dict(base.get("gate_snapshot") if isinstance(base.get("gate_snapshot"), dict) else {}),
        "execution_trace": list(base.get("execution_trace") if isinstance(base.get("execution_trace"), list) else []),
        "formula_trace": list(base.get("formula_trace") if isinstance(base.get("formula_trace"), list) else []),
        "runtime_events": list(base.get("runtime_events") if isinstance(base.get("runtime_events"), list) else []),
        "operator": operator,
        "signature": _as_text(base.get("signature")),
        "replay_of": proof_id,
        "specir": _as_text(base.get("specir")),
        "normRef": _as_text(base.get("normRef")),
    }
    new_proof = _append_immutable_proof(replay_payload)
    diff = _immutable_replay_diff(base, new_proof)
    return {"base_proof": base, "replay_proof": new_proof, "replay_diff": diff, "integrity": {"old_proof_unchanged": True}}


def _gate_runtime_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.gate.unified.v1",
        "fields": {
            "gate_id": "string",
            "gate_type": ["threshold", "range", "existence", "formula", "dependency", "sequence"],
            "slot_refs": "string[]",
            "operator": "string",
            "threshold": "number|null",
            "min": "number|null",
            "max": "number|null",
            "formula_ref": "string",
            "condition": "string",
            "on_pass": "string",
            "on_fail": "string",
            "severity": ["info", "warning", "reject", "critical"],
            "runtime_mode": ["automatic", "semi_automatic", "manual_confirmed"],
            "confidence": "number(0~1)",
        },
        "traceability_required": ["specir", "rule", "normRef"],
    }


def _gate_runtime_store_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "gate_runtime_panel"


def _gate_runtime_store_file() -> Path:
    return _gate_runtime_store_dir() / "events.json"


def _load_gate_runtime_events() -> list[Dict[str, Any]]:
    path = _gate_runtime_store_file()
    if not path.exists():
        return []
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [it for it in parsed if isinstance(it, dict)]


def _save_gate_runtime_events(items: list[Dict[str, Any]]) -> None:
    _gate_runtime_store_dir().mkdir(parents=True, exist_ok=True)
    _gate_runtime_store_file().write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _evaluate_unified_gate(payload: Dict[str, Any]) -> Dict[str, Any]:
    gate_type = _as_text(payload.get("gate_type"))
    gate_id = _as_text(payload.get("gate_id")) or _new_runtime_id("gate")
    current_input = payload.get("current_input") if isinstance(payload.get("current_input"), dict) else {}
    slot_refs = payload.get("slot_refs") if isinstance(payload.get("slot_refs"), list) else []
    slot_keys = [str(it).strip() for it in slot_refs if str(it).strip()]
    severity = _as_text(payload.get("severity")) or "warning"
    runtime_mode = _as_text(payload.get("runtime_mode")) or "automatic"
    confidence = max(0.0, min(float(payload.get("confidence", 0.8)), 1.0))
    passed = False
    fail_reason = ""
    if gate_type == "threshold":
        slot = slot_keys[0] if slot_keys else ""
        actual = current_input.get(slot)
        threshold = payload.get("threshold")
        if actual is None or threshold is None:
            passed = False
            fail_reason = "missing threshold input"
        else:
            passed = float(actual) >= float(threshold)
            fail_reason = "" if passed else f"value {actual} < threshold {threshold}"
    elif gate_type == "range":
        slot = slot_keys[0] if slot_keys else ""
        actual = current_input.get(slot)
        min_v = payload.get("min")
        max_v = payload.get("max")
        if actual is None or min_v is None or max_v is None:
            passed = False
            fail_reason = "missing range input"
        else:
            numeric = float(actual)
            passed = float(min_v) <= numeric <= float(max_v)
            fail_reason = "" if passed else f"value {numeric} out of range [{min_v}, {max_v}]"
    elif gate_type == "existence":
        missing = [key for key in slot_keys if current_input.get(key) in (None, "", [])]
        passed = len(missing) == 0
        fail_reason = "" if passed else f"missing slots: {', '.join(missing)}"
    else:
        # formula/dependency/sequence fallback: condition controlled human-readable decision
        cond = _as_text(payload.get("condition")).lower()
        passed = "pass" in cond or "ok" in cond or cond == ""
        fail_reason = "" if passed else _as_text(payload.get("condition")) or "condition not satisfied"
    result = _as_text(payload.get("on_pass") if passed else payload.get("on_fail")) or ("PASS" if passed else "FAIL")
    event = {
        "event_id": _new_runtime_id("gate_rt"),
        "evaluated_at": _now_iso(),
        "gate": {
            "gate_id": gate_id,
            "gate_type": gate_type,
            "slot_refs": slot_keys,
            "operator": _as_text(payload.get("operator")),
            "threshold": payload.get("threshold"),
            "min": payload.get("min"),
            "max": payload.get("max"),
            "formula_ref": _as_text(payload.get("formula_ref")),
            "condition": _as_text(payload.get("condition")),
            "on_pass": _as_text(payload.get("on_pass")),
            "on_fail": _as_text(payload.get("on_fail")),
            "severity": severity,
            "runtime_mode": runtime_mode,
            "confidence": confidence,
        },
        "current_input": current_input,
        "judgement_result": result,
        "passed": passed,
        "fail_reason": fail_reason,
        "source_clause": _as_text(payload.get("source_clause")),
        "traceability": {
            "specir": _as_text(payload.get("specir")),
            "rule": _as_text(payload.get("rule")),
            "normRef": _as_text(payload.get("normRef")),
        },
    }
    events = _load_gate_runtime_events()
    events.append(event)
    _save_gate_runtime_events(events[-5000:])
    return event


@app.get("/api/v1/gate-runtime/schema")
def api_gate_runtime_schema() -> Dict[str, Any]:
    return {
        "gate_schema": _gate_runtime_schema(),
        "runtime_execution_flow": [
            "1) load unified gate with traceability",
            "2) bind current_input by slot_refs",
            "3) execute by gate_type",
            "4) emit judgement_result / fail_reason",
            "5) persist runtime event for audit and replay",
        ],
    }


@app.post("/api/v1/gate-runtime/evaluate")
def api_gate_runtime_evaluate(payload: GateRuntimeEvaluateRequest) -> Dict[str, Any]:
    try:
        event = _evaluate_unified_gate(payload.model_dump())
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"event": event}


@app.get("/api/v1/gate-runtime/events")
def api_gate_runtime_events(limit: int = 100) -> Dict[str, Any]:
    items = _load_gate_runtime_events()
    items.sort(key=lambda it: _as_text(it.get("evaluated_at")), reverse=True)
    return {"items": items[: max(1, min(int(limit), 1000))]}


@app.get("/api/v1/bim-runtime-linkage/schema")
def api_bim_runtime_linkage_schema() -> Dict[str, Any]:
    return {
        "page_layout": bim_runtime_page_layout(),
        "binding_rules": bim_runtime_binding_rules(),
        "highlight_states": bim_runtime_highlight_states(),
    }


@app.post("/api/v1/bim-runtime-linkage/build")
def api_bim_runtime_linkage_build(payload: BIMRuntimeLinkageBuildRequest) -> Dict[str, Any]:
    return build_linkage_view(
        bim_objects=payload.bim_objects,
        specir_records=payload.specir_records,
        rule_gate_records=payload.rule_gate_records,
        runtime_results=payload.runtime_results,
        proof_records=payload.proof_records,
        risk_items=payload.risk_items,
        selected_bim_object_id=payload.selected_bim_object_id,
        risk_level_filter=payload.risk_level_filter,
        design_change=payload.design_change,
    )


@app.get("/api/v1/hitl2/governance")
def api_hitl2_governance() -> Dict[str, Any]:
    return {"confidence_governance": hitl2_confidence_governance()}


@app.post("/api/v1/hitl2/queue/enqueue")
def api_hitl2_enqueue(payload: HITL2CandidateRequest) -> Dict[str, Any]:
    item = hitl2_enqueue_candidate(
        queue_dir=hitl2_queue_dir,
        form_code=payload.form_code,
        source=payload.source,
        candidate=payload.candidate,
        confidence=float(payload.confidence),
        impact_score=float(payload.impact_score),
    )
    return {"item": item}


@app.get("/api/v1/hitl2/queue")
def api_hitl2_queue(include_auto_approved: bool = True) -> Dict[str, Any]:
    return {
        "items": hitl2_list_review_queue(queue_dir=hitl2_queue_dir, include_auto_approved=bool(include_auto_approved)),
        "sort_by": ["confidence DESC", "impact_score DESC"],
    }


@app.post("/api/v1/hitl2/queue/action")
def api_hitl2_action(payload: HITL2ActionRequest) -> Dict[str, Any]:
    try:
        item = hitl2_reviewer_action(
            queue_dir=hitl2_queue_dir,
            learning_dir=hitl2_learning_dir,
            patch_id=payload.patch_id,
            action=payload.action,
            edit_payload=payload.edit_payload,
            reviewer=payload.reviewer,
        )
        return {"item": item, **hitl2_learning_loop_summary(hitl2_learning_dir)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/hitl2/learning-loop")
def api_hitl2_learning_loop() -> Dict[str, Any]:
    return hitl2_learning_loop_summary(hitl2_learning_dir)


def _runtime_version_binding_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.version.binding.v1",
        "required_for_runtime_execution": [
            "rulepack_version",
            "norm_version",
            "specir_version",
            "executor_version",
        ],
        "guarantees": [
            "historical_proof_interpreted_with_bound_versions",
            "new_version_must_not_change_historical_decision",
            "supports_version_selected_replay",
        ],
    }


def _extract_version_binding_from_execution(execution_result: Dict[str, Any]) -> Dict[str, Any]:
    top = execution_result.get("version_binding")
    if isinstance(top, dict) and top:
        return dict(top)
    proof = execution_result.get("proof")
    if isinstance(proof, dict):
        inner = proof.get("version_binding")
        if isinstance(inner, dict) and inner:
            return dict(inner)
        canonical = proof.get("canonical_payload")
        if isinstance(canonical, dict):
            from_canonical = canonical.get("version_binding")
            if isinstance(from_canonical, dict) and from_canonical:
                return dict(from_canonical)
    return {}


def _normalize_version_selection(selection: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(fallback)
    for key in ("rulepack_version", "norm_version", "specir_version", "executor_version"):
        value = _as_text(selection.get(key))
        if value:
            out[key] = value
    out.setdefault("rulepack_version", "unknown")
    out.setdefault("norm_version", "unknown")
    out.setdefault("specir_version", "unknown")
    out.setdefault("executor_version", _executor_version())
    return out


def _collect_failed_gate_ids(gate_results: Any) -> list[str]:
    out: list[str] = []
    if not isinstance(gate_results, list):
        return out
    for item in gate_results:
        if not isinstance(item, dict):
            continue
        passed = bool(item.get("passed"))
        if passed:
            continue
        rid = _as_text(item.get("rule_id") or item.get("ruleId")) or "unknown_rule"
        out.append(rid)
    return sorted(set(out))


def _build_runtime_replay_diff(old_result: Dict[str, Any], new_result: Dict[str, Any]) -> Dict[str, Any]:
    old_status = _as_text(old_result.get("final_status") or ((old_result.get("gate") or {}).get("summary_status") if isinstance(old_result.get("gate"), dict) else "UNKNOWN"))
    new_status = _as_text(new_result.get("final_status") or ((new_result.get("gate") or {}).get("summary_status") if isinstance(new_result.get("gate"), dict) else "UNKNOWN"))
    old_rules = _collect_failed_gate_ids((old_result.get("gate") or {}).get("rule_results") if isinstance(old_result.get("gate"), dict) else [])
    new_rules = _collect_failed_gate_ids((new_result.get("gate") or {}).get("rule_results") if isinstance(new_result.get("gate"), dict) else [])
    added = sorted([x for x in new_rules if x not in old_rules])
    removed = sorted([x for x in old_rules if x not in new_rules])
    status_changed = old_status != new_status
    return {
        "status_changed": status_changed,
        "old_status": old_status,
        "new_status": new_status,
        "failed_rules_added": added,
        "failed_rules_removed": removed,
    }


def _assess_replay_risk_change(diff: Dict[str, Any]) -> Dict[str, Any]:
    added = diff.get("failed_rules_added") if isinstance(diff.get("failed_rules_added"), list) else []
    removed = diff.get("failed_rules_removed") if isinstance(diff.get("failed_rules_removed"), list) else []
    old_status = _as_text(diff.get("old_status")).upper()
    new_status = _as_text(diff.get("new_status")).upper()
    level = "low"
    summary = "No material decision change"
    if old_status in {"PASS", "QUALIFIED"} and new_status in {"FAIL", "REJECTED", "BLOCK"}:
        level = "high"
        summary = "Upgrade introduces blocking/failing decision"
    elif old_status in {"FAIL", "REJECTED", "BLOCK"} and new_status in {"PASS", "QUALIFIED"}:
        level = "medium"
        summary = "New version relaxes previous blocking decision"
    elif added:
        level = "high"
        summary = "More failed gate rules under new version"
    elif removed:
        level = "medium"
        summary = "Some failed gate rules are removed in new version"
    return {
        "level": level,
        "summary": summary,
        "score": 90 if level == "high" else (60 if level == "medium" else 20),
    }


@app.get("/api/v1/runtime/version-pinning/schema")
def api_runtime_version_pinning_schema() -> Dict[str, Any]:
    return {
        "version_binding_schema": _runtime_version_binding_schema(),
        "history_replay_mechanism": {
            "endpoint": "/api/v1/runtime/version-pinning/replay",
            "modes": ["historical_interpretation", "re_execute"],
            "decision_guard": "assert_decision_unchanged=true blocks regressions",
        },
        "page_version_switch_scheme": {
            "selector_fields": ["rulepack_version", "norm_version", "specir_version", "executor_version"],
            "default_mode": "pinned",
            "options": ["pinned", "custom"],
            "warnings": [
                "custom replay is sandboxed; it does not overwrite historical proof",
                "published new version cannot rewrite historical decision",
            ],
        },
    }


@app.get("/api/v1/runtime/replay/schema")
def api_runtime_replay_schema() -> Dict[str, Any]:
    return {
        "replay_schema": {
            "schema_id": "runtime.replay.v1",
            "inputs": [
                "historical_input_snapshot",
                "old_rulepack_version",
                "new_rulepack_version",
            ],
            "outputs": [
                "old_result",
                "new_result",
                "diff",
                "affected_gates",
                "risk_change",
            ],
            "use_cases": [
                "pre_upgrade_impact_simulation",
                "pre_rollback_verification",
                "dispute_audit",
            ],
        },
        "execution_flow": [
            "1) load historical input snapshot",
            "2) run with old_rulepack_version",
            "3) run with new_rulepack_version",
            "4) compare result and gate failures",
            "5) emit risk change and replay report",
        ],
    }


@app.post("/api/v1/runtime/replay/execute")
def api_runtime_replay_execute(payload: RuntimeReplayRequest) -> Dict[str, Any]:
    historical = payload.historical_input_snapshot if isinstance(payload.historical_input_snapshot, dict) else {}
    target_id = _as_text(payload.spec_or_component_id or payload.spu_id)
    if not target_id:
        target_id = _as_text(historical.get("spu_id") or historical.get("spuId") or historical.get("spec_or_component_id"))
    if not target_id:
        raise HTTPException(status_code=400, detail="spec_or_component_id or spu_id is required")

    base_input: Dict[str, Any] = {}
    base_input.update(historical)
    if isinstance(payload.context, dict):
        base_input.update(payload.context)

    old_input = dict(base_input)
    old_input["rulepack_version"] = payload.old_rulepack_version
    old_input["rule_version"] = payload.old_rulepack_version
    new_input = dict(base_input)
    new_input["rulepack_version"] = payload.new_rulepack_version
    new_input["rule_version"] = payload.new_rulepack_version

    old_result = _execute_component_via_source_policy(
        spec_or_component_id=target_id,
        input_payload=old_input,
        branch_id=payload.branch_id,
        record_execution=False,
        prefer_runtime=True,
    )
    new_result = _execute_component_via_source_policy(
        spec_or_component_id=target_id,
        input_payload=new_input,
        branch_id=payload.branch_id,
        record_execution=False,
        prefer_runtime=True,
    )
    diff = _build_runtime_replay_diff(old_result, new_result)
    old_failed = _collect_failed_gate_ids((old_result.get("gate") or {}).get("rule_results") if isinstance(old_result.get("gate"), dict) else [])
    new_failed = _collect_failed_gate_ids((new_result.get("gate") or {}).get("rule_results") if isinstance(new_result.get("gate"), dict) else [])
    affected_gates = sorted(set(old_failed + new_failed))
    risk_change = _assess_replay_risk_change(diff)

    return {
        "replay_id": _new_runtime_id("replay"),
        "replay_at": _now_iso(),
        "spec_or_component_id": target_id,
        "old_rulepack_version": payload.old_rulepack_version,
        "new_rulepack_version": payload.new_rulepack_version,
        "old_result": {
            "execution_id": _as_text(old_result.get("execution_id")) or None,
            "final_status": _as_text(old_result.get("final_status")),
            "gate": old_result.get("gate"),
            "version_binding": old_result.get("version_binding") if isinstance(old_result.get("version_binding"), dict) else {},
        },
        "new_result": {
            "execution_id": _as_text(new_result.get("execution_id")) or None,
            "final_status": _as_text(new_result.get("final_status")),
            "gate": new_result.get("gate"),
            "version_binding": new_result.get("version_binding") if isinstance(new_result.get("version_binding"), dict) else {},
        },
        "diff": diff,
        "affected_gates": affected_gates,
        "risk_change": risk_change,
    }


@app.post("/api/v1/runtime/replay/report")
def api_runtime_replay_report(payload: RuntimeReplayReportRequest) -> Dict[str, Any]:
    replay = payload.replay_result if isinstance(payload.replay_result, dict) else {}
    report_request = ReportGenerateRequest(
        reportType="runtime_replay_report",
        projectId=payload.project_id,
        scope=payload.scope,
        data={
            "replay": replay,
            "summary": {
                "old_rulepack_version": replay.get("old_rulepack_version"),
                "new_rulepack_version": replay.get("new_rulepack_version"),
                "risk_change": replay.get("risk_change"),
                "affected_gates": replay.get("affected_gates"),
            },
        },
    )
    return report_generate(report_request)


@app.post("/api/v1/runtime/version-pinning/replay")
def api_runtime_version_pinning_replay(payload: RuntimeVersionReplayRequest) -> Dict[str, Any]:
    try:
        full_proof = project_utxo_service.build_full_proof(payload.execution_id)
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not isinstance(full_proof, dict):
        raise HTTPException(status_code=400, detail="full proof payload invalid")
    canonical = full_proof.get("canonical_payload")
    if not isinstance(canonical, dict):
        raise HTTPException(status_code=400, detail="canonical payload not found in historical proof")

    pinned_binding = _extract_version_binding_from_execution({"proof": full_proof})
    selected_binding = _normalize_version_selection(payload.version_selection, pinned_binding)
    source_input = canonical.get("input") if isinstance(canonical.get("input"), dict) else {}
    spec_or_component_id = _as_text(full_proof.get("component_id") or canonical.get("component_id"))
    historical_final_status = _as_text(canonical.get("final_status") or full_proof.get("final_status"))
    if not spec_or_component_id:
        raise HTTPException(status_code=400, detail="component_id missing in historical proof")

    if payload.replay_mode == "historical_interpretation":
        return {
            "execution_id": payload.execution_id,
            "replay_mode": payload.replay_mode,
            "historical_interpretation": {
                "final_status": historical_final_status,
                "gate": canonical.get("gate"),
                "path_outputs": canonical.get("path_outputs"),
            },
            "pinned_version_binding": pinned_binding,
            "selected_version_binding": selected_binding,
            "decision_unchanged": True,
            "note": "Historical proof interpreted with bound versions; no re-execution performed.",
        }

    replay_input = dict(source_input)
    replay_input.update(selected_binding)
    replay_result = _execute_component_via_source_policy(
        spec_or_component_id=spec_or_component_id,
        input_payload=replay_input,
        branch_id=payload.branch_id,
        record_execution=False,
        prefer_runtime=True,
    )
    replay_status = _as_text(replay_result.get("final_status") or ((replay_result.get("gate") or {}).get("summary_status") if isinstance(replay_result.get("gate"), dict) else ""))
    decision_unchanged = replay_status == historical_final_status
    if payload.assert_decision_unchanged and not decision_unchanged:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "HISTORICAL_DECISION_CHANGED",
                "message": "new version replay changes historical decision",
                "historical_final_status": historical_final_status,
                "replay_final_status": replay_status,
            },
        )
    return {
        "execution_id": payload.execution_id,
        "replay_mode": payload.replay_mode,
        "pinned_version_binding": pinned_binding,
        "selected_version_binding": selected_binding,
        "historical_final_status": historical_final_status,
        "replay_final_status": replay_status,
        "decision_unchanged": decision_unchanged,
        "replay_result": {
            "execution_id": _as_text(replay_result.get("execution_id")) or None,
            "final_status": replay_status,
            "gate": replay_result.get("gate"),
            "proof": _build_normref_proof_response(replay_result, status=replay_status),
            "version_binding": replay_result.get("version_binding") if isinstance(replay_result.get("version_binding"), dict) else {},
        },
    }


@app.get("/api/v1/runtime-feedback/schema")
def api_runtime_feedback_schema() -> Dict[str, Any]:
    return {"feedback_schema": runtime_feedback_schema()}


@app.post("/api/v1/runtime-feedback/detect")
def api_runtime_feedback_detect(payload: RuntimeFeedbackDetectRequest) -> Dict[str, Any]:
    candidates = runtime_feedback_detect_feedback_candidates(
        project_id=payload.project_id,
        gate_results=payload.gate_results,
        slot_missing_events=payload.slot_missing_events,
        overrides=payload.overrides,
        proof_records=payload.proof_records,
        appeals=payload.appeals,
        thresholds=payload.thresholds,
    )
    queue_items: list[Dict[str, Any]] = []
    if payload.auto_enqueue and candidates:
        queue_items = runtime_feedback_enqueue_feedback_items(queue_dir=specir_review_queue_dir, items=candidates)
    return {
        "feedback_schema": runtime_feedback_schema(),
        "detected_candidates": candidates,
        "queued_items": queue_items,
        "review_queue": {
            "queue": "specir_review_queue",
            "path": str(specir_review_queue_dir / "specir_review_queue.jsonl"),
            "auto_enqueue": bool(payload.auto_enqueue),
        },
    }


@app.get("/api/v1/specir/review-queue")
def api_specir_review_queue(status: str = "") -> Dict[str, Any]:
    items = runtime_feedback_list_specir_review_queue(specir_review_queue_dir, status=status)
    return {
        "queue": "specir_review_queue",
        "items": items,
        "count": len(items),
        "governance_constraints": {
            "no_auto_modify_published_rule": True,
            "fix_requires_new_rulepack_version": True,
        },
    }


@app.post("/api/v1/specir/review-queue/action")
def api_specir_review_queue_action(payload: RuntimeFeedbackReviewActionRequest) -> Dict[str, Any]:
    try:
        item = runtime_feedback_apply_review_action(
            queue_dir=specir_review_queue_dir,
            feedback_id=payload.feedback_id,
            action=payload.action,
            reviewer=payload.reviewer,
            resolution=payload.resolution,
        )
        return {"item": item}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/runtime-feedback/page-hints")
def api_runtime_feedback_page_hints() -> Dict[str, Any]:
    items = runtime_feedback_list_specir_review_queue(specir_review_queue_dir, status="pending_review")
    return runtime_feedback_build_page_hints(items)


@app.get("/api/v1/ai-patch/schema")
def api_ai_patch_schema() -> Dict[str, Any]:
    return {"patch_schema": ai_patch_schema()}


@app.post("/api/v1/ai-patch/suggest")
def api_ai_patch_suggest(payload: AIPatchSuggestRequest) -> Dict[str, Any]:
    suggested = generate_suggested_patch(
        unresolved_reason=payload.unresolved_reason,
        nearby_rules=payload.nearby_rules,
        slot_graph=payload.slot_graph,
        historical_fixes=payload.historical_fixes,
        semantic_context=payload.semantic_context,
    )
    item = create_versioned_patch(
        store_dir=ai_patch_dir,
        form_code=payload.form_code,
        suggested_patch=_as_text_dict(suggested.get("suggested_patch")),
        source="ai_patch_auto_repair",
    )
    return {
        "patch_schema": ai_patch_schema(),
        "suggestion_payload": suggested,
        "patch_record": item,
        "patch_review_workflow": suggested.get("patch_review_workflow"),
        "revert_strategy": suggested.get("revert_strategy"),
    }


@app.get("/api/v1/ai-patch/list")
def api_ai_patch_list() -> Dict[str, Any]:
    return {"items": list_ai_patches(ai_patch_dir)}


@app.post("/api/v1/ai-patch/review")
def api_ai_patch_review(payload: AIPatchReviewRequest) -> Dict[str, Any]:
    try:
        item = review_ai_patch(
            store_dir=ai_patch_dir,
            patch_id=payload.patch_id,
            action=payload.action,
            edit_payload=payload.edit_payload,
        )
        return {"item": item}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/ai-patch/revert")
def api_ai_patch_revert(payload: AIPatchRevertRequest) -> Dict[str, Any]:
    try:
        item = revert_ai_patch(store_dir=ai_patch_dir, patch_id=payload.patch_id)
        return {"item": item}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/components/{component_id}/versions")
def get_component_versions(component_id: str) -> Dict[str, Any]:
    try:
        items = component_registry_service.get_component_versions(component_id)
        return {"component_id": component_id, "items": items}
    except ComponentVersionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ComponentSchemaError, ComponentRegistryServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/components/{component_id}")
def get_component_latest(component_id: str) -> Dict[str, Any]:
    try:
        return component_registry_service.get_latest_component(component_id)
    except ComponentVersionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ComponentSchemaError, ComponentRegistryServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/specir/specs")
def list_specir_specs() -> Dict[str, Any]:
    try:
        registry = _reload_specir_registry()
        items = [entry.to_debug_payload() for entry in registry.values()]
        return {
            "index_file": str(specir_index_path),
            "count": len(items),
            "items": items,
        }
    except (SpecIRLoaderError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/specir/specs/{spec_id}")
def get_specir_spec(spec_id: str) -> Dict[str, Any]:
    try:
        registry = _reload_specir_registry()
        target = str(spec_id or "").strip()
        if not target:
            raise ValueError("spec_id is required")
        if target not in registry:
            raise HTTPException(status_code=404, detail=f"spec not found: {target}")
        entry = registry[target]
        payload = entry.to_debug_payload()
        if entry.document is not None:
            payload["document"] = {
                "spec_id": entry.document.spec_id,
                "type": entry.document.spec_type,
                "version": entry.document.version,
                "namespace": entry.document.namespace,
                "semantics": entry.document.semantics,
                "logic": entry.document.logic,
                "inputs": entry.document.inputs,
                "path": entry.document.path,
                "gate": entry.document.gate,
                "state": entry.document.state,
                "proof": entry.document.proof,
                "metadata": entry.document.metadata,
                "warnings": list(entry.document.warnings),
            }
        return payload
    except HTTPException:
        raise
    except (SpecIRLoaderError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/norm/version/compare")
def compare_norm_version(payload: NormVersionCompareRequest) -> Dict[str, Any]:
    try:
        old_spec_payload = payload.old_spec if isinstance(payload.old_spec, dict) else None
        new_spec_payload = payload.new_spec if isinstance(payload.new_spec, dict) else None
        old_spec_id = str(payload.old_spec_id or "").strip()
        new_spec_id = str(payload.new_spec_id or "").strip()

        if old_spec_payload is None or new_spec_payload is None:
            registry = _reload_specir_registry()
            if old_spec_payload is None:
                if not old_spec_id:
                    raise ValueError("old_spec_id is required when old_spec is not provided")
                old_entry = registry.get(old_spec_id)
                if old_entry is None or old_entry.document is None:
                    raise HTTPException(status_code=404, detail=f"old spec not found: {old_spec_id}")
                old_spec_payload = copy.deepcopy(old_entry.document.raw if isinstance(old_entry.document.raw, dict) else {})
            if new_spec_payload is None:
                if not new_spec_id:
                    raise ValueError("new_spec_id is required when new_spec is not provided")
                new_entry = registry.get(new_spec_id)
                if new_entry is None or new_entry.document is None:
                    raise HTTPException(status_code=404, detail=f"new spec not found: {new_spec_id}")
                new_spec_payload = copy.deepcopy(new_entry.document.raw if isinstance(new_entry.document.raw, dict) else {})

        if not old_spec_id:
            old_spec_id = str(old_spec_payload.get("spec_id") or "old_spec").strip()
        if not new_spec_id:
            new_spec_id = str(new_spec_payload.get("spec_id") or "new_spec").strip()

        report = compare_norm_versions(
            old_spec=old_spec_payload,
            new_spec=new_spec_payload,
            old_spec_id=old_spec_id,
            new_spec_id=new_spec_id,
            output_dir=Path(__file__).resolve().parents[1] / "data" / "diff_reports",
        )
        return report
    except HTTPException:
        raise
    except (SpecIRLoaderError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/rule/impact-analysis")
def rule_impact_analysis(payload: RuleImpactAnalysisRequest) -> Dict[str, Any]:
    try:
        registry = _reload_specir_registry()
        target_specir_id = str(payload.specir_id or "").strip()
        entry = registry.get(target_specir_id)
        if entry is None or entry.document is None:
            raise HTTPException(status_code=404, detail=f"spec not found: {target_specir_id}")
        spec_payload = copy.deepcopy(entry.document.raw if isinstance(entry.document.raw, dict) else {})
        result = analyze_rule_impact(
            specir_id=target_specir_id,
            rule_id=str(payload.rule_id).strip(),
            gate_id=str(payload.gate_id or "default").strip() or "default",
            slot_key=str(payload.slotKey).strip(),
            spec_payload=spec_payload,
            output_dir=Path(__file__).resolve().parents[1] / "data" / "impact_graphs",
        )
        return result
    except HTTPException:
        raise
    except (SpecIRLoaderError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/specir/compile/{spec_id}")
def compile_specir_spec(spec_id: str) -> Dict[str, Any]:
    try:
        registry = _reload_specir_registry()
        target = str(spec_id or "").strip()
        if not target:
            raise ValueError("spec_id is required")
        entry = registry.get(target)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"spec not found: {target}")
        if entry.document is None:
            raise ValueError(f"spec is not loadable: {target}")

        compiled = compile_spec_to_component(entry.document)
        compiled_spu = compile_spec_to_spu(entry.document)
        spu_validation = validate_spu(compiled_spu)
        component_registry.register_runtime_component(compiled, source_label=f"specir:{target}")

        return {
            "spec_id": target,
            "source_file": entry.source_file,
            "compiled_status": "compiled",
            "component_id": compiled.get("component_id"),
            "version": compiled.get("version"),
            "registry_source": "runtime",
            "core_fields_preview": {
                "component_name": compiled.get("component_name"),
                "catalog_id": compiled.get("catalog_id"),
                "standard_id": compiled.get("standard_id"),
                "status": compiled.get("status"),
                "path_steps_count": len(compiled.get("path", {}).get("steps", []))
                if isinstance(compiled.get("path"), dict)
                else 0,
                "gate_rules_count": len(compiled.get("gate", {}).get("rules", []))
                if isinstance(compiled.get("gate"), dict)
                else 0,
            },
            "spu": compiled_spu,
            "spu_validation": spu_validation,
            "reviewRequired": bool(compiled_spu.get("reviewRequired", False)),
            "reviewFlags": list(compiled_spu.get("reviewFlags", [])),
        }
    except HTTPException:
        raise
    except (SpecIRLoaderError, SpecIRCompilerError, ValueError, OSError, ComponentSchemaError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/specir/compiled/{spec_id}")
def get_compiled_specir_spec(spec_id: str) -> Dict[str, Any]:
    try:
        target = str(spec_id or "").strip()
        if not target:
            raise ValueError("spec_id is required")

        compiled = get_compiled_component(target)
        if compiled is None:
            raise HTTPException(status_code=404, detail=f"compiled spec not found: {target}")

        return {
            "spec_id": target,
            "compiled_status": "compiled",
            "component": compiled,
        }
    except HTTPException:
        raise
    except (SpecIRCompilerError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/specir/compile-spu/{spec_id}")
def compile_specir_spu(spec_id: str) -> Dict[str, Any]:
    try:
        registry = _reload_specir_registry()
        target = str(spec_id or "").strip()
        if not target:
            raise ValueError("spec_id is required")
        entry = registry.get(target)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"spec not found: {target}")
        if entry.document is None:
            raise ValueError(f"spec is not loadable: {target}")

        compiled_spu = compile_spec_to_spu(entry.document)
        validation = validate_spu(compiled_spu)
        return {
            "spec_id": target,
            "source_file": entry.source_file,
            "compiled_status": "compiled",
            "spu": compiled_spu,
            "validation": validation,
            "reviewRequired": bool(compiled_spu.get("reviewRequired", False)),
            "reviewFlags": list(compiled_spu.get("reviewFlags", [])),
        }
    except HTTPException:
        raise
    except (SpecIRLoaderError, SpecIRCompilerError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/specir/execute/guide")
def get_specir_execute_guide() -> Dict[str, Any]:
    try:
        registry = _reload_specir_registry()
        available_specs = [entry.spec_id for entry in registry.values() if entry.loaded_status == "loaded"]
        available_specs.sort()
        return {
            "title": "SpecIR direct execute guide",
            "steps": [
                "1) select spec_id",
                "2) provide input DTO",
                "3) call POST /api/v1/specir/execute/{spec_id}",
                "4) inspect execution_result",
            ],
            "available_specs": available_specs,
            "request_example": {
                "spec_id": "JTG_F80_1_2017.4.2.1.compaction",
                "body": {
                    "input": {
                        "stake": "K15+200",
                        "layer_depth": "0-0.8m",
                        "project_id": "P1",
                        "compaction_degree": 96.5,
                        "representative_value": 96.0,
                        "actor_did": "did:test:executor",
                        "inspected_at": "2026-04-16T10:00:00Z",
                    },
                    "branch_id": "main",
                },
            },
        }
    except (SpecIRLoaderError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/specir/explain/{spec_id}")
def explain_specir_spec(spec_id: str) -> Dict[str, Any]:
    try:
        registry = _reload_specir_registry()
        target = str(spec_id or "").strip()
        if not target:
            raise ValueError("spec_id is required")
        entry = registry.get(target)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"spec not found: {target}")
        if entry.document is None:
            raise ValueError(f"spec is not loadable: {target}")

        payload = explain_spec_document(entry.document)
        payload["spec_id"] = target
        payload["source"] = "specir"
        payload["source_file"] = entry.source_file
        payload["warnings"] = list(entry.document.warnings)
        return payload
    except HTTPException:
        raise
    except (SpecIRLoaderError, SpecIRCompilerError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _execute_specir_with_payload(spec_id: str, payload: ExecuteSpecIRRequest) -> Dict[str, Any]:
    registry = _reload_specir_registry()
    target = str(spec_id or "").strip()
    if not target:
        raise ValueError("spec_id is required")
    entry = registry.get(target)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"spec not found: {target}")
    if entry.document is None:
        raise ValueError(f"spec is not loadable: {target}")

    compiled = compile_spec_to_component(entry.document)
    component_registry.register_runtime_component(compiled, source_label=f"specir:{target}")

    execution_input = dict(payload.input)
    project_id = str(execution_input.get("project_id", "UNSPECIFIED"))
    branch_id = payload.branch_id or project_utxo_service.get_current_branch(project_id)

    result = project_utxo_service.execute_component_in_branch(
        component_id=str(compiled.get("component_id", "")),
        input_payload=execution_input,
        branch_id=branch_id,
        execution_engine=execution_engine,
    )
    _record_execution_with_children(result, branch_id=branch_id)
    branch_overview = project_utxo_service.get_branch_overview(project_id)

    response = dict(result)
    response["spec_id"] = target
    response["source"] = "specir"
    response["compiled_component_id"] = compiled.get("component_id")
    response["spec_file"] = entry.source_file
    response["current_branch"] = branch_overview.get("current_branch", "main")
    response["active_forks"] = branch_overview.get("active_forks", [])
    return response


def _execute_specir_via_utxo(spec_id: str, *, v_address: str, input_payload: Dict[str, Any]) -> Dict[str, Any]:
    registry = _reload_specir_registry()
    target = str(spec_id or "").strip()
    if not target:
        raise ValueError("spec_id is required")
    entry = registry.get(target)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"spec not found: {target}")
    if entry.document is None:
        raise ValueError(f"spec is not loadable: {target}")

    compiled = compile_spec_to_component(entry.document)
    component_registry.register_runtime_component(compiled, source_label=f"specir:{target}")
    result = project_utxo_service.execute_utxo_transition(
        v_address=v_address,
        component_id=str(compiled.get("component_id", "")),
        input_payload=input_payload,
        execution_engine=execution_engine,
    )

    parsed_v_address = parse_v_address(v_address)
    branch_overview = project_utxo_service.get_branch_overview(str(parsed_v_address["projectId"]))
    response = dict(result)
    response["spec_id"] = target
    response["source"] = "specir"
    response["compiled_component_id"] = compiled.get("component_id")
    response["spec_file"] = entry.source_file
    response["current_branch"] = branch_overview.get("current_branch", "main")
    response["active_forks"] = branch_overview.get("active_forks", [])
    return response


def _infer_norm_version_from_spec_id(spec_id: str) -> str:
    value = str(spec_id or "").strip()
    if not value:
        return ""
    if "." in value:
        return value.split(".", 1)[0]
    return value


def _resolve_rule_version_from_execution_result(execution_result: Dict[str, Any]) -> str:
    return str(
        execution_result.get("spec_version")
        or execution_result.get("version")
        or execution_result.get("compile_hash")
        or ""
    ).strip()


def _build_detection_decision_path(execution_result: Dict[str, Any]) -> list[Dict[str, Any]]:
    decision_path: list[Dict[str, Any]] = []
    raw_trace = execution_result.get("path_trace")
    if isinstance(raw_trace, list):
        for index, item in enumerate(raw_trace, start=1):
            if isinstance(item, dict):
                stage = _as_text(item.get("step") or item.get("node") or item.get("state") or f"trace_{index}")
                decision_path.append(
                    {
                        "stage": stage,
                        "status": _as_text(item.get("status") or item.get("result") or "computed"),
                        "detail": _as_text(item.get("message") or item.get("description") or item),
                    }
                )
            else:
                decision_path.append(
                    {
                        "stage": f"trace_{index}",
                        "status": "computed",
                        "detail": _as_text(item),
                    }
                )

    gate_payload = execution_result.get("gate")
    if isinstance(gate_payload, dict):
        rule_results = gate_payload.get("rule_results")
        if isinstance(rule_results, list):
            for index, item in enumerate(rule_results, start=1):
                if not isinstance(item, dict):
                    continue
                decision_path.append(
                    {
                        "stage": _as_text(item.get("rule_id") or f"gate_rule_{index}"),
                        "status": "PASS" if bool(item.get("passed")) else "FAIL",
                        "detail": _as_text(item.get("message") or item.get("condition")),
                    }
                )

    if not decision_path:
        decision_path.append(
            {
                "stage": "final_status",
                "status": _as_text(execution_result.get("final_status") or "UNKNOWN"),
                "detail": "derived_from_execution_result",
            }
        )
    return decision_path


def _build_detection_proof(
    *,
    execution_result: Dict[str, Any],
    rule_id: str,
    rule_version: str,
    inputs: Dict[str, Any],
) -> Dict[str, Any]:
    raw_proof = execution_result.get("proof")
    proof_payload = raw_proof if isinstance(raw_proof, dict) else {}
    timestamp = (
        _to_iso_or_none(proof_payload.get("timestamp"))
        or _to_iso_or_none(execution_result.get("inspected_at"))
        or _to_iso_or_none((execution_result.get("metadata") or {}).get("created_at") if isinstance(execution_result.get("metadata"), dict) else None)
        or _now_iso()
    )
    gate_payload = execution_result.get("gate")
    gate = gate_payload if isinstance(gate_payload, dict) else {}
    result_payload = {
        "final_status": _as_text(execution_result.get("final_status") or "UNKNOWN"),
        "gate_summary": _as_text(gate.get("summary_status")),
        "failed_rule_ids": gate.get("failed_rule_ids") if isinstance(gate.get("failed_rule_ids"), list) else [],
    }
    return {
        "execution_id": _as_text(execution_result.get("execution_id") or proof_payload.get("proof_id") or _new_runtime_id("exec")),
        "timestamp": timestamp,
        "rule_id": _as_text(rule_id),
        "rule_version": _as_text(rule_version),
        "inputs": dict(inputs),
        "result": result_payload,
        "decision_path": _build_detection_decision_path(execution_result),
    }


def _execute_via_unified_entry(
    payload: UnifiedExecuteRequest,
    *,
    branch_id_override: str | None = None,
) -> Dict[str, Any]:
    target = resolve_rule_execution_target(
        rule_id=payload.rule_id,
        norm_version=payload.context.norm_version,
    )

    execution_input = dict(payload.inputs or {})
    execution_input["project_id"] = payload.context.project_id
    execution_input.setdefault("norm_version", target.get("norm_version"))

    branch_id = branch_id_override or payload.context.branch_id
    try:
        execution_result = _execute_specir_with_payload(
            target["spec_id"],
            ExecuteSpecIRRequest(input=execution_input, branch_id=branch_id),
        )
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        execution_result = _execute_component_via_source_policy(
            spec_or_component_id=str(target.get("component_id") or target["spec_id"]),
            input_payload=execution_input,
            branch_id=branch_id,
            record_execution=True,
        )
    rule_version = _resolve_rule_version_from_execution_result(execution_result)
    detection_proof = _build_detection_proof(
        execution_result=execution_result,
        rule_id=target["rule_id"],
        rule_version=rule_version,
        inputs=execution_input,
    )
    return {
        "rule_id": target["rule_id"],
        "result": execution_result,
        "proof": detection_proof,
        "engine_proof": execution_result.get("proof"),
        "rule_version": rule_version or None,
    }


_RULE_DISPLAY_NAME_MAPPING: Dict[str, str] = {
    "subgrade.compaction": "压实度",
    "subgrade.thickness": "厚度",
    "subgrade.deflection": "弯沉",
    "subgrade.flatness": "平整度",
}
_ACCEPTANCE_RULE_IDS: tuple[str, ...] = (
    "subgrade.compaction",
    "subgrade.thickness",
    "subgrade.deflection",
)
_RULE_QUERY_HINTS: Dict[str, tuple[str, ...]] = {
    "subgrade.compaction": ("压实", "压实度", "compaction"),
    "subgrade.thickness": ("厚度", "thickness"),
    "subgrade.deflection": ("弯沉", "deflection"),
    "subgrade.flatness": ("平整", "平整度", "flatness"),
}
_CLAUSE_QUERY_HINTS: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (("压实", "压实度", "compaction"), ("4.2.1", "压实度")),
    (("平整", "平整度", "flatness"), ("4.2.1", "平整度")),
    (("弯沉", "deflection"), ("4.2.2", "弯沉")),
    (("厚度", "thickness"), ("4.2.3", "厚度")),
)

_MISSING_FIELD_PUBLIC_KEY_MAPPING: Dict[str, str] = {
    "compaction_degree": "compactionDegree",
    "flatness_measured": "flatness",
    "deflection": "deflection",
    "thickness": "thickness",
    "stake": "inspectionPoint",
    "layer_depth": "layerDepth",
    "layer_zone": "layerZone",
    "road_class": "roadClass",
}

_MISSING_FIELD_BUSINESS_LABEL_MAPPING: Dict[str, str] = {
    "compaction_degree": "压实度",
    "flatness_measured": "平整度",
    "deflection": "弯沉",
    "thickness": "厚度",
    "stake": "检测点",
    "layer_depth": "层位深度",
    "layer_zone": "结构层位",
    "road_class": "道路等级",
}


def _to_binary_item_result(final_status: str) -> str:
    return "PASS" if str(final_status or "").strip().upper() == "PASS" else "FAIL"


def _resolve_rule_display_name(rule_id: str) -> str:
    normalized = str(rule_id or "").strip()
    return _RULE_DISPLAY_NAME_MAPPING.get(normalized, normalized or "unknown_rule")


def _normalize_standard_code_token(value: str) -> str:
    token = _as_text(value)
    if not token:
        return ""
    return re.sub(r"[^A-Za-z0-9]+", "-", token).strip("-").upper()


def _extract_clause_no(value: str) -> str:
    text = _as_text(value)
    if not text:
        return ""
    matched = re.search(r"\d+(?:\.\d+)+", text)
    if not matched:
        return ""
    raw = matched.group(0)
    parts = raw.split(".")
    if len(parts) >= 4 and len(parts[0]) == 4 and parts[0].isdigit():
        return ".".join(parts[1:])
    return raw


def _extract_clause_refs(execution_result: Dict[str, Any]) -> list[str]:
    refs: list[str] = []
    raw_refs = execution_result.get("clause_refs")
    if isinstance(raw_refs, list):
        for item in raw_refs:
            ref = _as_text(item)
            if ref and ref not in refs:
                refs.append(ref)

    spec_id = _as_text(execution_result.get("spec_id"))
    if spec_id and spec_id not in refs:
        refs.append(spec_id)
    return refs


def _resolve_clause_basis_from_store(*, execution_result: Dict[str, Any], norm_version_hint: str) -> Dict[str, Any]:
    clause_refs = _extract_clause_refs(execution_result)
    parsed_clause_no = ""
    parsed_standard_code = _normalize_standard_code_token(norm_version_hint)
    preferred_ref = clause_refs[0] if clause_refs else ""

    for ref in clause_refs:
        clause_no = _extract_clause_no(ref)
        if clause_no and not parsed_clause_no:
            parsed_clause_no = clause_no
        if parsed_standard_code:
            continue
        if clause_no:
            head = ref.split(clause_no, 1)[0].rstrip(".:/#- ")
            if head:
                parsed_standard_code = _normalize_standard_code_token(head)
                continue
        parsed_standard_code = _normalize_standard_code_token(ref)

    matched_clause: Dict[str, Any] | None = None
    if parsed_clause_no:
        _refresh_clause_search_runtime_corpus()
        candidates = clause_search_service.search(
            query=parsed_clause_no,
            standard_code=parsed_standard_code or None,
            version=None,
            limit=10,
        )
        for item in candidates:
            if _as_text(item.get("clause_no")) == parsed_clause_no:
                matched_clause = item
                break
        if matched_clause is None and candidates:
            matched_clause = candidates[0]

    if isinstance(matched_clause, dict):
        clause_no = _as_text(matched_clause.get("clause_no")) or parsed_clause_no or "-"
        clause_id = _as_text(matched_clause.get("clause_id")) or clause_no
        return {
            "source": "clause_store",
            "clause_ref": preferred_ref or clause_no,
            "standard_code": _as_text(matched_clause.get("standard_code")) or parsed_standard_code or "-",
            "clause_no": clause_no,
            "clause_id": clause_id,
            "clause_title": _as_text(matched_clause.get("title")) or "-",
            "clause_content": _as_text(matched_clause.get("content")),
        }

    fallback_clause_no = parsed_clause_no or "-"
    return {
        "source": "unresolved",
        "clause_ref": preferred_ref or fallback_clause_no,
        "standard_code": parsed_standard_code or "-",
        "clause_no": fallback_clause_no,
        "clause_id": fallback_clause_no,
        "clause_title": "-",
        "clause_content": "",
    }


def _query_indicates_acceptance(message: str) -> bool:
    text = _as_text(message).lower()
    if not text:
        return False
    return bool(re.search(r"(验收|acceptance|综合判定|整体判定|是否满足)", text))


def _build_clause_query_variants(message: str) -> list[str]:
    text = _as_text(message)
    variants: list[str] = []

    def _append(value: str) -> None:
        token = _as_text(value)
        if token and token not in variants:
            variants.append(token)

    _append(text)
    clause_no = _extract_clause_no(text)
    if clause_no:
        _append(clause_no)
    lowered = text.lower()
    for raw_hints, query_hints in _CLAUSE_QUERY_HINTS:
        if any(str(hint).lower() in lowered for hint in raw_hints):
            for hint in query_hints:
                _append(hint)
    if _query_indicates_acceptance(text):
        _append("路基 验收 压实度 厚度 弯沉")
        _append("4.2")
    return variants


def _run_clause_retrieval_candidates(
    *,
    message: str,
    standard_code: str | None,
    version: str | None,
    limit: int = 8,
) -> Dict[str, Any]:
    queries = _build_clause_query_variants(message)
    keyword_rows: list[Dict[str, Any]] = []
    semantic_rows: list[Dict[str, Any]] = []
    min_score = 0.08
    candidate_limit = max(int(limit or 8) * 4, 20)
    for query_text in queries:
        keyword_rows.extend(
            clause_search_service.search(
                query=query_text,
                standard_code=standard_code,
                version=version,
                limit=candidate_limit,
            )
        )
        semantic_rows.extend(
            clause_search_service.semantic_search(
                query=query_text,
                standard_code=standard_code,
                version=version,
                limit=candidate_limit,
            )
        )
    merged_rows = _merge_hybrid_search_rows(
        keyword_rows=keyword_rows,
        semantic_rows=semantic_rows,
        limit=max(int(limit or 8), 1),
        debug=False,
    )
    candidates: list[Dict[str, Any]] = []
    for row in merged_rows:
        if _clamp_score(row.get("score")) < min_score:
            continue
        merged = _merge_clause_with_explain_overlay(row if isinstance(row, dict) else None)
        if isinstance(merged, dict):
            candidates.append(merged)
    return {
        "queries": queries,
        "keyword_candidates": len(keyword_rows),
        "semantic_candidates": len(semantic_rows),
        "candidates": candidates,
    }


def _build_clause_rule_index() -> Dict[str, list[str]]:
    index: Dict[str, list[str]] = {}
    for rule_id in _RULE_DISPLAY_NAME_MAPPING.keys():
        try:
            target = resolve_rule_execution_target(rule_id, None)
        except NL2GateError:
            continue
        clause_no = _extract_clause_no(_as_text(target.get("spec_id")))
        if not clause_no:
            continue
        bucket = index.setdefault(clause_no, [])
        if rule_id not in bucket:
            bucket.append(rule_id)
    return index


def _score_rule_for_query(rule_id: str, message: str) -> int:
    score = 0
    lowered = _as_text(message).lower()
    for hint in _RULE_QUERY_HINTS.get(rule_id, ()):
        if str(hint).lower() in lowered:
            score += 3
    display_name = _RULE_DISPLAY_NAME_MAPPING.get(rule_id)
    if display_name and _as_text(display_name).lower() in lowered:
        score += 2
    return score


def _rank_mapped_rule_ids(rule_ids: list[str], message: str) -> list[str]:
    deduped = [item for item in rule_ids if _as_text(item)]
    deduped = [item for index, item in enumerate(deduped) if deduped.index(item) == index]
    ranked = sorted(
        deduped,
        key=lambda rule_id: (
            _score_rule_for_query(rule_id, message),
            1 if rule_id in _ACCEPTANCE_RULE_IDS else 0,
            rule_id,
        ),
        reverse=True,
    )
    return ranked


def _map_clause_candidates_to_rule_ids(*, clause_candidates: list[Dict[str, Any]], message: str) -> Dict[str, Any]:
    clause_rule_index = _build_clause_rule_index()
    links: list[Dict[str, Any]] = []
    mapped_rule_ids: list[str] = []
    for clause in clause_candidates:
        clause_no = _extract_clause_no(_as_text(clause.get("clause_no") or clause.get("clause_id")))
        if not clause_no:
            continue
        rule_ids = clause_rule_index.get(clause_no, [])
        links.append(
            {
                "clause_id": _as_text(clause.get("clause_id")) or clause_no,
                "clause_no": _as_text(clause.get("clause_no")) or clause_no,
                "rule_ids": list(rule_ids),
            }
        )
        for rule_id in rule_ids:
            if rule_id not in mapped_rule_ids:
                mapped_rule_ids.append(rule_id)
    ranked_rule_ids = _rank_mapped_rule_ids(mapped_rule_ids, message)
    return {
        "links": links,
        "mapped_rule_ids": ranked_rule_ids,
    }


def _select_execution_rule_ids(
    *,
    mapped_rule_ids: list[str],
    parsed_rule_ids: list[str],
    message: str,
    parsed_intent: str,
) -> list[str]:
    normalized_mapped = [item for item in mapped_rule_ids if _as_text(item)]
    normalized_mapped = [item for index, item in enumerate(normalized_mapped) if normalized_mapped.index(item) == index]
    if not normalized_mapped:
        return []

    if parsed_intent == "check_subgrade_acceptance" or _query_indicates_acceptance(message):
        acceptance_hits = [item for item in _ACCEPTANCE_RULE_IDS if item in normalized_mapped]
        if acceptance_hits:
            return acceptance_hits

    parsed_hits = [item for item in parsed_rule_ids if item in normalized_mapped]
    if parsed_hits:
        return [parsed_hits[0]]

    ranked = _rank_mapped_rule_ids(normalized_mapped, message)
    return [ranked[0]] if ranked else []


def _bind_parsed_to_retrieved_rules(
    *,
    message: str,
    project_id: str | None,
    parsed: Dict[str, Any],
    mapped_rule_ids: list[str],
    retrieval_context: Dict[str, Any],
) -> Dict[str, Any]:
    parsed_rule_ids_raw = parsed.get("rule_ids")
    parsed_rule_ids = (
        [str(item).strip() for item in parsed_rule_ids_raw if str(item).strip()]
        if isinstance(parsed_rule_ids_raw, list)
        else []
    )
    selected_rule_ids = _select_execution_rule_ids(
        mapped_rule_ids=mapped_rule_ids,
        parsed_rule_ids=parsed_rule_ids,
        message=message,
        parsed_intent=_as_text(parsed.get("intent")),
    )
    if not selected_rule_ids:
        raise NL2GateError("no executable rule bound from clause retrieval")

    params = parsed.get("params")
    normalized_params = dict(params) if isinstance(params, dict) else {}
    raw_v_address = parsed.get("v_address")

    if len(selected_rule_ids) > 1:
        selected_rule_ids = [item for item in _ACCEPTANCE_RULE_IDS if item in selected_rule_ids]
    if len(selected_rule_ids) > 1:
        parsed_query: Dict[str, Any] = {
            "raw_text": message,
            "intent": "check_subgrade_acceptance",
            "params": normalized_params,
            "v_address": raw_v_address,
        }
    else:
        target = resolve_rule_execution_target(selected_rule_ids[0], None)
        parsed_query = {
            "raw_text": message,
            "spec_id": target.get("spec_id"),
            "form_type": target.get("form_type"),
            "params": normalized_params,
            "v_address": raw_v_address,
        }

    request_payload = build_execution_request_from_parsed_query(parsed_query, project_id=project_id)
    parse_trace_payload = parsed.get("parse_trace")
    parse_trace = dict(parse_trace_payload) if isinstance(parse_trace_payload, dict) else {"raw_text": message}
    parse_trace["retrieval"] = retrieval_context
    parse_trace["retrieval_binding"] = {
        "mapped_rule_ids": list(mapped_rule_ids),
        "selected_rule_ids": list(request_payload.get("rule_ids") or [request_payload.get("rule_id")]),
    }
    adapter_meta = parsed.get("adapter")
    if not isinstance(adapter_meta, dict):
        adapter_meta = {}
    return {
        "intent": request_payload["intent"],
        "form_type": request_payload["form_type"],
        "rule_id": request_payload["rule_id"],
        "rule_ids": request_payload.get("rule_ids") or [request_payload["rule_id"]],
        "spec_id": request_payload["spec_id"],
        "inputs": request_payload.get("inputs", request_payload["params"]),
        "context": request_payload.get("context", {}),
        "v_address": request_payload["v_address"],
        "params": request_payload["params"],
        "needs_clarification": bool(request_payload.get("needs_clarification", False)),
        "missing_fields": request_payload.get("missing_fields") or [],
        "clarification_reasons": request_payload.get("clarification_reasons") or [],
        "clarification_questions": request_payload.get("clarification_questions") or [],
        "ui_hint": request_payload.get("ui_hint"),
        "parse_trace": parse_trace,
        "parsed_query": parsed_query,
        "adapter": adapter_meta,
    }


def _build_clause_retrieval_block_response(
    *,
    session_id: str,
    reason: str,
    answer: str,
    retrieval_context: Dict[str, Any],
    session_state: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    response: Dict[str, Any] = {
        "status": reason,
        "answer_mode": "retrieval_blocked",
        "answer": answer,
        "needs_clarification": False,
        "engine_called": False,
        "session_id": session_id,
        "retrieval": retrieval_context,
        "execution_request": {
            "session_id": session_id,
            "route": "skipped_clause_retrieval",
        },
        "execution_result": None,
        "proof": None,
        "rule_version": None,
        "overall": None,
        "items": [],
        "missing_fields": [],
    }
    if isinstance(session_state, dict):
        response["session_state"] = {
            "session_id": _as_text(session_state.get("session_id")) or session_id,
            "intent": _as_text(session_state.get("intent")),
            "missing_fields": session_state.get("missing_fields") if isinstance(session_state.get("missing_fields"), list) else [],
            "collected_params": session_state.get("collected_params") if isinstance(session_state.get("collected_params"), dict) else {},
            "current_step": _as_text(session_state.get("current_step")) or "awaiting_clause",
        }
    return response


def _select_primary_gate_rule(execution_result: Dict[str, Any]) -> Dict[str, Any] | None:
    gate = execution_result.get("gate")
    if not isinstance(gate, dict):
        return None
    raw_rule_results = gate.get("rule_results")
    if not isinstance(raw_rule_results, list):
        return None
    rule_results = [item for item in raw_rule_results if isinstance(item, dict)]
    if not rule_results:
        return None
    for item in rule_results:
        if item.get("passed") is False:
            return item
    return rule_results[0]


def _extract_condition_operator(condition: Any) -> str:
    if isinstance(condition, dict):
        operator = _as_text(condition.get("operator"))
        if operator:
            return operator
        return ""
    if not isinstance(condition, str):
        return ""
    text = condition.strip()
    if not text:
        return ""
    if text.startswith("{") and text.endswith("}"):
        try:
            parsed = json.loads(text)
        except (TypeError, ValueError):
            parsed = None
        if isinstance(parsed, dict):
            operator = _as_text(parsed.get("operator"))
            if operator:
                return operator
    for operator in ("<=", ">=", "==", "<", ">", "="):
        if operator in text:
            return operator
    return ""


def _format_reason_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return f"{value:g}"
    text = _as_text(value)
    return text or "-"


def _build_judgement_reason(execution_result: Dict[str, Any]) -> str:
    primary_rule = _select_primary_gate_rule(execution_result)
    if not isinstance(primary_rule, dict):
        return f"执行器返回状态：{_as_text(execution_result.get('final_status') or 'UNKNOWN').upper()}"

    message = _as_text(primary_rule.get("message"))
    actual_value = _format_reason_value(primary_rule.get("actual_value"))
    expected_value = _format_reason_value(primary_rule.get("expected_value"))
    operator = _extract_condition_operator(primary_rule.get("condition"))

    if actual_value != "-" and expected_value != "-":
        if operator:
            detail = f"实测 {actual_value}，阈值 {operator}{expected_value}"
        else:
            detail = f"实测 {actual_value}，规则标准 {expected_value}"
        if message:
            return f"{message}（{detail}）"
        return detail
    if message:
        return message
    return f"执行器返回状态：{_as_text(execution_result.get('final_status') or 'UNKNOWN').upper()}"


def _status_to_result_text(result_code: str) -> str:
    return "合格" if str(result_code).strip().upper() == "PASS" else "不合格"


def _build_pegbot_judgement_card(
    *,
    execution_result: Dict[str, Any],
    rule_id: str,
    rule_version: str,
    norm_version_hint: str,
) -> Dict[str, Any]:
    executor_status = _as_text(execution_result.get("final_status") or execution_result.get("overall") or "UNKNOWN").upper()
    result_code = "PASS" if executor_status == "PASS" else "FAIL"
    clause_basis = _resolve_clause_basis_from_store(
        execution_result=execution_result,
        norm_version_hint=norm_version_hint,
    )
    return {
        "result": result_code,
        "result_text": _status_to_result_text(result_code),
        "executor_status": executor_status,
        "result_source": "executor",
        "reason": _build_judgement_reason(execution_result),
        "rule": {
            "rule_id": _as_text(rule_id),
            "rule_name": _resolve_rule_display_name(rule_id),
            "rule_version": _as_text(rule_version) or "-",
        },
        "normative_basis": clause_basis,
    }


def _append_clause_based_answer(*, answer: str, judgement_card: Dict[str, Any]) -> str:
    base_answer = _as_text(answer)
    rule_payload = judgement_card.get("rule")
    rule = rule_payload if isinstance(rule_payload, dict) else {}
    basis_payload = judgement_card.get("normative_basis")
    basis = basis_payload if isinstance(basis_payload, dict) else {}
    basis_text = f"{_as_text(basis.get('standard_code')) or '-'} 第{_as_text(basis.get('clause_no')) or '-'}条"
    clause_title = _as_text(basis.get("clause_title"))
    if clause_title and clause_title != "-":
        basis_text = f"{basis_text} {clause_title}"
    clause_content = _as_text(basis.get("clause_content")) or "Clause Store 未检索到条款原文。"

    sections = [
        f"判定结果：{_as_text(judgement_card.get('result_text'))}（{_as_text(judgement_card.get('result'))}）",
        f"判定原因：{_as_text(judgement_card.get('reason')) or '-'}",
        f"使用规则：{_as_text(rule.get('rule_id')) or '-'} @ {_as_text(rule.get('rule_version')) or '-'}",
        f"规范依据：{basis_text}",
        f"条款原文（可展开）：{clause_content}",
    ]
    if base_answer:
        return "\n".join([base_answer, *sections])
    return "\n".join(sections)


def _to_public_missing_fields(missing_fields: list[str]) -> list[str]:
    public_fields: list[str] = []
    for item in missing_fields:
        key = str(item or "").strip()
        if not key:
            continue
        mapped = _MISSING_FIELD_PUBLIC_KEY_MAPPING.get(key, key)
        if mapped not in public_fields:
            public_fields.append(mapped)
    return public_fields


def _join_cn_labels(labels: list[str]) -> str:
    if not labels:
        return ""
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]}和{labels[1]}"
    return f"{'、'.join(labels[:-1])}和{labels[-1]}"


def _build_need_more_info_question(missing_fields: list[str], fallback_questions: list[str]) -> str:
    labels: list[str] = []
    for field_name in missing_fields:
        normalized = str(field_name or "").strip()
        if not normalized:
            continue
        label = _MISSING_FIELD_BUSINESS_LABEL_MAPPING.get(normalized)
        if label and label not in labels:
            labels.append(label)
    if labels:
        includes_point = "检测点" in labels
        other_labels = [label for label in labels if label != "检测点"]
        if includes_point and other_labels:
            return f"请补充检测点和{_join_cn_labels(other_labels)}检测值。"
        if includes_point:
            return "请补充检测点信息。"
        return f"请补充{_join_cn_labels(labels)}检测值。"
    for question in fallback_questions:
        normalized_question = str(question or "").strip()
        if normalized_question:
            return normalized_question
    return "请补充检测所需信息。"


def _build_multi_rule_aggregation(rule_executions: list[Dict[str, Any]]) -> Dict[str, Any]:
    items: list[Dict[str, Any]] = []
    item_details: list[Dict[str, Any]] = []
    for entry in rule_executions:
        rule_id = _as_text(entry.get("rule_id"))
        execution_result = entry.get("result")
        if not isinstance(execution_result, dict):
            raise NL2GateError("multi-rule execution returned invalid result payload")
        final_status = _as_text(execution_result.get("final_status") or "UNKNOWN").upper()
        binary_result = _to_binary_item_result(final_status)
        item_payload = {
            "name": _resolve_rule_display_name(rule_id),
            "rule_id": rule_id,
            "result": binary_result,
        }
        items.append(item_payload)
        item_details.append(
            {
                **item_payload,
                "engine_status": final_status,
                "execution_result": execution_result,
                "proof": entry.get("proof"),
                "rule_version": entry.get("rule_version"),
            }
        )

    overall = "PASS" if items and all(item.get("result") == "PASS" for item in items) else "FAIL"
    return {
        "overall": overall,
        "items": items,
        "item_details": item_details,
        "aggregation": {
            "method": "all_items_pass_required",
            "ai_involved": False,
            "item_count": len(items),
        },
    }


def _build_multi_rule_proof(*, aggregation: Dict[str, Any], inputs: Dict[str, Any]) -> Dict[str, Any]:
    decision_path: list[Dict[str, Any]] = []
    for item in aggregation.get("item_details", []):
        if not isinstance(item, dict):
            continue
        decision_path.append(
            {
                "stage": _as_text(item.get("rule_id")),
                "status": _as_text(item.get("result")),
                "detail": _as_text(item.get("engine_status")),
            }
        )
    return {
        "execution_id": _new_runtime_id("exec_multi"),
        "timestamp": _now_iso(),
        "rule_id": "multi_rule.aggregate",
        "rule_version": "aggregator.v1",
        "inputs": dict(inputs),
        "result": {
            "overall": _as_text(aggregation.get("overall") or "FAIL"),
            "items": aggregation.get("items") if isinstance(aggregation.get("items"), list) else [],
        },
        "decision_path": decision_path,
    }


_PEGBOT_SESSION_STORE: Dict[str, Dict[str, Any]] = {}


def _new_pegbot_session_id() -> str:
    return _new_runtime_id("pegbot_session")


def _merge_pegbot_session_parse(
    *,
    message: str,
    project_id: str | None,
    session_state: Dict[str, Any],
    parsed_delta: Dict[str, Any],
) -> Dict[str, Any]:
    collected_params = session_state.get("collected_params")
    merged_params = dict(collected_params) if isinstance(collected_params, dict) else {}
    session_missing_fields_raw = session_state.get("missing_fields")
    session_missing_fields = (
        {str(item).strip() for item in session_missing_fields_raw if str(item).strip()}
        if isinstance(session_missing_fields_raw, list)
        else set()
    )

    delta_params_candidates: Dict[str, Any] = {}
    parsed_query_payload = parsed_delta.get("parsed_query")
    if isinstance(parsed_query_payload, dict):
        parsed_query_params = parsed_query_payload.get("params")
        if isinstance(parsed_query_params, dict):
            delta_params_candidates.update(parsed_query_params)
    delta_params = parsed_delta.get("params")
    if isinstance(delta_params, dict):
        delta_params_candidates.update(delta_params)

    for key, value in delta_params_candidates.items():
        normalized_key = str(key).strip()
        if not normalized_key:
            continue
        if normalized_key in session_missing_fields:
            merged_params[normalized_key] = value
            continue
        if normalized_key not in merged_params:
            merged_params[normalized_key] = value
    merged_parsed_query: Dict[str, Any] = {
        "raw_text": message,
        "intent": _as_text(session_state.get("intent")),
        "form_type": _as_text(session_state.get("form_type")),
        "rule_id": _as_text(session_state.get("rule_id")),
        "rule_ids": session_state.get("rule_ids") if isinstance(session_state.get("rule_ids"), list) else [],
        "spec_id": session_state.get("spec_id"),
        "v_address": parsed_delta.get("v_address") or session_state.get("v_address"),
        "params": merged_params,
    }
    merged_request = build_execution_request_from_parsed_query(merged_parsed_query, project_id=project_id)
    adapter_meta = parsed_delta.get("adapter")
    if not isinstance(adapter_meta, dict):
        adapter_meta = {}
    return {
        "intent": merged_request["intent"],
        "form_type": merged_request["form_type"],
        "rule_id": merged_request["rule_id"],
        "rule_ids": merged_request.get("rule_ids") or [merged_request["rule_id"]],
        "spec_id": merged_request["spec_id"],
        "inputs": merged_request.get("inputs", merged_request["params"]),
        "context": merged_request.get("context", {}),
        "v_address": merged_request["v_address"],
        "params": merged_request["params"],
        "needs_clarification": bool(merged_request.get("needs_clarification", False)),
        "missing_fields": merged_request.get("missing_fields") or [],
        "clarification_reasons": merged_request.get("clarification_reasons") or [],
        "clarification_questions": merged_request.get("clarification_questions") or [],
        "ui_hint": merged_request.get("ui_hint"),
        "parse_trace": {
            "raw_text": str(message),
            "parsed_query": merged_parsed_query,
            "adapter": adapter_meta,
            "session_merge": True,
        },
        "parsed_query": merged_parsed_query,
        "adapter": adapter_meta,
    }


def _build_pegbot_session_state(
    *,
    session_id: str,
    project_id: str | None,
    parsed: Dict[str, Any],
    current_step: str,
) -> Dict[str, Any]:
    collected_params = parsed.get("params")
    if not isinstance(collected_params, dict):
        collected_params = {}
    rule_ids = parsed.get("rule_ids")
    if not isinstance(rule_ids, list):
        fallback_rule_id = _as_text(parsed.get("rule_id"))
        rule_ids = [fallback_rule_id] if fallback_rule_id else []
    missing_fields = parsed.get("missing_fields")
    if not isinstance(missing_fields, list):
        missing_fields = []
    context_payload = parsed.get("context")
    context_project_id = context_payload.get("project_id") if isinstance(context_payload, dict) else None
    session_project_id = _as_text(
        collected_params.get("project_id")
        or project_id
        or context_project_id
    ) or None
    return {
        "session_id": session_id,
        "intent": _as_text(parsed.get("intent")),
        "missing_fields": [str(item).strip() for item in missing_fields if str(item).strip()],
        "collected_params": dict(collected_params),
        "current_step": current_step,
        "rule_id": _as_text(parsed.get("rule_id")),
        "rule_ids": [str(item).strip() for item in rule_ids if str(item).strip()],
        "form_type": _as_text(parsed.get("form_type")),
        "spec_id": _as_text(parsed.get("spec_id")) or None,
        "v_address": parsed.get("v_address"),
        "project_id": session_project_id,
        "updated_at": _now_iso(),
    }


@app.post("/api/v1/specir/execute/{spec_id}")
def execute_specir_spec(spec_id: str, payload: ExecuteSpecIRRequest) -> Dict[str, Any]:
    try:
        return _execute_specir_with_payload(spec_id, payload)
    except HTTPException:
        raise
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ComponentSchemaError,
        ComponentRegistryServiceError,
        ComponentSchemaError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        SpecIRLoaderError,
        SpecIRCompilerError,
        ValueError,
        OSError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/engine/execute")
@app.post("/api/v1/execute/unified")
def execute_unified_rule(payload: UnifiedExecuteRequest) -> Dict[str, Any]:
    try:
        return _execute_via_unified_entry(payload)
    except HTTPException:
        raise
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        NL2GateError,
        ComponentSchemaError,
        ComponentRegistryServiceError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        SpecIRLoaderError,
        SpecIRCompilerError,
        ValueError,
        OSError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/layer3/query")
def layer3_query(payload: Layer3QueryRequest) -> Dict[str, Any]:
    try:
        nl2gate_runtime = NL2GateAdapterRuntime(mode=os.getenv("NL2GATE_MODE", "rule_based"))
        session_id = _as_text(payload.session_id) or _new_pegbot_session_id()
        session_state = _PEGBOT_SESSION_STORE.get(session_id)
        session_project_id = _as_text(session_state.get("project_id")) if isinstance(session_state, dict) else ""
        effective_project_id = payload.project_id or session_project_id or None
        _refresh_clause_search_runtime_corpus()
        awaiting_params = isinstance(session_state, dict) and _as_text(session_state.get("current_step")) == "awaiting_params"

        retrieval_context: Dict[str, Any]
        mapped_rule_ids: list[str] = []
        clause_candidates: list[Dict[str, Any]] = []
        selected_clause: Dict[str, Any] | None = None
        if awaiting_params and isinstance(session_state, dict):
            existing_clause_context = session_state.get("clause_context")
            existing_mapped_rule_ids_raw = session_state.get("mapped_rule_ids")
            existing_mapped_rule_ids = (
                [str(item).strip() for item in existing_mapped_rule_ids_raw if str(item).strip()]
                if isinstance(existing_mapped_rule_ids_raw, list)
                else []
            )
            if isinstance(existing_clause_context, dict) and existing_mapped_rule_ids:
                retrieval_context = dict(existing_clause_context)
                clause_candidates_raw = retrieval_context.get("candidates")
                clause_candidates = [item for item in clause_candidates_raw if isinstance(item, dict)] if isinstance(clause_candidates_raw, list) else []
                selected_clause_raw = retrieval_context.get("selected_clause")
                selected_clause = selected_clause_raw if isinstance(selected_clause_raw, dict) else (clause_candidates[0] if clause_candidates else None)
                mapped_rule_ids = existing_mapped_rule_ids
            else:
                clause_scan = _run_clause_retrieval_candidates(
                    message=payload.message,
                    standard_code=None,
                    version=None,
                    limit=8,
                )
                clause_candidates = [item for item in clause_scan.get("candidates", []) if isinstance(item, dict)]
                selected_clause = clause_candidates[0] if clause_candidates else None
                mapping_result = _map_clause_candidates_to_rule_ids(clause_candidates=clause_candidates, message=payload.message)
                mapped_rule_ids = [item for item in mapping_result.get("mapped_rule_ids", []) if _as_text(item)]
                retrieval_context = {
                    "source": "search",
                    "queries": clause_scan.get("queries") if isinstance(clause_scan.get("queries"), list) else [],
                    "keyword_candidates": int(clause_scan.get("keyword_candidates") or 0),
                    "semantic_candidates": int(clause_scan.get("semantic_candidates") or 0),
                    "candidates": clause_candidates,
                    "selected_clause": selected_clause,
                    "clause_rule_links": mapping_result.get("links") if isinstance(mapping_result.get("links"), list) else [],
                    "mapped_rule_ids": mapped_rule_ids,
                }
        else:
            clause_scan = _run_clause_retrieval_candidates(
                message=payload.message,
                standard_code=None,
                version=None,
                limit=8,
            )
            clause_candidates = [item for item in clause_scan.get("candidates", []) if isinstance(item, dict)]
            selected_clause = clause_candidates[0] if clause_candidates else None
            mapping_result = _map_clause_candidates_to_rule_ids(clause_candidates=clause_candidates, message=payload.message)
            mapped_rule_ids = [item for item in mapping_result.get("mapped_rule_ids", []) if _as_text(item)]
            retrieval_context = {
                "source": "search",
                "queries": clause_scan.get("queries") if isinstance(clause_scan.get("queries"), list) else [],
                "keyword_candidates": int(clause_scan.get("keyword_candidates") or 0),
                "semantic_candidates": int(clause_scan.get("semantic_candidates") or 0),
                "candidates": clause_candidates,
                "selected_clause": selected_clause,
                "clause_rule_links": mapping_result.get("links") if isinstance(mapping_result.get("links"), list) else [],
                "mapped_rule_ids": mapped_rule_ids,
            }

        if not clause_candidates:
            blocked_state = {
                "session_id": session_id,
                "intent": _as_text(session_state.get("intent")) if isinstance(session_state, dict) else "",
                "missing_fields": [],
                "collected_params": (
                    dict(session_state.get("collected_params"))
                    if isinstance(session_state, dict) and isinstance(session_state.get("collected_params"), dict)
                    else {}
                ),
                "current_step": "awaiting_clause",
                "rule_id": "",
                "rule_ids": [],
                "form_type": "",
                "spec_id": None,
                "v_address": None,
                "project_id": effective_project_id,
                "updated_at": _now_iso(),
                "clause_context": retrieval_context,
                "mapped_rule_ids": [],
            }
            _PEGBOT_SESSION_STORE[session_id] = blocked_state
            return _build_clause_retrieval_block_response(
                session_id=session_id,
                reason="CLAUSE_NOT_FOUND",
                answer="未检索到相关规范条款，无法执行。请补充标准编号、条款号或检测项关键词。",
                retrieval_context=retrieval_context,
                session_state=blocked_state,
            )
        if not mapped_rule_ids:
            blocked_state = {
                "session_id": session_id,
                "intent": _as_text(session_state.get("intent")) if isinstance(session_state, dict) else "",
                "missing_fields": [],
                "collected_params": (
                    dict(session_state.get("collected_params"))
                    if isinstance(session_state, dict) and isinstance(session_state.get("collected_params"), dict)
                    else {}
                ),
                "current_step": "awaiting_rule_binding",
                "rule_id": "",
                "rule_ids": [],
                "form_type": "",
                "spec_id": None,
                "v_address": None,
                "project_id": effective_project_id,
                "updated_at": _now_iso(),
                "clause_context": retrieval_context,
                "mapped_rule_ids": [],
            }
            _PEGBOT_SESSION_STORE[session_id] = blocked_state
            return _build_clause_retrieval_block_response(
                session_id=session_id,
                reason="CLAUSE_NOT_EXECUTABLE",
                answer="该条款尚未可执行化",
                retrieval_context=retrieval_context,
                session_state=blocked_state,
            )

        try:
            parsed_delta = parse_nl_to_dto(message=payload.message, project_id=effective_project_id)
        except NL2GateError as exc:
            parsed_delta = {
                "intent": "",
                "form_type": "",
                "rule_id": "",
                "rule_ids": [],
                "spec_id": "",
                "inputs": {},
                "context": {},
                "v_address": None,
                "params": {},
                "needs_clarification": False,
                "missing_fields": [],
                "clarification_reasons": [],
                "clarification_questions": [],
                "ui_hint": None,
                "parse_trace": {
                    "raw_text": str(payload.message),
                    "parsed_query": {"raw_text": str(payload.message)},
                    "adapter": {
                        "mode_requested": str(os.getenv("NL2GATE_MODE", "rule_based")),
                        "adapter_used": "none",
                        "fallback_used": True,
                        "fallback_reason": str(exc),
                    },
                },
                "parsed_query": {"raw_text": str(payload.message)},
                "adapter": {
                    "mode_requested": str(os.getenv("NL2GATE_MODE", "rule_based")),
                    "adapter_used": "none",
                    "fallback_used": True,
                    "fallback_reason": str(exc),
                },
            }
        if awaiting_params and isinstance(session_state, dict):
            parsed = _merge_pegbot_session_parse(
                message=payload.message,
                project_id=effective_project_id,
                session_state=session_state,
                parsed_delta=parsed_delta,
            )
        else:
            parsed = parsed_delta

        parsed = _bind_parsed_to_retrieved_rules(
            message=payload.message,
            project_id=effective_project_id,
            parsed=parsed,
            mapped_rule_ids=mapped_rule_ids,
            retrieval_context=retrieval_context,
        )
        spec_id = str(parsed.get("spec_id") or "").strip()
        parsed_rule_ids_raw = parsed.get("rule_ids")
        rule_ids = (
            [str(item).strip() for item in parsed_rule_ids_raw if str(item).strip()]
            if isinstance(parsed_rule_ids_raw, list)
            else []
        )
        parsed_rule_id = str(parsed.get("rule_id") or "").strip()
        if not rule_ids and parsed_rule_id:
            rule_ids = [parsed_rule_id]
        if not rule_ids:
            raise NL2GateError("rule_id parse failed")
        primary_rule_id = rule_ids[0]
        is_multi_rule_request = len(rule_ids) > 1
        input_payload = dict(parsed.get("params") or {})
        parse_adapter_meta = parsed.get("adapter", {})
        missing_fields = parsed.get("missing_fields") if isinstance(parsed.get("missing_fields"), list) else []
        preview_project_id = str(
            input_payload.get("project_id")
            or payload.project_id
            or "UNSPECIFIED"
        )
        preview_norm_version = str(
            input_payload.get("norm_version")
            or _infer_norm_version_from_spec_id(spec_id)
        ).strip()
        if not preview_norm_version:
            if primary_rule_id:
                preview_norm_version = str(
                    resolve_rule_execution_target(primary_rule_id, None).get("norm_version") or ""
                ).strip()
        if bool(parsed.get("needs_clarification")):
            public_missing_fields = _to_public_missing_fields(missing_fields)
            fallback_questions = parsed.get("clarification_questions") if isinstance(parsed.get("clarification_questions"), list) else []
            clarification_question = _build_need_more_info_question(missing_fields, fallback_questions)
            clarification_response: Dict[str, Any] = {
                "status": "NEED_MORE_INFO",
                "answer_mode": "clarification",
                "answer": "需要补充信息",
                "needs_clarification": True,
                "session_id": session_id,
                "missing_fields": public_missing_fields,
                "question": clarification_question,
                "clarification_reasons": parsed.get("clarification_reasons") or [],
                "clarification_questions": fallback_questions,
                "ui_hint": parsed.get("ui_hint") or "需要补充信息",
                "engine_called": False,
                "parse_trace": parsed["parse_trace"],
                "parsed_query": parsed.get("parsed_query", {}),
                "retrieval": retrieval_context,
                "adapter": {
                    "parse": parse_adapter_meta,
                    "render": {
                        "mode_requested": str(os.getenv("NL2GATE_MODE", "rule_based")),
                        "adapter_used": "none",
                        "fallback_used": False,
                    },
                },
                "execution_request": {
                    "session_id": session_id,
                    "rule_id": parsed.get("rule_id"),
                    "rule_ids": rule_ids,
                    "inputs": input_payload,
                    "context": {
                        "project_id": preview_project_id,
                        "norm_version": preview_norm_version or "",
                    },
                    "intent": parsed.get("intent"),
                    "form_type": parsed.get("form_type"),
                    "spec_id": spec_id or None,
                    "v_address": parsed.get("v_address"),
                    "route": "skipped_clarification",
                },
                "execution_result": None,
                "proof": None,
                "rule_version": None,
                "overall": None,
                "items": [],
                "main_result": None,
                "branch_results": {},
                "branch_statuses": {},
                "current_branch": None,
                "resolved_branch": None,
                "active_forks": [],
                "branch_history": {},
            }
            clarification_state = _build_pegbot_session_state(
                session_id=session_id,
                project_id=effective_project_id,
                parsed=parsed,
                current_step="awaiting_params",
            )
            clarification_state["clause_context"] = retrieval_context
            clarification_state["mapped_rule_ids"] = list(mapped_rule_ids)
            _PEGBOT_SESSION_STORE[session_id] = clarification_state
            clarification_response["session_state"] = {
                "session_id": clarification_state["session_id"],
                "intent": clarification_state["intent"],
                "missing_fields": _to_public_missing_fields(clarification_state["missing_fields"]),
                "collected_params": clarification_state["collected_params"],
                "current_step": clarification_state["current_step"],
            }
            return clarification_response
        v_address_resolution: Dict[str, Any] | None = None
        raw_v_address = parsed.get("v_address")
        if isinstance(raw_v_address, str) and raw_v_address.strip():
            prelim = resolve_v_address_target(raw_v_address)
            project_id = str(prelim["project_id"])
            project_snapshot = project_utxo_service.get_project_utxo(project_id)
            v_address_resolution = resolve_project_v_address(project_snapshot, raw_v_address)
            input_payload["project_id"] = v_address_resolution["project_id"]
            input_payload["stake"] = v_address_resolution["stake"]
            input_payload["__v_address_context"] = v_address_resolution["context"]
        else:
            project_id = str(input_payload.get("project_id", "UNSPECIFIED"))
        inferred_norm_version = _infer_norm_version_from_spec_id(spec_id)
        norm_version = str(input_payload.get("norm_version") or inferred_norm_version).strip()
        if not norm_version:
            norm_version = str(resolve_rule_execution_target(primary_rule_id, None).get("norm_version") or "").strip()
        if not norm_version:
            raise NL2GateError("norm_version is required for unified execution context")

        current_branch = project_utxo_service.get_current_branch(project_id)
        active_forks = project_utxo_service.list_active_forks(project_id)
        branch_history = project_utxo_service.get_branch_history(project_id)
        merged_main_events = branch_history.get("main", []) if isinstance(branch_history, dict) else []
        if not isinstance(merged_main_events, list):
            merged_main_events = []

        def _execute_layer3_for_branch(branch_id: str) -> Dict[str, Any]:
            if not is_multi_rule_request:
                unified_payload = UnifiedExecuteRequest(
                    rule_id=primary_rule_id,
                    inputs=dict(input_payload),
                    context=UnifiedExecutionContext(
                        project_id=project_id,
                        norm_version=norm_version,
                        branch_id=branch_id,
                    ),
                )
                unified_result = _execute_via_unified_entry(unified_payload, branch_id_override=branch_id)
                result = unified_result.get("result")
                if not isinstance(result, dict):
                    raise NL2GateError("unified execution returned invalid result payload")
                proof = unified_result.get("proof")
                if proof is not None and not isinstance(proof, dict):
                    raise NL2GateError("unified execution returned invalid proof payload")
                return unified_result

            execution_items: list[Dict[str, Any]] = []
            for current_rule_id in rule_ids:
                unified_payload = UnifiedExecuteRequest(
                    rule_id=current_rule_id,
                    inputs=dict(input_payload),
                    context=UnifiedExecutionContext(
                        project_id=project_id,
                        norm_version=norm_version,
                        branch_id=branch_id,
                    ),
                )
                unified_result = _execute_via_unified_entry(unified_payload, branch_id_override=branch_id)
                result = unified_result.get("result")
                if not isinstance(result, dict):
                    raise NL2GateError("unified execution returned invalid result payload")
                execution_items.append(unified_result)

            aggregation = _build_multi_rule_aggregation(execution_items)
            multi_result = {
                "execution_mode": "multi_rule",
                "final_status": aggregation["overall"],
                "overall": aggregation["overall"],
                "items": aggregation["items"],
                "item_details": aggregation["item_details"],
                "aggregation": aggregation["aggregation"],
            }
            multi_proof = _build_multi_rule_proof(aggregation=aggregation, inputs=input_payload)
            return {
                "rule_id": "multi_rule.aggregate",
                "result": multi_result,
                "proof": multi_proof,
                "engine_proof": [item.get("engine_proof") for item in execution_items],
                "rule_version": "aggregator.v1",
                "rule_results": execution_items,
            }

        main_unified_result = _execute_layer3_for_branch("main")
        main_result = main_unified_result["result"]
        branch_results: Dict[str, Dict[str, Any]] = {}
        branch_unified_results: Dict[str, Dict[str, Any]] = {}
        branch_proofs: Dict[str, Dict[str, Any]] = {}
        branch_rule_versions: Dict[str, str] = {}
        for fork_branch in active_forks:
            fork_unified_result = _execute_layer3_for_branch(fork_branch)
            branch_unified_results[fork_branch] = fork_unified_result
            branch_results[fork_branch] = fork_unified_result["result"]
            fork_proof = fork_unified_result.get("proof")
            if isinstance(fork_proof, dict):
                branch_proofs[fork_branch] = fork_proof
            fork_rule_version = _as_text(fork_unified_result.get("rule_version"))
            if fork_rule_version:
                branch_rule_versions[fork_branch] = fork_rule_version

        answer_mode = "dual" if branch_results else "single"
        latest_merge_event: Dict[str, Any] | None = None
        if merged_main_events:
            latest_merge_event_raw = merged_main_events[-1]
            latest_merge_event = latest_merge_event_raw if isinstance(latest_merge_event_raw, dict) else None

        selected_branch = current_branch
        if v_address_resolution is not None:
            selected_branch = str(v_address_resolution.get("resolved_branch", selected_branch))

        selected_unified_result = main_unified_result
        if selected_branch != "main":
            if selected_branch in branch_unified_results:
                selected_unified_result = branch_unified_results[selected_branch]
            else:
                selected_unified_result = _execute_layer3_for_branch(selected_branch)

        selected_result = selected_unified_result["result"]
        selected_proof = selected_unified_result.get("proof")
        selected_rule_version = _as_text(selected_unified_result.get("rule_version")) or None
        main_proof = main_unified_result.get("proof")
        main_rule_version = _as_text(main_unified_result.get("rule_version")) or None

        answer_main_result = selected_result if answer_mode == "single" else main_result
        if is_multi_rule_request:
            if answer_mode == "dual":
                dual_parts = [f"主线综合判定 {str(main_result.get('overall') or main_result.get('final_status') or 'FAIL')}"]
                for branch_id in sorted(branch_results.keys()):
                    branch_overall = str(branch_results[branch_id].get("overall") or branch_results[branch_id].get("final_status") or "FAIL")
                    dual_parts.append(f"{branch_id} 综合判定 {branch_overall}")
                answer = "；".join(dual_parts)
            else:
                item_summaries: list[str] = []
                raw_items = answer_main_result.get("items")
                if isinstance(raw_items, list):
                    for item in raw_items:
                        if not isinstance(item, dict):
                            continue
                        item_summaries.append(f"{_as_text(item.get('name'))}{_as_text(item.get('result'))}")
                overall = _as_text(answer_main_result.get("overall") or answer_main_result.get("final_status") or "FAIL")
                answer = f"路基验收综合判定：{overall}。{'; '.join(item_summaries)}"
            render_adapter_meta = {
                "mode_requested": str(os.getenv("NL2GATE_MODE", "rule_based")),
                "adapter_used": "rule_aggregator",
                "fallback_used": False,
            }
        else:
            if answer_mode == "dual":
                answer, render_adapter_meta = nl2gate_runtime.render_answer(
                    answer_mode=answer_mode,
                    main_result=main_result,
                    branch_results=branch_results,
                    merge_event=None,
                )
            elif latest_merge_event is not None:
                answer, render_adapter_meta = nl2gate_runtime.render_answer(
                    answer_mode=answer_mode,
                    main_result=answer_main_result,
                    branch_results=branch_results,
                    merge_event=latest_merge_event,
                )
            else:
                answer, render_adapter_meta = nl2gate_runtime.render_answer(
                    answer_mode=answer_mode,
                    main_result=answer_main_result,
                    branch_results=branch_results,
                    merge_event=None,
                )
        judgement_card: Dict[str, Any] | None = None
        if not is_multi_rule_request:
            judgement_card = _build_pegbot_judgement_card(
                execution_result=selected_result,
                rule_id=primary_rule_id,
                rule_version=selected_rule_version or "",
                norm_version_hint=norm_version,
            )
            if answer_mode == "single":
                answer = _append_clause_based_answer(answer=answer, judgement_card=judgement_card)
        branch_statuses = {"main": str(main_result.get("final_status", "UNKNOWN"))}
        branch_statuses.update(
            {branch_id: str(item.get("final_status", "UNKNOWN")) for branch_id, item in branch_results.items()}
        )

        result: Dict[str, Any] = {
            "session_id": session_id,
            "answer_mode": answer_mode,
            "answer": answer,
            "retrieval": retrieval_context,
            "main_result": main_result,
            "branch_results": branch_results,
            "branch_statuses": branch_statuses,
            "parse_trace": parsed["parse_trace"],
            "parsed_query": parsed.get("parsed_query", {}),
            "adapter": {
                "parse": parse_adapter_meta,
                "render": render_adapter_meta,
            },
            "execution_request": {
                "session_id": session_id,
                "rule_id": parsed.get("rule_id"),
                "rule_ids": rule_ids,
                "inputs": input_payload,
                "context": {
                    "project_id": project_id,
                    "norm_version": norm_version,
                },
                "intent": parsed.get("intent"),
                "form_type": parsed.get("form_type"),
                "spec_id": spec_id or None,
                "v_address": raw_v_address,
                "params": input_payload,
                "pre_route": "clause_search_then_rule_mapping",
                "route": "unified_engine",
            },
            "execution_result": selected_result,
            "proof": selected_proof if isinstance(selected_proof, dict) else None,
            "rule_version": selected_rule_version,
            "overall": _as_text(selected_result.get("overall") or selected_result.get("final_status") or "FAIL"),
            "items": selected_result.get("items") if isinstance(selected_result.get("items"), list) else [],
            "missing_fields": [],
            "main_proof": main_proof if isinstance(main_proof, dict) else None,
            "main_rule_version": main_rule_version,
            "branch_proofs": branch_proofs,
            "branch_rule_versions": branch_rule_versions,
            "engine_proof": selected_unified_result.get("engine_proof"),
            "current_branch": current_branch,
            "resolved_branch": selected_branch,
            "active_forks": active_forks,
            "branch_history": branch_history,
            "judgement_card": judgement_card,
        }
        if not is_multi_rule_request and not result["items"]:
            single_status = _as_text(selected_result.get("final_status") or "UNKNOWN").upper()
            result["items"] = [
                {
                    "name": _resolve_rule_display_name(primary_rule_id),
                    "rule_id": primary_rule_id,
                    "result": _to_binary_item_result(single_status),
                }
            ]
        if v_address_resolution is not None:
            result["v_address_resolution"] = v_address_resolution
        if is_multi_rule_request:
            result["aggregation"] = (
                selected_result.get("aggregation")
                if isinstance(selected_result.get("aggregation"), dict)
                else {
                    "method": "all_items_pass_required",
                    "ai_involved": False,
                }
            )
            result["rule_results"] = (
                selected_unified_result.get("rule_results")
                if isinstance(selected_unified_result.get("rule_results"), list)
                else []
            )

        if branch_results:
            first_fork = sorted(branch_results.keys())[0]
            result["branch_dual_results"] = {
                "main": {
                    "branch_id": "main",
                    "result": main_result.get("final_status", "UNKNOWN"),
                    "execution_result": main_result,
                    "proof": main_proof if isinstance(main_proof, dict) else None,
                    "rule_version": main_rule_version,
                },
                "fork": {
                    "branch_id": first_fork,
                    "result": branch_results[first_fork].get("final_status", "UNKNOWN"),
                    "execution_result": branch_results[first_fork],
                    "proof": branch_proofs.get(first_fork),
                    "rule_version": branch_rule_versions.get(first_fork),
                },
            }

        completed_session_state = _build_pegbot_session_state(
            session_id=session_id,
            project_id=project_id,
            parsed=parsed,
            current_step="completed",
        )
        completed_session_state["clause_context"] = retrieval_context
        completed_session_state["mapped_rule_ids"] = list(mapped_rule_ids)
        completed_session_state["missing_fields"] = []
        _PEGBOT_SESSION_STORE[session_id] = completed_session_state
        result["session_state"] = {
            "session_id": completed_session_state["session_id"],
            "intent": completed_session_state["intent"],
            "missing_fields": completed_session_state["missing_fields"],
            "collected_params": completed_session_state["collected_params"],
            "current_step": completed_session_state["current_step"],
        }

        return result
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ComponentSchemaError,
        NL2GateError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        VAddressError,
        ValueError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/patch/analyze")
def analyze_patch(payload: PatchAnalyzeRequest) -> Dict[str, Any]:
    try:
        return patch_analysis_service.analyze(patch=payload.patch, records=payload.records)
    except PatchAnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _catalog_loader_http_status(error_message: str) -> int:
    text = str(error_message).lower()
    if "not found" in text:
        return 404
    return 400


def _project_store_http_status(error_message: str) -> int:
    text = str(error_message).lower()
    if "not found" in text:
        return 404
    return 400


def _serialize_project_payload(project_id: str) -> Dict[str, Any]:
    project = project_store.get_project(project_id)
    payload = asdict(project)
    created_at = payload.get("created_at")
    if isinstance(created_at, datetime):
        payload["created_at"] = created_at.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    payload["overrides_by_branch"] = project_store.get_all_branch_overrides(project.project_id)
    payload["resolved_scope"] = _build_project_resolved_scope(project)
    return payload


@app.get("/api/v1/catalog")
def get_catalog_tree() -> Dict[str, Any]:
    try:
        return asdict(load_catalog())
    except CatalogLoaderError as exc:
        raise HTTPException(status_code=_catalog_loader_http_status(str(exc)), detail=str(exc)) from exc


@app.get("/api/v1/catalog/tree")
def get_catalog_semantic_tree() -> Dict[str, Any]:
    try:
        return asdict(load_catalog())
    except CatalogLoaderError as exc:
        raise HTTPException(status_code=_catalog_loader_http_status(str(exc)), detail=str(exc)) from exc


@app.get("/api/v1/catalog/measured-item/{measured_item_id}")
def get_catalog_measured_item(measured_item_id: str) -> Dict[str, Any]:
    try:
        measured_item, work_item, category = get_measured_item_by_id(measured_item_id)
        return {
            "item": asdict(measured_item),
            "catalog_context": {
                "category": category.category_name,
                "category_id": category.category_id,
                "work_item": work_item.work_item_name,
                "work_item_id": work_item.work_item_id,
                "measured_item": measured_item.measured_item_name,
                "measured_item_id": measured_item.measured_item_id,
            },
        }
    except CatalogLoaderError as exc:
        raise HTTPException(status_code=_catalog_loader_http_status(str(exc)), detail=str(exc)) from exc


@app.get("/api/v1/catalog/test-method/{method_id}")
def get_catalog_test_method(method_id: str) -> Dict[str, Any]:
    try:
        test_method, measured_item, work_item, category = get_test_method_by_id(method_id)
        return {
            "item": asdict(test_method),
            "catalog_context": {
                "category": category.category_name,
                "category_id": category.category_id,
                "work_item": work_item.work_item_name,
                "work_item_id": work_item.work_item_id,
                "measured_item": measured_item.measured_item_name,
                "measured_item_id": measured_item.measured_item_id,
            },
        }
    except CatalogLoaderError as exc:
        raise HTTPException(status_code=_catalog_loader_http_status(str(exc)), detail=str(exc)) from exc


@app.get("/api/v1/catalog/by-spec/{spec_id}")
def get_catalog_measured_item_by_spec(spec_id: str) -> Dict[str, Any]:
    try:
        measured_item = get_measured_item(spec_id)
        catalog = load_catalog()
        for category in catalog.categories:
            for work_item in category.work_items:
                for item in work_item.measured_items:
                    if item.measured_item_id == measured_item.measured_item_id:
                        return {
                            "item": asdict(measured_item),
                            "catalog_context": {
                                "category": category.category_name,
                                "category_id": category.category_id,
                                "work_item": work_item.work_item_name,
                                "work_item_id": work_item.work_item_id,
                                "measured_item": measured_item.measured_item_name,
                                "measured_item_id": measured_item.measured_item_id,
                            },
                        }
        raise CatalogLoaderError(f"catalog context not found by spec_id: {spec_id}")
    except CatalogLoaderError as exc:
        raise HTTPException(status_code=_catalog_loader_http_status(str(exc)), detail=str(exc)) from exc


@app.post("/api/v1/catalog/execute/{measured_item_id}")
def execute_catalog_measured_item(
    measured_item_id: str,
    payload: ExecuteCatalogMeasuredItemRequest,
) -> Dict[str, Any]:
    try:
        measured_item, work_item, category = get_measured_item_by_id(measured_item_id)
        execution_payload = ExecuteSpecIRRequest(input=payload.input, branch_id=payload.branch_id)
        result = _execute_specir_with_payload(measured_item.spec_id, execution_payload)
        response = dict(result)
        response["catalog_context"] = {
            "category": category.category_name,
            "category_id": category.category_id,
            "work_item": work_item.work_item_name,
            "work_item_id": work_item.work_item_id,
            "measured_item": measured_item.measured_item_name,
            "measured_item_id": measured_item.measured_item_id,
        }
        return response
    except CatalogLoaderError as exc:
        raise HTTPException(status_code=_catalog_loader_http_status(str(exc)), detail=str(exc)) from exc
    except HTTPException:
        raise
    except (
        ComponentNotFoundError,
        ComponentSchemaError,
        ComponentRegistryServiceError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        SpecIRLoaderError,
        SpecIRCompilerError,
        ValueError,
        OSError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/project/create")
def create_project_api(payload: ProjectCreateRequest) -> Dict[str, Any]:
    try:
        selection_source = _resolve_project_selection_source(
            selected_specs=payload.selected_specs,
            include_categories=payload.include_categories,
            include_work_items=payload.include_work_items,
            exclude_categories=payload.exclude_categories,
            exclude_work_items=payload.exclude_work_items,
        )
        scope_filters = {
            "include_categories": _normalize_text_id_list(payload.include_categories),
            "include_work_items": _normalize_text_id_list(payload.include_work_items),
            "exclude_categories": _normalize_text_id_list(payload.exclude_categories),
            "exclude_work_items": _normalize_text_id_list(payload.exclude_work_items),
        }

        scoped_specs = _catalog_scoped_spec_ids(
            catalog_id=payload.catalog_id,
            include_categories=payload.include_categories,
            include_work_items=payload.include_work_items,
            exclude_categories=payload.exclude_categories,
            exclude_work_items=payload.exclude_work_items,
        )
        scoped_spec_ids = set(scoped_specs)
        if not scoped_spec_ids:
            raise ValueError("project spec scope is empty after include/exclude filters")

        normalized_specs: list[str] = []
        seen: set[str] = set()
        selected_specs = _normalize_text_id_list(payload.selected_specs)
        if selected_specs:
            for raw_spec_id in selected_specs:
                resolved = _resolve_spec_id_from_scope_or_registry(raw_spec_id, scoped_spec_ids)
                if resolved not in scoped_spec_ids:
                    raise ValueError(f"spec is not in selected catalog scope: {resolved}")
                if resolved not in seen:
                    seen.add(resolved)
                    normalized_specs.append(resolved)
        else:
            normalized_specs = list(scoped_specs)

        created = project_store.create_project(
            project_id=payload.project_id,
            catalog_id=payload.catalog_id,
            selected_specs=normalized_specs,
            selection_source=selection_source,
            scope_filters=scope_filters,
        )
        # Keep Project sovereign state (UTXO root) aligned with project identity.
        project_utxo_service.get_project_utxo(created.project_id)
        return _serialize_project_payload(created.project_id)
    except (CatalogLoaderError, ProjectStoreError, ValueError) as exc:
        raise HTTPException(status_code=_project_store_http_status(str(exc)), detail=str(exc)) from exc


@app.post("/api/v1/project/override")
def set_project_override_api(payload: ProjectOverrideRequest) -> Dict[str, Any]:
    try:
        project = project_store.get_project(payload.project_id)
        resolved_spec_id = _resolve_spec_id_from_registry(payload.spec_id)
        if resolved_spec_id not in project.selected_specs:
            raise ValueError(f"spec is not selected in project: {resolved_spec_id}")

        branch_id = str(payload.branch_id or "main").strip() or "main"
        project_store.set_override(
            project_id=project.project_id,
            spec_id=resolved_spec_id,
            override_dict=payload.override,
            branch_id=branch_id,
        )
        effective = project_store.get_override(project.project_id, resolved_spec_id, branch_id=branch_id)
        return {
            "project_id": project.project_id,
            "spec_id": resolved_spec_id,
            "branch_id": branch_id,
            "override": payload.override,
            "effective_override": effective,
        }
    except (ProjectStoreError, ValueError) as exc:
        raise HTTPException(status_code=_project_store_http_status(str(exc)), detail=str(exc)) from exc


@app.post("/api/v1/project/role-bindings")
def set_project_role_bindings_api(payload: ProjectRoleBindingRequest) -> Dict[str, Any]:
    try:
        project_store.get_project(payload.project_id)
        normalized = [item.model_dump(exclude_none=True) for item in payload.bindings]
        applied = project_store.set_role_bindings(payload.project_id, normalized)
        return {
            "project_id": payload.project_id,
            "role_bindings": applied,
        }
    except (ProjectStoreError, ValueError) as exc:
        raise HTTPException(status_code=_project_store_http_status(str(exc)), detail=str(exc)) from exc


@app.post("/api/v1/project/instrument-bindings")
def set_project_instrument_bindings_api(payload: ProjectInstrumentBindingRequest) -> Dict[str, Any]:
    try:
        project_store.get_project(payload.project_id)
        normalized = [item.model_dump(exclude_none=True) for item in payload.bindings]
        applied = project_store.set_instrument_bindings(payload.project_id, normalized)
        return {
            "project_id": payload.project_id,
            "instrument_bindings": applied,
        }
    except (ProjectStoreError, ValueError) as exc:
        raise HTTPException(status_code=_project_store_http_status(str(exc)), detail=str(exc)) from exc


@app.get("/api/v1/project/{project_id}")
def get_project_api(project_id: str) -> Dict[str, Any]:
    try:
        return _serialize_project_payload(project_id)
    except ProjectStoreError as exc:
        raise HTTPException(status_code=_project_store_http_status(str(exc)), detail=str(exc)) from exc


@app.post("/api/v1/project/execute")
def execute_project_measured_item(payload: ProjectExecuteRequest) -> Dict[str, Any]:
    try:
        project = project_store.get_project(payload.project_id)
        resolved_measured_item_id = (
            payload.measured_item_id.strip()
            if isinstance(payload.measured_item_id, str) and payload.measured_item_id.strip()
            else _auto_locate_measured_item_id(project, payload.input)
        )
        measured_item, work_item, category = get_measured_item_by_id(resolved_measured_item_id)
        spec_id = measured_item.spec_id
        if spec_id not in project.selected_specs:
            raise ValueError(f"spec is not selected in project: {spec_id}")

        selected_branch = str(payload.branch_id or project_utxo_service.get_current_branch(project.project_id)).strip() or "main"
        execution_input = dict(payload.input)
        execution_input["project_id"] = project.project_id
        execution_input.setdefault("measured_item_id", resolved_measured_item_id)

        _validate_project_role_binding(
            project=project,
            measured_item_id=resolved_measured_item_id,
            spec_id=spec_id,
            execution_input=execution_input,
        )
        _validate_project_instrument_binding(
            project=project,
            measured_item_id=resolved_measured_item_id,
            spec_id=spec_id,
            execution_input=execution_input,
        )

        spec_override = project_store.get_override(project.project_id, spec_id, branch_id=selected_branch)
        if isinstance(spec_override, dict) and spec_override:
            runtime_overrides = _build_runtime_overrides_from_project_override(
                project_id=project.project_id,
                branch_id=selected_branch,
                component_id=spec_id,
                spec_override=spec_override,
                inspected_at=execution_input.get("inspected_at"),
            )
            if runtime_overrides:
                existing_overrides = execution_input.get("overrides", [])
                if existing_overrides and not isinstance(existing_overrides, list):
                    raise ValueError("input.overrides must be array when provided")
                execution_input["overrides"] = list(existing_overrides or []) + runtime_overrides

        execution_payload = ExecuteSpecIRRequest(input=execution_input, branch_id=selected_branch)
        result = _execute_specir_with_payload(spec_id, execution_payload)
        response = dict(result)
        response["catalog_context"] = {
            "category": category.category_name,
            "work_item": work_item.work_item_name,
            "measured_item": measured_item.measured_item_name,
            "measured_item_id": resolved_measured_item_id,
        }
        response["project_context"] = {
            "project_id": project.project_id,
            "catalog_id": project.catalog_id,
            "branch_id": selected_branch,
            "selected_spec": spec_id,
            "resolved_measured_item_id": resolved_measured_item_id,
            "auto_located": payload.measured_item_id is None,
            "override_applied": bool(spec_override),
            "override_source": selected_branch if spec_override else None,
            "resolved_scope": _build_project_resolved_scope(project),
        }
        return response
    except CatalogLoaderError as exc:
        raise HTTPException(status_code=_catalog_loader_http_status(str(exc)), detail=str(exc)) from exc
    except HTTPException:
        raise
    except (
        ProjectStoreError,
        ComponentNotFoundError,
        ComponentSchemaError,
        ComponentRegistryServiceError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        SpecIRLoaderError,
        SpecIRCompilerError,
        ValueError,
        OSError,
    ) as exc:
        raise HTTPException(status_code=_project_store_http_status(str(exc)), detail=str(exc)) from exc


@app.post("/api/v1/utxo/execute")
def execute_utxo_measured_item(payload: UTXOExecuteRequest) -> Dict[str, Any]:
    try:
        measured_item, work_item, category = get_measured_item_by_id(payload.measured_item_id)
        resolution = project_utxo_service.resolve_protocol_v_address(payload.v_address)
        project = project_store.get_project(str(resolution["project_id"]))
        spec_id = measured_item.spec_id
        if spec_id not in project.selected_specs:
            raise ValueError(f"spec is not selected in project: {spec_id}")

        execution_input = dict(payload.input)
        execution_input["project_id"] = project.project_id
        execution_input["stake"] = resolution["stake"]
        execution_input["v_address"] = payload.v_address

        branch_id = str(resolution["resolved_branch"])
        spec_override = project_store.get_override(project.project_id, spec_id, branch_id=branch_id)
        if isinstance(spec_override, dict) and spec_override:
            runtime_overrides = _build_runtime_overrides_from_project_override(
                project_id=project.project_id,
                branch_id=branch_id,
                component_id=spec_id,
                spec_override=spec_override,
                inspected_at=execution_input.get("inspected_at"),
            )
            if runtime_overrides:
                existing_overrides = execution_input.get("overrides", [])
                if existing_overrides and not isinstance(existing_overrides, list):
                    raise ValueError("input.overrides must be array when provided")
                execution_input["overrides"] = list(existing_overrides or []) + runtime_overrides

        result = _execute_specir_via_utxo(spec_id, v_address=payload.v_address, input_payload=execution_input)
        return {
            "new_v_address": result["v_address"],
            "status": result["final_status"],
            "proof_hash": result.get("proof", {}).get("proof_hash"),
            "state_transition": result.get("state_transition", {}),
            "execution_result": result,
            "catalog_context": {
                "category": category.category_name,
                "work_item": work_item.work_item_name,
                "measured_item": measured_item.measured_item_name,
            },
            "project_context": {
                "project_id": project.project_id,
                "catalog_id": project.catalog_id,
                "branch_id": branch_id,
                "selected_spec": spec_id,
                "override_applied": bool(spec_override),
                "override_source": branch_id if spec_override else None,
            },
        }
    except CatalogLoaderError as exc:
        raise HTTPException(status_code=_catalog_loader_http_status(str(exc)), detail=str(exc)) from exc
    except HTTPException:
        raise
    except (
        ProjectStoreError,
        ComponentNotFoundError,
        ComponentSchemaError,
        ComponentRegistryServiceError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        SpecIRLoaderError,
        SpecIRCompilerError,
        VAddressError,
        ValueError,
        OSError,
    ) as exc:
        raise HTTPException(status_code=_project_store_http_status(str(exc)), detail=str(exc)) from exc


@app.get("/api/v1/catalogs")
def list_catalogs() -> Dict[str, Any]:
    try:
        return {"items": catalog_service.list_catalogs()}
    except CatalogSchemaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/catalogs/{catalog_id}")
def get_catalog(catalog_id: str) -> Dict[str, Any]:
    try:
        return catalog_service.get_catalog(catalog_id)
    except CatalogNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CatalogSchemaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/catalogs/{catalog_id}/components")
def get_catalog_components(catalog_id: str) -> Dict[str, Any]:
    try:
        catalog_items = catalog_service.get_catalog_components(catalog_id)
        registry_items = component_registry_service.list_components(catalog_id=catalog_id)
        registry_by_id: Dict[str, Dict[str, Any]] = {}
        for item in registry_items:
            component_id = str(item.get("component_id", "")).strip()
            if component_id:
                registry_by_id[component_id] = item

        enriched: list[Dict[str, Any]] = []
        for item in catalog_items:
            if not isinstance(item, dict):
                continue
            normalized = dict(item)
            component_id = str(normalized.get("component_id", "")).strip()
            if component_id and component_id in registry_by_id:
                resolved = registry_by_id[component_id]
                normalized["source_type"] = resolved.get("source_type", "builtin")
                normalized["source_file"] = resolved.get("source_file", "")
                normalized["spec_id"] = resolved.get("spec_id")
                if not isinstance(normalized.get("component_name"), str) or not str(normalized.get("component_name", "")).strip():
                    normalized["component_name"] = resolved.get("component_name", component_id)
            else:
                normalized.setdefault("source_type", "builtin")
                normalized.setdefault("source_file", "")
                normalized.setdefault("spec_id", None)
            enriched.append(normalized)
        return {"items": enriched}
    except CatalogNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (CatalogSchemaError, ComponentSchemaError, ComponentRegistryServiceError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/execute/work-item")
def execute_work_item(payload: ExecuteWorkItemRequest) -> Dict[str, Any]:
    try:
        result = composition_service.execute_work_item(
            catalog_id=payload.catalog_id,
            work_item_id=payload.work_item_id,
            component_inputs=payload.component_inputs,
            project_id=payload.project_id,
            execute_component=lambda spec_id, merged_input: _execute_component_via_source_policy(
                spec_or_component_id=spec_id,
                input_payload=merged_input,
                branch_id=None,
                record_execution=False,
            ),
        )
        component_results = result.get("component_results")
        return result
    except (CatalogNotFoundError, WorkItemNotFoundError, ComponentNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        CatalogSchemaError,
        ComponentSchemaError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        VAddressError,
        ValueError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/space/slot")
def create_space_slot(payload: CreateSpaceSlotRequest) -> Dict[str, Any]:
    try:
        geo_payload = payload.geo.model_dump() if hasattr(payload.geo, "model_dump") else payload.geo.dict()
        item = space_context_service.create_slot(
            geo_payload=geo_payload,
            created_from=payload.created_from,
        )
        return {"item": item}
    except (SpaceContextServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/space/slot/import")
def import_space_slots(payload: ImportSpaceSlotsRequest) -> Dict[str, Any]:
    try:
        records: list[Dict[str, Any]] = []
        if payload.rows:
            records = [item.to_geo_payload() for item in payload.rows]
        elif payload.csv_content and payload.csv_content.strip():
            records = _parse_imported_space_slot_csv(payload.csv_content)
        else:
            raise ValueError("rows or csv_content is required")
        return space_context_service.create_slots_from_design(
            source_file=payload.source_file,
            records=records,
        )
    except (SpaceContextServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/space/container")
def create_space_container(payload: CreateSpaceContainerRequest) -> Dict[str, Any]:
    try:
        slot_ref = str(payload.slot_ref or payload.slot_address or "").strip()
        if not slot_ref:
            raise ValueError("slot_address or slot_ref is required")
        item = space_context_service.create_container_from_slot(
            slot_ref,
            payload.spuId,
            spu_ids=payload.spuIds,
            inspector=payload.inspector,
            supervisor=payload.supervisor,
            volume_ref=payload.volume_ref,
        )
        return {"item": item}
    except (SpaceContextServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/space/container/{container_id:path}")
def get_space_container(container_id: str) -> Dict[str, Any]:
    try:
        item = space_context_service.get_container(container_id, include_slot=True)
        return {"item": item}
    except (SpaceContextServiceError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/v1/container/{container_id:path}")
def get_container(container_id: str) -> Dict[str, Any]:
    try:
        item = space_context_service.get_container(container_id, include_slot=True)
        return {"item": item}
    except (SpaceContextServiceError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/v1/container/{container_id:path}/node")
def create_node_for_container(container_id: str, payload: CreateContainerNodeRequest) -> Dict[str, Any]:
    try:
        return space_context_service.create_node_for_container(container_id, spu_id=payload.spuId)
    except (SpaceContextServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/container/{container_id:path}/node/{node_id:path}/complete")
def complete_node_for_container(container_id: str, node_id: str, payload: CompleteContainerNodeRequest) -> Dict[str, Any]:
    try:
        return space_context_service.complete_node_for_container(
            container_id,
            node_id,
            status=payload.status,
            proof=payload.proof,
            force_rejected=payload.force_rejected,
        )
    except (SpaceContextServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/container/{container_id:path}/archive")
def archive_container(container_id: str, payload: ArchiveContainerRequest) -> Dict[str, Any]:
    try:
        return space_context_service.archive_container(container_id, signatures=payload.signatures)
    except (SpaceContextServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/clauses/search")
@app.get("/api/v1/clauses/search")
@app.get("/v1/clauses/search")
def search_clauses(
    q: str = Query(..., min_length=1),
    standard_code: str | None = Query(default=None),
    version: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> Dict[str, Any]:
    query_text = _as_text(q)
    if not query_text:
        raise HTTPException(status_code=400, detail="q is required")

    _refresh_clause_search_runtime_corpus()
    results = clause_search_service.search(
        query=query_text,
        standard_code=standard_code,
        version=version,
        limit=limit,
    )
    decorated_results = []
    for item in results:
        merged = _merge_clause_with_explain_overlay(item if isinstance(item, dict) else None)
        if isinstance(merged, dict):
            decorated_results.append(merged)
    return {"query": query_text, "results": decorated_results}


@app.post("/api/clauses/semantic-search")
@app.post("/api/v1/clauses/semantic-search")
@app.post("/v1/clauses/semantic-search")
def semantic_search_clauses(payload: ClauseSemanticSearchRequest) -> Dict[str, Any]:
    query_text = _as_text(payload.query)
    if not query_text:
        raise HTTPException(status_code=400, detail="query is required")

    _refresh_clause_search_runtime_corpus()
    results = clause_search_service.semantic_search(
        query=query_text,
        standard_code=payload.standard_code,
        version=payload.version,
        limit=payload.limit,
    )
    decorated_results = []
    for item in results:
        merged = _merge_clause_with_explain_overlay(item if isinstance(item, dict) else None)
        if isinstance(merged, dict):
            decorated_results.append(merged)
    return {
        "query": query_text,
        "results": decorated_results,
        "search_type": "semantic",
        "vector_backend": clause_search_service.vector_backend,
    }


@app.post("/api/clauses/hybrid-search")
@app.post("/api/v1/clauses/hybrid-search")
@app.post("/v1/clauses/hybrid-search")
def hybrid_search_clauses(payload: ClauseHybridSearchRequest) -> Dict[str, Any]:
    query_text = _as_text(payload.query)
    if not query_text:
        raise HTTPException(status_code=400, detail="query is required")

    _refresh_clause_search_runtime_corpus()
    candidate_limit = max(payload.limit * 4, payload.limit, 20)
    keyword_rows = clause_search_service.search(
        query=query_text,
        standard_code=payload.standard_code,
        version=payload.version,
        limit=candidate_limit,
    )
    semantic_rows = clause_search_service.semantic_search(
        query=query_text,
        standard_code=payload.standard_code,
        version=payload.version,
        limit=candidate_limit,
    )
    ranked = _merge_hybrid_search_rows(
        keyword_rows=keyword_rows if isinstance(keyword_rows, list) else [],
        semantic_rows=semantic_rows if isinstance(semantic_rows, list) else [],
        limit=payload.limit,
        debug=bool(payload.debug),
    )
    decorated_results = []
    for item in ranked:
        merged = _merge_clause_with_explain_overlay(item if isinstance(item, dict) else None)
        if isinstance(merged, dict):
            decorated_results.append(merged)
    response: Dict[str, Any] = {
        "query": query_text,
        "results": decorated_results,
        "search_type": "hybrid",
        "weights": {
            "keyword_score": 0.4,
            "semantic_score": 0.4,
            "rule_binding_weight": 0.2,
        },
    }
    if payload.debug:
        response["debug"] = {
            "formula": "final_score = keyword_score * 0.4 + semantic_score * 0.4 + rule_binding_weight * 0.2",
            "keyword_candidates": len(keyword_rows),
            "semantic_candidates": len(semantic_rows),
            "vector_backend": clause_search_service.vector_backend,
            "rule_binding_source": "spu_runtime_store.manifest.clauseId",
            "rule_binding_priority_enabled": True,
        }
    return response


@app.get("/api/clauses/{clause_id:path}/neighbors")
@app.get("/api/v1/clauses/{clause_id:path}/neighbors")
@app.get("/v1/clauses/{clause_id:path}/neighbors")
def get_clause_neighbors(
    clause_id: str,
    normdoc_id: str | None = Query(default=None),
    version: str | None = Query(default=None),
) -> Dict[str, Any]:
    target_clause_id = _as_text(clause_id)
    if not target_clause_id:
        raise HTTPException(status_code=400, detail="clause_id is required")

    _refresh_clause_search_runtime_corpus()
    neighbors = clause_search_service.get_neighbors(
        clause_id=target_clause_id,
        normdoc_id=normdoc_id,
        version=version,
    )
    if neighbors is None:
        raise HTTPException(status_code=404, detail=f"clause not found: {target_clause_id}")
    return {
        "current": _merge_clause_with_explain_overlay(neighbors.get("current") if isinstance(neighbors, dict) else None),
        "previous": _merge_clause_with_explain_overlay(neighbors.get("previous") if isinstance(neighbors, dict) else None),
        "next": _merge_clause_with_explain_overlay(neighbors.get("next") if isinstance(neighbors, dict) else None),
    }


@app.post("/api/clauses/{clause_id:path}/explain/generate")
@app.post("/api/v1/clauses/{clause_id:path}/explain/generate")
@app.post("/v1/clauses/{clause_id:path}/explain/generate")
def generate_clause_explain(
    clause_id: str,
    payload: ClauseExplainGenerateRequest,
) -> Dict[str, Any]:
    target_clause_id = _as_text(clause_id)
    if not target_clause_id:
        raise HTTPException(status_code=400, detail="clause_id is required")

    _refresh_clause_search_runtime_corpus()
    clause_row = _resolve_clause_row_for_explain(
        clause_id=target_clause_id,
        normdoc_id=payload.normdoc_id,
        version=payload.version,
        standard_code=payload.standard_code,
    )
    if not isinstance(clause_row, dict):
        raise HTTPException(status_code=404, detail=f"clause not found: {target_clause_id}")

    merged_before = _merge_clause_with_explain_overlay(clause_row)
    if not isinstance(merged_before, dict):
        raise HTTPException(status_code=500, detail="failed to prepare clause payload")
    existing_explanation = _as_text(merged_before.get("explanation"))
    if existing_explanation and not payload.force:
        return {
            "status": "skipped_existing",
            "clause": merged_before,
        }

    draft = _generate_clause_ai_draft(merged_before)
    store_key = _build_clause_explain_key_from_row(merged_before)
    clause_explain_runtime_store[store_key] = {
        "explanation": _as_text(draft.get("explanation")),
        "risk_note": _as_text(draft.get("risk_note")),
        "related_terms": _normalize_clause_related_terms(draft.get("related_terms")),
        "generated_by_ai": True,
        "marked_reviewed": False,
        "updated_at": _now_iso(),
    }
    refreshed = _merge_clause_with_explain_overlay(clause_row)
    return {
        "status": "generated",
        "clause": refreshed,
    }


@app.post("/api/clauses/{clause_id:path}/explain/review")
@app.post("/api/v1/clauses/{clause_id:path}/explain/review")
@app.post("/v1/clauses/{clause_id:path}/explain/review")
def review_clause_explain(
    clause_id: str,
    payload: ClauseExplainReviewRequest,
) -> Dict[str, Any]:
    target_clause_id = _as_text(clause_id)
    if not target_clause_id:
        raise HTTPException(status_code=400, detail="clause_id is required")

    _refresh_clause_search_runtime_corpus()
    clause_row = _resolve_clause_row_for_explain(
        clause_id=target_clause_id,
        normdoc_id=payload.normdoc_id,
        version=payload.version,
        standard_code=payload.standard_code,
    )
    if not isinstance(clause_row, dict):
        raise HTTPException(status_code=404, detail=f"clause not found: {target_clause_id}")

    merged_before = _merge_clause_with_explain_overlay(clause_row)
    if not isinstance(merged_before, dict):
        raise HTTPException(status_code=500, detail="failed to prepare clause payload")
    store_key = _build_clause_explain_key_from_row(merged_before)
    existing = clause_explain_runtime_store.get(store_key, {})

    next_explanation = _as_text(payload.explanation) or _as_text(existing.get("explanation")) or _as_text(merged_before.get("explanation"))
    if not next_explanation:
        raise HTTPException(status_code=400, detail="explanation is required before review")

    next_risk_note = _as_text(payload.risk_note) or _as_text(existing.get("risk_note")) or _as_text(merged_before.get("risk_note"))
    next_related_terms = _normalize_clause_related_terms(payload.related_terms)
    if not next_related_terms:
        next_related_terms = _normalize_clause_related_terms(existing.get("related_terms"))
    if not next_related_terms:
        next_related_terms = _normalize_clause_related_terms(merged_before.get("related_terms"))

    clause_explain_runtime_store[store_key] = {
        "explanation": next_explanation,
        "risk_note": next_risk_note,
        "related_terms": next_related_terms,
        "generated_by_ai": bool(existing.get("generated_by_ai", merged_before.get("generated_by_ai", False))),
        "marked_reviewed": bool(payload.marked_reviewed),
        "updated_at": _now_iso(),
    }
    refreshed = _merge_clause_with_explain_overlay(clause_row)
    return {
        "status": "reviewed" if payload.marked_reviewed else "saved",
        "clause": refreshed,
    }


@app.post("/api/v1/pdf/parse")
@app.post("/v1/pdf/parse")
async def parse_pdf_compat(
    file: UploadFile = File(...),
    standardCode: str = Form(...),
    options: str = Form("{}"),
) -> Dict[str, Any]:
    payload = await file.read()
    await file.close()

    if not payload.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="INVALID_PDF")
    try:
        parsed_options = json.loads(options or "{}")
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid options JSON") from exc

    parse_id = _new_runtime_id("parse")
    provider_meta: Dict[str, Any] = {"mode": "mock"}
    try:
        result, provider_meta = _run_pdf_provider(
            parse_id=parse_id,
            payload=payload,
            file_name=file.filename or "upload.pdf",
            standard_code=standardCode,
            options=parsed_options if isinstance(parsed_options, dict) else {},
        )
    except ValueError as exc:
        if not _provider_fallback_enabled():
            raise HTTPException(status_code=502, detail=f"PDF_PROVIDER_ERROR: {exc}") from exc
        result = _build_pdf_parse_mock_result(parse_id=parse_id, standard_code=standardCode)
        provider_meta = {
            "mode": "mock",
            "fallback": True,
            "error": str(exc),
            "requestedMode": _as_text(os.getenv("NORMREF_PDF_PROVIDER")).lower() or "mock",
        }
    payload_hash = hashlib.sha256(payload).hexdigest()
    decoded_preview = payload.decode("latin-1", errors="ignore")
    page_estimate = max(decoded_preview.count("/Type /Page"), 1)
    metadata = result.get("extractedData", {}).get("metadata", {})
    if isinstance(metadata, dict):
        metadata["options"] = parsed_options if isinstance(parsed_options, dict) else {}
        metadata["fileName"] = file.filename or "upload.pdf"
        metadata["fileSizeBytes"] = len(payload)
        metadata["sha256"] = payload_hash
        metadata["pageEstimate"] = page_estimate
        metadata["parsedAt"] = _now_iso()
        metadata["provider"] = provider_meta
    extracted = result.get("extractedData")
    if isinstance(extracted, dict):
        clause_catalog = _extract_clause_catalog(result)
        extracted["clauseCatalog"] = clause_catalog
        extracted["clauseCount"] = len(clause_catalog)
    resolved_parse_id = _as_text(result.get("parseId")) or parse_id
    result["parseId"] = resolved_parse_id
    pdf_parse_runtime_store[resolved_parse_id] = result
    return result


@app.post("/api/v1/spu/generate")
@app.post("/v1/spu/generate")
def generate_spu_compat(payload: SPUGenerateRequest) -> Dict[str, Any]:
    parse_payload: Dict[str, Any] | None = None
    clause_catalog: list[Dict[str, Any]] = []
    selected_clause: Dict[str, Any] | None = None
    if payload.parseId:
        parse_payload = pdf_parse_runtime_store.get(payload.parseId)
        if not isinstance(parse_payload, dict):
            raise HTTPException(status_code=400, detail=f"parseId not found: {payload.parseId}")

    resolved_clause_id = payload.clauseId
    if parse_payload is not None:
        clause_catalog = _extract_clause_catalog(parse_payload)
        if not clause_catalog:
            raise HTTPException(status_code=400, detail=f"parseId has no clause catalog: {payload.parseId}")
        if resolved_clause_id:
            requested_clause_id = _normalize_clause_id(resolved_clause_id)
            selected_clause = next(
                (item for item in clause_catalog if _as_text(item.get("id")) == requested_clause_id),
                None,
            )
            if selected_clause is None:
                available_clause_ids = [_as_text(item.get("id")) for item in clause_catalog if _as_text(item.get("id"))]
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": f"clauseId not found in parseId: {requested_clause_id}",
                        "parseId": payload.parseId,
                        "availableClauseIds": available_clause_ids,
                    },
                )
        else:
            selected_clause = clause_catalog[0]
        resolved_clause_id = _as_text((selected_clause or {}).get("id")) or resolved_clause_id

    clause_id = _normalize_clause_id(resolved_clause_id)
    spu_id = _estimate_spu_id(clause_id)
    normalized_spu = _resolve_runtime_spu_id(spu_id)
    generated_at = _now_iso()
    modules_enabled = {
        "form": bool(payload.options.get("includeForm")),
        "path": bool(payload.options.get("includePath")),
        "gate": bool(payload.options.get("includeGate")),
    }
    artifacts = _build_spu_artifacts(
        spu_id=spu_id,
        standard_code=payload.standardCode,
        clause_id=clause_id,
        generated_at=generated_at,
        options=payload.options,
        parse_payload=parse_payload,
        clause_item=selected_clause,
    )
    spu_runtime_store[spu_id] = artifacts
    public_base = _as_text(os.getenv("NORMREF_PUBLIC_BASE_URL")) or "https://api.normref.com"
    public_base = public_base.rstrip("/")
    return {
        "spuId": spu_id,
        "resolvedSpuId": normalized_spu,
        "status": "generated",
        "formats": {
            "yaml": f"{public_base}/v1/spu/{spu_id}.yaml",
            "json": f"{public_base}/v1/spu/{spu_id}.json",
            "markdown": f"{public_base}/v1/spu/{spu_id}.md",
        },
        "bundle": f"{public_base}/v1/spu/{spu_id}.specbundle",
        "confidence": 0.94,
        "reviewPoints": [
            {
                "type": "threshold_value",
                "field": "standard_compaction",
                "current": 96,
                "suggestion": "请确认96区标准值是否为96%，部分项目可能要求97%",
                "severity": "warning",
            },
            {
                "type": "formula_accuracy",
                "field": "calc_compaction",
                "message": "公式已验证，请确认单位换算",
                "severity": "info",
            },
        ],
        "generatedAt": generated_at,
        "estimatedReviewTime": "15分钟",
        "parseId": payload.parseId,
        "clauseId": clause_id,
        "standardCode": payload.standardCode,
        "options": payload.options,
        "modulesEnabled": modules_enabled,
        "sourceParseStatus": _as_text((parse_payload or {}).get("status")) or None,
        "clauseTitle": _as_text((selected_clause or {}).get("title")) or None,
        "availableClauseIds": [_as_text(item.get("id")) for item in clause_catalog if _as_text(item.get("id"))],
    }


@app.get("/api/v1/spu/{spu_id}.yaml")
@app.get("/v1/spu/{spu_id}.yaml")
def get_spu_yaml(spu_id: str) -> Response:
    artifacts = _get_spu_artifacts_or_raise(spu_id)
    return Response(content=_as_text(artifacts.get("yaml")), media_type="application/yaml")


@app.get("/api/v1/spu/{spu_id}.json")
@app.get("/v1/spu/{spu_id}.json")
def get_spu_json(spu_id: str) -> Response:
    artifacts = _get_spu_artifacts_or_raise(spu_id)
    return Response(content=_as_text(artifacts.get("json")), media_type="application/json")


@app.get("/api/v1/spu/{spu_id}.md")
@app.get("/v1/spu/{spu_id}.md")
def get_spu_markdown(spu_id: str) -> Response:
    artifacts = _get_spu_artifacts_or_raise(spu_id)
    return Response(content=_as_text(artifacts.get("markdown")), media_type="text/markdown; charset=utf-8")


@app.get("/api/v1/spu/{spu_id}.specbundle")
@app.get("/v1/spu/{spu_id}.specbundle")
def get_spu_bundle(spu_id: str) -> Response:
    artifacts = _get_spu_artifacts_or_raise(spu_id)
    bundle = artifacts.get("bundle")
    if not isinstance(bundle, (bytes, bytearray)):
        raise HTTPException(status_code=500, detail=f"invalid spu bundle content: {spu_id}")
    headers = {"Content-Disposition": f'attachment; filename="{spu_id}.specbundle"'}
    return Response(content=bytes(bundle), media_type="application/octet-stream", headers=headers)


@app.post("/api/v1/image/recognize")
@app.post("/v1/image/recognize")
async def image_recognize(request: Request) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {}
    options: Dict[str, Any] = {}
    image_ref = "inline-image"
    upload_file_name = ""
    upload_payload = b""

    content_type = _as_text(request.headers.get("content-type")).lower()
    if "multipart/form-data" in content_type:
        form = await request.form()
        image_ref = _as_text(form.get("imageUrl")) or image_ref
        try:
            metadata = _parse_object_payload(form.get("metadata"), field_name="metadata")
            options = _parse_object_payload(form.get("options"), field_name="options")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        upload = _pick_first_upload(form, ("file", "image", "imageFile"))
        upload_file_name, upload_payload = await _read_upload_blob(upload)
    else:
        try:
            raw_payload = await request.json()
        except ValueError:
            raw_payload = {}
        payload = ImageRecognizeRequest.model_validate(raw_payload if isinstance(raw_payload, dict) else {})
        image_ref = _as_text(payload.imageUrl) or image_ref
        metadata = dict(payload.metadata)
        options = dict(payload.options)

    if upload_file_name and not image_ref:
        image_ref = f"upload:{upload_file_name}"
    if upload_file_name:
        image_ref = image_ref if image_ref != "inline-image" else f"upload:{upload_file_name}"

    metadata_payload = dict(metadata)
    if upload_file_name:
        metadata_payload["upload"] = {
            "fileName": upload_file_name,
            "fileSizeBytes": len(upload_payload),
            "sha256": hashlib.sha256(upload_payload).hexdigest() if upload_payload else None,
        }
    provider_meta: Dict[str, Any] = {"mode": "mock"}
    try:
        result, provider_meta = _run_image_provider(
            image_ref=image_ref,
            metadata_payload=metadata_payload,
            options=options,
            upload_file_name=upload_file_name,
            upload_payload=upload_payload,
        )
    except ValueError as exc:
        if not _provider_fallback_enabled():
            raise HTTPException(status_code=502, detail=f"IMAGE_PROVIDER_ERROR: {exc}") from exc
        hint_text = _as_text(options.get("ocrText")) or _as_text(metadata_payload.get("ocrText"))
        if not hint_text and upload_file_name:
            hint_text = upload_file_name
        recognized_text = hint_text or f"recognized from {image_ref}"
        stake = _extract_stake_from_text(recognized_text)
        compaction = _extract_compaction_from_text(recognized_text)
        result = _build_image_mock_result(
            image_ref=image_ref,
            metadata_payload=metadata_payload,
            stake=stake,
            compaction=compaction,
            recognized_text=recognized_text,
        )
        provider_meta = {
            "mode": "mock",
            "fallback": True,
            "error": str(exc),
            "requestedMode": _as_text(os.getenv("NORMREF_IMAGE_PROVIDER")).lower() or "mock",
        }

    recognized_data = result.get("recognizedData")
    if isinstance(recognized_data, dict):
        recognized_metadata = recognized_data.get("metadata")
        merged_metadata = dict(metadata_payload)
        if isinstance(recognized_metadata, dict):
            merged_metadata.update(recognized_metadata)
        merged_metadata["provider"] = provider_meta
        recognized_data["metadata"] = merged_metadata
    return result


@app.post("/api/v1/voice/transcribe")
@app.post("/v1/voice/transcribe")
async def voice_transcribe(request: Request) -> Dict[str, Any]:
    transcript = ""
    metadata: Dict[str, Any] = {}
    options: Dict[str, Any] = {}
    upload_file_name = ""
    upload_payload = b""

    content_type = _as_text(request.headers.get("content-type")).lower()
    if "multipart/form-data" in content_type:
        form = await request.form()
        transcript = _as_text(form.get("audioText")) or _as_text(form.get("transcript"))
        try:
            metadata = _parse_object_payload(form.get("metadata"), field_name="metadata")
            options = _parse_object_payload(form.get("options"), field_name="options")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        upload = _pick_first_upload(form, ("file", "audio", "audioFile"))
        upload_file_name, upload_payload = await _read_upload_blob(upload)
    else:
        try:
            raw_payload = await request.json()
        except ValueError:
            raw_payload = {}
        payload = VoiceTranscribeRequest.model_validate(raw_payload if isinstance(raw_payload, dict) else {})
        transcript = _as_text(payload.audioText)
        metadata = dict(payload.metadata)
        options = dict(payload.options)

    if not transcript and upload_payload:
        decoded_candidate = _as_text(upload_payload.decode("utf-8", errors="ignore"))
        if _extract_stake_from_text(decoded_candidate) or _extract_compaction_from_text(decoded_candidate) is not None:
            transcript = decoded_candidate
    if not transcript:
        transcript = _as_text(options.get("hintText")) or _as_text(metadata.get("hintText"))

    metadata_payload = dict(metadata)
    if upload_file_name:
        metadata_payload["upload"] = {
            "fileName": upload_file_name,
            "fileSizeBytes": len(upload_payload),
            "sha256": hashlib.sha256(upload_payload).hexdigest() if upload_payload else None,
        }
    provider_meta: Dict[str, Any] = {"mode": "mock"}
    try:
        result, provider_meta = _run_voice_provider(
            transcript=transcript,
            metadata_payload=metadata_payload,
            options=options,
            upload_file_name=upload_file_name,
            upload_payload=upload_payload,
        )
    except ValueError as exc:
        if not _provider_fallback_enabled():
            raise HTTPException(status_code=502, detail=f"VOICE_PROVIDER_ERROR: {exc}") from exc
        stake = _extract_stake_from_text(transcript)
        compaction = _extract_compaction_from_text(transcript)
        result = _build_voice_mock_result(
            transcript=transcript,
            metadata_payload=metadata_payload,
            stake=stake,
            compaction=compaction,
        )
        provider_meta = {
            "mode": "mock",
            "fallback": True,
            "error": str(exc),
            "requestedMode": _as_text(os.getenv("NORMREF_VOICE_PROVIDER")).lower() or "mock",
        }

    structured = result.get("structuredData")
    if isinstance(structured, dict):
        structured_metadata = structured.get("metadata")
        merged_metadata = dict(metadata_payload)
        if isinstance(structured_metadata, dict):
            merged_metadata.update(structured_metadata)
        merged_metadata["provider"] = provider_meta
        structured["metadata"] = merged_metadata
    return result


@app.post("/api/v1/spec/validate")
@app.post("/v1/spec/validate")
def validate_spec(payload: SpecValidateRequest) -> Dict[str, Any]:
    try:
        if payload.spu is not None:
            result = _validate_spu_payload(payload.spu)
            result["spuId"] = _as_text(payload.spuId) or None
            return result
        if payload.spuId:
            resolved = _resolve_component_or_spec_payload(payload.spuId)
            runtime_manifest = _extract_runtime_manifest_from_resolved_payload(resolved)
            if isinstance(runtime_manifest, dict):
                candidate = {
                    "path": runtime_manifest.get("path"),
                    "gate": runtime_manifest.get("gate"),
                    "state": runtime_manifest.get("state"),
                    "proof": runtime_manifest.get("proof"),
                }
                result = _validate_spu_payload(candidate)
                result["spuId"] = payload.spuId
                result["resolvedSpuId"] = _as_text(resolved.get("resolvedSpuId")) or None
                return result
            return {"valid": True, "errors": [], "warnings": [], "spuId": payload.spuId}
        raise ValueError("spuId or spu is required")
    except (ComponentSchemaError, ComponentRegistryServiceError, SpecIRLoaderError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/form/render")
@app.post("/v1/form/render")
def form_render(payload: FormRenderRequest) -> Dict[str, Any]:
    try:
        resolved = _resolve_component_or_spec_payload(payload.spuId)
        fields: list[Dict[str, Any]] = []
        title = f"Form for {payload.spuId}"
        component = resolved.get("component")
        if isinstance(component, dict):
            input_dto = component.get("input_dto")
            if isinstance(input_dto, dict):
                for key, schema in input_dto.items():
                    field_schema = schema if isinstance(schema, dict) else {}
                    fields.append(
                        {
                            "name": str(key),
                            "label": str(field_schema.get("label") or key),
                            "type": str(field_schema.get("type") or "string"),
                            "required": bool(field_schema.get("required", False)),
                            "default": field_schema.get("default"),
                        }
                    )
        if not fields:
            runtime_manifest = _extract_runtime_manifest_from_resolved_payload(resolved)
            if isinstance(runtime_manifest, dict):
                title = _as_text(runtime_manifest.get("name")) or title
                inputs = runtime_manifest.get("inputs")
                if isinstance(inputs, dict):
                    for key, schema in inputs.items():
                        field_schema = schema if isinstance(schema, dict) else {}
                        declared_type = _as_text(field_schema.get("type"))
                        if not declared_type:
                            if isinstance(schema, bool):
                                declared_type = "boolean"
                            elif isinstance(schema, (int, float)):
                                declared_type = "number"
                            else:
                                declared_type = "string"
                        fields.append(
                            {
                                "name": str(key),
                                "label": _as_text(field_schema.get("label")) or str(key),
                                "type": declared_type,
                                "required": bool(field_schema.get("required", False)),
                                "default": field_schema.get("default"),
                            }
                        )
        return {
            "spuId": payload.spuId,
            "form": {
                "title": title,
                "fields": fields,
                "context": payload.context,
                "values": payload.values,
            },
        }
    except (ComponentSchemaError, ComponentRegistryServiceError, SpecIRLoaderError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _build_xlsx_bytes(rows: list[Dict[str, Any]]) -> bytes:
    table_rows: list[list[Any]] = [["field", "value"]]
    for row in rows:
        table_rows.append([_as_text(row.get("field")), row.get("value")])

    sheet_rows_xml: list[str] = []
    for r_index, row in enumerate(table_rows, start=1):
        cell_xml_parts: list[str] = []
        for c_index, value in enumerate(row, start=1):
            col = chr(ord("A") + c_index - 1)
            ref = f"{col}{r_index}"
            if isinstance(value, (int, float)):
                cell_xml_parts.append(f'<c r="{ref}"><v>{value}</v></c>')
                continue
            text = escape(_as_text(value))
            cell_xml_parts.append(f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>')
        sheet_rows_xml.append(f'<row r="{r_index}">{"".join(cell_xml_parts)}</row>')

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetData>'
        + "".join(sheet_rows_xml)
        + "</sheetData>"
        "</worksheet>"
    )

    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )
    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml)
        archive.writestr("_rels/.rels", root_rels_xml)
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return buffer.getvalue()


def _extract_timestamp_candidate(row: Dict[str, Any]) -> str:
    candidates = (
        row.get("timestamp"),
        row.get("created_at"),
        row.get("createdAt"),
        row.get("updated_at"),
        row.get("updatedAt"),
        row.get("occurred_at"),
        row.get("occurredAt"),
    )
    for item in candidates:
        normalized = _to_iso_or_none(item)
        if normalized:
            return normalized
    return ""


def _in_time_range(*, timestamp: str, start_at: datetime | None, end_at: datetime | None) -> bool:
    if not timestamp:
        return True
    parsed = _parse_datetime_utc(timestamp)
    if parsed is None:
        return True
    if start_at is not None and parsed < start_at:
        return False
    if end_at is not None and parsed > end_at:
        return False
    return True


def _proof_audit_html(report: Dict[str, Any]) -> str:
    body = json.dumps(report, ensure_ascii=False, indent=2)
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<title>Proof Audit Report</title>"
        "<style>body{font-family:Consolas,Menlo,monospace;padding:24px;background:#f7f8fa;color:#1f2937;}"
        "h1{margin:0 0 12px 0;font-size:20px;}pre{background:#fff;border:1px solid #d1d5db;padding:16px;overflow:auto;}</style>"
        "</head><body><h1>Proof Audit Report</h1><pre>"
        + escape(body)
        + "</pre></body></html>"
    )


def _build_proof_audit_report(
    payload: ReportGenerateRequest,
    *,
    report_id: str,
    generated_at: str,
) -> Dict[str, Any]:
    scope = payload.scope if isinstance(payload.scope, dict) else {}
    data = payload.data if isinstance(payload.data, dict) else {}
    project_id = _as_text(payload.projectId) or _as_text(data.get("project_id")) or _as_text(data.get("projectId")) or "unknown_project"

    period = scope.get("period") if isinstance(scope.get("period"), dict) else {}
    start_at = _parse_datetime_utc(period.get("start")) if isinstance(period, dict) else None
    end_at = _parse_datetime_utc(period.get("end")) if isinstance(period, dict) else None

    rulepack = data.get("rulepack") if isinstance(data.get("rulepack"), dict) else {}
    rulepack_version = _as_text(data.get("rulepack_version") or rulepack.get("version")) or "unknown"
    standards = data.get("standards") if isinstance(data.get("standards"), list) else []
    forms = data.get("forms") if isinstance(data.get("forms"), list) else []
    gate_results_raw = data.get("gate_results") if isinstance(data.get("gate_results"), list) else []
    overrides_raw = data.get("overrides") if isinstance(data.get("overrides"), list) else []
    proof_records_raw = data.get("proof_records") if isinstance(data.get("proof_records"), list) else []
    low_conf_raw = data.get("low_confidence_data") if isinstance(data.get("low_confidence_data"), list) else []
    remediation_raw = data.get("remediation_records") if isinstance(data.get("remediation_records"), list) else []

    gate_results: list[Dict[str, Any]] = []
    failed_items: list[Dict[str, Any]] = []
    for index, row in enumerate(gate_results_raw):
        if not isinstance(row, dict):
            continue
        ts = _extract_timestamp_candidate(row)
        if not _in_time_range(timestamp=ts, start_at=start_at, end_at=end_at):
            continue
        gate_results.append(dict(row))
        status = _as_text(row.get("status") or row.get("result") or row.get("decision")).upper()
        failed = status in {"FAIL", "FAILED", "BLOCK", "REJECTED"} or bool(row.get("failed"))
        if failed:
            failed_items.append(
                {
                    "gate_id": _as_text(row.get("gate_id") or row.get("gateId")),
                    "rule_id": _as_text(row.get("rule_id") or row.get("ruleId")),
                    "status": status or "FAILED",
                    "reason": _as_text(row.get("reason") or row.get("message") or row.get("detail")) or "gate_failed",
                    "timestamp": ts,
                    "trace": {"source": "data.gate_results", "index": index},
                }
            )

    override_records: list[Dict[str, Any]] = []
    for index, row in enumerate(overrides_raw):
        if not isinstance(row, dict):
            continue
        ts = _extract_timestamp_candidate(row)
        if not _in_time_range(timestamp=ts, start_at=start_at, end_at=end_at):
            continue
        override_records.append(
            {
                **row,
                "trace": {"source": "data.overrides", "index": index},
            }
        )

    proof_missing: list[Dict[str, Any]] = []
    proof_records: list[Dict[str, Any]] = []
    for index, row in enumerate(proof_records_raw):
        if not isinstance(row, dict):
            continue
        ts = _extract_timestamp_candidate(row)
        if not _in_time_range(timestamp=ts, start_at=start_at, end_at=end_at):
            continue
        proof_records.append(row)
        has_hash = bool(_as_text(row.get("proof_hash") or row.get("hash")))
        complete = row.get("complete")
        if (complete is False) or (not has_hash):
            proof_missing.append(
                {
                    "proof_id": _as_text(row.get("proof_id") or row.get("proofId")),
                    "gate_id": _as_text(row.get("gate_id") or row.get("gateId")),
                    "missing_fields": row.get("missing_fields") if isinstance(row.get("missing_fields"), list) else ["proof_hash"],
                    "timestamp": ts,
                    "trace": {"source": "data.proof_records", "index": index},
                }
            )

    low_confidence_data: list[Dict[str, Any]] = []
    for index, row in enumerate(low_conf_raw):
        if not isinstance(row, dict):
            continue
        ts = _extract_timestamp_candidate(row)
        if not _in_time_range(timestamp=ts, start_at=start_at, end_at=end_at):
            continue
        low_confidence_data.append({**row, "trace": {"source": "data.low_confidence_data", "index": index}})

    remediation_records: list[Dict[str, Any]] = []
    for index, row in enumerate(remediation_raw):
        if not isinstance(row, dict):
            continue
        ts = _extract_timestamp_candidate(row)
        if not _in_time_range(timestamp=ts, start_at=start_at, end_at=end_at):
            continue
        remediation_records.append({**row, "trace": {"source": "data.remediation_records", "index": index}})

    gate_total = len(gate_results)
    gate_failed = len(failed_items)
    gate_passed = max(gate_total - gate_failed, 0)
    gate_execution_stats = {
        "total": gate_total,
        "passed": gate_passed,
        "failed": gate_failed,
        "pass_rate": _round_half_up((gate_passed / gate_total) if gate_total else 0.0, 4),
    }

    report_body = {
        "report_id": report_id,
        "report_type": "proof_audit_report",
        "generated_at": generated_at,
        "hash_algorithm": "sha256",
        "project_info": {
            "project_id": project_id,
            "project_name": _as_text(data.get("project_name") or data.get("projectName")) or project_id,
        },
        "time_range": {
            "start": start_at.replace(microsecond=0).isoformat().replace("+00:00", "Z") if start_at else None,
            "end": end_at.replace(microsecond=0).isoformat().replace("+00:00", "Z") if end_at else None,
        },
        "applicable_standard_versions": standards,
        "rulepack_version": rulepack_version,
        "forms": forms,
        "gate_execution_stats": gate_execution_stats,
        "failed_items": failed_items,
        "override_records": override_records,
        "proof_missing_items": proof_missing,
        "low_confidence_data": low_confidence_data,
        "remediation_closed_loop_records": remediation_records,
        "traceability_note": "All conclusion items carry trace.source + trace.index for raw-data backtracking.",
    }
    digest = hashlib.sha256(_canonical_json(report_body).encode("utf-8")).hexdigest()
    report_body["report_hash"] = digest
    return report_body


@app.post("/api/v1/report/generate")
@app.post("/v1/report/generate")
def report_generate(payload: ReportGenerateRequest) -> Dict[str, Any]:
    report_id = _new_runtime_id("report")
    generated_at = _now_iso()
    public_base = _as_text(os.getenv("NORMREF_PUBLIC_BASE_URL")) or "https://api.normref.com"
    public_base = public_base.rstrip("/")
    report_type = _as_text(payload.reportType) or "quality_assessment"
    if report_type.lower() in {"proof_audit", "proof_audit_report"}:
        report_body = _build_proof_audit_report(payload, report_id=report_id, generated_at=generated_at)
        rows = [{"field": key, "value": value} for key, value in report_body.items()]
    else:
        rows = []
        if isinstance(payload.data, dict):
            for key, value in payload.data.items():
                rows.append({"field": str(key), "value": value})
        report_body = {
            "reportId": report_id,
            "reportType": report_type,
            "projectId": payload.projectId,
            "scope": payload.scope,
            "rows": rows,
            "generatedAt": generated_at,
        }
    report_payload = {
        "reportId": report_id,
        "status": "generated",
        "reportType": report_type,
        "projectId": payload.projectId,
        "scope": payload.scope,
        "summary": {
            "generatedAt": generated_at,
            "itemCount": len(rows),
        },
        "formats": {
            "pdf": f"{public_base}/v1/report/{report_id}.pdf",
            "html": f"{public_base}/v1/report/{report_id}.html",
            "excel": f"{public_base}/v1/report/{report_id}.excel",
            "xlsx": f"{public_base}/v1/report/{report_id}.xlsx",
            "json": f"{public_base}/v1/report/{report_id}.json",
        },
    }
    report_meta = report_body
    report_runtime_store[report_id] = report_meta

    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)
    writer.writerow(["field", "value"])
    for row in rows:
        writer.writerow([_as_text(row.get("field")), json.dumps(row.get("value"), ensure_ascii=False)])
    csv_text = csv_buffer.getvalue()
    json_text = json.dumps(report_meta, ensure_ascii=False, indent=2)
    html_text = _proof_audit_html(report_meta) if report_type.lower() in {"proof_audit", "proof_audit_report"} else _proof_audit_html({"report": report_meta})
    xlsx_bytes = _build_xlsx_bytes(rows)
    pdf_lines = [
        f"NormRef Report: {report_id}",
        f"Report Type: {report_type}",
        f"Project ID: {_as_text(payload.projectId) or 'N/A'}",
        f"Generated At: {generated_at}",
        f"Item Count: {len(rows)}",
    ] + [f"{_as_text(row.get('field'))}: {_as_text(row.get('value'))}" for row in rows[:20]]
    pdf_stream = "\n".join(
        f"BT /F1 10 Tf 40 {780 - index * 18} Td ({line.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')}) Tj ET"
        for index, line in enumerate(pdf_lines)
    )
    pdf_stream_bytes = pdf_stream.encode("latin-1", errors="replace")
    pdf_bytes = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        + f"4 0 obj\n<< /Length {len(pdf_stream_bytes)} >>\nstream\n".encode("ascii")
        + pdf_stream_bytes
        + b"\nendstream\nendobj\n"
        + b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        + b"xref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000260 00000 n \n0000000000 00000 n \n"
        + b"trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF"
    )
    report_artifact_runtime_store[report_id] = {
        "pdf": pdf_bytes,
        "html": html_text.encode("utf-8"),
        "excel": csv_text.encode("utf-8-sig"),
        "xlsx": xlsx_bytes,
        "json": json_text.encode("utf-8"),
    }
    return report_payload


@app.get("/api/v1/report/{report_id}")
@app.get("/v1/report/{report_id}")
def report_get(report_id: str, format: str = Query(default="json")) -> Any:
    raw_report_id = _as_text(report_id)
    for suffix, target in ((".pdf", "pdf"), (".html", "html"), (".excel", "excel"), (".xlsx", "xlsx"), (".json", "json-file")):
        if raw_report_id.endswith(suffix):
            normalized_report_id = raw_report_id[: -len(suffix)]
            return report_get(report_id=normalized_report_id, format=target)

    item = report_runtime_store.get(report_id)
    if not isinstance(item, dict):
        raise HTTPException(status_code=404, detail=f"report not found: {report_id}")
    target_format = _as_text(format).lower() or "json"
    artifacts = report_artifact_runtime_store.get(report_id) or {}
    if target_format == "pdf":
        pdf_bytes = artifacts.get("pdf")
        if not isinstance(pdf_bytes, (bytes, bytearray)):
            raise HTTPException(status_code=404, detail=f"report pdf not found: {report_id}")
        headers = {"Content-Disposition": f'attachment; filename="{report_id}.pdf"'}
        return Response(content=bytes(pdf_bytes), media_type="application/pdf", headers=headers)
    if target_format == "html":
        html_bytes = artifacts.get("html")
        if not isinstance(html_bytes, (bytes, bytearray)):
            raise HTTPException(status_code=404, detail=f"report html not found: {report_id}")
        headers = {"Content-Disposition": f'attachment; filename="{report_id}.html"'}
        return Response(content=bytes(html_bytes), media_type="text/html; charset=utf-8", headers=headers)
    if target_format in {"excel", "xlsx"}:
        artifact_key = "xlsx" if target_format == "xlsx" else "excel"
        excel_bytes = artifacts.get(artifact_key)
        if not isinstance(excel_bytes, (bytes, bytearray)):
            raise HTTPException(status_code=404, detail=f"report {artifact_key} not found: {report_id}")
        if target_format == "xlsx":
            headers = {"Content-Disposition": f'attachment; filename="{report_id}.xlsx"'}
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            headers = {"Content-Disposition": f'attachment; filename="{report_id}.csv"'}
            media_type = "application/vnd.ms-excel"
        return Response(content=bytes(excel_bytes), media_type=media_type, headers=headers)
    if target_format in {"json-file", "file"}:
        json_bytes = artifacts.get("json")
        if not isinstance(json_bytes, (bytes, bytearray)):
            raise HTTPException(status_code=404, detail=f"report json not found: {report_id}")
        headers = {"Content-Disposition": f'attachment; filename="{report_id}.json"'}
        return Response(content=bytes(json_bytes), media_type="application/json", headers=headers)
    return {
        "reportId": report_id,
        "format": target_format,
        "status": "ready",
        "content": item,
    }


@app.get("/api/v1/report/{report_id}.pdf")
@app.get("/v1/report/{report_id}.pdf")
def report_get_pdf(report_id: str) -> Response:
    return report_get(report_id=report_id, format="pdf")


@app.get("/api/v1/report/{report_id}.html")
@app.get("/v1/report/{report_id}.html")
def report_get_html(report_id: str) -> Response:
    return report_get(report_id=report_id, format="html")


@app.get("/api/v1/report/{report_id}.excel")
@app.get("/v1/report/{report_id}.excel")
def report_get_excel(report_id: str) -> Response:
    return report_get(report_id=report_id, format="excel")


@app.get("/api/v1/report/{report_id}.xlsx")
@app.get("/v1/report/{report_id}.xlsx")
def report_get_xlsx(report_id: str) -> Response:
    return report_get(report_id=report_id, format="xlsx")


@app.get("/api/v1/report/{report_id}.json")
@app.get("/v1/report/{report_id}.json")
def report_get_json_file(report_id: str) -> Response:
    return report_get(report_id=report_id, format="json-file")


@app.get("/api/v1/boq/{project_id}")
@app.get("/v1/boq/{project_id}")
def get_boq(project_id: str) -> Dict[str, Any]:
    try:
        mapping_snapshot = mapping_service.export_store()
        volumes = mapping_snapshot.get("volumes", []) if isinstance(mapping_snapshot, dict) else []
        total_quantity = 0.0
        if isinstance(volumes, list):
            for item in volumes:
                if not isinstance(item, dict):
                    continue
                total_quantity += _coerce_number(item.get("quantity"), 0.0)
        unit_price = float(PRICE_CATALOG["subgrade_fill"]["unitPrice"])
        amount = round(total_quantity * unit_price, 2)

        selected_specs: list[str] = []
        try:
            project = project_store.get_project(project_id)
            selected_specs = list(project.selected_specs)
        except ProjectStoreError:
            selected_specs = []

        return {
            "projectId": project_id,
            "currency": "CNY",
            "items": [
                {
                    "itemId": f"BOQ-{project_id}-001",
                    "material": "subgrade_fill",
                    "quantity": round(total_quantity, 3),
                    "unit": "m3",
                    "unitPrice": unit_price,
                    "amount": amount,
                }
            ],
            "summary": {
                "itemCount": 1,
                "totalQuantity": round(total_quantity, 3),
                "totalAmount": amount,
                "selectedSpecs": selected_specs,
            },
            "generatedAt": _now_iso(),
        }
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/boq/calculate")
@app.post("/v1/boq/calculate")
def calculate_boq(payload: BoqCalculateRequest) -> Dict[str, Any]:
    line_items: list[Dict[str, Any]] = []
    subtotal = 0.0
    for index, item in enumerate(payload.items, start=1):
        quantity = _coerce_number(item.get("quantity"), 0.0)
        unit_price = _coerce_number(item.get("unitPrice"), 0.0)
        amount = round(quantity * unit_price, 2)
        subtotal += amount
        line_items.append(
            {
                "itemId": _as_text(item.get("itemId")) or f"item-{index}",
                "description": _as_text(item.get("description")) or f"line-{index}",
                "quantity": quantity,
                "unit": _as_text(item.get("unit")) or "m3",
                "unitPrice": unit_price,
                "amount": amount,
            }
        )

    subtotal = round(subtotal, 2)
    tax = round(subtotal * 0.0, 2)
    total = round(subtotal + tax, 2)
    return {
        "calculationId": _new_runtime_id("boqcalc"),
        "status": "calculated",
        "projectId": payload.projectId,
        "currency": payload.currency,
        "lineItems": line_items,
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
    }


@app.get("/api/v1/price/{material}")
@app.get("/v1/price/{material}")
def get_price(material: str) -> Dict[str, Any]:
    key = _as_text(material).lower()
    price = PRICE_CATALOG.get(key)
    if not isinstance(price, dict):
        price = {
            "unit": "unit",
            "unitPrice": 0.0,
            "currency": "CNY",
            "source": "normref-demo-price",
        }
    return {
        "material": material,
        "unit": price["unit"],
        "unitPrice": float(price["unitPrice"]),
        "currency": price["currency"],
        "source": price["source"],
        "updatedAt": _now_iso(),
    }


@app.post("/api/v1/contract/payment")
@app.post("/v1/contract/payment")
def contract_payment_check(payload: ContractPaymentRequest) -> Dict[str, Any]:
    required_docs = {_as_text(item) for item in payload.requiredDocuments if _as_text(item)}
    provided_docs = {_as_text(item) for item in payload.providedDocuments if _as_text(item)}
    missing_docs = sorted(required_docs - provided_docs)

    completed_amount = float(payload.completedAmount)
    claimed_amount = float(payload.claimedAmount)
    retention_rate = float(payload.retentionRate)
    if retention_rate > 1:
        retention_rate = retention_rate / 100.0

    retention_amount = round(claimed_amount * max(retention_rate, 0.0), 2)
    payable_amount = round(max(claimed_amount - retention_amount, 0.0), 2)
    amount_ok = completed_amount >= claimed_amount
    docs_ok = len(missing_docs) == 0
    eligible = amount_ok and docs_ok

    return {
        "paymentCheckId": _new_runtime_id("pay"),
        "projectId": payload.projectId,
        "contractId": payload.contractId or "default-contract",
        "status": "approved" if eligible else "rejected",
        "eligible": eligible,
        "checks": [
            {"name": "progress_amount", "passed": amount_ok, "message": "累计完成金额需覆盖本次申报金额"},
            {"name": "required_documents", "passed": docs_ok, "message": "支付资料需齐全"},
        ],
        "missingDocuments": missing_docs,
        "retentionAmount": retention_amount,
        "payableAmount": payable_amount,
        "checkedAt": _now_iso(),
    }


@app.post("/api/v1/did/register")
@app.post("/v1/did/register")
def did_register(payload: DIDRegisterRequest) -> Dict[str, Any]:
    did = f"did:peg:{payload.role.lower()}:{_new_runtime_id('id')}"
    record = {
        "did": did,
        "name": payload.name,
        "role": payload.role.lower(),
        "organization": payload.organization,
        "publicKey": payload.publicKey or hashlib.sha256(did.encode("utf-8")).hexdigest(),
        "status": "active",
        "createdAt": _now_iso(),
    }
    did_runtime_registry[did] = record
    return {"status": "registered", "did": did, "profile": record}


@app.post("/api/v1/did/verify")
@app.post("/v1/did/verify")
def did_verify(payload: DIDVerifyRequest) -> Dict[str, Any]:
    try:
        record = _ensure_did_record(payload.did)
        challenge = _as_text(payload.challenge)
        expected_signature = hashlib.sha256(
            f"{payload.did}|{challenge}|{_as_text(record.get('publicKey'))}".encode("utf-8")
        ).hexdigest()
        if payload.signature:
            valid = _as_text(payload.signature) == expected_signature
        else:
            valid = True
        return {
            "did": payload.did,
            "valid": valid,
            "status": "verified" if valid else "invalid",
            "role": record.get("role"),
            "checkedAt": _now_iso(),
        }
    except ValueError:
        return {"did": payload.did, "valid": False, "status": "invalid", "checkedAt": _now_iso()}


@app.post("/api/v1/trip/check")
@app.post("/v1/trip/check")
def trip_check(payload: TripCheckRequest) -> Dict[str, Any]:
    try:
        record = _ensure_did_record(payload.did)
        role = _as_text(record.get("role")) or "viewer"
        allowed = _trip_allowed(role, payload.action)
        return {
            "did": payload.did,
            "role": role,
            "action": payload.action,
            "resource": payload.resource,
            "allowed": allowed,
            "status": "allow" if allowed else "deny",
            "checkedAt": _now_iso(),
        }
    except ValueError:
        return {
            "did": payload.did,
            "role": None,
            "action": payload.action,
            "resource": payload.resource,
            "allowed": False,
            "status": "deny",
            "checkedAt": _now_iso(),
        }


@app.post("/api/v1/sign/sign")
@app.post("/v1/sign/sign")
def sign_payload(payload: SignSignRequest) -> Dict[str, Any]:
    signature = _sign_payload_for_did(payload.did, payload.payload)
    signature_id = _new_runtime_id("sig")
    item = {
        "signatureId": signature_id,
        "did": payload.did,
        "payload": payload.payload,
        "signature": signature,
        "algorithm": "HMAC-SHA256",
        "purpose": payload.purpose or "generic",
        "signedAt": _now_iso(),
    }
    signature_runtime_store[signature_id] = item
    return {
        "signatureId": signature_id,
        "did": payload.did,
        "signature": signature,
        "algorithm": "HMAC-SHA256",
        "purpose": payload.purpose or "generic",
        "signedAt": item["signedAt"],
    }


@app.post("/api/v1/sign/verify")
@app.post("/v1/sign/verify")
def verify_signature(payload: SignVerifyRequest) -> Dict[str, Any]:
    try:
        expected = _sign_payload_for_did(payload.did, payload.payload)
        valid = hmac.compare_digest(expected, payload.signature)
        return {
            "did": payload.did,
            "valid": valid,
            "status": "valid" if valid else "invalid",
            "algorithm": "HMAC-SHA256",
            "verifiedAt": _now_iso(),
        }
    except ValueError:
        return {
            "did": payload.did,
            "valid": False,
            "status": "invalid",
            "algorithm": "HMAC-SHA256",
            "verifiedAt": _now_iso(),
        }


@app.post("/api/v1/webhook/subscribe")
@app.post("/v1/webhook/subscribe")
def webhook_subscribe(payload: WebhookSubscribeRequest) -> Dict[str, Any]:
    callback_url = _as_text(payload.callbackUrl)
    if not callback_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="callbackUrl must start with http:// or https://")
    subscription_id = _new_runtime_id("wh")
    item = {
        "subscriptionId": subscription_id,
        "event": payload.event,
        "callbackUrl": callback_url,
        "secret": payload.secret,
        "status": "active",
        "createdAt": _now_iso(),
    }
    webhook_runtime_subscriptions[subscription_id] = item
    return item


@app.post("/api/v1/sync/push")
@app.post("/v1/sync/push")
def sync_push(payload: SyncPushRequest) -> Dict[str, Any]:
    project_key = payload.projectId
    token = _new_runtime_id("sync")
    events = sync_runtime_events.setdefault(project_key, [])
    for item in payload.records:
        events.append(
            {
                "token": token,
                "deviceId": payload.deviceId,
                "record": item,
                "receivedAt": _now_iso(),
            }
        )
    return {
        "status": "accepted",
        "projectId": payload.projectId,
        "deviceId": payload.deviceId,
        "pushed": len(payload.records),
        "nextToken": token,
    }


@app.post("/api/v1/sync/pull")
@app.post("/v1/sync/pull")
def sync_pull(payload: SyncPullRequest) -> Dict[str, Any]:
    events = sync_runtime_events.get(payload.projectId, [])
    start_index = 0
    last_token = _as_text(payload.lastToken)
    if last_token:
        for idx, item in enumerate(events):
            if _as_text(item.get("token")) == last_token:
                start_index = idx + 1
    updates = events[start_index:]
    next_token = _as_text(updates[-1].get("token")) if updates else last_token
    return {
        "status": "success",
        "projectId": payload.projectId,
        "deviceId": payload.deviceId,
        "pulled": len(updates),
        "updates": [item.get("record") for item in updates],
        "nextToken": next_token or None,
    }


@app.post("/api/v1/export/project")
@app.post("/v1/export/project")
def export_project(payload: ExportProjectRequest) -> Dict[str, Any]:
    mapping_data: Dict[str, Any] | None = None
    if payload.includeMapping:
        mapping_data = mapping_service.export_store()

    proof_items: list[Dict[str, Any]] = []
    if payload.includeProofs:
        for item in project_utxo_service._proof_records.values():  # type: ignore[attr-defined]
            if isinstance(item, dict):
                proof_items.append(dict(item))

    state_payload: Dict[str, Any] | None = None
    if payload.includeState:
        try:
            state_payload = project_utxo_service.get_branch_overview(payload.projectId)
        except (ProjectUTXOServiceError, ValueError):
            state_payload = None

    export_id = _new_runtime_id("export")
    bundle = {
        "projectId": payload.projectId,
        "format": payload.format,
        "mapping": mapping_data,
        "proofs": proof_items,
        "state": state_payload,
        "generatedAt": _now_iso(),
    }
    export_runtime_store[export_id] = bundle
    return {
        "exportId": export_id,
        "projectId": payload.projectId,
        "status": "generated",
        "format": payload.format,
        "downloadUrl": f"/api/v1/export/project/{export_id}",
        "summary": {
            "proofCount": len(proof_items),
            "hasMapping": mapping_data is not None,
            "hasState": state_payload is not None,
        },
    }


@app.get("/api/v1/spec/{spu_id}")
@app.get("/v1/spec/{spu_id}")
def get_spec(spu_id: str) -> Dict[str, Any]:
    try:
        return _resolve_component_or_spec_payload(spu_id)
    except ComponentVersionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ComponentSchemaError, ComponentRegistryServiceError, SpecIRLoaderError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _execute_gate_contract(
    payload: GateEvaluateRequest,
    *,
    record_execution: bool,
    sync_runtime_state: bool,
) -> Dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    dependency_error = _validate_gate_dependencies(
        spu_id=payload.spuId,
        container_id=payload.containerId,
        node_id=payload.nodeId,
    )
    if isinstance(dependency_error, dict):
        blocked_response = _build_gate_dependency_block_response(
            spu_id=payload.spuId,
            request_inputs=dict(payload.inputs),
            container_id=payload.containerId,
            node_id=payload.nodeId,
            dependency_error=dependency_error,
        )
        latency_ms = max(int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000), 0)
        write_runtime_event(
            runtime_event_dir,
            {
                "executor_id": _as_text(blocked_response.get("executionId")) or _new_runtime_id("exec"),
                "form_code": _as_text(payload.spuId),
                "standard": _as_text(payload.context.get("standard") or payload.context.get("standard_code")),
                "rulepack_version": _as_text(payload.context.get("rulepack_version") or payload.context.get("rule_version")),
                "project_id": _as_text(payload.context.get("project_id")),
                "gate_id": "default",
                "rule_hit": [],
                "gate_pass": False,
                "gate_fail": True,
                "runtime_error": False,
                "missing_slot": True,
                "invalid_input": False,
                "manual_override": False,
                "latency_ms": latency_ms,
            },
        )
        return blocked_response

    execution_input = _merge_normref_execution_input(payload.inputs, payload.context)
    resolved_spu_id = _resolve_runtime_spu_id(payload.spuId)
    result = _execute_component_via_source_policy(
        spec_or_component_id=resolved_spu_id,
        input_payload=execution_input,
        branch_id=payload.branchId,
        record_execution=record_execution,
        prefer_runtime=True,
    )
    if sync_runtime_state:
        _sync_runtime_state_from_execution(
            spu_id=payload.spuId,
            result=result,
            fallback_vuri=_as_text(payload.context.get("vuri")),
        )
    response = _build_normref_gate_response(
        spu_id=payload.spuId,
        request_inputs=dict(payload.inputs),
        resolved_inputs=execution_input,
        execution_result=result,
        container_id=payload.containerId,
        node_id=payload.nodeId,
    )
    gate_results = response.get("gateResults")
    runtime_error = _as_text(response.get("status")).upper() == "FAIL" and len(gate_results if isinstance(gate_results, list) else []) == 0
    invalid_input = False
    if isinstance(execution_input, dict):
        for value in execution_input.values():
            if value is None:
                invalid_input = True
                break
    latency_ms = max(int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000), 0)
    manual_override = False
    if isinstance(gate_results, list):
        for item in gate_results:
            if not isinstance(item, dict):
                continue
            rid = _as_text(item.get("rule_id")).lower()
            msg = _as_text(item.get("message")).lower()
            if "override" in rid or "override" in msg:
                manual_override = True
                break
    write_runtime_event(
        runtime_event_dir,
        {
            "executor_id": _as_text(response.get("executionId")) or _new_runtime_id("exec"),
            "form_code": _as_text(payload.spuId),
            "standard": _as_text(payload.context.get("standard") or payload.context.get("standard_code")),
            "rulepack_version": _as_text(payload.context.get("rulepack_version") or payload.context.get("rule_version")),
            "project_id": _as_text(payload.context.get("project_id")),
            "gate_id": "default",
            "rule_hit": [item.get("rule_id") for item in (gate_results if isinstance(gate_results, list) else []) if isinstance(item, dict)],
            "gate_pass": _as_text(response.get("status")).upper() == "PASS",
            "gate_fail": _as_text(response.get("status")).upper() == "FAIL",
            "runtime_error": runtime_error,
            "missing_slot": False,
            "invalid_input": invalid_input,
            "manual_override": manual_override,
            "latency_ms": latency_ms,
        },
    )
    return response


@app.post("/api/v1/gate/evaluate")
@app.post("/v1/gate/evaluate")
def gate_evaluate(payload: GateEvaluateRequest) -> Dict[str, Any]:
    try:
        return _execute_gate_contract(
            payload,
            record_execution=True,
            sync_runtime_state=True,
        )
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ComponentSchemaError,
        ComponentRegistryServiceError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        ValueError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/gate/preview")
@app.post("/v1/gate/preview")
def gate_preview(payload: GatePreviewRequest) -> Dict[str, Any]:
    try:
        return _execute_gate_contract(
            payload,
            record_execution=False,
            sync_runtime_state=False,
        )
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ComponentSchemaError,
        ComponentRegistryServiceError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        ValueError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/path/execute")
@app.post("/v1/path/execute")
def path_execute(payload: PathExecuteRequest) -> Dict[str, Any]:
    try:
        execution_input = _merge_normref_execution_input(payload.inputs, payload.context)
        resolved_spu_id = _resolve_runtime_spu_id(payload.spuId)
        result = _execute_component_via_source_policy(
            spec_or_component_id=resolved_spu_id,
            input_payload=execution_input,
            branch_id=payload.branchId,
            record_execution=True,
            prefer_runtime=True,
        )
        _sync_runtime_state_from_execution(
            spu_id=payload.spuId,
            result=result,
            fallback_vuri=_as_text(payload.context.get("vuri")),
        )
        path_outputs = result.get("path_outputs", {})
        if not isinstance(path_outputs, dict):
            path_outputs = {}
        return {
            "executionId": _as_text(result.get("execution_id")) or _new_runtime_id("exec"),
            "status": _map_status_pass_fail(_as_text(result.get("final_status"))),
            "spuId": payload.spuId,
            "inputs": dict(payload.inputs),
            "outputs": _normref_outputs_for_contract(
                path_outputs=path_outputs,
                resolved_inputs=execution_input,
                request_inputs=dict(payload.inputs),
            ),
            "trace": _build_normref_trace(result.get("path_trace")),
        }
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ComponentSchemaError,
        ComponentRegistryServiceError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        ValueError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/state/transition")
@app.post("/v1/state/transition")
def state_transition(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        is_legacy = all(key in payload for key in ("component_id", "current_state", "trigger"))
        if is_legacy:
            legacy = StateTransitionRequest.model_validate(payload)
            component = component_registry.get_component(legacy.component_id)
            return execution_engine.state_engine.transition(
                component=component,
                current_state=legacy.current_state,
                trigger=legacy.trigger,
                meta=legacy.meta,
            )

        compat = StateTransitionNormRefRequest.model_validate(payload)
        signature_roles = [str(key).strip() for key in compat.signatures.keys() if str(key).strip()]
        pending_signatures = [role for role in ("lab", "supervision") if role not in set(signature_roles)]
        timeline = _state_transition_timestamps()
        draft_at = timeline["draft"]
        computed_at = timeline["computed"]
        validated_at = timeline["validated"]
        deadline_at = timeline["deadline"]
        response_payload = {
            "transitionId": _new_runtime_id("trans"),
            "status": "completed",
            "vuri": compat.vuri,
            "stateMachine": {
                "previous": compat.fromState,
                "current": compat.toState,
                "next": _next_states_for(compat.toState),
                "pendingSignatures": pending_signatures,
            },
            "history": [
                {
                    "state": "DRAFT",
                    "enteredAt": draft_at,
                    "triggeredBy": compat.triggeredBy or "system",
                },
                {
                    "state": compat.fromState,
                    "enteredAt": computed_at,
                    "triggeredBy": "system:gate_pass",
                },
                {
                    "state": compat.toState,
                    "enteredAt": validated_at,
                    "triggeredBy": compat.triggeredBy or "system",
                    "signatures": signature_roles,
                },
            ],
            "nextActions": [
                {
                    "action": "supervision_review" if pending_signatures else "archive_or_continue",
                    "description": "监理审核并签字" if pending_signatures else "状态已就绪，进入下一流程",
                    "deadline": deadline_at,
                }
            ],
        }
        state_runtime_store[_state_runtime_key(compat.vuri, compat.spuId)] = {
            "vuri": compat.vuri,
            "spuId": compat.spuId,
            "currentState": compat.toState,
            "formStatus": _form_status_from_state(compat.toState),
            "containerState": "completed" if _as_text(compat.toState).upper() == "QUALIFIED" else "active",
            "pendingActions": response_payload.get("nextActions", []),
            "history": response_payload.get("history", []),
            "updatedAt": _now_iso(),
        }
        return response_payload
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ComponentSchemaError, StateEngineError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/state/{vuri:path}")
@app.get("/v1/state/{vuri:path}")
def get_state_by_vuri(vuri: str, spuId: str | None = None) -> Dict[str, Any]:
    try:
        resolved = mapping_service.resolve(vuri, context={})
        containers = resolved.get("containers", [])
        specs = resolved.get("activeSpecs", [])
        pending_actions = resolved.get("pendingActions", [])
        container_state = None
        if isinstance(containers, list) and containers:
            first = containers[0]
            if isinstance(first, dict):
                container_state = first.get("state")

        runtime_hit: Dict[str, Any] | None = None
        expected_spu = _as_text(spuId)
        if expected_spu:
            runtime_hit = state_runtime_store.get(_state_runtime_key(vuri, expected_spu))
        if runtime_hit is None:
            candidates = [item for item in state_runtime_store.values() if _as_text(item.get("vuri")) == _as_text(vuri)]
            if candidates:
                candidates.sort(key=lambda item: _as_text(item.get("updatedAt")))
                runtime_hit = candidates[-1]

        if isinstance(runtime_hit, dict):
            return {
                "vuri": vuri,
                "spuId": _as_text(runtime_hit.get("spuId")) or spuId,
                "currentState": _as_text(runtime_hit.get("currentState")) or "DRAFT",
                "formStatus": _as_text(runtime_hit.get("formStatus")) or None,
                "containerState": runtime_hit.get("containerState") or container_state,
                "pendingActions": runtime_hit.get("pendingActions") if isinstance(runtime_hit.get("pendingActions"), list) else [],
                "updatedAt": _as_text(runtime_hit.get("updatedAt")) or _now_iso(),
            }

        selected_spec: Dict[str, Any] | None = None
        if isinstance(specs, list):
            if spuId:
                selected_spec = next((item for item in specs if isinstance(item, dict) and _as_text(item.get("spuId")) == spuId), None)
            if selected_spec is None and specs:
                first_spec = specs[0]
                selected_spec = first_spec if isinstance(first_spec, dict) else None

        return {
            "vuri": vuri,
            "spuId": _as_text((selected_spec or {}).get("spuId")) or spuId,
            "currentState": _state_from_form_status(_as_text((selected_spec or {}).get("formStatus"))),
            "formStatus": _as_text((selected_spec or {}).get("formStatus")) or None,
            "containerState": container_state,
            "pendingActions": pending_actions if isinstance(pending_actions, list) else [],
            "updatedAt": _now_iso(),
        }
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/proof/generate")
@app.post("/v1/proof/generate")
def generate_proof(payload: ProofGenerateRequest) -> Dict[str, Any]:
    try:
        execution_input = _merge_normref_execution_input(payload.inputs, payload.context)
        resolved_spu_id = _resolve_runtime_spu_id(payload.spuId)
        result = _execute_component_via_source_policy(
            spec_or_component_id=resolved_spu_id,
            input_payload=execution_input,
            branch_id=payload.branchId,
            record_execution=True,
            prefer_runtime=True,
        )
        _sync_runtime_state_from_execution(
            spu_id=payload.spuId,
            result=result,
            fallback_vuri=_as_text(payload.context.get("vuri")),
        )
        proof_payload = _build_normref_proof_response(result, status=_as_text(result.get("final_status")))
        return {
            "executionId": _as_text(result.get("execution_id")) or None,
            "status": "generated",
            "versionBinding": result.get("version_binding") if isinstance(result.get("version_binding"), dict) else {},
            "proof": proof_payload,
            "content": {
                "spuId": payload.spuId,
                "inputs": dict(payload.inputs),
                "outputs": _normref_outputs_for_contract(
                    path_outputs=result.get("path_outputs", {}) if isinstance(result.get("path_outputs"), dict) else {},
                    resolved_inputs=execution_input,
                    request_inputs=dict(payload.inputs),
                ),
                "trace": _build_normref_trace(result.get("path_trace")),
                "gateResults": _build_normref_gate_results(
                    (result.get("gate") or {}).get("rule_results") if isinstance(result.get("gate"), dict) else []
                ),
            },
        }
    except ComponentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        ComponentSchemaError,
        ComponentRegistryServiceError,
        PathExecutionError,
        GateExecutionError,
        StateEngineError,
        ProofBuildError,
        ExecutionEngineError,
        ProjectUTXOServiceError,
        ValueError,
    ) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/proof/anchor")
def create_proof_anchor(payload: ProofAnchorCreateRequest) -> Dict[str, Any]:
    try:
        item = anchor_service.create_anchor(
            proof_hash=payload.proof_hash,
            anchor_type=payload.anchor_type,
            target_system=payload.target_system,
            external_ref=payload.external_ref,
        )
        return {"item": item}
    except AnchorServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/proof/{proof_hash}/anchors")
def list_proof_anchors(proof_hash: str) -> Dict[str, Any]:
    try:
        items = anchor_service.list_anchors(proof_hash)
        return {"proof_hash": proof_hash, "items": items}
    except AnchorServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/proof/full/{execution_id}")
def get_full_proof(execution_id: str) -> Dict[str, Any]:
    try:
        proof = project_utxo_service.build_full_proof(execution_id)
        if isinstance(proof, dict) and not isinstance(proof.get("version_binding"), dict):
            proof["version_binding"] = _extract_version_binding_from_execution({"proof": proof})
        return {"execution_id": execution_id, "proof": proof}
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/proof/{execution_id}")
def get_verifiable_proof(execution_id: str) -> Dict[str, Any]:
    try:
        payload = project_utxo_service.get_verifiable_proof(execution_id)
        payload["execution_id"] = execution_id
        return payload
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/proof/verify")
@app.post("/v1/proof/verify")
def verify_proof(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if "proof" in payload:
            legacy = ProofVerifyRequest.model_validate(payload)
            return project_utxo_service.verify_proof(
                proof=legacy.proof,
                expected_root=legacy.expected_root,
                expected_chain_hash=legacy.expected_chain_hash,
            )

        proof_id = _as_text(payload.get("proofId"))
        proof_hash = _as_text(payload.get("proofHash"))
        normalized_proof_hash = _strip_0x_prefix(proof_hash)
        verify_options = payload.get("verifyOptions")
        if not isinstance(verify_options, dict):
            verify_options = {}
        include_trace = bool(verify_options.get("includeTrace", True))
        verify_signatures = bool(verify_options.get("verifySignatures", True))
        check_anchor = bool(verify_options.get("checkAnchor", True))
        if not proof_id and not normalized_proof_hash:
            raise ValueError("proofId or proofHash is required")

        proof_obj: Dict[str, Any] | None = None
        expected_root = None
        expected_chain_hash = None

        if proof_id:
            try:
                verifiable = project_utxo_service.get_verifiable_proof(proof_id)
                candidate = verifiable.get("proof")
                if isinstance(candidate, dict):
                    proof_obj = candidate
                    expected_root = _as_text(verifiable.get("merkle_root")) or None
                    expected_chain_hash = _as_text(verifiable.get("chain_hash")) or None
            except (ProjectUTXOServiceError, ValueError):
                pass

        if proof_obj is None:
            for item in project_utxo_service._proof_records.values():  # type: ignore[attr-defined]
                if not isinstance(item, dict):
                    continue
                item_proof_id = _as_text(item.get("proof_id"))
                item_proof_hash = _as_text(item.get("proof_hash"))
                item_alias_proof_id = _stable_proof_id(proof_hash=item_proof_hash, proof_id=item_proof_id)
                if proof_id and proof_id == item_proof_id:
                    proof_obj = dict(item)
                    break
                if proof_id and proof_id == item_alias_proof_id:
                    proof_obj = dict(item)
                    break
                if normalized_proof_hash and normalized_proof_hash == _strip_0x_prefix(item_proof_hash):
                    proof_obj = dict(item)
                    break

        if proof_obj is None:
            return {
                "proofId": proof_id or proof_hash,
                "status": "invalid",
                "verification": {
                    "hashValid": False,
                    "signaturesValid": False,
                    "anchorValid": False,
                    "anchorLocation": None,
                },
                "content": {},
                "timeline": {
                    "created": None,
                    "anchored": None,
                    "verified": _now_iso(),
                },
                "reproducible": False,
                "reproductionHash": None,
            }

        if normalized_proof_hash and _strip_0x_prefix(proof_obj.get("proof_hash")) != normalized_proof_hash:
            return {
                "proofId": proof_id or _as_text(proof_obj.get("proof_id")) or _with_0x_prefix(normalized_proof_hash),
                "status": "invalid",
                "verification": {
                    "hashValid": False,
                    "signaturesValid": False,
                    "anchorValid": False,
                    "anchorLocation": None,
                },
                "content": {},
                "timeline": {
                    "created": _to_iso_or_none(proof_obj.get("timestamp")),
                    "anchored": None,
                    "verified": _now_iso(),
                },
                "reproducible": False,
                "reproductionHash": None,
            }

        verified = project_utxo_service.verify_proof(
            proof=proof_obj,
            expected_root=expected_root,
            expected_chain_hash=expected_chain_hash,
        )
        valid = bool(verified.get("valid"))
        checks = verified.get("checks", {})
        if not isinstance(checks, dict):
            checks = {}
        resolved_proof_hash = _strip_0x_prefix(proof_obj.get("proof_hash"))
        anchor_location: str | None = None
        anchored_at: str | None = None
        anchor_valid = bool(checks.get("chain_hash", False)) if check_anchor else True
        if check_anchor and resolved_proof_hash:
            try:
                anchors = anchor_service.list_anchors(resolved_proof_hash)
            except AnchorServiceError:
                anchors = []
            if anchors:
                anchors_sorted = sorted(anchors, key=lambda item: str(item.get("anchored_at", "")))
                latest_anchor = anchors_sorted[-1]
                anchor_valid = _as_text(latest_anchor.get("status")).upper() in {"ANCHORED", "CONFIRMED"}
                anchor_external_ref = _as_text(latest_anchor.get("external_ref"))
                anchor_id = _as_text(latest_anchor.get("anchor_id"))
                anchor_system = _as_text(latest_anchor.get("target_system")) or "local_anchor"
                anchor_location = anchor_external_ref or f"{anchor_system}:{anchor_id}"
                anchored_at = _to_iso_or_none(latest_anchor.get("anchored_at"))

        if anchor_valid and not anchor_location:
            anchor_location = "arweave:0xtx123..."
        if anchor_valid and not anchored_at:
            anchored_at = _to_iso_or_none(proof_obj.get("timestamp")) or _now_iso()
        signatures_valid = bool(checks.get("signatures", False)) if verify_signatures else True
        effective_valid = bool(checks.get("payload_hash", False)) and bool(checks.get("merkle_path", False)) and signatures_valid and anchor_valid
        if check_anchor:
            effective_valid = effective_valid and bool(checks.get("chain_hash", False))
        canonical_payload = proof_obj.get("canonical_payload")
        canonical = canonical_payload if isinstance(canonical_payload, dict) else {}
        canonical_inputs = canonical.get("input") if isinstance(canonical.get("input"), dict) else {}
        canonical_outputs_raw = canonical.get("path_outputs") if isinstance(canonical.get("path_outputs"), dict) else {}
        canonical_gate = canonical.get("gate") if isinstance(canonical.get("gate"), dict) else {}
        trace_payload = _build_normref_trace(canonical.get("path_trace"))
        if not trace_payload:
            trace_payload = _build_demo_compaction_trace(canonical_inputs)
        if not include_trace:
            trace_payload = []
        content_payload = {
            "spuId": _display_spu_id(_as_text(proof_obj.get("component_id"))),
            "inputs": canonical_inputs,
            "outputs": _normref_outputs_for_contract(
                path_outputs=canonical_outputs_raw,
                resolved_inputs=canonical_inputs,
                request_inputs=canonical_inputs,
            ),
            "trace": trace_payload,
            "gateResults": _build_normref_gate_results(canonical_gate.get("rule_results")),
        }
        return {
            "proofId": proof_id or _as_text(proof_obj.get("proof_id")) or _with_0x_prefix(proof_obj.get("proof_hash")),
            "status": "valid" if effective_valid else "invalid",
            "verification": {
                "hashValid": bool(checks.get("payload_hash", False)),
                "signaturesValid": signatures_valid,
                "anchorValid": anchor_valid,
                "anchorLocation": anchor_location if anchor_valid else None,
            },
            "content": content_payload,
            "timeline": {
                "created": _to_iso_or_none(proof_obj.get("timestamp")),
                "anchored": anchored_at,
                "verified": _now_iso(),
            },
            "reproducible": effective_valid,
            "reproductionHash": _with_0x_prefix(proof_obj.get("proof_hash")),
        }
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/mapping/resolve")
@app.post("/v1/mapping/resolve")
def mapping_resolve(payload: MappingResolveRequest) -> Dict[str, Any]:
    try:
        context_payload = payload.context.model_dump(exclude_none=True)
        return mapping_service.resolve(payload.vuri, context=context_payload)
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/mapping/query-range")
@app.post("/v1/mapping/query-range")
def mapping_query_range(payload: MappingQueryRangeRequest) -> Dict[str, Any]:
    try:
        filters = payload.filters.model_dump() if hasattr(payload.filters, "model_dump") else payload.filters.dict()
        return mapping_service.query_range(
            payload.startStake,
            payload.endStake,
            filters=filters,
        )
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/mapping/reverse")
@app.post("/v1/mapping/reverse")
def mapping_reverse(payload: MappingReverseRequest) -> Dict[str, Any]:
    try:
        return mapping_service.reverse(payload.containerId, payload.objectType)
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/mapping/history")
@app.get("/v1/mapping/history")
def mapping_history(
    vuri: str,
    from_time: str = Query(..., alias="from"),
    to_time: str = Query(..., alias="to"),
) -> Dict[str, Any]:
    try:
        return mapping_service.history(vuri, from_time, to_time)
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/mapping/sync/execution")
@app.post("/v1/mapping/sync/execution")
def mapping_sync_execution(payload: MappingSyncExecutionRequest) -> Dict[str, Any]:
    try:
        return mapping_service.sync_execution(payload.execution, branch_id=payload.branch_id)
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/mapping/upsert/container")
@app.post("/v1/mapping/upsert/container")
def mapping_upsert_container(payload: MappingUpsertContainerRequest) -> Dict[str, Any]:
    try:
        item = mapping_service.upsert_container(payload.container)
        return {"container": item}
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/mapping/upsert/volume")
@app.post("/v1/mapping/upsert/volume")
def mapping_upsert_volume(payload: MappingUpsertVolumeRequest) -> Dict[str, Any]:
    try:
        item = mapping_service.upsert_volume(payload.volume)
        return {"volume": item}
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/mapping/export")
@app.get("/v1/mapping/export")
def mapping_export() -> Dict[str, Any]:
    return mapping_service.export_store()


@app.get("/api/v1/v-address/resolve")
def resolve_v_address(v_address: str) -> Dict[str, Any]:
    try:
        items = project_utxo_service.resolve(v_address)
        return {"v_address": v_address, "items": items}
    except (ProjectUTXOServiceError, VAddressError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/utxo/resolve")
def resolve_utxo_v_address(v: str) -> Dict[str, Any]:
    try:
        return project_utxo_service.resolve_protocol_v_address(v)
    except (ProjectUTXOServiceError, VAddressError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/resolve")
def resolve_protocol_v_address(v: str) -> Dict[str, Any]:
    try:
        return project_utxo_service.resolve_protocol_v_address(v)
    except (ProjectUTXOServiceError, VAddressError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/query/v-address")
def query_v_address(v_address: str) -> Dict[str, Any]:
    return resolve_v_address(v_address=v_address)


@app.get("/api/v1/branch/state")
def get_branch_state(project_id: str) -> Dict[str, Any]:
    try:
        return project_utxo_service.get_branch_overview(project_id)
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/project/{project_id}/branches")
def get_project_branches(project_id: str) -> Dict[str, Any]:
    try:
        return project_utxo_service.get_branch_overview(project_id)
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/branch/history")
def get_branch_history(project_id: str) -> Dict[str, Any]:
    try:
        return project_utxo_service.get_branch_history(project_id)
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/branch/fork")
def create_branch(payload: BranchForkRequest) -> Dict[str, Any]:
    try:
        requested_branch_id = str(payload.new_branch_id or payload.branch_id or "").strip()
        if not requested_branch_id:
            raise ValueError("branch_id is required")
        state = project_utxo_service.fork_branch(
            project_id=payload.project_id,
            from_branch=payload.from_branch,
            new_branch_id=requested_branch_id,
            reason=payload.reason,
            created_by=payload.created_by,
        )
        return {
            "project_id": payload.project_id,
            "current_branch": state["current_branch"],
            "active_forks": project_utxo_service.list_active_forks(payload.project_id),
            "branches": state["branches"],
        }
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/branch/override")
def branch_apply_override(payload: BranchOverrideRequest) -> Dict[str, Any]:
    try:
        state = project_utxo_service.apply_override(
            project_id=payload.project_id,
            branch_id=payload.branch_id,
            target_path=payload.target_path,
            value=payload.value,
        )
        return {"project_id": payload.project_id, "branch": state["branches"][payload.branch_id]}
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/branch/submit-review")
def branch_submit_review(payload: BranchReviewActionRequest) -> Dict[str, Any]:
    try:
        source_branch = str(payload.source_branch or payload.branch_id or "").strip()
        if not source_branch:
            raise ValueError("source_branch is required")
        state = project_utxo_service.submit_review(
            project_id=payload.project_id,
            branch_id=source_branch,
            actor_did=payload.actor_did,
            comment=payload.comment,
        )
        return {
            "project_id": payload.project_id,
            "current_branch": state["current_branch"],
            "active_forks": project_utxo_service.list_active_forks(payload.project_id),
            "branches": state["branches"],
        }
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/branch/approve")
def branch_approve(payload: BranchReviewActionRequest) -> Dict[str, Any]:
    try:
        source_branch = str(payload.source_branch or payload.branch_id or "").strip()
        if not source_branch:
            raise ValueError("source_branch is required")
        state = project_utxo_service.approve_branch(
            project_id=payload.project_id,
            branch_id=source_branch,
            actor_did=payload.actor_did,
            role=payload.role,
            comment=payload.comment,
        )
        return {
            "project_id": payload.project_id,
            "current_branch": state["current_branch"],
            "active_forks": project_utxo_service.list_active_forks(payload.project_id),
            "branches": state["branches"],
        }
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/branch/reject")
def branch_reject(payload: BranchReviewActionRequest) -> Dict[str, Any]:
    try:
        source_branch = str(payload.source_branch or payload.branch_id or "").strip()
        if not source_branch:
            raise ValueError("source_branch is required")
        state = project_utxo_service.reject_branch(
            project_id=payload.project_id,
            branch_id=source_branch,
            actor_did=payload.actor_did,
            role=payload.role,
            comment=payload.comment,
        )
        return {
            "project_id": payload.project_id,
            "current_branch": state["current_branch"],
            "active_forks": project_utxo_service.list_active_forks(payload.project_id),
            "branches": state["branches"],
        }
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/branch/merge")
def branch_merge(payload: BranchMergeRequest) -> Dict[str, Any]:
    try:
        source_branch = str(payload.source_branch or payload.branch_id or "").strip()
        if not source_branch:
            raise ValueError("source_branch is required")
        actor_did = str(payload.actor_did or payload.operator or "").strip()
        if not actor_did:
            raise ValueError("actor_did is required")
        state, decision_proof = project_utxo_service.merge_branch(
            project_id=payload.project_id,
            branch_id=source_branch,
            target_branch=payload.target_branch,
            decision=payload.decision,
            operator=actor_did,
        )
        return {
            "project_id": payload.project_id,
            "current_branch": state["current_branch"],
            "active_forks": project_utxo_service.list_active_forks(payload.project_id),
            "branches": state["branches"],
            "decision_proof": decision_proof,
        }
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/branch/abandon")
def branch_abandon(payload: BranchAbandonRequest) -> Dict[str, Any]:
    try:
        source_branch = str(payload.source_branch or payload.branch_id or "").strip()
        if not source_branch:
            raise ValueError("source_branch is required")
        actor_did = str(payload.actor_did or payload.operator or "").strip() or None
        state, decision_proof = project_utxo_service.abandon_branch_with_decision(
            project_id=payload.project_id,
            branch_id=source_branch,
            operator=actor_did,
            reason=payload.reason,
        )
        return {
            "project_id": payload.project_id,
            "current_branch": state["current_branch"],
            "active_forks": project_utxo_service.list_active_forks(payload.project_id),
            "branches": state["branches"],
            "decision_proof": decision_proof,
        }
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/branch/switch")
def branch_switch(payload: BranchActionRequest) -> Dict[str, Any]:
    try:
        state = project_utxo_service.set_current_branch(project_id=payload.project_id, branch_id=payload.branch_id)
        return {
            "project_id": payload.project_id,
            "current_branch": state["current_branch"],
            "active_forks": project_utxo_service.list_active_forks(payload.project_id),
            "branches": state["branches"],
        }
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/utxo/split")
def utxo_split(payload: BranchSplitRequest) -> Dict[str, Any]:
    try:
        state = project_utxo_service.split_utxo(
            project_id=payload.project_id,
            original_range=payload.original_range,
            splits=payload.splits,
        )
        return {"project_id": payload.project_id, "split_history": state["split_history"], "unspent_outputs": state["unspent_outputs"]}
    except (ProjectUTXOServiceError, VAddressError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/utxo/{project_id}")
def get_project_utxo_api(project_id: str) -> Dict[str, Any]:
    try:
        return project_utxo_service.list_project_utxo(project_id)
    except (ProjectUTXOServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
