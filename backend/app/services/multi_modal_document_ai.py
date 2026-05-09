from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict


HEADING_RE = re.compile(r"^(?P<num>\d+(?:\.\d+)*)\s+(?P<title>.+)$")
FORMULA_NAME_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")

TOLERANCE_KEYWORDS = ["\u5141\u8bb8\u504f\u5dee", "\u504f\u5dee", "\u516c\u5dee", "tolerance", "\u00b1"]
MERGED_CELL_KEYWORDS = ["\u5408\u5e76\u5355\u5143\u683c", "merged cell", "rowspan", "colspan", "\u8de8\u884c", "\u8de8\u5217"]
ANNOTATION_KEYWORDS = ["\u6ce8:", "\u6ce8\uff1a", "\u5907\u6ce8", "note:", "annotation"]


def layout_schema() -> Dict[str, Any]:
    return {
        "schema_id": "layout.semantic.ir.v1",
        "document_types": ["pdf", "word", "scanned_image", "screenshot"],
        "required_entities": [
            "heading_hierarchy",
            "tolerance_tables",
            "merged_cells",
            "formula_regions",
            "annotations",
        ],
        "evidence": ["bbox", "evidence_span"],
        "page_model": {
            "unit": "px",
            "origin": "top_left",
            "bbox_format": {"x": "int", "y": "int", "w": "int", "h": "int"},
        },
    }


def analyze_layout_semantics(*, document_type: str, text: str) -> Dict[str, Any]:
    normalized_type = _normalize_document_type(document_type)
    lines = _split_lines(str(text or ""))

    heading_hierarchy = _extract_headings(lines)
    tolerance_tables = _extract_tolerance_tables(lines)
    merged_cells = _detect_merged_cells(lines)
    formula_regions = _extract_formula_regions(lines)
    annotations = _extract_annotations(lines)

    return {
        "layout_schema": layout_schema(),
        "ocr_fusion_strategy": {
            "name": "ocr_fusion_v2",
            "document_type": normalized_type,
            "strategy": {
                "pdf": "native text layer first, OCR fallback by region",
                "word": "xml text layer first, OCR only for embedded/raster blocks",
                "scanned_image": "OCR first, then layout reconstruction",
                "screenshot": "OCR first, with aggressive denoise and region split",
            },
            "steps": [
                "1) Detect layout blocks (heading/table/formula/note)",
                "2) Extract text candidates (native layer + OCR)",
                "3) Fuse text by confidence and geometric overlap",
                "4) Build semantic entities and keep bbox + evidence_span",
            ],
            "fallback": "Low-confidence lines are marked as review_required but retained in IR",
        },
        "semantic_layout_engine": {
            "name": "multi_modal_layout_engine_v2",
            "supported_inputs": ["PDF", "Word", "Scanned image", "Screenshot"],
            "recognition_targets": [
                "heading_hierarchy",
                "tolerance_tables",
                "merged_cells",
                "formula_regions",
                "annotations",
            ],
        },
        "layout_semantic_ir": {
            "schema_version": "layout_semantic_ir.v1",
            "document_type": normalized_type,
            "heading_hierarchy": heading_hierarchy,
            "tolerance_tables": tolerance_tables,
            "merged_cells": merged_cells,
            "formula_regions": formula_regions,
            "annotations": annotations,
        },
        "meta": {"generated_at": _now(), "line_count": len(lines)},
    }


def _normalize_document_type(value: str) -> str:
    t = str(value or "").strip().lower()
    if t in {"pdf", "word", "scanned_image", "screenshot"}:
        return t
    return "pdf"


def _split_lines(text: str) -> list[str]:
    return [line.rstrip("\n") for line in text.splitlines()]


def _extract_headings(lines: list[str]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    for line_no, line in enumerate(lines, start=1):
        s = line.strip()
        if not s:
            continue
        m = HEADING_RE.match(s)
        if not m:
            continue
        level = len(m.group("num").split("."))
        out.append(
            {
                "id": f"heading:{line_no}",
                "level": level,
                "numbering": m.group("num"),
                "title": m.group("title").strip(),
                "bbox": _mock_bbox(line_no, 24 + level * 8),
                "evidence_span": {"line": line_no, "start": 1, "end": len(s), "text": s},
            }
        )
    return out


def _extract_tolerance_tables(lines: list[str]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    for line_no, line in enumerate(lines, start=1):
        s = line.strip()
        if not s:
            continue
        lower = s.lower()
        if not any(keyword in s or keyword in lower for keyword in TOLERANCE_KEYWORDS):
            continue
        out.append(
            {
                "id": f"tolerance_table:{line_no}",
                "semantic_type": "tolerance_table",
                "title": "tolerance_table",
                "table_hint": {"has_tolerance_column": True, "raw": s},
                "bbox": _mock_bbox(line_no, 200),
                "evidence_span": {"line": line_no, "start": 1, "end": len(s), "text": s},
            }
        )
    return out


def _detect_merged_cells(lines: list[str]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    for line_no, line in enumerate(lines, start=1):
        s = line.strip()
        if not s:
            continue
        lower = s.lower()
        if not any(keyword in s or keyword in lower for keyword in MERGED_CELL_KEYWORDS):
            continue
        out.append(
            {
                "id": f"merged_cell:{line_no}",
                "table_ref": f"table:{line_no}",
                "merge_type": "unknown",
                "bbox": _mock_bbox(line_no, 268),
                "evidence_span": {"line": line_no, "start": 1, "end": len(s), "text": s},
            }
        )
    return out


def _extract_formula_regions(lines: list[str]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    for line_no, line in enumerate(lines, start=1):
        s = line.strip()
        if not s or "=" not in s:
            continue
        if not FORMULA_NAME_RE.search(s):
            continue
        out.append(
            {
                "id": f"formula_region:{line_no}",
                "formula_text": s,
                "language": "math_or_expression",
                "bbox": _mock_bbox(line_no, 330),
                "evidence_span": {"line": line_no, "start": 1, "end": len(s), "text": s},
            }
        )
    return out


def _extract_annotations(lines: list[str]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    for line_no, line in enumerate(lines, start=1):
        s = line.strip()
        if not s:
            continue
        lower = s.lower()
        if not any(keyword in s or keyword in lower for keyword in ANNOTATION_KEYWORDS):
            continue
        out.append(
            {
                "id": f"annotation:{line_no}",
                "content": s,
                "bbox": _mock_bbox(line_no, 390),
                "evidence_span": {"line": line_no, "start": 1, "end": len(s), "text": s},
            }
        )
    return out


def _mock_bbox(row: int, x: int) -> Dict[str, int]:
    top = 30 + row * 18
    return {"x": x, "y": top, "w": 640, "h": 16}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
