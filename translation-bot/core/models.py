from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Formula:
    expression: str
    latex: str
    formula_code: str
    output_variable: str
    unit: str = ""
    source_page: int = 0
    source_line_no: int = 0


@dataclass
class PageStructure:
    page_no: int
    text: str
    text_blocks: List[str] = field(default_factory=list)
    tables: List[Dict[str, Any]] = field(default_factory=list)
    formulas: List[Formula] = field(default_factory=list)


@dataclass
class ClauseNode:
    clause_id: str
    title: str
    text: str
    page_no: int = 0
    line_no: int = 0
    depth: int = 1
    parent_id: Optional[str] = None


@dataclass
class ClauseTree:
    roots: List[Dict[str, Any]]
    nodes: List[Dict[str, Any]]
    stats: Dict[str, Any]

    def leaves(self) -> List[Dict[str, Any]]:
        return [item for item in self.nodes if not item.get("children")]


@dataclass
class DocumentStructure:
    standard_code: str
    pdf_path: str
    pages: List[PageStructure] = field(default_factory=list)
    clause_tree: ClauseTree = field(
        default_factory=lambda: ClauseTree(roots=[], nodes=[], stats={"node_count": 0, "root_count": 0, "max_depth": 0})
    )
    warnings: List[str] = field(default_factory=list)


@dataclass
class ClauseSemantics:
    clause_id: str
    clause_title: str
    measured_item: Dict[str, Any]
    formulas: List[Dict[str, Any]]
    gate_rules: List[Dict[str, Any]]
    confidence: float
    evidence: Dict[str, Any] = field(default_factory=dict)


@dataclass
class NormSemantics:
    standard_code: str
    clauses: List[ClauseSemantics] = field(default_factory=list)
    avg_confidence: float = 0.0


@dataclass
class SpecIRDraft:
    yaml_text: str
    confidence: float
    review_points: List[Dict[str, Any]]
    specs: List[Dict[str, Any]]


@dataclass
class TaskResult:
    task_id: str
    status: str
    standard_code: str
    input_file: str
    created_at: str
    updated_at: str
    result_yaml: str = ""
    result_markdown: str = ""
    result_json: Dict[str, Any] = field(default_factory=dict)
    result_spu: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    parse_id: str = ""
    parse_status: str = ""
    parse_progress: float = 0.0
    parse_error: str = ""
    review_points: List[Any] = field(default_factory=list)
    parse_result: Dict[str, Any] = field(default_factory=dict)
    validate_result: Dict[str, Any] = field(default_factory=dict)
    spu_result: Dict[str, Any] = field(default_factory=dict)
    spu_validate_result: Dict[str, Any] = field(default_factory=dict)
    bundle_download_url: str = ""
    review_required: bool = False
    review_status: str = "DRAFT"
    review_score: float = 0.0
    review_passed: bool = False
    review_issues: List[Dict[str, Any]] = field(default_factory=list)
    review_history: List[Dict[str, Any]] = field(default_factory=list)
    review_decision: Dict[str, Any] = field(default_factory=dict)
    review_audit_events: List[Dict[str, Any]] = field(default_factory=list)
    template_query: Dict[str, Any] = field(default_factory=dict)
    template_recommendations: List[Dict[str, Any]] = field(default_factory=list)
    template_action: str = ""
    template_selected_id: str = ""
    auto_registry: Dict[str, Any] = field(default_factory=dict)
    execution_entry: Dict[str, Any] = field(default_factory=dict)
    template_saved_path: str = ""
    error: str = ""
