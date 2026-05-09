from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple


CHECKLIST_ITEMS: List[Tuple[str, str]] = [
    ("semantic_correct", "semantic 是否正确"),
    ("slots_complete", "slots 是否完整"),
    ("unit_correct", "unit 是否正确"),
    ("threshold_correct", "threshold 是否正确"),
    ("gate_complete", "gate 是否完整"),
    ("evidence_traceable", "evidence 是否可追溯"),
]

ALLOWED_RESULTS = {"pass", "fail", "na"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_specir_checklist(specir: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for item_id, label in CHECKLIST_ITEMS:
        out.append(
            {
                "item_id": item_id,
                "label": label,
                "result": "na",
                "comment": "",
                "reviewer_id": "",
                "reviewed_at": "",
            }
        )
    return out


def validate_specir_checklist(specir: Dict[str, Any]) -> Dict[str, Any]:
    checklist = specir.get("checklist")
    if not isinstance(checklist, list):
        return {"ok": False, "errors": ["checklist must be array"], "failed_items": []}

    expected = {item_id: label for item_id, label in CHECKLIST_ITEMS}
    seen: set[str] = set()
    errors: List[str] = []
    failed_items: List[str] = []
    incomplete_items: List[str] = []

    for idx, row in enumerate(checklist):
        if not isinstance(row, dict):
            errors.append(f"checklist[{idx}] must be object")
            continue
        item_id = str(row.get("item_id", "")).strip()
        label = str(row.get("label", "")).strip()
        result = str(row.get("result", "")).strip()
        reviewer_id = str(row.get("reviewer_id", "")).strip()
        reviewed_at = str(row.get("reviewed_at", "")).strip()
        comment = str(row.get("comment", "")).strip()

        if item_id not in expected:
            errors.append(f"checklist[{idx}].item_id invalid: {item_id}")
            continue
        if item_id in seen:
            errors.append(f"duplicate checklist item_id: {item_id}")
        seen.add(item_id)

        if label != expected[item_id]:
            errors.append(f"checklist[{idx}].label mismatch for {item_id}")
        if result not in ALLOWED_RESULTS:
            errors.append(f"checklist[{idx}].result invalid: {result}")
        if result == "fail":
            failed_items.append(item_id)
        if result == "na":
            incomplete_items.append(item_id)
        # Required fields for every checklist item.
        if not reviewer_id:
            errors.append(f"checklist[{idx}].reviewer_id required")
        if not reviewed_at:
            errors.append(f"checklist[{idx}].reviewed_at required")
        if not comment:
            errors.append(f"checklist[{idx}].comment required")

    missing = sorted(set(expected.keys()) - seen)
    for item_id in missing:
        errors.append(f"missing checklist item: {item_id}")

    return {"ok": len(errors) == 0, "errors": errors, "failed_items": failed_items, "incomplete_items": incomplete_items}


def enforce_specir_approval_guard(specir: Dict[str, Any]) -> Dict[str, Any]:
    res = validate_specir_checklist(specir)
    blockers: List[str] = []
    if not res["ok"]:
        blockers.extend(res["errors"])
    if len(res["failed_items"]) > 0:
        blockers.append(f"failed checklist items: {','.join(res['failed_items'])}")
    if len(res.get("incomplete_items", [])) > 0:
        blockers.append(f"incomplete checklist items: {','.join(res['incomplete_items'])}")

    allowed = len(blockers) == 0
    return {
        "specir_id": str(specir.get("specir_id", "")).strip(),
        "can_approve": allowed,
        "blockers": blockers,
        "checked_at": _utc_now(),
    }

