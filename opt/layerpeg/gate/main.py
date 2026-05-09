from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any, Literal, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse

from engine import FieldValue, GateContext, GateEngine, Patch


StatusType = Literal["PASS", "WARNING", "BLOCKED"]


class PhotoItem(BaseModel):
    hash: str
    meta: dict[str, Any] = Field(default_factory=dict)


class GateValidateRequest(BaseModel):
    form_type: str
    project_id: str
    section: Optional[str] = None
    inputs: dict[str, Any]
    photos: list[PhotoItem] = Field(default_factory=list)


class RuleHitResult(BaseModel):
    rule_id: str
    field: str
    status: StatusType
    message: str
    suggested_action: str
    override_requirements: list[Any] = Field(default_factory=list)


class GateValidateResponse(BaseModel):
    validation_id: str
    status: StatusType
    results: list[RuleHitResult]
    form_pdf: str
    proof_hash: str


class ErrorResponse(BaseModel):
    error: dict[str, Any]


app = FastAPI(title="LayerPeg Gate API")
# MINIMAL_COMPLETION: required for local browser validation page calling 8080/8081 directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
engine = GateEngine()
project_configs: dict[str, dict[str, Any]] = {}


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
    code = detail.get("code", "HTTP_ERROR")
    message = detail.get("message", "request_failed")
    payload = {"error": {"code": code, "message": message, "details": detail}}
    return JSONResponse(status_code=exc.status_code, content=payload)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    payload = {
        "error": {
            "code": "REQUEST_VALIDATION_ERROR",
            "message": "request_body_validation_failed",
            "details": exc.errors(),
        }
    }
    return JSONResponse(status_code=422, content=payload)


def _to_field_value(value: Any) -> FieldValue:
    if isinstance(value, bool):
        return FieldValue.Boolean(value)
    if isinstance(value, (int, float)):
        return FieldValue.Number(float(value))
    if isinstance(value, str):
        return FieldValue.String(value)
    if isinstance(value, list):
        return FieldValue.Array(value)
    if isinstance(value, dict):
        return FieldValue.Computed(value)
    return FieldValue.String(str(value))


def _project_file_candidates(project_id: str) -> list[Path]:
    primary = Path("projects") / f"{project_id}.json"
    layerpeg_root = Path(__file__).resolve().parent.parent
    fallback = layerpeg_root / "projects" / f"{project_id}.json"
    return [primary, fallback]


def _load_project_config(project_id: str) -> dict[str, Any]:
    if project_id in project_configs:
        return project_configs[project_id]

    for candidate in _project_file_candidates(project_id):
        if candidate.exists():
            payload = json.loads(candidate.read_text(encoding="utf-8"))
            project_configs[project_id] = payload
            return payload

    raise HTTPException(
        status_code=404,
        detail={
            "code": "PROJECT_NOT_FOUND",
            "message": f"项目配置不存在：projects/{project_id}.json",
        },
    )


def _parse_effective(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _build_project_overrides(project_profile: dict[str, Any]) -> list[Patch]:
    patches: list[Patch] = []

    # Preferred shape from current project file:
    # design_params.subgrade.96_zone.project_override
    override = (
        project_profile.get("design_params", {})
        .get("subgrade", {})
        .get("96_zone", {})
        .get("project_override")
    )
    if isinstance(override, dict) and override.get("enabled"):
        target = str(override.get("target") or "compaction_degree_threshold")
        replace = override.get("value")
        if replace is not None:
            patches.append(
                Patch(
                    patch_id=f"{project_profile.get('project_code', 'project')}.96_zone.override",
                    target=target,
                    replace=replace,
                    reason=str(override.get("reason") or "project_override"),
                    effective=_parse_effective(override.get("effective_date")),
                    authority=str(override.get("approved_by") or ""),
                    # MINIMAL_COMPLETION: local project override uses preloaded profile, not signature workflow.
                    signature_hash="project_profile_override",
                )
            )

    # Compatibility with document JSON sample:
    # project_overrides[].rules[].{target, override}
    for override_item in project_profile.get("project_overrides", []):
        if not isinstance(override_item, dict):
            continue
        for rule in override_item.get("rules", []):
            if not isinstance(rule, dict):
                continue
            target = rule.get("target")
            replace = rule.get("override")
            if target is None or replace is None:
                continue
            patches.append(
                Patch(
                    patch_id=str(override_item.get("id") or f"override_{len(patches)+1}"),
                    target=str(target),
                    replace=replace,
                    reason=str(rule.get("note") or override_item.get("name") or "project_override"),
                    effective=_parse_effective(override_item.get("effective_date")),
                    authority="project_profile",
                    # MINIMAL_COMPLETION: compatibility path for sample profile payload.
                    signature_hash="project_profile_override",
                )
            )

    return patches


def _number_value(table_data: dict[str, FieldValue], field_id: str) -> Optional[float]:
    value = table_data.get(field_id)
    if value is None or value.kind != "Number":
        return None
    try:
        return float(value.value)
    except (TypeError, ValueError):
        return None


def _materialize_t0921_inputs(table_data: dict[str, FieldValue], gate_engine: GateEngine) -> None:
    # MINIMAL_COMPLETION: when request only carries raw test inputs, derive computed fields required by Gate checks.
    if "position" in table_data and "layer_position" not in table_data:
        position = table_data["position"]
        if position.kind == "String":
            table_data["layer_position"] = FieldValue.String(str(position.value))

    if "wet_density" not in table_data:
        wet_density = gate_engine.compute_field("wet_density", table_data)
        if wet_density is not None:
            table_data["wet_density"] = FieldValue.Number(wet_density)

    if "dry_density" not in table_data:
        dry_density = gate_engine.compute_field("dry_density", table_data)
        if dry_density is not None:
            table_data["dry_density"] = FieldValue.Number(dry_density)

    if "compaction_degree" not in table_data:
        compaction = gate_engine.compute_field("compaction_degree", table_data)
        if compaction is not None:
            table_data["compaction_degree"] = FieldValue.Number(compaction)


def _status_from_results(results: list[RuleHitResult]) -> StatusType:
    has_block = any(item.status == "BLOCKED" for item in results)
    if has_block:
        return "BLOCKED"
    has_warning = any(item.status == "WARNING" for item in results)
    if has_warning:
        return "WARNING"
    return "PASS"


def _map_validation_result(
    *,
    fallback_rule_id: str,
    fallback_field: str,
    status: str,
    message: str,
    code: str,
    remedy: Optional[str],
    extra: dict[str, Any],
) -> RuleHitResult:
    mapped_status: StatusType
    if status == "Block":
        mapped_status = "BLOCKED"
    elif status == "Warning":
        mapped_status = "WARNING"
    else:
        mapped_status = "PASS"

    rule_id = str(extra.get("rule_id") or code or fallback_rule_id)
    field = str(extra.get("field") or extra.get("field_id") or fallback_field)
    suggested_action = remedy or ("block_submit" if mapped_status == "BLOCKED" else "continue")
    override_requirements = extra.get("OverrideRequires") or extra.get("override_requirements") or []
    if not isinstance(override_requirements, list):
        override_requirements = [override_requirements]

    return RuleHitResult(
        rule_id=rule_id,
        field=field,
        status=mapped_status,
        message=message or code or "validation_result",
        suggested_action=str(suggested_action),
        override_requirements=override_requirements,
    )


def _build_placeholder_form_pdf(request: GateValidateRequest, validation_id: str) -> str:
    # MINIMAL_COMPLETION: 文档要求 form_pdf 字段；当前仅返回占位 base64 前缀，不生成真实 PDF。
    payload = {
        "validation_id": validation_id,
        "form_type": request.form_type,
        "project_id": request.project_id,
        "section": request.section,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    return f"base64:placeholder:{digest}"


def _build_proof_hash(
    request: GateValidateRequest,
    status: StatusType,
    results: list[RuleHitResult],
    validated_inputs: dict[str, Any],
) -> str:
    payload = {
        "form_type": request.form_type,
        "project_id": request.project_id,
        "section": request.section,
        "inputs": validated_inputs,
        "photos": [item.model_dump() for item in request.photos],
        "status": status,
        "results": [item.model_dump() for item in results],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


@app.post(
    "/v1/gate/validate",
    response_model=GateValidateResponse,
    responses={400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def gate_validate(request: GateValidateRequest) -> GateValidateResponse:
    if request.form_type != "T0921-2019":
        raise HTTPException(
            status_code=422,
            detail={
                "code": "UNSUPPORTED_FORM_TYPE",
                "message": f"当前第一版仅支持 T0921-2019，收到 {request.form_type}",
                "allowed": ["T0921-2019"],
            },
        )

    normalized_inputs = dict(request.inputs)
    if "stake" not in normalized_inputs and request.section:
        normalized_inputs["stake"] = request.section

    table_data = {key: _to_field_value(value) for key, value in normalized_inputs.items()}
    _materialize_t0921_inputs(table_data, engine)

    if _number_value(table_data, "compaction_degree") is None:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INSUFFICIENT_INPUTS",
                "message": "无法形成 T0921 所需 compaction_degree，请补充 compaction_degree 或完整原始参数",
                "required_any_of": [
                    ["compaction_degree"],
                    ["sand_density", "mass_hole_sand", "volume_ring", "moisture_content", "max_dry_density"],
                ],
            },
        )

    project_profile = _load_project_config(request.project_id)
    context = GateContext(
        norm_version="JTG_3450_2019.T0921",
        project_overrides=_build_project_overrides(project_profile),
        user_context={"project_id": request.project_id},
    )

    results: list[RuleHitResult] = []

    for field_id, field_value in table_data.items():
        if engine.get_field_definition(field_id) is None:
            # MINIMAL_COMPLETION: request may include metadata/helper fields not defined in Gate field schema.
            continue
        field_result = engine.validate_field(field_id, field_value, context)
        if field_result.status == "Pass":
            continue
        results.append(
            _map_validation_result(
                fallback_rule_id=f"field.{field_id}",
                fallback_field=field_id,
                status=field_result.status,
                message=field_result.message,
                code=field_result.code,
                remedy=field_result.remedy,
                extra=field_result.extra,
            )
        )

    cross_results = engine.validate_cross_field(table_data, context)
    for cross in cross_results:
        results.append(
            _map_validation_result(
                fallback_rule_id=str(cross.code or "cross_rule"),
                fallback_field=str(cross.extra.get("field") or ""),
                status=cross.status,
                message=cross.message,
                code=cross.code,
                remedy=cross.remedy,
                extra=cross.extra,
            )
        )

    status = _status_from_results(results)
    validation_id = f"val-{uuid4().hex}"
    form_pdf = _build_placeholder_form_pdf(request, validation_id)
    proof_hash = _build_proof_hash(
        request=request,
        status=status,
        results=results,
        validated_inputs={key: value.value for key, value in table_data.items()},
    )

    return GateValidateResponse(
        validation_id=validation_id,
        status=status,
        results=results,
        form_pdf=form_pdf,
        proof_hash=proof_hash,
    )


@app.get("/health")
def health() -> dict[str, str]:
    # MINIMAL_COMPLETION: 文档主接口只要求 /v1/gate/validate；保留 /health 仅用于进程存活探测。
    return {"status": "ok"}
