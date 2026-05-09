from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field


class CompactionRawData(BaseModel):
    sand_density: float
    mass_hole_sand: float
    volume_ring: float
    moisture_content: float
    max_dry_density: float


class CompactionExecutionRequest(BaseModel):
    project_id: str = "GXX_2024_XXX"
    component_id: str = "JTG_F80_1_2017.4.2.1.compaction"
    version: str | None = None
    patch_ids: List[str] = Field(default_factory=list)
    stake: str
    layer_depth: str = "0-0.8m"
    test_method: str = "T0921"
    raw_data: CompactionRawData | None = None
    compaction_degree: float | None = None
    paragraph_values: List[float] = Field(default_factory=list)
    actor_did: str = "did:peg:inspector:001"
    actor_name: str = "site_inspector"
    inspected_at: datetime | None = None
    override_requested: bool = False
    override_evidence: Dict[str, Any] = Field(default_factory=dict)


class GateDecision(BaseModel):
    status: Literal["PASS", "BLOCKED", "CRITICAL", "OVERRIDDEN"]
    single_point_passed: bool
    representative_passed: bool
    single_point_condition: str
    representative_condition: str
    single_point_message: str
    representative_message: str
    standard_value: float
    tolerance: float
    representative_value: float
    clause_refs: List[str] = Field(default_factory=list)


class ProofDTO(BaseModel):
    proof_hash: str
    generated_at: str
    payload: Dict[str, Any]


class ExecutionResult(BaseModel):
    component_id: str
    version: str
    project_id: str
    state_trace: List[str]
    input: Dict[str, Any]
    path_outputs: Dict[str, Any]
    gate: GateDecision
    output: Dict[str, Any]
    proof: ProofDTO
    explanation_basis: Dict[str, Any]


class TableExecutionRequest(BaseModel):
    project_id: str = "GXX_2024_XXX"
    component_id: str = "JTG_F80_1_2017.4.2.1.compaction"
    version: str | None = None
    patch_ids: List[str] = Field(default_factory=list)
    rows: List[CompactionExecutionRequest]


class RuleUpdateRequest(BaseModel):
    project_id: str
    component_id: str = "JTG_F80_1_2017.4.2.1.compaction"
    target: str = "body.path.lookup_tables.standard_by_zone.Z96"
    old_value: float
    new_value: float
    effective_date: str
    reason: str
    clause_id: str


class InspectedRecord(BaseModel):
    record_id: str
    stake: str
    checked_at: str
    compaction_degree: float
    layer_depth: str = "0-0.8m"
    status: str
    proof_hash: str = ""


class RuleUpdateImpactRequest(BaseModel):
    update: RuleUpdateRequest
    records: List[InspectedRecord]


class NotificationAckRequest(BaseModel):
    project_id: str
    user_did: str
    comment: str = ""
