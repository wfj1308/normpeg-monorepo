from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def patch_schema() -> Dict[str, Any]:
    return {
        "schema_id": "ai.patch.auto_repair.v2",
        "input_fields": ["unresolved_reason", "nearby_rules", "slot_graph", "historical_fixes", "semantic_context"],
        "suggested_patch_fields": ["slotKey", "threshold", "operator", "formula", "gate_logic"],
        "workflow": ["generate_patch", "review", "apply", "revert"],
        "guarantees": ["versioned", "reviewable", "revertable"],
        "output_contract": {
            "suggested_patch": {
                "slotKey": "string",
                "threshold": "number|string",
                "operator": "string",
                "formula": "string",
                "gate_logic": "string",
            }
        },
    }


def generate_suggested_patch(
    *,
    unresolved_reason: str,
    nearby_rules: list[Dict[str, Any]],
    slot_graph: Dict[str, Any],
    historical_fixes: list[Dict[str, Any]],
    semantic_context: Dict[str, Any],
) -> Dict[str, Any]:
    nearby = nearby_rules[0] if nearby_rules and isinstance(nearby_rules[0], dict) else {}
    hist = historical_fixes[0] if historical_fixes and isinstance(historical_fixes[0], dict) else {}
    graph_hint = {}
    if isinstance(slot_graph, dict):
        nodes = slot_graph.get("nodes", [])
        if isinstance(nodes, list) and nodes and isinstance(nodes[0], dict):
            graph_hint = nodes[0]
    slot_key = str(
        nearby.get("slotKey")
        or nearby.get("field")
        or hist.get("slotKey")
        or graph_hint.get("slotKey")
        or graph_hint.get("id")
        or "value"
    ).strip() or "value"
    operator = str(nearby.get("operator") or hist.get("operator") or ">=").strip() or ">="
    threshold = nearby.get("threshold", hist.get("threshold", graph_hint.get("threshold", 0)))
    formula = str(nearby.get("formula") or hist.get("formula") or f"{slot_key} {operator} {threshold}").strip()
    gate_logic = str(nearby.get("gate_logic") or hist.get("gate_logic") or "AND").strip() or "AND"
    return {
        "schema": patch_schema(),
        "meta": {"generated_at": _now()},
        "suggested_patch": {
            "slotKey": slot_key,
            "threshold": threshold,
            "operator": operator,
            "formula": formula,
            "gate_logic": gate_logic,
        },
        "patch_review_workflow": {
            "reviewable": True,
            "steps": ["generated", "pending_review", "approved/rejected/edited", "applied"],
            "review_actions": ["accept", "edit", "reject"],
            "state_machine": {
                "generated": ["pending_review"],
                "pending_review": ["approved", "edited", "rejected"],
                "approved": ["applied", "reverted"],
                "edited": ["pending_review", "applied", "reverted"],
                "rejected": [],
                "applied": ["reverted"],
                "reverted": [],
            },
        },
        "revert_strategy": {
            "revertable": True,
            "mode": "version_pointer_rollback",
            "action": "revert_to_previous_version",
            "requires_previous_version": True,
        },
        "context_digest": {
            "unresolved_reason": unresolved_reason,
            "nearby_rules_count": len(nearby_rules),
            "historical_fixes_count": len(historical_fixes),
            "slot_graph_nodes": len(slot_graph.get("nodes", [])) if isinstance(slot_graph, dict) else 0,
            "semantic_context_keys": sorted(list(semantic_context.keys())) if isinstance(semantic_context, dict) else [],
        },
    }


def create_versioned_patch(
    *,
    store_dir: Path,
    form_code: str,
    suggested_patch: Dict[str, Any],
    source: str = "ai_patch_auto_repair",
) -> Dict[str, Any]:
    store_dir.mkdir(parents=True, exist_ok=True)
    path = store_dir / "patches.jsonl"
    patch_id = f"aipatch_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    version = _next_version(store_dir, form_code)
    item = {
        "patch_id": patch_id,
        "form_code": form_code,
        "version": version,
        "previous_version": max(version - 1, 0),
        "source": source,
        "status": "pending_review",
        "created_at": _now(),
        "suggested_patch": suggested_patch,
        "revert_ref": f"{form_code}@{max(version - 1, 0)}",
        "review_history": [],
        "revertable": True,
    }
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(item, ensure_ascii=False) + "\n")
    return item


def list_patches(store_dir: Path) -> list[Dict[str, Any]]:
    rows = _read_jsonl(store_dir / "patches.jsonl")
    rows.sort(
        key=lambda row: (
            str(row.get("created_at") or ""),
            int(row.get("version") or 0),
        ),
        reverse=True,
    )
    return rows


def review_patch(
    *,
    store_dir: Path,
    patch_id: str,
    action: str,
    edit_payload: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    rows = _read_jsonl(store_dir / "patches.jsonl")
    target = None
    for row in rows:
        if str(row.get("patch_id")) == patch_id:
            target = row
            break
    if target is None:
        raise ValueError(f"patch not found: {patch_id}")
    act = str(action or "").strip().lower()
    if act not in {"accept", "edit", "reject"}:
        raise ValueError("action must be accept/edit/reject")
    if act == "accept":
        target["status"] = "approved"
    elif act == "reject":
        target["status"] = "rejected"
    else:
        target["status"] = "edited"
        if isinstance(edit_payload, dict):
            target["edited_patch"] = edit_payload
    target["updated_at"] = _now()
    review_history = target.get("review_history")
    if not isinstance(review_history, list):
        review_history = []
    review_history.append(
        {
            "action": act,
            "edit_payload": edit_payload if isinstance(edit_payload, dict) else {},
            "at": target["updated_at"],
        }
    )
    target["review_history"] = review_history
    _write_jsonl(store_dir / "patches.jsonl", rows)
    return target


def revert_patch(*, store_dir: Path, patch_id: str) -> Dict[str, Any]:
    rows = _read_jsonl(store_dir / "patches.jsonl")
    target = None
    for row in rows:
        if str(row.get("patch_id")) == patch_id:
            target = row
            break
    if target is None:
        raise ValueError(f"patch not found: {patch_id}")
    target["status"] = "reverted"
    target["reverted_at"] = _now()
    target["revert_strategy"] = {
        "mode": "version_pointer_rollback",
        "from_version": int(target.get("version") or 0),
        "to_version": int(target.get("previous_version") or 0),
        "reverted_at": target["reverted_at"],
    }
    _write_jsonl(store_dir / "patches.jsonl", rows)
    return target


def _next_version(store_dir: Path, form_code: str) -> int:
    rows = _read_jsonl(store_dir / "patches.jsonl")
    versions = [int(r.get("version") or 0) for r in rows if str(r.get("form_code")) == form_code]
    return (max(versions) + 1) if versions else 1


def _read_jsonl(path: Path) -> list[Dict[str, Any]]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        t = line.strip()
        if not t:
            continue
        try:
            obj = json.loads(t)
        except Exception:
            continue
        if isinstance(obj, dict):
            out.append(obj)
    return out


def _write_jsonl(path: Path, rows: list[Dict[str, Any]]) -> None:
    text = "\n".join(json.dumps(r, ensure_ascii=False) for r in rows)
    path.write_text(f"{text}\n" if text else "", encoding="utf-8")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
