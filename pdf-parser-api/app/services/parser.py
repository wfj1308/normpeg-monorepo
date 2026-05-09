from __future__ import annotations

import hashlib
import io
import re
import uuid
from typing import Any, Callable, Dict, List, Optional

import fitz  # type: ignore

from app.models.schemas import ExtractedData, ParseOptions, ParseResult


CHAPTER_RE = re.compile(r"^第[一二三四五六七八九十百零〇\d]+章\s*(.+)$")
CLAUSE_RE = re.compile(r"^(?P<id>\d+(?:\.\d+){1,4})\s*(?P<title>.*)$")
FORMULA_RE = re.compile(r"([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]{0,30}\s*=\s*[^\n]{1,160})")
TABLE_CLAUSE_RE = re.compile(r"^表\s*(\d+(?:\.\d+){1,4})")


def is_pdf_bytes(payload: bytes) -> bool:
    return payload.startswith(b"%PDF")


def _extract_tables(doc: fitz.Document) -> List[Dict[str, Any]]:
    tables: List[Dict[str, Any]] = []
    for page_no, page in enumerate(doc, start=1):
        try:
            finder = page.find_tables()
            page_tables = getattr(finder, "tables", []) if finder is not None else []
        except Exception:
            page_tables = []

        for table_idx, table in enumerate(page_tables, start=1):
            try:
                rows = table.extract()
            except Exception:
                rows = []
            tables.append(
                {
                    "page": page_no,
                    "tableIndex": table_idx,
                    "rows": rows or [],
                }
            )
    return tables


def _extract_formulas(raw_text: str) -> List[Dict[str, Any]]:
    formulas: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for hit in FORMULA_RE.finditer(raw_text):
        expression = hit.group(1).strip()
        if expression in seen:
            continue
        seen.add(expression)
        formulas.append({"expression": expression})
    return formulas


def _extract_chapters_and_clauses(page_texts: List[str]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    chapters: List[Dict[str, Any]] = []
    clauses: List[Dict[str, Any]] = []

    for page_no, text in enumerate(page_texts, start=1):
        for line_no, raw_line in enumerate(text.splitlines(), start=1):
            line = raw_line.strip()
            if not line:
                continue

            chapter_hit = CHAPTER_RE.match(line)
            if chapter_hit:
                chapters.append(
                    {
                        "id": f"chapter_{len(chapters) + 1}",
                        "title": chapter_hit.group(0),
                        "page": page_no,
                        "line": line_no,
                    }
                )
                continue

            clause_hit = CLAUSE_RE.match(line)
            if clause_hit:
                clause_id = clause_hit.group("id")
                clause_title = clause_hit.group("title").strip() or clause_id
                clauses.append(
                    {
                        "clauseId": clause_id,
                        "title": clause_title,
                        "text": line,
                        "page": page_no,
                        "line": line_no,
                    }
                )

    return chapters, clauses


def _estimate_confidence(
    raw_text: str,
    chapters: List[Dict[str, Any]],
    clauses: List[Dict[str, Any]],
    tables: List[Dict[str, Any]],
    formulas: List[Dict[str, Any]],
    ocr_pages: List[int],
) -> float:
    if not raw_text.strip():
        return 0.0

    score = 0.5
    if chapters:
        score += 0.18
    if clauses:
        score += 0.17
    if tables:
        score += 0.05
    if formulas:
        score += 0.05
    if ocr_pages:
        score += 0.03
    return round(min(score, 0.99), 4)


def _try_ocr_page(page: fitz.Page, ocr_language: str) -> str:
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
    except Exception:
        return ""

    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        png_bytes = pix.tobytes("png")
        image = Image.open(io.BytesIO(png_bytes))
        text = pytesseract.image_to_string(image, lang=ocr_language)
        return text or ""
    except Exception:
        return ""


def _extract_page_text_with_fallback(page: fitz.Page, *, options: ParseOptions) -> tuple[str, bool]:
    text = (page.get_text("text") or "").strip()
    if len(text) >= 50:
        return text, False

    ocr_text = _try_ocr_page(page, options.ocrLanguage).strip()
    if len(ocr_text) > len(text):
        return ocr_text, True
    return text, False


def _sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def _sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _classify_block_type(text: str) -> Dict[str, Any]:
    line = (text or "").strip()
    if not line:
        return {"type": "paragraph", "heading_level": "", "clause_id": "", "unknown": False}
    if re.match(r"^\d{1,2}\s+\S+", line):
        return {"type": "heading", "heading_level": "h1", "clause_id": "", "unknown": False}
    if re.match(r"^\d{1,2}\.\d{1,2}\s+\S+", line):
        return {"type": "heading", "heading_level": "h2", "clause_id": "", "unknown": False}
    if re.match(r"^\d{1,2}\.\d{1,2}\.\d{1,2}\s+\S+", line):
        return {"type": "heading", "heading_level": "h3", "clause_id": "", "unknown": False}
    if re.match(r"^第[\u4e00-\u9fff0-9]+章", line):
        return {"type": "chapter", "heading_level": "h1", "clause_id": "", "unknown": False}
    if re.match(r"^第[\u4e00-\u9fff0-9]+节", line):
        return {"type": "section", "heading_level": "h2", "clause_id": "", "unknown": False}
    if CLAUSE_RE.match(line):
        cid = CLAUSE_RE.match(line).group("id") if CLAUSE_RE.match(line) else ""
        return {"type": "clause", "heading_level": "", "clause_id": cid, "unknown": False}
    tcm = TABLE_CLAUSE_RE.match(line)
    if tcm:
        return {"type": "clause", "heading_level": "", "clause_id": tcm.group(1), "unknown": False}
    if re.search(r"(表\s*\d+|Table\s*\d+)", line, flags=re.IGNORECASE):
        return {"type": "table", "heading_level": "", "clause_id": "", "unknown": False}
    if re.search(r"(图\s*\d+|Figure\s*\d+)", line, flags=re.IGNORECASE):
        return {"type": "figure", "heading_level": "", "clause_id": "", "unknown": False}
    if FORMULA_RE.search(line):
        return {"type": "formula", "heading_level": "", "clause_id": "", "unknown": False}
    if "条文说明" in line:
        return {"type": "note", "heading_level": "", "clause_id": "", "unknown": False}
    if re.match(r"^(注|说明|Note)[:：\s]", line, flags=re.IGNORECASE):
        return {"type": "note", "heading_level": "", "clause_id": "", "unknown": False}
    return {"type": "paragraph", "heading_level": "", "clause_id": "", "unknown": True}


def _build_document_ir(
    *,
    doc: fitz.Document,
    file_name: str,
    standard_code: str,
    parse_id: str,
    payload: bytes,
    ocr_pages: List[int],
    page_texts: List[str],
) -> Dict[str, Any]:
    pages: List[Dict[str, Any]] = []
    ocr_page_set = set(ocr_pages)
    for page_no, page in enumerate(doc, start=1):
        blocks: List[Dict[str, Any]] = []
        raw_blocks = page.get_text("blocks") or []
        if raw_blocks:
            for idx, block in enumerate(raw_blocks, start=1):
                if len(block) < 5:
                    continue
                x0, y0, x1, y1, text = block[0], block[1], block[2], block[3], block[4]
                clean_text = str(text or "").strip()
                if not clean_text:
                    continue

                block_id = f"{parse_id}:p{page_no}:b{idx}"
                source_seed = f"{page_no}|{x0:.3f}|{y0:.3f}|{x1:.3f}|{y1:.3f}|{clean_text}"
                cls = _classify_block_type(clean_text)
                blocks.append(
                    {
                        "block_id": block_id,
                        "type": cls["type"],
                        "heading_level": cls["heading_level"],
                        "clause_id": cls["clause_id"],
                        "text": clean_text,
                        "source_text": clean_text,
                        "page_no": page_no,
                        "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
                        "confidence": 0.75 if page_no in ocr_page_set else 0.93,
                        "source_hash": _sha256_text(source_seed),
                    }
                )

        # Table structure extraction as dedicated blocks.
        try:
            finder = page.find_tables()
            page_tables = getattr(finder, "tables", []) if finder is not None else []
        except Exception:
            page_tables = []
        for t_idx, table in enumerate(page_tables, start=1):
            try:
                rows = table.extract() or []
            except Exception:
                rows = []
            row_count = len(rows)
            col_count = max((len(r) for r in rows), default=0)
            bbox = getattr(table, "bbox", None)
            if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
                x0, y0, x1, y1 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
            else:
                x0, y0, x1, y1 = 0.0, 0.0, float(page.rect.width), float(page.rect.height)
            block_id = f"{parse_id}:p{page_no}:t{t_idx}"
            source_text = "\n".join([" | ".join([str(c or "") for c in r]) for r in rows]).strip()
            blocks.append(
                {
                    "block_id": block_id,
                    "type": "table",
                    "heading_level": "",
                    "clause_id": "",
                    "text": source_text,
                    "source_text": source_text,
                    "page_no": page_no,
                    "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
                    "confidence": 0.9,
                    "source_hash": _sha256_text(f"{page_no}|table|{t_idx}|{source_text}"),
                    "table": {
                        "rows": row_count,
                        "cols": col_count,
                        "merged_cells": [],
                    },
                }
            )

        if not blocks:
            page_text = page_texts[page_no - 1] if page_no - 1 < len(page_texts) else ""
            lines = [line.strip() for line in page_text.splitlines() if line.strip()]
            if not lines and page_text.strip():
                lines = [page_text.strip()]
            if lines:
                page_w = float(page.rect.width)
                page_h = float(page.rect.height)
                line_h = page_h / max(len(lines), 1)
                for idx, line in enumerate(lines, start=1):
                    y0 = (idx - 1) * line_h
                    y1 = min(page_h, idx * line_h)
                    block_id = f"{parse_id}:p{page_no}:fallback:{idx}"
                    source_seed = f"{page_no}|{line}|fallback"
                    blocks.append(
                        {
                            "block_id": block_id,
                            "type": _classify_block_type(line)["type"],
                            "heading_level": _classify_block_type(line)["heading_level"],
                            "clause_id": _classify_block_type(line)["clause_id"],
                            "text": line,
                            "source_text": line,
                            "page_no": page_no,
                            "bbox": {"x0": 0.0, "y0": y0, "x1": page_w, "y1": y1},
                            "confidence": 0.7 if page_no in ocr_page_set else 0.85,
                            "source_hash": _sha256_text(source_seed),
                        }
                    )

        if not blocks:
            block_id = f"{parse_id}:p{page_no}:fallback:1"
            source_seed = f"{page_no}|<empty-page>|fallback"
            blocks.append(
                {
                    "block_id": block_id,
                    "type": "paragraph",
                    "heading_level": "",
                    "clause_id": "",
                    "text": "",
                    "source_text": "",
                    "page_no": page_no,
                    "bbox": {"x0": 0.0, "y0": 0.0, "x1": float(page.rect.width), "y1": float(page.rect.height)},
                    "confidence": 0.0,
                    "source_hash": _sha256_text(source_seed),
                }
            )

        pages.append(
            {
                "page_no": page_no,
                "width": float(page.rect.width),
                "height": float(page.rect.height),
                "text_blocks": blocks,
            }
        )

    return {
        "document": {
            "doc_id": parse_id,
            "norm_id": standard_code,
            "norm_name": file_name,
            "version": "unknown",
            "source_file_hash": _sha256_bytes(payload),
            "page_count": len(doc),
        },
        "pages": pages,
    }


def parse_pdf(
    payload: bytes,
    *,
    file_name: str,
    standard_code: str,
    options: ParseOptions,
    parse_id: str | None = None,
    progress_callback: Optional[Callable[[float], None]] = None,
) -> ParseResult:
    current_parse_id = parse_id or f"parse_{uuid.uuid4().hex[:16]}"

    if not payload or not is_pdf_bytes(payload):
        return ParseResult(
            parseId=current_parse_id,
            status="failed",
            extractedData=ExtractedData(),
            rawText="",
            confidence=0.0,
            reviewRequired=True,
            error="INVALID_PDF",
        )

    doc = fitz.open(stream=payload, filetype="pdf")
    try:
        total_pages = len(doc)
        page_texts: List[str] = []
        ocr_pages: List[int] = []

        for page_index, page in enumerate(doc):
            page_text, used_ocr = _extract_page_text_with_fallback(page, options=options)
            page_texts.append(page_text)
            if used_ocr:
                ocr_pages.append(page_index + 1)

            if progress_callback and total_pages > 0:
                progress_callback((page_index + 1) / total_pages)

        raw_text = "\n".join(page_texts).strip()
        chapters, clauses = _extract_chapters_and_clauses(page_texts)
        tables = _extract_tables(doc) if options.extractTables else []
        formulas = _extract_formulas(raw_text) if options.extractFormulas else []
        document_ir = _build_document_ir(
            doc=doc,
            file_name=file_name,
            standard_code=standard_code,
            parse_id=current_parse_id,
            payload=payload,
            ocr_pages=ocr_pages,
            page_texts=page_texts,
        )
    finally:
        doc.close()

    confidence = _estimate_confidence(raw_text, chapters, clauses, tables, formulas, ocr_pages)
    status = "success"
    if raw_text and not clauses and not chapters:
        status = "partial"
    review_required = confidence < 0.9

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
    return ParseResult(
        parseId=current_parse_id,
        status=status,
        extractedData=extracted,
        rawText=raw_text,
        confidence=confidence,
        reviewRequired=review_required,
        error=None,
    )
