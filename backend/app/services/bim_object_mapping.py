from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def bim_mapping_schema() -> Dict[str, Any]:
    return {
        "schema_id": "bim_object_mapping.v1",
        "node": "BIMObject",
        "required_fields": [
            "bim_object_id",
            "object_type",
            "location",
            "project_id",
            "related_form_code",
            "related_slotKeys",
            "related_specir_ids",
            "geometry_ref",
            "metadata",
        ],
        "mapping_rules": [
            "one BIMObject can bind multiple slotKeys",
            "slotKey supports reverse BIMObject lookup",
            "when gate failed, highlight mapped BIMObjects",
            "when BIM updated, trigger impacted Rule/Gate check",
        ],
    }


def upsert_bim_object(*, store_dir: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    row = _normalize(payload)
    _validate(row)
    db = _load_db(store_dir)
    db["objects"][row["bim_object_id"]] = row
    _save_db(store_dir, db)
    return {"item": row, "schema": bim_mapping_schema()}


def analyze_impact(
    *,
    store_dir: Path,
    project_id: str,
    slotKey: str = "",
    gate_failed: Dict[str, Any] | None = None,
    bim_update: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    db = _load_db(store_dir)
    objs = [x for x in db["objects"].values() if str(x.get("project_id") or "").strip() == project_id]
    target_slot = str(slotKey or "").strip()
    gate = gate_failed if isinstance(gate_failed, dict) else {}
    update = bim_update if isinstance(bim_update, dict) else {}
    gate_slot = str(gate.get("slotKey") or "").strip()
    update_obj_id = str(update.get("bim_object_id") or "").strip()

    highlighted: list[Dict[str, Any]] = []
    reverse_lookup: list[Dict[str, Any]] = []
    impacted_checks: list[Dict[str, Any]] = []
    for obj in objs:
        keys = [str(x).strip() for x in (obj.get("related_slotKeys") or []) if str(x).strip()]
        if target_slot and target_slot in keys:
            reverse_lookup.append(obj)
        should_highlight = bool(gate_slot and gate_slot in keys)
        if should_highlight:
            highlighted.append(
                {
                    "bim_object_id": obj.get("bim_object_id"),
                    "geometry_ref": obj.get("geometry_ref"),
                    "reason": f"gate failed at slotKey={gate_slot}",
                }
            )
        if update_obj_id and str(obj.get("bim_object_id") or "").strip() == update_obj_id:
            impacted_checks.append(
                {
                    "bim_object_id": update_obj_id,
                    "trigger": "bim_update",
                    "recheck_rule_ids": _as_str_list(update.get("rule_ids")),
                    "recheck_gate_ids": _as_str_list(update.get("gate_ids")),
                    "related_slotKeys": keys,
                    "related_form_code": obj.get("related_form_code"),
                }
            )

    return {
        "impact_analysis_logic": {
            "slot_reverse_lookup": "slotKey -> related BIMObjects[]",
            "failed_gate_highlight": "gate_failed.slotKey -> highlight BIMObjects where related_slotKeys contains slotKey",
            "bim_update_recheck": "bim_update.bim_object_id -> recheck related Rule/Gate",
        },
        "reverse_lookup": reverse_lookup,
        "highlight_targets": highlighted,
        "impacted_rule_gate_checks": impacted_checks,
        "meta": {"project_id": project_id, "generated_at": _now()},
    }


def list_bim_objects(*, store_dir: Path, project_id: str = "") -> Dict[str, Any]:
    db = _load_db(store_dir)
    items = list(db["objects"].values())
    pid = project_id.strip()
    if pid:
        items = [x for x in items if str(x.get("project_id") or "").strip() == pid]
    return {"items": items}


def _db_path(store_dir: Path) -> Path:
    return store_dir / "bim_object_mapping.json"


def _load_db(store_dir: Path) -> Dict[str, Any]:
    store_dir.mkdir(parents=True, exist_ok=True)
    path = _db_path(store_dir)
    if not path.exists():
        return {"objects": {}}
    try:
        obj = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return {"objects": {}}
    if not isinstance(obj, dict):
        return {"objects": {}}
    rows = obj.get("objects")
    if not isinstance(rows, dict):
        return {"objects": {}}
    return {"objects": rows}


def _save_db(store_dir: Path, db: Dict[str, Any]) -> None:
    _db_path(store_dir).write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")


def _normalize(payload: Dict[str, Any]) -> Dict[str, Any]:
    row = dict(payload)
    row.setdefault("location", {})
    row.setdefault("related_slotKeys", [])
    row.setdefault("related_specir_ids", [])
    row.setdefault("metadata", {})
    row.setdefault("updated_at", _now())
    return row


def _validate(row: Dict[str, Any]) -> None:
    for field in bim_mapping_schema()["required_fields"]:
        if field not in row:
            raise ValueError(f"missing required field: {field}")
    if not isinstance(row.get("location"), dict):
        raise ValueError("location must be object")
    if not isinstance(row.get("related_slotKeys"), list):
        raise ValueError("related_slotKeys must be array")
    if not isinstance(row.get("related_specir_ids"), list):
        raise ValueError("related_specir_ids must be array")
    if not isinstance(row.get("metadata"), dict):
        raise ValueError("metadata must be object")


def _as_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(x).strip() for x in value if str(x).strip()]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

