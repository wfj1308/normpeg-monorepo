from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional, Tuple

from app.services.specir_review import build_specir_checklist

CLAUSE_ID_RE = re.compile(r"(\d+(?:\.\d+){0,4})")
GATE_RANGE_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s*(?:~|～|-|—|至|到)\s*(-?\d+(?:\.\d+)?)")
GATE_COMP_RE = re.compile(r"(>=|<=|>|<|≥|≤)\s*(-?\d+(?:\.\d+)?)")
FORMULA_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n]{1,160})")


def _extract_clause_id(text: str) -> Optional[str]:
    m = CLAUSE_ID_RE.search(text)
    return m.group(1) if m else None


def _normalize_operator(op: str) -> str:
    mapping = {"≥": ">=", "≤": "<="}
    return mapping.get(op, op)


def _infer_gate(text: str) -> Tuple[Dict[str, Any], bool, str]:
    range_hit = GATE_RANGE_RE.search(text)
    if range_hit:
        low = float(range_hit.group(1))
        high = float(range_hit.group(2))
        return (
            {
                "type": "range",
                "operator": "between",
                "threshold": [low, high],
                "unit": "",
                "decision_logic": "value between threshold[0] and threshold[1]",
                "on_fail": "reject",
            },
            False,
            "",
        )

    comp_hit = GATE_COMP_RE.search(text)
    if comp_hit:
        op = _normalize_operator(comp_hit.group(1))
        value = float(comp_hit.group(2))
        gate_type = "max" if op in {"<=", "<"} else "min"
        return (
            {
                "type": gate_type,
                "operator": op,
                "threshold": value,
                "unit": "",
                "decision_logic": f"value {op} threshold",
                "on_fail": "reject",
            },
            False,
            "",
        )

    return (
        {
            "type": "none",
            "operator": "",
            "threshold": None,
            "unit": "",
            "decision_logic": "",
            "on_fail": "",
        },
        True,
        "MISSING_GATE",
    )


def _infer_cal(text: str) -> Dict[str, Any]:
    hit = FORMULA_RE.search(text)
    if not hit:
        return {"type": "none", "formula": "", "inputs": [], "output": ""}
    lhs = hit.group(1).strip()
    rhs = hit.group(2).strip()
    inputs = sorted(set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", rhs)))
    return {"type": "formula", "formula": f"{lhs} = {rhs}", "inputs": inputs, "output": lhs}


def _infer_slots(text: str) -> List[Dict[str, Any]]:
    keys = re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text)
    if not keys:
        return [{"key": "measured_value", "label": "测量值", "type": "number", "unit": "", "required": True}]
    uniq = sorted(set(keys))[:3]
    return [{"key": k, "label": k, "type": "number", "unit": "", "required": True} for k in uniq]


def _is_executable_candidate(block_type: str, text: str) -> bool:
    if block_type in {"clause", "table"}:
        return True
    if block_type == "paragraph":
        return bool(GATE_RANGE_RE.search(text) or GATE_COMP_RE.search(text) or FORMULA_RE.search(text))
    return False


def generate_specir_candidates(document_ir: Dict[str, Any]) -> Dict[str, Any]:
    document = document_ir.get("document") if isinstance(document_ir, dict) else None
    pages = document_ir.get("pages") if isinstance(document_ir, dict) else None
    if not isinstance(document, dict) or not isinstance(pages, list):
        return {"specir_count": 0, "specirs": []}

    norm_id = str(document.get("norm_id", "")).strip() or "UNKNOWN_NORM"
    norm_version = str(document.get("version", "")).strip() or "unknown"
    specirs: List[Dict[str, Any]] = []
    last_norm_ref = ""

    for page in pages:
        if not isinstance(page, dict):
            continue
        page_no = int(page.get("page_no", 0) or 0)
        for block in page.get("text_blocks", []) or []:
            if not isinstance(block, dict):
                continue
            block_id = str(block.get("block_id", "")).strip()
            block_type = str(block.get("type", "paragraph")).strip() or "paragraph"
            text = str(block.get("text", "") or "")
            if not block_id or not text.strip():
                continue
            if not _is_executable_candidate(block_type, text):
                continue

            norm_ref = str(block.get("normRef", "")).strip()
            if not norm_ref:
                clause_id = _extract_clause_id(text) or (last_norm_ref.split("/")[-1] if last_norm_ref else "")
                if clause_id:
                    norm_ref = f"v://std/{norm_id}/{norm_version}/clause/{clause_id}"
                elif last_norm_ref:
                    norm_ref = last_norm_ref
                else:
                    norm_ref = ""
            if norm_ref:
                last_norm_ref = norm_ref
            else:
                # SpecIR must bind normRef; unresolved candidate is still emitted for review.
                norm_ref = f"v://std/{norm_id}/{norm_version}/clause/unknown"

            gate, unresolved, unresolved_reason = _infer_gate(text)
            cal = _infer_cal(text)
            slots = _infer_slots(text)
            units = sorted({str(s.get("unit", "")).strip() for s in slots if isinstance(s, dict) and str(s.get("unit", "")).strip()})
            required_fields = [str(s.get("key", "")).strip() for s in slots if isinstance(s, dict) and bool(s.get("required")) and str(s.get("key", "")).strip()]
            confidence = float(block.get("confidence", 0) or 0)
            status = "review_required" if confidence < 0.92 else "auto_candidate"

            seed = f"{norm_id}|{norm_ref}|{block_id}|{text[:120]}"
            specir_id = "specir_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]

            specirs.append(
                {
                    "specir_id": specir_id,
                    "specir_version": f"{norm_version}",
                    "norm_id": norm_id,
                    "norm_version": norm_version,
                    "normRef": norm_ref,
                    "source": {
                        "document_ir_block_ids": [block_id],
                        "source_text": text,
                        "page_no": page_no,
                        "bbox": block.get("bbox") or {"x0": 0, "y0": 0, "x1": 0, "y1": 0},
                    },
                    "semantic": {
                        "title": text[:40],
                        "subject": "",
                        "action": "",
                        "condition": "",
                        "scope": "",
                    },
                    "body": {
                        "slots": slots,
                        "units": units,
                        "required": required_fields,
                    },
                    "cal": {
                        "type": cal.get("type", "none"),
                        "formula": cal.get("formula", ""),
                        "inputs": cal.get("inputs", []),
                        "output": cal.get("output", ""),
                    },
                    "gate": gate,
                    "evidence": {
                        "source_text": text,
                        "normRef": norm_ref,
                        "page_no": page_no,
                        "block_ids": [block_id],
                    },
                    "status": status,
                    "quality": {
                        "confidence": confidence,
                        "unresolved": unresolved,
                        "unresolved_reason": unresolved_reason,
                    },
                    "checklist": build_specir_checklist(
                        {
                            "specir_id": specir_id,
                        }
                    ),
                    "derivation_policy": "Rule/Gate must be derived from SpecIR only",
                }
            )

    return {"specir_count": len(specirs), "specirs": specirs}
