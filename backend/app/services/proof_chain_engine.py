from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def proof_schema() -> Dict[str, Any]:
    return {
        "schema_id": "proof_chain.v1",
        "append_only": True,
        "required_fields": [
            "proof_id",
            "project_id",
            "form_code",
            "slotKey",
            "rule_id",
            "gate_id",
            "input_snapshot",
            "calculation_trace",
            "decision_result",
            "evidence_files",
            "operator",
            "timestamp",
            "hash",
            "previous_hash",
        ],
        "traceability_fields": ["specir_id", "normRef", "source_text"],
        "override_policy": "manual override must append a new proof entry",
        "export_support": ["json", "markdown"],
    }


def hash_chain_design() -> Dict[str, Any]:
    return {
        "name": "sha256_linked_proof_chain_v1",
        "chain_formula": "hash = sha256(canonical(proof_without_hash) + '|' + previous_hash)",
        "previous_hash_source": "latest proof hash in same project_id",
        "immutability_rule": "append-only ledger (jsonl), no overwrite path provided",
    }


def append_proof(*, store_dir: Path, payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_payload(payload)
    _validate_payload(normalized)
    store_dir.mkdir(parents=True, exist_ok=True)

    chain_path = store_dir / "proof_chain_ledger.jsonl"
    if _exists_proof_id(chain_path=chain_path, proof_id=str(normalized.get("proof_id") or "")):
        raise ValueError("proof_id already exists; proof chain is append-only and does not allow overwrite")
    previous_hash = _last_hash_for_project(chain_path=chain_path, project_id=str(normalized.get("project_id") or ""))
    normalized["previous_hash"] = previous_hash
    normalized["hash"] = _compute_hash(normalized)

    with chain_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(normalized, ensure_ascii=False) + "\n")

    return {
        "proof": normalized,
        "hash_chain_design": hash_chain_design(),
        "write_flow": {
            "steps": [
                "1) validate proof schema",
                "2) resolve previous_hash by project scope",
                "3) compute sha256 hash",
                "4) append-only write to proof_chain_ledger.jsonl",
            ],
            "store_path": str(chain_path),
        },
    }


def list_proofs(*, store_dir: Path, project_id: str | None = None, limit: int = 100) -> Dict[str, Any]:
    path = store_dir / "proof_chain_ledger.jsonl"
    items: list[Dict[str, Any]] = []
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            txt = line.strip()
            if not txt:
                continue
            try:
                obj = json.loads(txt)
            except Exception:
                continue
            if not isinstance(obj, dict):
                continue
            if project_id and str(obj.get("project_id") or "").strip() != project_id:
                continue
            items.append(obj)
    items = items[-max(1, min(int(limit), 2000)) :]
    return {"items": items}


def export_audit_report(*, store_dir: Path, project_id: str) -> Dict[str, Any]:
    listing = list_proofs(store_dir=store_dir, project_id=project_id, limit=5000).get("items", [])
    chain_ok = _verify_chain(listing)
    failed_items = [
        {
            "proof_id": str(item.get("proof_id") or ""),
            "gate_id": str(item.get("gate_id") or ""),
            "rule_id": str(item.get("rule_id") or ""),
            "decision_result": str(item.get("decision_result") or ""),
        }
        for item in listing
        if str(item.get("decision_result") or "").strip().upper() in {"FAIL", "BLOCK", "REJECTED"}
    ]
    markdown_lines = [
        f"# Proof Audit Report - {project_id}",
        "",
        f"- generated_at: {_now()}",
        f"- total_proofs: {len(listing)}",
        f"- chain_integrity: {'PASS' if chain_ok else 'FAIL'}",
        f"- failed_decisions: {len(failed_items)}",
        "",
        "## Failed Decisions",
    ]
    if not failed_items:
        markdown_lines.append("- none")
    else:
        for item in failed_items:
            markdown_lines.append(
                f"- proof_id={item['proof_id']}, gate_id={item['gate_id']}, rule_id={item['rule_id']}, result={item['decision_result']}"
            )

    return {
        "project_id": project_id,
        "generated_at": _now(),
        "chain_integrity": chain_ok,
        "total_proofs": len(listing),
        "failed_items": failed_items,
        "report_markdown": "\n".join(markdown_lines),
        "traceability": {
            "specir_coverage": sum(1 for item in listing if str(item.get("specir_id") or "").strip()),
            "normref_coverage": sum(1 for item in listing if str(item.get("normRef") or "").strip()),
            "source_text_coverage": sum(1 for item in listing if str(item.get("source_text") or "").strip()),
        },
    }


def _normalize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    row = dict(payload)
    row.setdefault("proof_id", f"proof_{int(datetime.now(timezone.utc).timestamp() * 1000)}")
    row.setdefault("timestamp", _now())
    row.setdefault("input_snapshot", {})
    row.setdefault("calculation_trace", [])
    row.setdefault("evidence_files", [])
    row.setdefault("previous_hash", "")
    row.setdefault("hash", "")
    row.setdefault("specir_id", "")
    row.setdefault("normRef", "")
    row.setdefault("source_text", "")
    return row


def _validate_payload(payload: Dict[str, Any]) -> None:
    for field in [
        "proof_id",
        "project_id",
        "form_code",
        "slotKey",
        "rule_id",
        "gate_id",
        "input_snapshot",
        "calculation_trace",
        "decision_result",
        "evidence_files",
        "operator",
        "timestamp",
    ]:
        if field not in payload:
            raise ValueError(f"missing required field: {field}")
    if not isinstance(payload.get("input_snapshot"), dict):
        raise ValueError("input_snapshot must be object")
    if not isinstance(payload.get("calculation_trace"), list):
        raise ValueError("calculation_trace must be array")
    if not isinstance(payload.get("evidence_files"), list):
        raise ValueError("evidence_files must be array")


def _last_hash_for_project(*, chain_path: Path, project_id: str) -> str:
    if not chain_path.exists():
        return ""
    last_hash = ""
    for line in chain_path.read_text(encoding="utf-8-sig").splitlines():
        txt = line.strip()
        if not txt:
            continue
        try:
            obj = json.loads(txt)
        except Exception:
            continue
        if not isinstance(obj, dict):
            continue
        if str(obj.get("project_id") or "").strip() != project_id:
            continue
        last_hash = str(obj.get("hash") or "").strip()
    return last_hash


def _compute_hash(payload: Dict[str, Any]) -> str:
    body = dict(payload)
    body["hash"] = ""
    previous = str(body.get("previous_hash") or "")
    canonical = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{canonical}|{previous}".encode("utf-8")).hexdigest()


def _exists_proof_id(*, chain_path: Path, proof_id: str) -> bool:
    if not proof_id or not chain_path.exists():
        return False
    for line in chain_path.read_text(encoding="utf-8-sig").splitlines():
        txt = line.strip()
        if not txt:
            continue
        try:
            obj = json.loads(txt)
        except Exception:
            continue
        if not isinstance(obj, dict):
            continue
        if str(obj.get("proof_id") or "").strip() == proof_id:
            return True
    return False


def _verify_chain(items: list[Dict[str, Any]]) -> bool:
    previous = ""
    for item in items:
        if str(item.get("previous_hash") or "") != previous:
            return False
        expected = _compute_hash(item)
        current = str(item.get("hash") or "")
        if expected != current:
            return False
        previous = current
    return True


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
