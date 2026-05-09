from __future__ import annotations

import uuid
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from app.models.schemas import GenerateSPURequest, SPUGenerationResult, ValidationRequest, ValidationResponse
from app.services.json_renderer import render_json
from app.services.markdown_renderer import render_markdown
from app.services.specbundle_builder import build_specbundle_bytes
from app.services.spu_generator import (
    build_spec_json,
    build_spu_definition,
    is_empty_extracted_data,
    is_supported_metric,
    score_compaction_detection,
)
from app.services.validator import validate_spu_schema
from app.storage.output_store import OutputStore


def create_spu_router(store: OutputStore) -> APIRouter:
    router = APIRouter(prefix="/v1/spu", tags=["spu"])

    @router.post("/generate", response_model=SPUGenerationResult)
    def generate_spu(request: GenerateSPURequest) -> SPUGenerationResult:
        task_id = f"spu_{uuid.uuid4().hex[:16]}"
        extracted_data = request.extractedData if isinstance(request.extractedData, dict) else {}

        if is_empty_extracted_data(extracted_data):
            failed = SPUGenerationResult(
                taskId=task_id,
                status="failed",
                confidence=0.0,
                reviewPoints=[],
                error="EMPTY_EXTRACTED_DATA",
            )
            store.put(failed)
            return JSONResponse(status_code=400, content=failed.model_dump(by_alias=True))  # type: ignore[return-value]

        if not is_supported_metric(request.standardCode, extracted_data):
            failed = SPUGenerationResult(
                taskId=task_id,
                status="failed",
                confidence=0.0,
                reviewPoints=[],
                error="UNSUPPORTED_METRIC",
            )
            store.put(failed)
            return JSONResponse(status_code=422, content=failed.model_dump(by_alias=True))  # type: ignore[return-value]

        confidence, review_points = score_compaction_detection(request.standardCode, extracted_data)
        spu = build_spu_definition()
        validation = validate_spu_schema(spu, "SPU-v1")
        if not validation.valid:
            failed = SPUGenerationResult(
                taskId=task_id,
                status="failed",
                confidence=confidence,
                reviewPoints=review_points,
                error="INVALID_SPU_SCHEMA",
            )
            store.put(failed)
            return JSONResponse(status_code=422, content=failed.model_dump(by_alias=True))  # type: ignore[return-value]

        markdown = render_markdown(spu)
        spec_json = render_json(build_spec_json(spu))
        bundle = build_specbundle_bytes(markdown, spec_json)

        result = SPUGenerationResult(
            taskId=task_id,
            status="success",
            spu=spu,
            markdown=markdown,
            json_data=spec_json,
            confidence=confidence,
            reviewPoints=review_points,
            error=None,
            downloadUrl=f"/v1/spu/download/{task_id}.specbundle",
        )
        store.put(result, bundle_bytes=bundle)
        return result

    @router.get("/result/{taskId}", response_model=SPUGenerationResult)
    def get_spu_result(taskId: str) -> SPUGenerationResult:
        result = store.get(taskId)
        if result is None:
            raise HTTPException(status_code=404, detail=f"task not found: {taskId}")
        return result

    @router.get("/download/{taskId}.specbundle")
    def download_specbundle(taskId: str) -> FileResponse:
        path = store.bundle_path(taskId)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"specbundle not found: {taskId}")
        return FileResponse(path=path, filename=f"{taskId}.specbundle", media_type="application/zip")

    @router.post("/validate", response_model=ValidationResponse)
    def validate_spu(request: ValidationRequest) -> ValidationResponse:
        return validate_spu_schema(request.spu, request.targetSchema)

    return router
