from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from app.services.specir_review import enforce_specir_approval_guard
from app.services.specir_signature import sign_specir


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _runtime_root() -> Path:
    return Path(__file__).resolve().parents[1] / "runtime" / "parse_results"


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _save_json(path: Path, obj: Dict[str, Any]) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def get_review_queue(parse_id: str) -> Dict[str, Any]:
    p = _runtime_root() / parse_id / "specir_candidates.json"
    if not p.exists():
        return {"status": "failed", "error": "SPECIR_CANDIDATES_NOT_FOUND", "items": []}
    doc = _load_json(p)
    rows = doc.get("specirs", []) if isinstance(doc, dict) else []
    if not isinstance(rows, list):
        rows = []
    items = [x for x in rows if isinstance(x, dict)]

    auto_candidates = []
    review_required = []
    for row in items:
        confidence = float((row.get("quality", {}) if isinstance(row.get("quality"), dict) else {}).get("confidence", 0) or 0)
        if confidence >= 0.92:
            row["status"] = "auto_candidate"
            auto_candidates.append(row)
        else:
            row["status"] = "review_required"
            review_required.append(row)

    return {
        "status": "success",
        "parse_id": parse_id,
        "summary": {
            "total": len(items),
            "auto_candidate": len(auto_candidates),
            "review_required": len(review_required),
        },
        "auto_candidate": auto_candidates,
        "review_queue": review_required,
    }


def decide_review_queue_item(parse_id: str, specir_id: str, action: str, *, editor_id: str = "", patch: Dict[str, Any] | None = None, reason: str = "") -> Dict[str, Any]:
    p = _runtime_root() / parse_id / "specir_candidates.json"
    if not p.exists():
        return {"status": "failed", "error": "SPECIR_CANDIDATES_NOT_FOUND"}
    doc = _load_json(p)
    rows = doc.get("specirs", []) if isinstance(doc, dict) else []
    if not isinstance(rows, list):
        return {"status": "failed", "error": "INVALID_SPECIR_CANDIDATES"}

    target = None
    for i, row in enumerate(rows):
        if isinstance(row, dict) and str(row.get("specir_id", "")).strip() == str(specir_id).strip():
            target = (i, row)
            break
    if target is None:
        return {"status": "failed", "error": "SPECIR_NOT_FOUND"}

    idx, row = target
    act = str(action).strip().lower()
    now = _utc_now()
    history = row.get("review_history", [])
    if not isinstance(history, list):
        history = []

    if act == "approve":
        guard = enforce_specir_approval_guard(row)
        if not bool(guard.get("can_approve", False)):
            return {"status": "failed", "error": "CHECKLIST_INCOMPLETE", "blockers": guard.get("blockers", [])}
        row["status"] = "approved"
        signed = sign_specir(row, signer_id=(editor_id or "reviewer_001"), signer_role="reviewer", editor_id=(row.get("last_editor_id") or "editor_001"))
        if not bool(signed.get("ok", False)):
            return {"status": "failed", "error": signed.get("error", "SIGNATURE_FAILED"), "message": signed.get("message", "")}
        row = signed.get("specir", row)
    elif act == "reject":
        row["status"] = "rejected"
        if str(reason).strip():
            row["rejected_reason"] = str(reason).strip()
    elif act == "edit":
        # modify must create new version
        old_ver = str(row.get("specir_version", "")).strip() or "v1"
        if old_ver.startswith("v") and old_ver[1:].isdigit():
            row["specir_version"] = f"v{int(old_ver[1:]) + 1}"
        else:
            row["specir_version"] = f"{old_ver}.1"
        row["status"] = "revised"
        if isinstance(patch, dict):
            for key in ("semantic", "body", "gate", "source", "evidence"):
                if key in patch and isinstance(patch.get(key), dict):
                    row[key] = patch[key]
    else:
        return {"status": "failed", "error": "INVALID_ACTION"}

    history.append(
        {
            "action": act,
            "editor_id": str(editor_id).strip(),
            "reason": str(reason).strip(),
            "edited_at": now,
        }
    )
    row["last_editor_id"] = str(editor_id).strip()
    row["review_history"] = history
    row["updated_at"] = now
    rows[idx] = row
    doc["specirs"] = rows
    _save_json(p, doc)
    return {"status": "success", "parse_id": parse_id, "specir_id": specir_id, "action": act, "specir": row}
