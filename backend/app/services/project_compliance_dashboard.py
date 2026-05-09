from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def dashboard_structure() -> Dict[str, Any]:
    return {
        "name": "project_compliance_dashboard.v1",
        "widgets": [
            "overall_compliance_score",
            "failed_gate_count",
            "unverifiable_proof_count",
            "high_risk_forms",
            "low_trust_data_count",
            "pending_review_count",
            "recent_overrides",
        ],
        "filters": ["form_code", "bridge_section", "construction_stage", "rulepack_version", "risk_level"],
    }


def metric_definitions() -> Dict[str, Any]:
    return {
        "overall_compliance_score": "0-100 aggregated score from filtered forms",
        "failed_gate_count": "count of gate records with status FAIL/BLOCK/ERROR",
        "unverifiable_proof_count": "count of records where proof_status=unverifiable or proof_missing=true",
        "high_risk_forms": "forms where risk_level=high or risk_score>=0.75",
        "low_trust_data_count": "count of items where trust_level in [low, untrusted]",
        "pending_review_count": "count of review queue items in pending/open status",
        "recent_overrides": "latest manual_override events in filtered scope",
    }


def status_color_rules() -> Dict[str, Any]:
    return {
        "overall_compliance_score": [
            {"if": "score >= 90", "color": "green"},
            {"if": "75 <= score < 90", "color": "amber"},
            {"if": "50 <= score < 75", "color": "orange"},
            {"if": "score < 50", "color": "red"},
        ],
        "risk_level": {
            "low": "green",
            "medium": "amber",
            "high": "red",
            "critical": "red",
        },
        "trust_level": {
            "high": "green",
            "medium": "amber",
            "low": "orange",
            "untrusted": "red",
        },
        "review_status": {"pending": "amber", "open": "amber", "done": "green", "rejected": "red"},
    }


def build_project_dashboard(
    *,
    forms: list[Dict[str, Any]],
    gate_results: list[Dict[str, Any]],
    proof_status: list[Dict[str, Any]],
    risk_items: list[Dict[str, Any]],
    trust_items: list[Dict[str, Any]],
    review_queue: list[Dict[str, Any]],
    runtime_events: list[Dict[str, Any]],
    filters: Dict[str, Any],
) -> Dict[str, Any]:
    filtered_forms = _apply_filters(forms=forms, filters=filters)
    form_codes = {str(x.get("form_code") or "").strip() for x in filtered_forms if str(x.get("form_code") or "").strip()}
    filtered_gates = _filter_by_form_codes(gate_results, form_codes)
    filtered_proofs = _filter_by_form_codes(proof_status, form_codes)
    filtered_risks = _filter_by_form_codes(risk_items, form_codes)
    filtered_trust = _filter_by_form_codes(trust_items, form_codes)
    filtered_reviews = _filter_by_form_codes(review_queue, form_codes)
    filtered_events = _filter_by_form_codes(runtime_events, form_codes)

    overall_score = _score(filtered_forms)
    failed_gate_count = sum(1 for x in filtered_gates if str(x.get("status") or x.get("result") or "").upper() in {"FAIL", "BLOCK", "ERROR"})
    unverifiable_proof_count = sum(
        1
        for x in filtered_proofs
        if str(x.get("proof_status") or "").lower() == "unverifiable" or bool(x.get("proof_missing", False))
    )
    high_risk_forms = sorted(
        {
            str(x.get("form_code") or "").strip()
            for x in filtered_risks
            if str(x.get("risk_level") or "").lower() == "high" or float(x.get("risk_score") or 0) >= 0.75
        }
    )
    low_trust_data_count = sum(1 for x in filtered_trust if str(x.get("trust_level") or "").lower() in {"low", "untrusted"})
    pending_review_count = sum(1 for x in filtered_reviews if str(x.get("status") or "").lower() in {"pending", "open"})
    recent_overrides = [
        x
        for x in filtered_events
        if str(x.get("event_type") or "").lower() == "manual_override"
    ][-20:]

    return {
        "dashboard_structure": dashboard_structure(),
        "metric_definitions": metric_definitions(),
        "status_color_rules": status_color_rules(),
        "metrics": {
            "overall_compliance_score": overall_score,
            "failed_gate_count": failed_gate_count,
            "unverifiable_proof_count": unverifiable_proof_count,
            "high_risk_forms": high_risk_forms,
            "low_trust_data_count": low_trust_data_count,
            "pending_review_count": pending_review_count,
            "recent_overrides": recent_overrides,
        },
        "applied_filters": filters,
        "meta": {"generated_at": _now(), "form_count": len(filtered_forms)},
    }


def _apply_filters(*, forms: list[Dict[str, Any]], filters: Dict[str, Any]) -> list[Dict[str, Any]]:
    out = [x for x in forms if isinstance(x, dict)]
    form_code = str(filters.get("form_code") or "").strip().lower()
    bridge_section = str(filters.get("bridge_section") or "").strip().lower()
    construction_stage = str(filters.get("construction_stage") or "").strip().lower()
    rulepack_version = str(filters.get("rulepack_version") or "").strip().lower()
    risk_level = str(filters.get("risk_level") or "").strip().lower()

    if form_code:
        out = [x for x in out if str(x.get("form_code") or "").strip().lower() == form_code]
    if bridge_section:
        out = [x for x in out if str(x.get("bridge_section") or "").strip().lower() == bridge_section]
    if construction_stage:
        out = [x for x in out if str(x.get("construction_stage") or "").strip().lower() == construction_stage]
    if rulepack_version:
        out = [x for x in out if str(x.get("rulepack_version") or "").strip().lower() == rulepack_version]
    if risk_level:
        out = [x for x in out if str(x.get("risk_level") or "").strip().lower() == risk_level]
    return out


def _filter_by_form_codes(rows: list[Dict[str, Any]], form_codes: set[str]) -> list[Dict[str, Any]]:
    if not form_codes:
        return [x for x in rows if isinstance(x, dict)]
    out: list[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        code = str(row.get("form_code") or "").strip()
        if code in form_codes:
            out.append(row)
    return out


def _score(forms: list[Dict[str, Any]]) -> float:
    if not forms:
        return 0.0
    vals: list[float] = []
    for row in forms:
        try:
            vals.append(float(row.get("compliance_score")))
        except Exception:
            continue
    if not vals:
        return 0.0
    return round(sum(vals) / len(vals), 2)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

