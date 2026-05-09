from __future__ import annotations

from typing import Any, Dict, Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .services import MappingService, MappingServiceError


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


app = FastAPI(
    title="NormRef Mapping API",
    version="1.0.0",
    description="Engineering spatial mapping service for stake -> container/volume/spec/state resolution.",
)
mapping_service = MappingService()


@app.post("/v1/mapping/resolve")
def mapping_resolve(payload: MappingResolveRequest) -> Dict[str, Any]:
    try:
        context_payload = payload.context.model_dump(exclude_none=True)
        return mapping_service.resolve(payload.vuri, context=context_payload)
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/mapping/query-range")
def mapping_query_range(payload: MappingQueryRangeRequest) -> Dict[str, Any]:
    try:
        filters = payload.filters.model_dump()
        return mapping_service.query_range(
            payload.startStake,
            payload.endStake,
            filters=filters,
        )
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/mapping/reverse")
def mapping_reverse(payload: MappingReverseRequest) -> Dict[str, Any]:
    try:
        return mapping_service.reverse(payload.containerId, payload.objectType)
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


@app.post("/v1/mapping/sync/execution")
def mapping_sync_execution(payload: MappingSyncExecutionRequest) -> Dict[str, Any]:
    try:
        return mapping_service.sync_execution(payload.execution, branch_id=payload.branch_id)
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/mapping/upsert/container")
def mapping_upsert_container(payload: MappingUpsertContainerRequest) -> Dict[str, Any]:
    try:
        item = mapping_service.upsert_container(payload.container)
        return {"container": item}
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/mapping/upsert/volume")
def mapping_upsert_volume(payload: MappingUpsertVolumeRequest) -> Dict[str, Any]:
    try:
        item = mapping_service.upsert_volume(payload.volume)
        return {"volume": item}
    except (MappingServiceError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/v1/mapping/export")
def mapping_export() -> Dict[str, Any]:
    return mapping_service.export_store()
