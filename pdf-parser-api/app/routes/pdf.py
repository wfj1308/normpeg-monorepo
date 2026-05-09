from __future__ import annotations

import json
import threading
import uuid
from typing import Any, Dict

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.models.schemas import (
    BuildRulepackRequest,
    DocumentIRValidateRequest,
    ParseOptions,
    ParseQueuedResponse,
    ParseStatusResponse,
    SpecIRQualityBatchCheckRequest,
    SpecIRQualityCheckRequest,
    SpecIRChecklistValidateRequest,
    SpecIRSignRequest,
    RunPipelineRequest,
    SpecIRDiffRequest,
    SpecIRReviewQueueRequest,
    SpecIRReviewQueueDecideRequest,
    ValidateRequest,
    ValidateResponse,
)
from pathlib import Path
from app.services.parser import is_pdf_bytes, parse_pdf
from app.services.pipeline_orchestrator import run_full_pipeline
from app.services.rulepack_builder import build_rulepack
from app.services.specir_candidate import generate_specir_candidates
from app.services.specir_derivation import derive_rules_and_gates_from_specir
from app.services.specir_quality import check_specir_quality, check_specir_quality_batch
from app.services.specir_review import enforce_specir_approval_guard, validate_specir_checklist
from app.services.specir_signature import sign_specir
from app.services.specir_versioning import build_specir_diff_report
from app.services.specir_review_queue import get_review_queue, decide_review_queue_item
from app.services.validator import validate_document_ir, validate_extracted_data
from app.services.document_ir_pipeline import run_document_ir_pipeline
from app.storage.result_store import ParseResultStore


def _run_parse_task(
    *,
    store: ParseResultStore,
    parse_id: str,
    payload: bytes,
    file_name: str,
    standard_code: str,
    options: ParseOptions,
) -> None:
    try:
        store.set_processing(parse_id, progress=0.0)
        artifact_dir = Path(store.runtime_dir) / parse_id
        result, artifacts, steps = run_document_ir_pipeline(
            parse_id=parse_id,
            payload=payload,
            file_name=file_name,
            standard_code=standard_code,
            options=options,
            artifact_dir=artifact_dir,
        )
        for step in steps:
            store.append_step_log(parse_id, step)
            store.set_stage(parse_id, str(step.get("step", "processing")), progress=min(1.0, max(0.0, float((steps.index(step) + 1) / max(1, len(steps))))))
        for name, path in artifacts.items():
            store.add_artifact(parse_id, name, Path(path))
        if result.status == "failed" or result.error:
            store.set_failed(parse_id, result.error or "PARSE_ERROR")
            return
        store.set_success(parse_id, result)
    except Exception:
        store.set_failed(parse_id, "PARSE_ERROR")


def create_pdf_router(store: ParseResultStore) -> APIRouter:
    router = APIRouter(prefix="/v1/pdf", tags=["pdf"])

    @router.post("/parse", response_model=ParseQueuedResponse)
    async def parse_endpoint(
        file: UploadFile = File(...),
        standardCode: str = Form(...),
        options: str = Form("{}"),
    ) -> ParseQueuedResponse:
        payload = await file.read()
        await file.close()

        filename = file.filename or "upload.pdf"
        parse_id = f"parse_{uuid.uuid4().hex[:16]}"
        if not payload:
            store.create_task(parse_id)
            store.set_failed(parse_id, "INVALID_FILE")
            return JSONResponse(status_code=400, content={"parseId": parse_id, "status": "failed", "error": "INVALID_FILE"})  # type: ignore[return-value]

        try:
            options_payload: Dict[str, Any] = json.loads(options or "{}")
            parse_options = ParseOptions.model_validate(options_payload)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid options JSON")

        store.create_task(parse_id)
        worker = threading.Thread(
            target=_run_parse_task,
            kwargs={
                "store": store,
                "parse_id": parse_id,
                "payload": payload,
                "file_name": filename,
                "standard_code": standardCode,
                "options": parse_options,
            },
            daemon=True,
        )
        worker.start()
        return ParseQueuedResponse(parseId=parse_id, status="queued")

    @router.get("/status/{parseId}", response_model=ParseStatusResponse)
    def status_endpoint(parseId: str) -> ParseStatusResponse:
        task = store.get_task(parseId)
        if task is None:
            raise HTTPException(status_code=404, detail=f"parseId not found: {parseId}")
        return ParseStatusResponse(parseId=parseId, status=task.status, progress=task.progress, stage=task.stage, artifacts=task.artifacts, error=task.error)

    @router.get("/result/{parseId}")
    def result_endpoint(parseId: str):
        task = store.get_task(parseId)
        if task is None:
            raise HTTPException(status_code=404, detail=f"parseId not found: {parseId}")
        if task.status == "success" and task.result is not None:
            return task.result
        return {
            "parseId": parseId,
            "status": task.status,
            "progress": task.progress,
            "stage": task.stage,
            "artifacts": task.artifacts,
            "step_logs": task.step_logs,
            "error": task.error,
        }

    @router.post("/validate", response_model=ValidateResponse)
    def validate_endpoint(request: ValidateRequest) -> ValidateResponse:
        return validate_extracted_data(request.extractedData, request.targetSchema)

    @router.post("/validate-document-ir")
    def validate_document_ir_endpoint(request: DocumentIRValidateRequest):
        return validate_document_ir(request.documentIR)

    @router.post("/specir-quality-check")
    def specir_quality_check_endpoint(request: SpecIRQualityCheckRequest):
        return check_specir_quality(request.specir)

    @router.post("/specir-quality-check/batch")
    def specir_quality_check_batch_endpoint(request: SpecIRQualityBatchCheckRequest):
        return check_specir_quality_batch(request.specirs)

    @router.post("/build-rulepack")
    def build_rulepack_endpoint(request: BuildRulepackRequest):
        result = build_rulepack(
            request.form_code,
            whitelist=request.whitelist or None,
            approved_specirs=request.approved_specirs or None,
            parse_id=request.parse_id or "",
        )
        if isinstance(result.get("rulepack"), dict):
            store.write_rulepack(request.form_code, result.get("rulepack", {}))
        if isinstance(result.get("rulepack_diff"), dict):
            store.write_rulepack_diff(request.form_code, result.get("rulepack_diff", {}))
        if isinstance(result.get("traceability_report"), dict):
            store.write_traceability_report(request.form_code, result.get("traceability_report", {}))
        return result

    @router.post("/specir-checklist/validate")
    def validate_specir_checklist_endpoint(request: SpecIRChecklistValidateRequest):
        return validate_specir_checklist(request.specir)

    @router.post("/specir-checklist/approval-guard")
    def specir_approval_guard_endpoint(request: SpecIRChecklistValidateRequest):
        return enforce_specir_approval_guard(request.specir)

    @router.post("/specir/sign")
    def sign_specir_endpoint(request: SpecIRSignRequest):
        return sign_specir(
            request.specir,
            signer_id=request.signer_id,
            signer_role=request.signer_role,
            editor_id=request.editor_id,
        )

    @router.post("/pipeline/run")
    def run_pipeline_endpoint(request: RunPipelineRequest):
        return run_full_pipeline(
            parse_id=request.parse_id,
            form_code=request.form_code,
            reviewer_id=request.reviewer_id,
            signer_id=request.signer_id,
            signer_role=request.signer_role,
            editor_id=request.editor_id,
        )

    @router.post("/specir/diff")
    def specir_diff_endpoint(request: SpecIRDiffRequest):
        base_dir = Path(store.runtime_dir) / request.parse_id
        old_path = base_dir / request.old_specir_file
        new_path = base_dir / request.new_specir_file
        report = build_specir_diff_report(old_specirs_path=old_path, new_specirs_path=new_path)
        store.write_specir_diff_report(request.parse_id, report)
        return report

    @router.post("/specir/review-queue")
    def specir_review_queue_endpoint(request: SpecIRReviewQueueRequest):
        return get_review_queue(request.parse_id)

    @router.post("/specir/review-queue/decide")
    def specir_review_queue_decide_endpoint(request: SpecIRReviewQueueDecideRequest):
        return decide_review_queue_item(
            request.parse_id,
            request.specir_id,
            request.action,
            editor_id=request.editor_id,
            patch=request.patch or {},
            reason=request.reason,
        )

    return router
