from __future__ import annotations

from typing import Any, Dict

from pydantic import BaseModel, Field


class NLQueryRequest(BaseModel):
    project_id: str = "GXX_2024_XXX"
    message: str = Field(..., min_length=1)
    user_id: str = "default"


class NLQueryResponse(BaseModel):
    parse_trace: Dict[str, Any]
    layer2_request: Dict[str, Any]
    execution_result: Dict[str, Any]
    natural_language_reply: str

