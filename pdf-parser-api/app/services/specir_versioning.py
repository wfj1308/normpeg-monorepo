from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_specirs(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    rows = doc.get("specirs", []) if isinstance(doc, dict) else []
    return [x for x in rows if isinstance(x, dict)] if isinstance(rows, list) else []


def _index_key(specir: Dict[str, Any]) -> str:
    sid = str(specir.get("specir_id", "")).strip()
    if sid:
        return sid
    return str(specir.get("normRef", "")).strip()


def _obj_diff(old: Dict[str, Any], new: Dict[str, Any], keys: List[str]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for k in keys:
        ov = old.get(k)
        nv = new.get(k)
        if ov != nv:
            out[k] = {"old": ov, "new": nv}
    return out


def build_specir_diff_report(*, old_specirs_path: Path, new_specirs_path: Path) -> Dict[str, Any]:
    old_rows = _load_specirs(old_specirs_path)
    new_rows = _load_specirs(new_specirs_path)
    old_map = {_index_key(x): x for x in old_rows if _index_key(x)}
    new_map = {_index_key(x): x for x in new_rows if _index_key(x)}

    added_keys = sorted([k for k in new_map.keys() if k not in old_map])
    removed_keys = sorted([k for k in old_map.keys() if k not in new_map])
    common_keys = sorted([k for k in new_map.keys() if k in old_map])

    added = [new_map[k] for k in added_keys]
    removed = [old_map[k] for k in removed_keys]
    modified: List[Dict[str, Any]] = []

    for k in common_keys:
        old = old_map[k]
        new = new_map[k]
        semantic_old = old.get("semantic", {}) if isinstance(old.get("semantic"), dict) else {}
        semantic_new = new.get("semantic", {}) if isinstance(new.get("semantic"), dict) else {}
        gate_old = old.get("gate", {}) if isinstance(old.get("gate"), dict) else {}
        gate_new = new.get("gate", {}) if isinstance(new.get("gate"), dict) else {}
        semantic_diff = _obj_diff(semantic_old, semantic_new, ["title", "subject", "action", "condition", "scope"])
        gate_diff = _obj_diff(gate_old, gate_new, ["type", "operator", "threshold", "unit", "decision_logic", "on_fail"])
        threshold_diff = {}
        if gate_old.get("threshold") != gate_new.get("threshold"):
            threshold_diff = {"old": gate_old.get("threshold"), "new": gate_new.get("threshold")}

        if semantic_diff or gate_diff or threshold_diff:
            modified.append(
                {
                    "specir_id": str(new.get("specir_id", "")).strip() or str(old.get("specir_id", "")).strip(),
                    "old_specir_version": str(old.get("specir_version", "")).strip(),
                    "new_specir_version": str(new.get("specir_version", "")).strip(),
                    "semantic_diff": semantic_diff,
                    "gate_diff": gate_diff,
                    "threshold_diff": threshold_diff,
                }
            )

    return {
        "generated_at": _utc_now(),
        "old_path": str(old_specirs_path),
        "new_path": str(new_specirs_path),
        "summary": {
            "old_count": len(old_rows),
            "new_count": len(new_rows),
            "added_count": len(added),
            "removed_count": len(removed),
            "modified_count": len(modified),
        },
        "added": added,
        "removed": removed,
        "modified": modified,
    }

