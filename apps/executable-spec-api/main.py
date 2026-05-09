from __future__ import annotations

import csv
import io
import sys
from pathlib import Path
from typing import Any, Dict, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from app.layer1.facade import list_layer1_components, resolve_layer1_component
from app.layer1.repository import load_normdoc
from app.models.compiler import NormDocCompileEnvelope, NormDocCompileRequest
from app.layer2.execution_service import execute_compaction, execute_compaction_table
from app.layer2.notification_service import ack_notification, list_notifications
from app.layer3.nl2gate import parse_natural_query, trace_to_layer2_request
from app.layer3.packaging import package_result
from app.models.execution import (
    CompactionExecutionRequest,
    NotificationAckRequest,
    RuleUpdateImpactRequest,
    TableExecutionRequest,
)
from app.models.layer3 import NLQueryRequest, NLQueryResponse
from app.models.normdoc import Layer1ResolveRequest
from app.services.orchestrator import compile_and_register_spu, process_rule_update_with_retrospect
from app.services.spu_registry import list_spu_registry_items, load_spu_asset_text
from backend.app.services import SpaceContextService, SpaceContextServiceError


app = FastAPI(title="Executable Spec API", version="0.1.0")
space_context_service = SpaceContextService()


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5175", "http://localhost:5175", "http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/layer1/components")
def api_list_components() -> Dict[str, Any]:
    return {"items": list_layer1_components()}


@app.get("/api/v1/layer1/components/{component_id}")
def api_get_component(component_id: str, version: str = "v1") -> Dict[str, Any]:
    payload = load_normdoc(component_id, version).model_dump(by_alias=True)
    return {"normdoc": payload}


@app.post("/api/v1/layer1/resolve")
def api_layer1_resolve(request: Layer1ResolveRequest) -> Dict[str, Any]:
    return resolve_layer1_component(request).model_dump()


@app.post("/api/v1/layer1/compile/spu-yaml", response_class=PlainTextResponse)
def api_compile_spu_yaml(request: NormDocCompileRequest) -> str:
    result = compile_and_register_spu(request)
    if not result.get("ok"):
        return str(result.get("error", "COMPILE_FAILED"))
    yaml_text = load_spu_asset_text(str(result["spuId"]))
    return yaml_text


@app.get("/api/v1/spu/registry")
def api_list_spu_registry() -> Dict[str, Any]:
    return {"items": list_spu_registry_items()}


@app.get("/api/v1/spu/assets/{spu_id}", response_class=PlainTextResponse)
def api_get_spu_asset(spu_id: str) -> str:
    return load_spu_asset_text(spu_id)


@app.post("/api/v1/normdoc/compile-spu")
def api_compile_spu(request: NormDocCompileEnvelope) -> Dict[str, Any]:
    return compile_and_register_spu(request.normDoc)


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


@app.post("/api/v1/layer2/execute/compaction")
def api_execute_compaction(request: CompactionExecutionRequest) -> Dict[str, Any]:
    return execute_compaction(request).model_dump()


@app.post("/api/v1/layer2/execute/compaction-table")
def api_execute_compaction_table(request: TableExecutionRequest) -> Dict[str, Any]:
    return execute_compaction_table(request.rows)


@app.post("/api/v1/layer2/rule-update-impact")
def api_rule_update_impact(request: RuleUpdateImpactRequest) -> Dict[str, Any]:
    return process_rule_update_with_retrospect(request.update, request.records)


@app.get("/api/v1/layer2/notifications")
def api_list_notifications(project_id: str, status: str = "") -> Dict[str, Any]:
    return {
        "items": list_notifications(project_id=project_id, status=status),
    }


@app.post("/api/v1/layer2/notifications/{notification_id}/ack")
def api_ack_notification(notification_id: str, request: NotificationAckRequest) -> Dict[str, Any]:
    return {
        "notification": ack_notification(
            project_id=request.project_id,
            notification_id=notification_id,
            user_did=request.user_did,
            comment=request.comment,
        )
    }


@app.post("/api/v1/layer3/query", response_model=NLQueryResponse)
def api_nl_query(request: NLQueryRequest) -> NLQueryResponse:
    trace = parse_natural_query(request.message)
    layer2_req = trace_to_layer2_request(request.project_id, trace)
    execution_result = execute_compaction(layer2_req).model_dump()
    natural_reply = package_result(trace, execution_result)
    return NLQueryResponse(
        parse_trace=trace,
        layer2_request=layer2_req.model_dump(mode="json"),
        execution_result=execution_result,
        natural_language_reply=natural_reply,
    )
