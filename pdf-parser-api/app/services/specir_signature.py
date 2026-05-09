from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _runtime_root() -> Path:
    return Path(__file__).resolve().parents[1] / "runtime" / "parse_results"


def _stable_hash(payload: Dict[str, Any]) -> str:
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def _checklist_hash(specir: Dict[str, Any]) -> str:
    checklist = specir.get("checklist", [])
    if not isinstance(checklist, list):
        checklist = []
    canonical = []
    for row in checklist:
        if not isinstance(row, dict):
            continue
        canonical.append(
            {
                "item_id": str(row.get("item_id", "")).strip(),
                "result": str(row.get("result", "")).strip(),
                "comment": str(row.get("comment", "")).strip(),
                "reviewer_id": str(row.get("reviewer_id", "")).strip(),
                "reviewed_at": str(row.get("reviewed_at", "")).strip(),
            }
        )
    return _stable_hash({"checklist": canonical})


def _content_hash_without_signatures(specir: Dict[str, Any]) -> str:
    row = dict(specir)
    row.pop("signatures", None)
    row.pop("audit_log", None)
    return _stable_hash(row)


def _audit_path() -> Path:
    p = _runtime_root() / "specir_audit_log.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _append_audit_log(event: Dict[str, Any]) -> None:
    with _audit_path().open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def _compute_diff(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    keys = sorted(set(before.keys()) | set(after.keys()))
    out: Dict[str, Any] = {}
    for k in keys:
        if before.get(k) != after.get(k):
            out[k] = {"before": before.get(k), "after": after.get(k)}
    return out


def sign_specir(
    specir: Dict[str, Any],
    *,
    signer_id: str,
    signer_role: str,
    editor_id: str,
) -> Dict[str, Any]:
    before = dict(specir if isinstance(specir, dict) else {})
    row = dict(before)
    signatures = row.get("signatures")
    if not isinstance(signatures, list):
        signatures = []
    version = str(row.get("specir_version", "")).strip() or str(row.get("version", "")).strip() or "v1"
    row["specir_version"] = version

    if str(signer_id).strip() == str(editor_id).strip():
        return {"ok": False, "error": "EDITOR_REVIEWER_CONFLICT", "message": "editor and reviewer cannot be the same person"}

    # No overwrite: a version can only be signed once.
    if any(str(s.get("specir_version", "")).strip() == version for s in signatures if isinstance(s, dict)):
        return {"ok": False, "error": "SIGNATURE_ALREADY_EXISTS", "message": "signature already exists for current specir_version"}

    checklist_hash = _checklist_hash(row)
    specir_hash = _content_hash_without_signatures(row)
    signature_hash = _stable_hash(
        {
            "signer": signer_id,
            "role": signer_role,
            "timestamp": _utc_now(),
            "specir_hash": specir_hash,
            "checklist_hash": checklist_hash,
            "specir_version": version,
        }
    )
    sig = {
        "signer": str(signer_id).strip(),
        "role": str(signer_role).strip(),
        "timestamp": _utc_now(),
        "specir_version": version,
        "specir_hash": specir_hash,
        "checklist_hash": checklist_hash,
        "signature_hash": signature_hash,
        # backward compatibility fields
        "signer_id": str(signer_id).strip(),
        "signer_role": str(signer_role).strip(),
        "signed_at": _utc_now(),
    }
    signatures.append(sig)
    row["signatures"] = signatures
    row["last_signature_content_hash"] = specir_hash

    after = dict(row)
    audit_item = {
        "before": before,
        "after": after,
        "diff": _compute_diff(before, after),
        "operator": str(signer_id).strip(),
        "operation_type": "APPROVE_SIGN",
        "at": _utc_now(),
        "specir_id": str(row.get("specir_id", "")).strip(),
        "specir_version": version,
    }
    local_audit = row.get("audit_log", [])
    if not isinstance(local_audit, list):
        local_audit = []
    local_audit.append(audit_item)
    row["audit_log"] = local_audit
    _append_audit_log(audit_item)
    return {"ok": True, "specir": row, "signature": sig}


def ensure_resign_required_after_modify(specir_before: Dict[str, Any], specir_after: Dict[str, Any]) -> Dict[str, Any]:
    before_hash = _content_hash_without_signatures(specir_before if isinstance(specir_before, dict) else {})
    after_hash = _content_hash_without_signatures(specir_after if isinstance(specir_after, dict) else {})
    changed = before_hash != after_hash
    if not changed:
        return {"changed": False, "resign_required": False}
    last_signed_hash = str((specir_after or {}).get("last_signature_content_hash", "")).strip() if isinstance(specir_after, dict) else ""
    resign_required = (last_signed_hash != after_hash)
    return {"changed": True, "resign_required": resign_required}

