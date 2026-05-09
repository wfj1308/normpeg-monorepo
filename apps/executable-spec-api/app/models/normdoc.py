from __future__ import annotations

from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field


class NormDocHeader(BaseModel):
    catalog_id: str
    standard_id: str
    standard_version: str
    component_id: str
    component_name: str
    version: str
    status: str = "active"


class PathStep(BaseModel):
    id: str
    output: str | None = None
    formula: str | None = None
    lookup: Dict[str, Any] | None = None


class PathDefinition(BaseModel):
    steps: List[PathStep]
    lookup_tables: Dict[str, Any] = Field(default_factory=dict)


class GateCheck(BaseModel):
    condition: str
    fail_action: str


class RepresentativeCheck(BaseModel):
    aggregation: str
    method: str
    condition: str
    fail_action: str


class GateDefinition(BaseModel):
    entry: str
    clause_refs: List[str] = Field(default_factory=list)
    type: str = "DualCheck"
    single_point_check: GateCheck
    representative_check: RepresentativeCheck
    override_allowed: bool = False
    override_requires: List[str] = Field(default_factory=list)


class NormDocBody(BaseModel):
    type: str
    critical: bool = False
    input_dto: Dict[str, Any]
    output_dto: Dict[str, Any]
    path: PathDefinition
    state: List[str]


class NormDocTrailer(BaseModel):
    proof_fields: List[str] = Field(default_factory=list)
    execution_entry: str


class IncrementalUpdate(BaseModel):
    id: str
    target: str
    from_value: Any = Field(alias="from")
    to_value: Any = Field(alias="to")
    effective_date: str
    reason: str


class NormDoc(BaseModel):
    header: NormDocHeader
    body: NormDocBody
    gate: GateDefinition
    trailer: NormDocTrailer
    incremental_updates: List[IncrementalUpdate] = Field(default_factory=list)


class PatchOperation(BaseModel):
    op: Literal["replace"]
    path: str
    value: Any


class NormPatch(BaseModel):
    patch_id: str
    component_id: str
    base_version: str
    authority: str
    reason: str
    effective_date: str
    operations: List[PatchOperation]


class ProjectOverrideRule(BaseModel):
    target: str
    value: Any
    reason: str


class ProjectProfile(BaseModel):
    project_id: str
    project_name: str
    default_component_version: str = "v1"
    overrides: List[ProjectOverrideRule] = Field(default_factory=list)
    roles: Dict[str, Any] = Field(default_factory=dict)


class Layer1ResolveRequest(BaseModel):
    project_id: str
    component_id: str
    version: str | None = None
    patch_ids: List[str] = Field(default_factory=list)
    use_project_overrides: bool = True


class Layer1ResolveResponse(BaseModel):
    component_id: str
    version: str
    applied_patches: List[str]
    applied_overrides: List[str]
    normdoc: Dict[str, Any]

