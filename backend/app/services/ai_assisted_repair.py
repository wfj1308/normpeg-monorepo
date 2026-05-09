from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def build_ai_repair_schema() -> Dict[str, Any]:
    return {
        "schema_id": "ai.assisted.repair.v1",
        "input_fields": [
            "source_clause",
            "specir",
            "unresolved_reason",
            "nearby_resolved_rules",
            "slot_registry",
        ],
        "suggestion_fields": [
            "field",
            "slotKey",
            "operator",
            "threshold",
            "unit",
            "gate_logic",
        ],
        "workflow_actions": ["accept_patch", "reject_suggestion", "manual_edit"],
    }


def generate_ai_repair_suggestion(
    *,
    source_clause: str,
    specir: Dict[str, Any],
    unresolved_reason: str,
    nearby_resolved_rules: list[Dict[str, Any]],
    slot_registry: list[Dict[str, Any]],
) -> Dict[str, Any]:
    picked = _pick_rule_from_nearby(nearby_resolved_rules)
    field = _guess_field(picked, slot_registry)
    slot_key = field
    operator = _guess_operator(picked, unresolved_reason)
    threshold = _guess_threshold(picked, unresolved_reason)
    unit = _guess_unit(field, slot_registry)
    gate_logic = _guess_gate_logic(picked, unresolved_reason)

    return {
        "schema": build_ai_repair_schema(),
        "meta": {
            "generated_at": _now(),
            "mode": "heuristic_ai_assist",
        },
        "input_digest": {
            "source_clause": source_clause,
            "unresolved_reason": unresolved_reason,
            "nearby_rule_count": len(nearby_resolved_rules),
            "slot_count": len(slot_registry),
            "spec_id": str(specir.get("spec_id") or ""),
        },
        "suggestion": {
            "field": field,
            "slotKey": slot_key,
            "operator": operator,
            "threshold": threshold,
            "unit": unit,
            "gate_logic": gate_logic,
        },
    }


def enqueue_patch_for_review(
    *,
    queue_dir: Path,
    form_code: str,
    suggestion: Dict[str, Any],
    source: str = "ai_assisted_repair",
) -> Dict[str, Any]:
    queue_dir.mkdir(parents=True, exist_ok=True)
    queue_path = queue_dir / "review_queue.jsonl"
    patch_id = f"patch_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    item = {
        "patch_id": patch_id,
        "form_code": form_code,
        "source": source,
        "status": "pending_review",
        "created_at": _now(),
        "suggestion": suggestion,
    }
    with queue_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(item, ensure_ascii=False) + "\n")
    return item


def list_review_queue(queue_dir: Path) -> list[Dict[str, Any]]:
    queue_path = queue_dir / "review_queue.jsonl"
    if not queue_path.exists():
        return []
    items: list[Dict[str, Any]] = []
    for line in queue_path.read_text(encoding="utf-8-sig").splitlines():
        text = line.strip()
        if not text:
            continue
        try:
            payload = json.loads(text)
        except Exception:
            continue
        if isinstance(payload, dict):
            items.append(payload)
    return items


def update_review_queue_item(
    *,
    queue_dir: Path,
    patch_id: str,
    action: str,
    manual_edit: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    items = list_review_queue(queue_dir)
    target = None
    for item in items:
        if str(item.get("patch_id")) == patch_id:
            target = item
            break
    if target is None:
        raise ValueError(f"patch not found: {patch_id}")

    normalized = action.strip().lower()
    if normalized not in {"accept_patch", "reject_suggestion", "manual_edit"}:
        raise ValueError("action must be accept_patch/reject_suggestion/manual_edit")
    if normalized == "accept_patch":
        target["status"] = "accepted"
    elif normalized == "reject_suggestion":
        target["status"] = "rejected"
    else:
        target["status"] = "manual_edited"
        if isinstance(manual_edit, dict):
            target["manual_edit"] = manual_edit
    target["updated_at"] = _now()

    queue_path = queue_dir / "review_queue.jsonl"
    queue_path.write_text("\n".join(json.dumps(item, ensure_ascii=False) for item in items) + "\n", encoding="utf-8")
    return target


def _pick_rule_from_nearby(items: list[Dict[str, Any]]) -> Dict[str, Any]:
    for item in items:
        if isinstance(item, dict):
            return item
    return {}


def _guess_field(rule: Dict[str, Any], slots: list[Dict[str, Any]]) -> str:
    for key in ("field", "slotKey", "actual"):
        val = str(rule.get(key) or "").strip()
        if val:
            return val.split(".")[-1]
    if slots:
        first = slots[0]
        if isinstance(first, dict):
            return str(first.get("slotKey") or first.get("key") or first.get("field") or "value").strip() or "value"
    return "value"


def _guess_operator(rule: Dict[str, Any], reason: str) -> str:
    for key in ("operator", "op"):
        val = str(rule.get(key) or "").strip()
        if val:
            return val
    text = reason.lower()
    if "upper" in text or "max" in text:
        return "<="
    return ">="


def _guess_threshold(rule: Dict[str, Any], reason: str) -> Any:
    for key in ("threshold", "value", "expected", "min", "max"):
        if key in rule and rule.get(key) is not None:
            return rule.get(key)
    return 0


def _guess_unit(field: str, slots: list[Dict[str, Any]]) -> str:
    target = field.strip()
    for item in slots:
        if not isinstance(item, dict):
            continue
        keys = [str(item.get("slotKey") or ""), str(item.get("key") or ""), str(item.get("field") or "")]
        if target and target in keys:
            unit = str(item.get("unit") or "").strip()
            if unit:
                return unit
    return ""


def _guess_gate_logic(rule: Dict[str, Any], reason: str) -> str:
    logic = str(rule.get("gate_logic") or rule.get("logic") or "").strip()
    if logic:
        return logic
    text = reason.lower()
    if "or" in text:
        return "OR"
    return "AND"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
