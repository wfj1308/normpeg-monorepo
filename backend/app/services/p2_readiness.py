from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def p2_report_schema() -> Dict[str, Any]:
    return {
        "schema_id": "p2_readiness_report.v1",
        "required_fields": ["generated_at", "metrics", "summary", "maturity_level", "remaining_blockers"],
        "metric_fields": ["id", "name", "threshold", "actual", "status", "evidence"],
    }


def build_p2_readiness_report(*, inputs: Dict[str, Any]) -> Dict[str, Any]:
    m = _as_dict(inputs.get("metrics"))
    evidence = _as_dict(inputs.get("evidence"))

    metrics = [
        _ratio_metric("1", "auto_specir_extraction_rate", 0.90, _num(m.get("auto_specir_extraction_rate")), "gte", evidence.get("auto_specir_extraction_rate")),
        _ratio_metric("2", "slot_auto_bind_accuracy", 0.92, _num(m.get("slot_auto_bind_accuracy")), "gte", evidence.get("slot_auto_bind_accuracy")),
        _ratio_metric("3", "ai_gate_synthesis_rate", 0.85, _num(m.get("ai_gate_synthesis_rate")), "gte", evidence.get("ai_gate_synthesis_rate")),
        _ratio_metric("4", "low_confidence_review_rate", 0.10, _num(m.get("low_confidence_review_rate")), "lte", evidence.get("low_confidence_review_rate")),
        _bool_metric("5", "semantic_conflict_detection_pass", bool(m.get("semantic_conflict_detection_pass")), evidence.get("semantic_conflict_detection_pass")),
        _bool_metric("6", "runtime_traceability_complete", bool(m.get("runtime_traceability_complete")), evidence.get("runtime_traceability_complete")),
        _ratio_metric("7", "propagation_accuracy", 0.90, _num(m.get("propagation_accuracy")), "gte", evidence.get("propagation_accuracy")),
        _ratio_metric("8", "ai_patch_acceptance_rate", 0.70, _num(m.get("ai_patch_acceptance_rate")), "gte", evidence.get("ai_patch_acceptance_rate")),
        _ratio_metric("9", "norm_diff_accuracy", 0.95, _num(m.get("norm_diff_accuracy")), "gte", evidence.get("norm_diff_accuracy")),
        _bool_metric("10", "compliance_reasoning_available", bool(m.get("compliance_reasoning_available")), evidence.get("compliance_reasoning_available")),
    ]

    passed = sum(1 for x in metrics if x["status"] == "pass")
    failed = sum(1 for x in metrics if x["status"] == "fail")
    unknown = sum(1 for x in metrics if x["status"] == "unknown")
    maturity = _maturity_level(passed=passed, failed=failed, unknown=unknown)
    blockers = _remaining_blockers(metrics)

    return {
        "generated_at": _now(),
        "schema": p2_report_schema(),
        "metrics": metrics,
        "summary": {
            "total": len(metrics),
            "passed": passed,
            "failed": failed,
            "unknown": unknown,
            "pass_rate": round(passed / len(metrics), 4) if metrics else 0.0,
        },
        "maturity_level": maturity,
        "remaining_blockers": blockers,
    }


def _ratio_metric(mid: str, name: str, threshold: float, actual: float | None, mode: str, evidence: Any) -> Dict[str, Any]:
    if actual is None:
        return {
            "id": mid,
            "name": name,
            "threshold": {mode: threshold},
            "actual": None,
            "status": "unknown",
            "evidence": evidence or "",
        }
    if mode == "gte":
        ok = actual >= threshold
    else:
        ok = actual <= threshold
    return {
        "id": mid,
        "name": name,
        "threshold": {mode: threshold},
        "actual": round(actual, 6),
        "status": "pass" if ok else "fail",
        "evidence": evidence or "",
    }


def _bool_metric(mid: str, name: str, actual: bool | None, evidence: Any) -> Dict[str, Any]:
    if actual is None:
        return {"id": mid, "name": name, "threshold": {"bool": True}, "actual": None, "status": "unknown", "evidence": evidence or ""}
    return {
        "id": mid,
        "name": name,
        "threshold": {"bool": True},
        "actual": bool(actual),
        "status": "pass" if bool(actual) else "fail",
        "evidence": evidence or "",
    }


def _maturity_level(*, passed: int, failed: int, unknown: int) -> Dict[str, Any]:
    # L1 design, L2 API available, L3 feature complete, L4 metrics pass, L5 stable operation
    if failed == 0 and unknown == 0:
        level = "L4"
        text = "Metrics passed. Ready for stability-run toward L5."
    elif passed >= 3 and unknown > 0:
        level = "L3"
        text = "Feature complete, metrics evidence still pending."
    elif passed > 0:
        level = "L2"
        text = "Capabilities available but far from acceptance."
    else:
        level = "L1"
        text = "Only baseline definition exists."
    return {"level": level, "explanation": text}


def _remaining_blockers(metrics: list[Dict[str, Any]]) -> list[str]:
    out = []
    failed = [m for m in metrics if m.get("status") == "fail"]
    unknown = [m for m in metrics if m.get("status") == "unknown"]
    if unknown:
        out.append(f"Missing metric evidence for {len(unknown)} items.")
    if failed:
        out.append(f"{len(failed)} acceptance metrics are below threshold.")
    if any(m.get("name") == "runtime_traceability_complete" and m.get("status") != "pass" for m in metrics):
        out.append("Project-level runtime traceability is not complete.")
    if any(m.get("name") == "semantic_conflict_detection_pass" and m.get("status") != "pass" for m in metrics):
        out.append("Semantic conflict detection does not pass acceptance criteria.")
    if not out:
        out.append("No blocking issue detected for P2 acceptance.")
    return out


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

