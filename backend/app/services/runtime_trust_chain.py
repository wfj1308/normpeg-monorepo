from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def trust_score_rules() -> Dict[str, Any]:
    return {
        "engine": "runtime_trust_chain.v1",
        "dimensions": [
            "source_trustworthiness",
            "device_calibration",
            "manual_input_signature",
            "proof_completeness",
            "override_presence",
            "abrupt_jump_anomaly",
        ],
        "scoring_formula": "score = 100 - penalties",
        "penalties": {
            "untrusted_source": 25,
            "uncalibrated_device": 30,
            "unsigned_manual_input": 20,
            "incomplete_proof": 20,
            "override_detected": 15,
            "abrupt_jump_detected": 20,
        },
        "score_bands": {
            "high": "score >= 85",
            "medium": "70 <= score < 85",
            "low": "50 <= score < 70",
            "untrusted": "score < 50",
        },
        "gating_rules": [
            "low/untrusted cannot auto-generate final compliance conclusion",
            "override must reduce trust score",
            "uncalibrated device data must go to human review",
        ],
    }


def trust_report_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime_trust_report.v1",
        "fields": [
            "project_id",
            "trust_score",
            "trust_level",
            "dimensions",
            "penalties_applied",
            "override_detected",
            "needs_human_review",
            "allow_auto_final_compliance",
            "reasoning",
            "generated_at",
        ],
    }


def evaluate_runtime_trust(
    *,
    project_id: str,
    source: Dict[str, Any],
    device: Dict[str, Any],
    manual_input: Dict[str, Any],
    proof: Dict[str, Any],
    runtime_events: list[Dict[str, Any]],
    recent_values: list[float],
) -> Dict[str, Any]:
    rules = trust_score_rules()
    p = rules["penalties"]

    source_trusted = bool(source.get("trusted", False))
    calibrated = str(device.get("calibration_status") or "").strip().lower() in {"valid", "ok", "calibrated"}
    manual_signed = bool(manual_input.get("signed", False))
    proof_complete = bool(proof.get("complete", False))
    override_detected = _has_override(runtime_events)
    abrupt_jump = _has_abrupt_jump(recent_values)

    penalties_applied: list[Dict[str, Any]] = []
    score = 100
    if not source_trusted:
        score -= int(p["untrusted_source"])
        penalties_applied.append({"rule": "untrusted_source", "penalty": int(p["untrusted_source"])})
    if not calibrated:
        score -= int(p["uncalibrated_device"])
        penalties_applied.append({"rule": "uncalibrated_device", "penalty": int(p["uncalibrated_device"])})
    if not manual_signed:
        score -= int(p["unsigned_manual_input"])
        penalties_applied.append({"rule": "unsigned_manual_input", "penalty": int(p["unsigned_manual_input"])})
    if not proof_complete:
        score -= int(p["incomplete_proof"])
        penalties_applied.append({"rule": "incomplete_proof", "penalty": int(p["incomplete_proof"])})
    if override_detected:
        score -= int(p["override_detected"])
        penalties_applied.append({"rule": "override_detected", "penalty": int(p["override_detected"])})
    if abrupt_jump:
        score -= int(p["abrupt_jump_detected"])
        penalties_applied.append({"rule": "abrupt_jump_detected", "penalty": int(p["abrupt_jump_detected"])})

    score = max(0, min(100, score))
    trust_level = _level(score)
    needs_human_review = (not calibrated) or trust_level in {"low", "untrusted"}
    allow_auto_final = trust_level in {"high", "medium"}

    reasoning = [
        f"source_trusted={source_trusted}",
        f"device_calibrated={calibrated}",
        f"manual_signed={manual_signed}",
        f"proof_complete={proof_complete}",
        f"override_detected={override_detected}",
        f"abrupt_jump_detected={abrupt_jump}",
        f"trust_score={score}, trust_level={trust_level}",
    ]

    return {
        "trust_score_rules": rules,
        "trust_report_schema": trust_report_schema(),
        "trust_report": {
            "project_id": project_id,
            "trust_score": score,
            "trust_level": trust_level,
            "dimensions": {
                "source_trusted": source_trusted,
                "device_calibrated": calibrated,
                "manual_input_signed": manual_signed,
                "proof_complete": proof_complete,
                "override_detected": override_detected,
                "abrupt_jump_detected": abrupt_jump,
            },
            "penalties_applied": penalties_applied,
            "override_detected": override_detected,
            "needs_human_review": needs_human_review,
            "allow_auto_final_compliance": allow_auto_final,
            "reasoning": reasoning,
            "generated_at": _now(),
        },
    }


def _has_override(events: list[Dict[str, Any]]) -> bool:
    for row in events:
        if not isinstance(row, dict):
            continue
        if str(row.get("event_type") or "").strip().lower() == "manual_override":
            return True
    return False


def _has_abrupt_jump(values: list[float]) -> bool:
    if len(values) < 2:
        return False
    cleaned = [float(v) for v in values]
    diffs = [abs(cleaned[i] - cleaned[i - 1]) for i in range(1, len(cleaned))]
    avg = sum(abs(v) for v in cleaned) / max(1, len(cleaned))
    threshold = max(5.0, avg * 0.3)
    return any(d > threshold for d in diffs)


def _level(score: int) -> str:
    if score >= 85:
        return "high"
    if score >= 70:
        return "medium"
    if score >= 50:
        return "low"
    return "untrusted"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

