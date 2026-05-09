from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class NormDocField(BaseModel):
    name: str
    key: str
    type: Literal["number"] = "number"


class NormDocCompileRequest(BaseModel):
    norm: str
    clause: str
    category: str
    workItem: str
    measuredItem: str
    typeHint: str = "general"
    unit: str = ""
    threshold: float | int
    testMethods: list[str] = Field(default_factory=list)
    fields: list[NormDocField] = Field(default_factory=list)


class NormDocCompileEnvelope(BaseModel):
    normDoc: NormDocCompileRequest


class SpuRegistryItem(BaseModel):
    spuId: str
    norm: str
    clause: str
    name: str
    version: str
    category: str
    workItem: str
    measuredItem: str
    sourceType: str
    metricType: str = ""
    assetPath: str
