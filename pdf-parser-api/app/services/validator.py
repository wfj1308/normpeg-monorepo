from __future__ import annotations

from typing import Any, Dict
from typing import List

from app.models.schemas import ExtractedData, ValidateResponse


def validate_document_ir(document_ir: Dict[str, Any]) -> Dict[str, Any]:
    failed_blocks: List[str] = []
    block_count = 0
    heading_count = 0
    clause_count = 0
    table_count = 0

    if not isinstance(document_ir, dict):
        return {
            "status": "failed",
            "error_code": "INVALID_DOCUMENT_IR",
            "message": "document_ir must be object",
            "failed_blocks": [],
        }

    document = document_ir.get("document")
    pages = document_ir.get("pages")

    if not isinstance(document, dict):
        return {
            "status": "failed",
            "error_code": "DOCUMENT_MISSING",
            "message": "document is required",
            "failed_blocks": [],
        }
    if not str(document.get("doc_id", "")).strip():
        return {
            "status": "failed",
            "error_code": "DOC_ID_MISSING",
            "message": "doc_id is required",
            "failed_blocks": [],
        }
    if not str(document.get("norm_id", "")).strip():
        return {
            "status": "failed",
            "error_code": "NORM_ID_MISSING",
            "message": "norm_id is required",
            "failed_blocks": [],
        }
    if not isinstance(pages, list) or len(pages) == 0:
        return {
            "status": "failed",
            "error_code": "PAGES_EMPTY",
            "message": "pages must be non-empty array",
            "failed_blocks": [],
        }

    seen_block_ids: set[str] = set()
    for p_idx, page in enumerate(pages):
        if not isinstance(page, dict):
            return {
                "status": "failed",
                "error_code": "INVALID_PAGE",
                "message": f"pages[{p_idx}] must be object",
                "failed_blocks": [],
            }
        text_blocks = page.get("text_blocks")
        if not isinstance(text_blocks, list) or len(text_blocks) == 0:
            return {
                "status": "failed",
                "error_code": "TEXT_BLOCKS_EMPTY",
                "message": f"pages[{p_idx}].text_blocks must be non-empty array",
                "failed_blocks": [],
            }

        for b_idx, block in enumerate(text_blocks):
            block_count += 1
            block_ref = f"pages[{p_idx}].text_blocks[{b_idx}]"
            if not isinstance(block, dict):
                failed_blocks.append(block_ref)
                continue

            block_id = str(block.get("block_id", "")).strip()
            if not block_id:
                failed_blocks.append(block_ref)
            elif block_id in seen_block_ids:
                failed_blocks.append(block_id)
            else:
                seen_block_ids.add(block_id)

            if not str(block.get("page_no", "")).strip():
                failed_blocks.append(block_id or block_ref)
            if not str(block.get("type", "")).strip():
                failed_blocks.append(block_id or block_ref)
            if "text" not in block:
                failed_blocks.append(block_id or block_ref)
            if not str(block.get("source_hash", "")).strip():
                failed_blocks.append(block_id or block_ref)

            t = str(block.get("type", "")).strip()
            if t == "heading":
                heading_count += 1
            elif t == "clause":
                clause_count += 1
            elif t == "table":
                table_count += 1

    if failed_blocks:
        return {
            "status": "failed",
            "error_code": "BLOCK_VALIDATION_FAILED",
            "message": "one or more text blocks failed validation",
            "failed_blocks": sorted(set(failed_blocks)),
        }

    return {
        "status": "success",
        "page_count": len(pages),
        "block_count": block_count,
        "heading_count": heading_count,
        "clause_count": clause_count,
        "table_count": table_count,
    }


def _validate_document_ir(document_ir: Dict[str, Any], errors: List[str]) -> None:
    if not isinstance(document_ir, dict):
        errors.append("documentIR must be object")
        return
    document = document_ir.get("document")
    pages = document_ir.get("pages")
    if not isinstance(document, dict):
        errors.append("documentIR.document is required")
        return
    if not isinstance(pages, list):
        errors.append("documentIR.pages is required")
        return

    seen_block_ids: set[str] = set()
    for p_idx, page in enumerate(pages):
        if not isinstance(page, dict):
            errors.append(f"documentIR.pages[{p_idx}] must be object")
            continue
        page_no = page.get("page_no")
        text_blocks = page.get("text_blocks")
        if not isinstance(text_blocks, list):
            errors.append(f"documentIR.pages[{p_idx}].text_blocks must be array")
            continue
        for b_idx, block in enumerate(text_blocks):
            if not isinstance(block, dict):
                errors.append(f"documentIR.pages[{p_idx}].text_blocks[{b_idx}] must be object")
                continue
            block_id = str(block.get("block_id", "")).strip()
            if not block_id:
                errors.append(f"documentIR.pages[{p_idx}].text_blocks[{b_idx}].block_id is required")
            elif block_id in seen_block_ids:
                errors.append(f"duplicate block_id: {block_id}")
            else:
                seen_block_ids.add(block_id)

            if block.get("page_no") != page_no:
                errors.append(f"documentIR.pages[{p_idx}].text_blocks[{b_idx}].page_no must equal page.page_no")
            if "source_text" not in block:
                errors.append(f"documentIR.pages[{p_idx}].text_blocks[{b_idx}].source_text is required")
            bbox = block.get("bbox")
            if not isinstance(bbox, dict):
                errors.append(f"documentIR.pages[{p_idx}].text_blocks[{b_idx}].bbox is required")
                continue
            for key in ("x0", "y0", "x1", "y1"):
                if key not in bbox:
                    errors.append(f"documentIR.pages[{p_idx}].text_blocks[{b_idx}].bbox.{key} is required")
            if str(block.get("type", "")).strip() == "table":
                table = block.get("table")
                if not isinstance(table, dict):
                    errors.append(f"documentIR.pages[{p_idx}].text_blocks[{b_idx}].table is required for table block")
                else:
                    for key in ("rows", "cols", "merged_cells"):
                        if key not in table:
                            errors.append(f"documentIR.pages[{p_idx}].text_blocks[{b_idx}].table.{key} is required")
            btype = str(block.get("type", "")).strip()
            if btype in {"clause", "table"}:
                has_normref = bool(str(block.get("normRef", "")).strip())
                unresolved_reason = str(block.get("unresolved_reason", "")).strip()
                if not has_normref and unresolved_reason != "MISSING_NORMREF":
                    errors.append(f"documentIR.pages[{p_idx}].text_blocks[{b_idx}] missing normRef and unresolved_reason")


def validate_extracted_data(extracted: ExtractedData, target_schema: str) -> ValidateResponse:
    errors: List[str] = []

    if target_schema not in {"SPU-v1", "Document-IR-v1"}:
        errors.append(f"UNSUPPORTED_SCHEMA:{target_schema}")

    if not extracted.metadata:
        errors.append("metadata is required")

    if not extracted.clauses:
        errors.append("clauses is empty")
    else:
        for idx, clause in enumerate(extracted.clauses):
            if not isinstance(clause, dict):
                errors.append(f"clauses[{idx}] must be object")
                continue
            if not clause.get("clauseId"):
                errors.append(f"clauses[{idx}].clauseId is required")
            if not clause.get("text"):
                errors.append(f"clauses[{idx}].text is required")

    _validate_document_ir(extracted.documentIR, errors)

    return ValidateResponse(valid=len(errors) == 0, errors=errors)
