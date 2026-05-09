from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple


TABLE_ID_RE = re.compile(r"表\s*(\d+(?:\.\d+){1,4})")


def _norm_slug(value: str) -> str:
    s = str(value or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "unknown"


def _extract_table_id(text: str) -> str:
    m = TABLE_ID_RE.search(str(text or ""))
    return m.group(1) if m else ""


def generate_normref_index(document_ir: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    doc = document_ir.get("document") if isinstance(document_ir, dict) else {}
    norm_id = _norm_slug(str((doc or {}).get("norm_id", "")).strip())
    version = str((doc or {}).get("version", "")).strip() or "unknown"

    entries: List[Dict[str, Any]] = []
    unresolved_count = 0
    pages = document_ir.get("pages", []) if isinstance(document_ir, dict) else []
    for page in pages if isinstance(pages, list) else []:
        if not isinstance(page, dict):
            continue
        page_no = int(page.get("page_no", 0) or 0)
        blocks = page.get("text_blocks", [])
        if not isinstance(blocks, list):
            continue
        for b in blocks:
            if not isinstance(b, dict):
                continue
            btype = str(b.get("type", "")).strip()
            if btype not in {"clause", "table"}:
                continue

            block_id = str(b.get("block_id", "")).strip()
            source_text = str(b.get("source_text", b.get("text", "")) or "")
            clause_title = source_text.splitlines()[0].strip() if source_text.strip() else ""

            seg = "clause"
            cid = str(b.get("clause_id", "")).strip()
            if btype == "table":
                seg = "table"
                cid = cid or _extract_table_id(source_text)
            if not cid:
                b["unresolved_reason"] = "MISSING_NORMREF"
                unresolved_count += 1
                entries.append(
                    {
                        "normRef": "",
                        "source_block_id": block_id,
                        "page_no": page_no,
                        "clause_title": clause_title,
                        "unresolved_reason": "MISSING_NORMREF",
                    }
                )
                continue

            norm_ref = f"v://std/{norm_id}/{version}/{seg}/{cid}"
            b["normRef"] = norm_ref
            entries.append(
                {
                    "normRef": norm_ref,
                    "source_block_id": block_id,
                    "page_no": page_no,
                    "clause_title": clause_title,
                }
            )

    index = {
        "norm_id": norm_id,
        "version": version,
        "entry_count": len(entries),
        "unresolved_count": unresolved_count,
        "entries": entries,
    }
    return index, document_ir

