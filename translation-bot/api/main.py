from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any, Dict

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from core import TaskStore, translation_pipeline
from core.platform_api_client import PlatformAPIClient
from core.spu_review_validator import REVIEW_STATUS_AUTO_VALIDATED, validate_generated_spu
from core.template_library import TemplateLibrary, infer_template_query

REVIEW_STATUS_DRAFT = "DRAFT"
REVIEW_STATUS_NEEDS_REVIEW = "NEEDS_REVIEW"
REVIEW_STATUS_APPROVED = "APPROVED"
REVIEW_STATUS_REJECTED = "REJECTED"

EXECUTION_ALLOWED_REVIEW_STATUSES = {
    REVIEW_STATUS_AUTO_VALIDATED,
    REVIEW_STATUS_APPROVED,
}

TEMPLATE_ALLOWED_ACTIONS = {
    "auto",
    "direct_use",
    "based_generate",
    "ignore",
}

BASE_DIR = Path(__file__).resolve().parents[1]
RUNTIME_DIR = BASE_DIR / "runtime"
UPLOAD_DIR = RUNTIME_DIR / "uploads"
UI_INDEX = BASE_DIR / "ui" / "index.html"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TASK_STORE = TaskStore(runtime_dir=RUNTIME_DIR)
TEMPLATE_LIBRARY = TemplateLibrary(runtime_dir=RUNTIME_DIR)

app = FastAPI(title="NormRef Translation Bot", version="0.1.0")


class ExecuteEntryRequest(BaseModel):
    containerId: str | None = None


class SaveTemplateResponse(BaseModel):
    status: str
    templatePath: str


class ReviewValidateRequest(BaseModel):
    spu: Dict[str, Any]
    extractedData: Dict[str, Any]
    confidence: float
    standardCode: str = ""


class ReviewApproveRequest(BaseModel):
    taskId: str
    reviewer: str


class ReviewRejectRequest(BaseModel):
    taskId: str
    reviewer: str
    reason: str


class TemplateApplyRequest(BaseModel):
    taskId: str
    action: str
    templateId: str | None = None


class TemplateRecommendRequest(BaseModel):
    standardCode: str
    extractedData: Dict[str, Any] = {}
    measuredItem: str = ""
    clause: str = ""
    category: str = ""
    workItem: str = ""


def _safe_file_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name or "upload.pdf").strip("._")
    return cleaned or "upload.pdf"


def _read_task(task_id: str):
    item = TASK_STORE.get(task_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
    return item


def _guard_task_done(task_id: str):
    item = _read_task(task_id)
    if item.status != "done":
        raise HTTPException(status_code=409, detail=f"Task not done: {task_id}")
    return item


def _ensure_execution_allowed(task_id: str):
    item = _guard_task_done(task_id)
    if item.review_status in EXECUTION_ALLOWED_REVIEW_STATUSES:
        return item
    if item.review_status == REVIEW_STATUS_NEEDS_REVIEW:
        raise HTTPException(status_code=400, detail="This SPU requires manual approval before execution.")
    if item.review_status == REVIEW_STATUS_REJECTED:
        raise HTTPException(status_code=400, detail="This SPU has been rejected and cannot be executed.")
    raise HTTPException(status_code=400, detail=f"Execution not allowed for reviewStatus={item.review_status}")


def _ensure_registered(task_id: str):
    item = _guard_task_done(task_id)
    if item.review_status not in EXECUTION_ALLOWED_REVIEW_STATUSES:
        raise HTTPException(status_code=400, detail=f"Registration not allowed for reviewStatus={item.review_status}")

    if bool((item.auto_registry or {}).get("registered")):
        return item

    spu_obj = item.result_spu or {}
    if not spu_obj:
        raise HTTPException(status_code=400, detail="No SPU generated for registration.")

    try:
        platform_client = PlatformAPIClient()
        auto_registry = platform_client.register_generated_spu(
            spu=spu_obj,
            verified=item.review_status == REVIEW_STATUS_APPROVED,
        )
        TASK_STORE.update_auto_registry(task_id=task_id, auto_registry=auto_registry)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"SPU registration failed: {exc}") from exc
    return _read_task(task_id)


def _persist_approved_template(task_id: str, reviewer: str) -> Dict[str, Any]:
    item = _guard_task_done(task_id)
    if item.review_status != REVIEW_STATUS_APPROVED:
        raise HTTPException(status_code=400, detail=f"Template persistence requires APPROVED status, got {item.review_status}.")
    if not item.result_spu:
        raise HTTPException(status_code=400, detail="No generated SPU available for template persistence.")

    template = TEMPLATE_LIBRARY.build_template_from_spu(
        spu=item.result_spu,
        source_type="generated_approved",
        review_status=REVIEW_STATUS_APPROVED,
        approved_by=reviewer,
        approved_at=item.updated_at,
    )
    stored = TEMPLATE_LIBRARY.add_template(template)
    event = {
        "eventType": "TEMPLATE_CREATED",
        "taskId": task_id,
        "templateId": stored.get("templateId"),
        "spuId": stored.get("spuId"),
        "timestamp": item.updated_at,
    }
    TEMPLATE_LIBRARY.log_event(event)
    TASK_STORE.append_audit_event(task_id, event)
    return stored


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/ui", response_class=HTMLResponse)
def ui() -> HTMLResponse:
    if not UI_INDEX.exists():
        raise HTTPException(status_code=404, detail="UI page not found.")
    return HTMLResponse(UI_INDEX.read_text(encoding="utf-8"))


@app.post("/translate")
async def translate_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    standard_code: str = Form(...),
    ocr_max_pages: int = Form(20),
    template_strategy: str = Form("auto"),
    template_id: str | None = Form(None),
) -> Dict[str, Any]:
    safe_name = _safe_file_name(file.filename or "upload.pdf")
    if not safe_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF is supported.")

    strategy = (template_strategy or "auto").strip().lower()
    if strategy not in TEMPLATE_ALLOWED_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid template strategy: {template_strategy}")

    payload = await file.read()
    await file.close()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty.")

    task_id = str(uuid.uuid4())
    save_path = UPLOAD_DIR / f"{task_id}-{safe_name}"
    save_path.write_bytes(payload)

    TASK_STORE.create(
        task_id=task_id,
        standard_code=standard_code,
        input_file=str(save_path),
    )
    background_tasks.add_task(
        translation_pipeline,
        task_id=task_id,
        pdf_path=str(save_path),
        standard_code=standard_code,
        base_dir=BASE_DIR,
        task_store=TASK_STORE,
        ocr_max_pages=ocr_max_pages,
        template_strategy=strategy,
        template_id=template_id,
    )

    return {
        "task_id": task_id,
        "status": "processing",
        "standard_code": standard_code,
    }


@app.get("/result/{task_id}")
def get_result(task_id: str) -> Dict[str, Any]:
    item = _read_task(task_id)
    done = item.status == "done"
    return {
        "task_id": item.task_id,
        "status": item.status,
        "standard_code": item.standard_code,
        "input_file": item.input_file,
        "parse_id": item.parse_id,
        "parse_status": item.parse_status,
        "parse_progress": item.parse_progress,
        "parse_error": item.parse_error,
        "markdown": item.result_markdown if done else None,
        "json": item.result_json if done else None,
        "spu": item.result_spu if done else None,
        "specir_yaml": item.result_yaml if done else None,
        "confidence": item.confidence,
        "review_points": item.review_points,
        "parse_result": item.parse_result if done else None,
        "validate_result": item.validate_result if done else None,
        "spu_result": item.spu_result if done else None,
        "spu_validate_result": item.spu_validate_result if done else None,
        "review_required": item.review_required if done else None,
        "review_status": item.review_status if done else REVIEW_STATUS_DRAFT,
        "review_score": item.review_score if done else 0.0,
        "review_passed": item.review_passed if done else False,
        "review_issues": item.review_issues if done else [],
        "review_history": item.review_history,
        "review_decision": item.review_decision if done else {},
        "review_audit_events": item.review_audit_events,
        "template_query": item.template_query if done else {},
        "template_recommendations": item.template_recommendations if done else [],
        "template_action": item.template_action if done else "",
        "template_selected_id": item.template_selected_id if done else "",
        "auto_registry": item.auto_registry if done else None,
        "execution_entry": item.execution_entry if done else None,
        "template_saved_path": item.template_saved_path if done else None,
        "error": item.error if item.status == "error" else None,
        "download_url": item.bundle_download_url if done else None,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


@app.post("/api/v1/spu/review/validate")
def validate_spu_review(payload: ReviewValidateRequest) -> Dict[str, Any]:
    return validate_generated_spu(
        spu=payload.spu,
        extracted_data=payload.extractedData,
        confidence=float(payload.confidence),
        standard_code=payload.standardCode,
    )


@app.post("/api/v1/spu/review/approve")
def approve_spu_review(payload: ReviewApproveRequest) -> Dict[str, Any]:
    _guard_task_done(payload.taskId)
    updated = TASK_STORE.approve_review(task_id=payload.taskId, reviewer=payload.reviewer)

    if not bool((updated.auto_registry or {}).get("registered")):
        _ensure_registered(payload.taskId)
        updated = _read_task(payload.taskId)

    stored = _persist_approved_template(payload.taskId, payload.reviewer)
    return {
        "taskId": payload.taskId,
        "reviewStatus": updated.review_status,
        "autoRegistry": updated.auto_registry,
        "template": stored,
    }


@app.post("/api/v1/spu/review/reject")
def reject_spu_review(payload: ReviewRejectRequest) -> Dict[str, Any]:
    _guard_task_done(payload.taskId)
    updated = TASK_STORE.reject_review(
        task_id=payload.taskId,
        reviewer=payload.reviewer,
        reason=payload.reason,
    )
    return {
        "taskId": payload.taskId,
        "reviewStatus": updated.review_status,
    }


@app.post("/api/v1/templates/recommend")
def recommend_templates(payload: TemplateRecommendRequest) -> Dict[str, Any]:
    query = infer_template_query(payload.standardCode, payload.extractedData, spu=None)
    if payload.measuredItem:
        query["measuredItem"] = payload.measuredItem
    if payload.clause:
        query["clause"] = payload.clause
    if payload.category:
        query["category"] = payload.category
    if payload.workItem:
        query["workItem"] = payload.workItem
    recommendations = TEMPLATE_LIBRARY.find_similar_templates(query)
    return {"query": query, "recommendations": recommendations}


@app.get("/api/v1/templates")
def list_templates() -> Dict[str, Any]:
    return {"items": TEMPLATE_LIBRARY.list_templates()}


@app.get("/api/v1/templates/{template_id}")
def get_template(template_id: str) -> Dict[str, Any]:
    item = TEMPLATE_LIBRARY.get_template(template_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")
    return {"item": item}


@app.delete("/api/v1/templates/{template_id}")
def delete_template(template_id: str) -> Dict[str, Any]:
    removed = TEMPLATE_LIBRARY.delete_template(template_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")
    return {"status": "deleted", "templateId": template_id}


@app.post("/api/v1/templates/apply")
def apply_template(
    payload: TemplateApplyRequest,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    action = (payload.action or "").strip().lower()
    if action not in TEMPLATE_ALLOWED_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid template action: {payload.action}")

    current = _read_task(payload.taskId)
    if current.status not in {"done", "error"}:
        raise HTTPException(status_code=409, detail=f"Task is not ready for template apply: {payload.taskId}")

    TASK_STORE.restart_processing(payload.taskId)
    background_tasks.add_task(
        translation_pipeline,
        task_id=payload.taskId,
        pdf_path=current.input_file,
        standard_code=current.standard_code,
        base_dir=BASE_DIR,
        task_store=TASK_STORE,
        ocr_max_pages=20,
        template_strategy=action,
        template_id=payload.templateId,
    )
    return {
        "taskId": payload.taskId,
        "status": "processing",
        "action": action,
        "templateId": payload.templateId,
    }


@app.post("/execute/{task_id}/entry")
def create_execute_entry(task_id: str, payload: ExecuteEntryRequest | None = None) -> Dict[str, Any]:
    _ensure_execution_allowed(task_id)
    item = _ensure_registered(task_id)

    spu_id = str((item.result_spu or {}).get("spuId") or "")
    if not spu_id:
        raise HTTPException(status_code=400, detail="Missing spuId in generation result.")

    container_id = payload.containerId if payload else None
    if not container_id:
        container_id = str((item.execution_entry or {}).get("containerId") or "").strip() or None

    platform_client = PlatformAPIClient()
    execution_entry = platform_client.create_execution_entry(
        spu_id=spu_id,
        container_id=container_id,
    )
    TASK_STORE.mark_execution_entry(task_id=task_id, execution_entry=execution_entry)

    warning = "Manual review is recommended before execution." if item.review_required else ""
    return {
        "task_id": task_id,
        "status": "ready",
        "warning": warning,
        "execution_entry": execution_entry,
        "execution_url": execution_entry.get("executionUrl", ""),
    }


@app.post("/template/{task_id}/save", response_model=SaveTemplateResponse)
def save_template(task_id: str) -> SaveTemplateResponse:
    _ensure_execution_allowed(task_id)
    item = _ensure_registered(task_id)
    if not item.result_spu:
        raise HTTPException(status_code=400, detail="No SPU generated.")

    template_path = TASK_STORE.save_template(
        task_id=task_id,
        spu=item.result_spu,
        markdown=item.result_markdown,
    )
    return SaveTemplateResponse(
        status="saved",
        templatePath=str(template_path),
    )


@app.get("/download/{task_id}.yaml")
def download_result_yaml(task_id: str) -> FileResponse:
    _guard_task_done(task_id)
    yaml_path = TASK_STORE.yaml_path(task_id)
    if not yaml_path.exists():
        raise HTTPException(status_code=404, detail=f"YAML not found for task: {task_id}")
    return FileResponse(
        path=yaml_path,
        filename=f"{task_id}.yaml",
        media_type="text/yaml",
    )


@app.get("/download/{task_id}.specbundle")
def download_result_specbundle(task_id: str) -> FileResponse:
    _guard_task_done(task_id)
    bundle_path = TASK_STORE.bundle_path(task_id)
    if not bundle_path.exists():
        raise HTTPException(status_code=404, detail=f"specbundle not found for task: {task_id}")
    return FileResponse(
        path=bundle_path,
        filename=f"{task_id}.specbundle",
        media_type="application/zip",
    )
