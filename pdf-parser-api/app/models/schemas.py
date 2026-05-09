from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


ParseTaskStatusLiteral = Literal["queued", "processing", "success", "failed"]
ParseResultStatusLiteral = Literal["success", "partial", "failed"]


class ParseOptions(BaseModel):
    extractTables: bool = True
    extractFormulas: bool = True
    ocrLanguage: str = "chi_sim+eng"


class ExtractedData(BaseModel):
    metadata: Dict[str, Any] = Field(default_factory=dict)
    documentIR: Dict[str, Any] = Field(default_factory=dict)
    chapters: List[Dict[str, Any]] = Field(default_factory=list)
    tables: List[Dict[str, Any]] = Field(default_factory=list)
    formulas: List[Dict[str, Any]] = Field(default_factory=list)
    clauses: List[Dict[str, Any]] = Field(default_factory=list)


class ParseResult(BaseModel):
    parseId: str
    status: ParseResultStatusLiteral
    extractedData: ExtractedData = Field(default_factory=ExtractedData)
    rawText: str = ""
    confidence: float = 0.0
    reviewRequired: bool = True
    error: Optional[str] = None


class ParseQueuedResponse(BaseModel):
    parseId: str
    status: Literal["queued"]


class ParseStatusResponse(BaseModel):
    parseId: str
    status: ParseTaskStatusLiteral
    progress: float = 0.0
    stage: str = "queued"
    artifacts: Dict[str, str] = Field(default_factory=dict)
    error: Optional[str] = None


class ParseTaskRecord(BaseModel):
    parseId: str
    status: ParseTaskStatusLiteral = "queued"
    progress: float = 0.0
    stage: str = "queued"
    artifacts: Dict[str, str] = Field(default_factory=dict)
    step_logs: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
    result: Optional[ParseResult] = None


class ValidateRequest(BaseModel):
    extractedData: ExtractedData
    targetSchema: str = "SPU-v1"


class ValidateResponse(BaseModel):
    valid: bool
    errors: List[str] = Field(default_factory=list)


class DocumentIRValidateRequest(BaseModel):
    documentIR: Dict[str, Any]


class SpecIRQualityCheckRequest(BaseModel):
    specir: Dict[str, Any]


class SpecIRQualityBatchCheckRequest(BaseModel):
    specirs: List[Dict[str, Any]]


class BuildRulepackRequest(BaseModel):
    form_code: str
    parse_id: str = ""
    whitelist: Dict[str, Any] = Field(default_factory=dict)
    approved_specirs: List[Dict[str, Any]] = Field(default_factory=list)


class SpecIRChecklistValidateRequest(BaseModel):
    specir: Dict[str, Any]


class SpecIRSignRequest(BaseModel):
    specir: Dict[str, Any]
    signer_id: str
    signer_role: str
    editor_id: str


class RunPipelineRequest(BaseModel):
    parse_id: str
    form_code: str = "bridge13"
    reviewer_id: str = "reviewer_001"
    signer_id: str = "reviewer_001"
    signer_role: str = "reviewer"
    editor_id: str = "editor_001"


class SpecIRDiffRequest(BaseModel):
    parse_id: str
    old_specir_file: str
    new_specir_file: str


class SpecIRReviewQueueRequest(BaseModel):
    parse_id: str


class SpecIRReviewQueueDecideRequest(BaseModel):
    parse_id: str
    specir_id: str
    action: Literal["approve", "reject", "edit"]
    editor_id: str = ""
    reason: str = ""
    patch: Dict[str, Any] = Field(default_factory=dict)
