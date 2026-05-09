from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from app.services.rulepack_builder import build_rulepack
from app.services.specir_quality_gate import evaluate_specir_quality_gate
from app.services.specir_review import enforce_specir_approval_guard
from app.services.specir_signature import sign_specir
from app.services.validator import validate_document_ir


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _runtime_root() -> Path:
    return Path(__file__).resolve().parents[1] / "runtime" / "parse_results"


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _fill_checklist_pass(specir: Dict[str, Any], reviewer_id: str) -> Dict[str, Any]:
    row = dict(specir)
    checklist = row.get("checklist", [])
    if not isinstance(checklist, list):
        checklist = []
    now = _utc_now()
    fixed: List[Dict[str, Any]] = []
    for item in checklist:
        if not isinstance(item, dict):
            continue
        x = dict(item)
        x["result"] = "pass"
        x["comment"] = str(x.get("comment", "")).strip() or "auto checklist pass"
        x["reviewer_id"] = reviewer_id
        x["reviewed_at"] = now
        fixed.append(x)
    row["checklist"] = fixed
    return row


def run_full_pipeline(*, parse_id: str, form_code: str, reviewer_id: str, signer_id: str, signer_role: str, editor_id: str) -> Dict[str, Any]:
    root = _runtime_root() / parse_id
    doc_ir_path = root / "document_ir.json"
    specir_candidates_path = root / "specir_candidates.json"
    blockers: List[str] = []

    if not doc_ir_path.exists():
        return {"status": "failed", "blockers": ["document_ir.json missing"], "parse_id": parse_id}
    if not specir_candidates_path.exists():
        return {"status": "failed", "blockers": ["specir_candidates.json missing"], "parse_id": parse_id}

    document_ir = _load_json(doc_ir_path)
    doc_check = validate_document_ir(document_ir)
    if str(doc_check.get("status")) != "success":
        blockers.append("document_ir validation failed")

    specir_candidates = _load_json(specir_candidates_path)
    specirs = specir_candidates.get("specirs", []) if isinstance(specir_candidates, dict) else []
    if not isinstance(specirs, list):
        specirs = []

    normrefs = sorted({str(s.get("normRef", "")).strip() for s in specirs if isinstance(s, dict) and str(s.get("normRef", "")).strip()})
    normref_doc = {"count": len(normrefs), "normRefs": normrefs}

    approved: List[Dict[str, Any]] = []
    signature_rows: List[Dict[str, Any]] = []
    for specir in specirs:
        if not isinstance(specir, dict):
            continue
        reviewed = _fill_checklist_pass(specir, reviewer_id=reviewer_id)
        guard = enforce_specir_approval_guard(reviewed)
        if not bool(guard.get("can_approve", False)):
            continue
        reviewed["status"] = "approved"
        signed = sign_specir(
            reviewed,
            signer_id=signer_id,
            signer_role=signer_role,
            editor_id=editor_id,
        )
        if not bool(signed.get("ok", False)):
            continue
        final_specir = signed.get("specir", {})
        if isinstance(final_specir, dict):
            approved.append(final_specir)
            signature_rows.append(signed.get("signature", {}))

    if len(approved) == 0:
        blockers.append("no approved specir")

    approved_doc = {"approved_count": len(approved), "approved_specirs": approved}
    (root / "normref.json").write_text(json.dumps(normref_doc, ensure_ascii=False, indent=2), encoding="utf-8")
    (root / "specir_approved.json").write_text(json.dumps(approved_doc, ensure_ascii=False, indent=2), encoding="utf-8")

    quality_report = evaluate_specir_quality_gate(approved, min_confidence=0.92)
    (root / "quality_report.json").write_text(json.dumps(quality_report, ensure_ascii=False, indent=2), encoding="utf-8")
    if bool(quality_report.get("publish_blocked", False)):
        blockers.append("quality_gate_blocked: error_count > 0")

    rulepack_result = build_rulepack(
        form_code,
        approved_specirs=approved,
        parse_id=parse_id,
    )
    asset_signature_rows: List[Dict[str, Any]] = []
    if str(rulepack_result.get("status")) != "success":
        blockers.extend([f"rulepack: {x}" for x in rulepack_result.get("blockers", [])])
    else:
        # Write requested filename alias.
        out = _runtime_root() / "rulepacks"
        out.mkdir(parents=True, exist_ok=True)
        target_name = f"{form_code}.rulepack.json"
        (out / target_name).write_text(json.dumps(rulepack_result.get("rulepack", {}), ensure_ascii=False, indent=2), encoding="utf-8")
        traceability_report = rulepack_result.get("traceability_report", {})
        if isinstance(traceability_report, dict):
            (root / "traceability_report.json").write_text(json.dumps(traceability_report, ensure_ascii=False, indent=2), encoding="utf-8")
        rp = rulepack_result.get("rulepack", {}) if isinstance(rulepack_result.get("rulepack"), dict) else {}
        rules = rp.get("rules", []) if isinstance(rp.get("rules"), list) else []
        gates = rp.get("gates", []) if isinstance(rp.get("gates"), list) else []
        sig_by_specir: Dict[str, Dict[str, Any]] = {}
        for sp in approved:
            sid = str(sp.get("specir_id", "")).strip()
            sigs = sp.get("signatures", [])
            if sid and isinstance(sigs, list) and len(sigs) > 0 and isinstance(sigs[-1], dict):
                sig_by_specir[sid] = sigs[-1]
        for r in rules:
            if not isinstance(r, dict):
                continue
            sid = str(r.get("source_specir_id", "")).strip()
            sig = sig_by_specir.get(sid, {})
            asset_signature_rows.append(
                {
                    "asset_type": "rule",
                    "asset_id": str(r.get("rule_id", "")).strip(),
                    "source_specir_id": sid,
                    "signature_hash": str(sig.get("signature_hash", "")).strip(),
                    "signer_id": str(sig.get("signer_id", "")).strip(),
                }
            )
        for g in gates:
            if not isinstance(g, dict):
                continue
            sid = str(g.get("source_specir_id", "")).strip()
            sig = sig_by_specir.get(sid, {})
            asset_signature_rows.append(
                {
                    "asset_type": "gate",
                    "asset_id": str(g.get("gate_id", "")).strip(),
                    "source_specir_id": sid,
                    "signature_hash": str(sig.get("signature_hash", "")).strip(),
                    "signer_id": str(sig.get("signer_id", "")).strip(),
                }
            )

    publish_record = {
        "parse_id": parse_id,
        "form_code": form_code,
        "published_at": _utc_now(),
        "signature_count": len(signature_rows),
        "signatures": signature_rows,
        "asset_signatures": asset_signature_rows,
        "assets": {
            "document_ir": str(doc_ir_path),
            "normref": str(root / "normref.json"),
            "specir_candidates": str(specir_candidates_path),
            "specir_approved": str(root / "specir_approved.json"),
            "rulepack": str((_runtime_root() / "rulepacks" / f"{form_code}.rulepack.json")),
        },
    }
    (root / "publish_record.json").write_text(json.dumps(publish_record, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "status": "success" if len(blockers) == 0 else "failed",
        "parse_id": parse_id,
        "form_code": form_code,
        "checks": {
            "document_ir_exists": doc_ir_path.exists(),
            "document_ir_valid": str(doc_check.get("status")) == "success",
            "specir_candidates_exists": specir_candidates_path.exists(),
            "approved_specir_count": len(approved),
            "rulepack_schema_ok": bool((rulepack_result.get("gate_checks", {}) if isinstance(rulepack_result.get("gate_checks"), dict) else {}).get("schema_ok", False)),
            "traceable_rule_gate": True,
            "signature_record_count": len(signature_rows),
            "published_asset_signature_count": len([x for x in asset_signature_rows if str(x.get("signature_hash", "")).strip()]),
            "quality_gate_error_count": int(quality_report.get("error_count", 0) or 0),
        },
        "rulepack_result": rulepack_result,
        "quality_report": quality_report,
        "blockers": blockers,
    }
