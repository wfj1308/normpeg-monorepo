from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import fitz  # type: ignore

from app.models.schemas import ExtractedData, ParseOptions, ParseResult
from app.services.ir_regression import build_ir_snapshot_diff
from app.services.normref_generator import generate_normref_index
from app.services.parser import _build_document_ir, _classify_block_type, _estimate_confidence, _extract_chapters_and_clauses, _extract_formulas, _extract_tables, _extract_page_text_with_fallback, is_pdf_bytes
from app.services.validator import validate_document_ir


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def run_document_ir_pipeline(
    *,
    parse_id: str,
    payload: bytes,
    file_name: str,
    standard_code: str,
    options: ParseOptions,
    artifact_dir: Path,
) -> Tuple[ParseResult, Dict[str, str], List[Dict[str, Any]]]:
    steps: List[Dict[str, Any]] = []
    artifacts: Dict[str, str] = {}

    def record(step: str, start: float, ok: bool, error_code: str = "") -> None:
        steps.append(
            {
                "job_id": parse_id,
                "step": step,
                "duration_ms": round((time.perf_counter() - start) * 1000.0, 2),
                "success": ok,
                "error_code": error_code,
            }
        )

    # upload (marker step)
    t0 = time.perf_counter()
    record("upload", t0, True, "")

    if is_pdf_bytes(payload):
        doc = fitz.open(stream=payload, filetype="pdf")
        try:
            # parse_text
            t1 = time.perf_counter()
            page_texts: List[str] = []
            ocr_pages: List[int] = []
            for idx, page in enumerate(doc):
                text, used_ocr = _extract_page_text_with_fallback(page, options=options)
                page_texts.append(text)
                if used_ocr:
                    ocr_pages.append(idx + 1)
            raw_text = "\n".join(page_texts).strip()
            raw_text_doc = {"job_id": parse_id, "parser": "fitz", "page_count": len(page_texts), "raw_text": raw_text}
            raw_text_path = artifact_dir / "raw_text.json"
            _write_json(raw_text_path, raw_text_doc)
            artifacts["raw_text.json"] = str(raw_text_path)
            record("parse_text", t1, True, "")

            # layout_detect
            t2 = time.perf_counter()
            layout_pages: List[Dict[str, Any]] = []
            for page_no, page in enumerate(doc, start=1):
                blocks = page.get_text("blocks") or []
                layout_pages.append(
                    {
                        "page_no": page_no,
                        "width": float(page.rect.width),
                        "height": float(page.rect.height),
                        "blocks": [
                            {
                                "x0": b[0],
                                "y0": b[1],
                                "x1": b[2],
                                "y1": b[3],
                                "text": str(b[4] or "").strip(),
                            }
                            for b in blocks
                            if len(b) >= 5
                        ],
                    }
                )
            layout_doc = {"job_id": parse_id, "pages": layout_pages}
            layout_path = artifact_dir / "layout_blocks.json"
            _write_json(layout_path, layout_doc)
            artifacts["layout_blocks.json"] = str(layout_path)
            record("layout_detect", t2, True, "")

            # block_classify + build_document_ir
            t3 = time.perf_counter()
            document_ir = _build_document_ir(
                doc=doc,
                file_name=file_name,
                standard_code=standard_code,
                parse_id=parse_id,
                payload=payload,
                ocr_pages=ocr_pages,
                page_texts=page_texts,
            )
            record("block_classify", t3, True, "")

            t4 = time.perf_counter()
            ir_path = artifact_dir / "document_ir.json"
            normref_index, document_ir = generate_normref_index(document_ir)
            _write_json(ir_path, document_ir)
            artifacts["document_ir.json"] = str(ir_path)
            normref_path = artifact_dir / "normref_index.json"
            _write_json(normref_path, normref_index)
            artifacts["normref_index.json"] = str(normref_path)
            record("build_document_ir", t4, True, "")

            # block classification report
            blocks = [
                b
                for p in (document_ir.get("pages", []) if isinstance(document_ir, dict) else [])
                if isinstance(p, dict)
                for b in (p.get("text_blocks", []) if isinstance(p.get("text_blocks"), list) else [])
                if isinstance(b, dict)
            ]
            heading_count = len([b for b in blocks if str(b.get("type", "")).strip() in {"heading", "chapter", "section"}])
            clause_count = len([b for b in blocks if str(b.get("type", "")).strip() == "clause"])
            table_count = len([b for b in blocks if str(b.get("type", "")).strip() == "table"])
            unknown_count = 0
            for b in blocks:
                cls = _classify_block_type(str(b.get("source_text", b.get("text", "")) or ""))
                if bool(cls.get("unknown", False)):
                    unknown_count += 1
            report = {
                "job_id": parse_id,
                "heading_count": heading_count,
                "clause_count": clause_count,
                "table_count": table_count,
                "unknown_count": unknown_count,
                "page_count": int(document_ir.get("document", {}).get("page_count", 0)) if isinstance(document_ir.get("document"), dict) else 0,
                "block_count": len(blocks),
            }
            report_path = artifact_dir / "block_classification_report.json"
            _write_json(report_path, report)
            artifacts["block_classification_report.json"] = str(report_path)

            snapshot_diff = build_ir_snapshot_diff(document_ir)
            snapshot_diff_path = artifact_dir / "ir_snapshot_diff.json"
            _write_json(snapshot_diff_path, snapshot_diff)
            artifacts["ir_snapshot_diff.json"] = str(snapshot_diff_path)

            # validate_ir
            t5 = time.perf_counter()
            ir_validation = validate_document_ir(document_ir)
            ir_validation_path = artifact_dir / "ir_validation.json"
            _write_json(ir_validation_path, ir_validation)
            artifacts["ir_validation.json"] = str(ir_validation_path)
            record("validate_ir", t5, str(ir_validation.get("status")) == "success", "" if str(ir_validation.get("status")) == "success" else "IR_INVALID")

            chapters, clauses = _extract_chapters_and_clauses(page_texts)
            tables = _extract_tables(doc) if options.extractTables else []
            formulas = _extract_formulas(raw_text) if options.extractFormulas else []
            confidence = _estimate_confidence(raw_text, chapters, clauses, tables, formulas, ocr_pages)
            extracted = ExtractedData(
                metadata={
                    "fileName": file_name,
                    "standardCode": standard_code,
                    "pageCount": len(page_texts),
                    "options": options.model_dump(),
                    "ocrUsed": len(ocr_pages) > 0,
                    "ocrFallbackPages": ocr_pages,
                },
                documentIR=document_ir,
                chapters=chapters,
                tables=tables,
                formulas=formulas,
                clauses=clauses,
            )
            status = "success" if str(ir_validation.get("status")) == "success" else "failed"
            result = ParseResult(
                parseId=parse_id,
                status=status,  # type: ignore[arg-type]
                extractedData=extracted,
                rawText=raw_text,
                confidence=confidence,
                reviewRequired=confidence < 0.9,
                error=None if status == "success" else "IR_INVALID",
            )
            return result, artifacts, steps
        finally:
            doc.close()

    # non-pdf fallback path (Word / scan / others still enter IR pipeline)
    t1 = time.perf_counter()
    text = ""
    try:
        text = payload.decode("utf-8", errors="ignore")
    except Exception:
        text = ""
    raw_text_doc = {"job_id": parse_id, "parser": "fallback", "page_count": 1, "raw_text": text}
    raw_text_path = artifact_dir / "raw_text.json"
    _write_json(raw_text_path, raw_text_doc)
    artifacts["raw_text.json"] = str(raw_text_path)
    record("parse_text", t1, True, "")

    t2 = time.perf_counter()
    layout_doc = {"job_id": parse_id, "pages": [{"page_no": 1, "width": 0, "height": 0, "blocks": [{"x0": 0, "y0": 0, "x1": 0, "y1": 0, "text": text.strip()}]}]}
    layout_path = artifact_dir / "layout_blocks.json"
    _write_json(layout_path, layout_doc)
    artifacts["layout_blocks.json"] = str(layout_path)
    record("layout_detect", t2, True, "")

    t3 = time.perf_counter()
    block_text = text.strip()
    document_ir = {
        "document": {
            "doc_id": parse_id,
            "norm_id": standard_code or "UNKNOWN_NORM",
            "norm_name": file_name,
            "version": "unknown",
            "source_file_hash": "",
            "page_count": 1,
        },
        "pages": [
            {
                "page_no": 1,
                "width": 0,
                "height": 0,
                "text_blocks": [
                    {
                        "block_id": f"{parse_id}:p1:b1",
                        "type": "paragraph",
                        "text": block_text,
                        "page_no": 1,
                        "bbox": {"x0": 0, "y0": 0, "x1": 0, "y1": 0},
                        "confidence": 0.5,
                        "source_hash": "",
                    }
                ],
            }
        ],
    }
    record("block_classify", t3, True, "")

    t4 = time.perf_counter()
    ir_path = artifact_dir / "document_ir.json"
    normref_index, document_ir = generate_normref_index(document_ir)
    _write_json(ir_path, document_ir)
    artifacts["document_ir.json"] = str(ir_path)
    normref_path = artifact_dir / "normref_index.json"
    _write_json(normref_path, normref_index)
    artifacts["normref_index.json"] = str(normref_path)
    record("build_document_ir", t4, True, "")

    report = {
        "job_id": parse_id,
        "heading_count": 0,
        "clause_count": 0,
        "table_count": 0,
        "unknown_count": 0 if text.strip() else 1,
        "page_count": 1,
        "block_count": 1 if text.strip() else 0,
    }
    report_path = artifact_dir / "block_classification_report.json"
    _write_json(report_path, report)
    artifacts["block_classification_report.json"] = str(report_path)
    snapshot_diff = build_ir_snapshot_diff(document_ir)
    snapshot_diff_path = artifact_dir / "ir_snapshot_diff.json"
    _write_json(snapshot_diff_path, snapshot_diff)
    artifacts["ir_snapshot_diff.json"] = str(snapshot_diff_path)

    t5 = time.perf_counter()
    ir_validation = validate_document_ir(document_ir)
    ir_validation_path = artifact_dir / "ir_validation.json"
    _write_json(ir_validation_path, ir_validation)
    artifacts["ir_validation.json"] = str(ir_validation_path)
    record("validate_ir", t5, str(ir_validation.get("status")) == "success", "" if str(ir_validation.get("status")) == "success" else "IR_INVALID")

    extracted = ExtractedData(
        metadata={"fileName": file_name, "standardCode": standard_code, "pageCount": 1, "options": options.model_dump()},
        documentIR=document_ir,
        chapters=[],
        tables=[],
        formulas=[],
        clauses=[],
    )
    status = "success" if str(ir_validation.get("status")) == "success" else "failed"
    result = ParseResult(
        parseId=parse_id,
        status=status,  # type: ignore[arg-type]
        extractedData=extracted,
        rawText=text,
        confidence=0.5,
        reviewRequired=True,
        error=None if status == "success" else "IR_INVALID",
    )
    return result, artifacts, steps
