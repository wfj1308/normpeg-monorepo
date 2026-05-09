from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict


class GenerateSPURequest(BaseModel):
    standardCode: str
    extractedData: Dict[str, Any] = Field(default_factory=dict)


class SPUGenerationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    taskId: str
    status: Literal["success", "failed"]
    spu: Optional[Dict[str, Any]] = None
    markdown: Optional[str] = None
    json_data: Optional[Dict[str, Any]] = Field(default=None, alias="json")
    confidence: float = 0.0
    reviewPoints: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    downloadUrl: Optional[str] = None


class ValidationRequest(BaseModel):
    spu: Dict[str, Any]
    targetSchema: str = "SPU-v1"


class ValidationResponse(BaseModel):
    valid: bool
    errors: List[str] = Field(default_factory=list)
