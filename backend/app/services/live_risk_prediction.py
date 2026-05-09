from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def risk_model_schema() -> Dict[str, Any]:
    return {
        "schema_id": "live_risk_prediction.v1",
        "inputs": [
            "historical_gate_results",
            "construction_phase",
            "sensor_data",
            "proof_missing",
            "manual_overrides",
        ],
        "outputs": [
            "predicted_failed_gates",
            "risk_score",
            "risk_reason",
            "suggested_prevention",
        ],
        "constraints": [
            "risk hint only; do not auto-judge gate failure",
            "all predictions must include confidence",
            "high-risk predictions should enter project risk board",
        ],
    }


def risk_explanation_fields() -> Dict[str, Any]:
    return {
        "fields": [
            "gate_id",
            "confidence",
            "risk_score",
            "risk_reason",
            "leading_signals",
            "suggested_prevention",
            "evidence",
        ],
        "evidence_fields": ["historical_fail_ratio", "sensor_anomaly_ratio", "proof_missing_count", "override_count", "construction_phase"],
    }


def predict_live_risk(
    *,
    project_id: str,
    historical_gate_results: list[Dict[str, Any]],
    construction_phase: str,
    sensor_data: list[Dict[str, Any]],
    proof_missing: list[Dict[str, Any]],
    manual_overrides: list[Dict[str, Any]],
) -> Dict[str, Any]:
    hist = [x for x in historical_gate_results if isinstance(x, dict)]
    sensor = [x for x in sensor_data if isinstance(x, dict)]
    missing = [x for x in proof_missing if isinstance(x, dict)]
    overrides = [x for x in manual_overrides if isinstance(x, dict)]

    gate_stats = _build_gate_stats(hist)
    anomaly_ratio = _sensor_anomaly_ratio(sensor)
    phase_factor = _phase_factor(construction_phase)
    missing_count = len(missing)
    override_count = len(overrides)

    predicted: list[Dict[str, Any]] = []
    for gate_id, stat in gate_stats.items():
        fail_ratio = stat["failed"] / max(1, stat["total"])
        risk_score_num = min(
            1.0,
            fail_ratio * 0.45
            + anomaly_ratio * 0.2
            + min(1.0, missing_count / 10.0) * 0.15
            + min(1.0, override_count / 10.0) * 0.1
            + phase_factor * 0.1,
        )
        confidence = min(0.99, 0.55 + stat["total"] * 0.03 + anomaly_ratio * 0.15)
        if risk_score_num < 0.35:
            continue
        predicted.append(
            {
                "gate_id": gate_id,
                "confidence": round(confidence, 4),
                "risk_score": round(risk_score_num, 4),
                "risk_reason": _reason(fail_ratio, anomaly_ratio, missing_count, override_count, construction_phase),
                "suggested_prevention": _prevention(fail_ratio, anomaly_ratio, missing_count, override_count),
                "leading_signals": {
                    "historical_fail_ratio": round(fail_ratio, 4),
                    "sensor_anomaly_ratio": round(anomaly_ratio, 4),
                    "proof_missing_count": missing_count,
                    "override_count": override_count,
                    "construction_phase": construction_phase,
                },
                "evidence": {
                    "historical_total": stat["total"],
                    "historical_failed": stat["failed"],
                },
                "prediction_note": "Risk hint only. This is not an automatic gate-fail decision.",
            }
        )

    predicted.sort(key=lambda x: (float(x.get("risk_score", 0)), float(x.get("confidence", 0))), reverse=True)
    global_risk_score = round(predicted[0]["risk_score"], 4) if predicted else 0.0
    high_risk_items = [x for x in predicted if float(x.get("risk_score", 0)) >= 0.75]

    return {
        "risk_model_schema": risk_model_schema(),
        "risk_explanation_fields": risk_explanation_fields(),
        "result": {
            "predicted_failed_gates": predicted,
            "risk_score": global_risk_score,
            "risk_reason": "Aggregated from historical failures, sensor anomalies, proof gaps, overrides, and phase factor.",
            "suggested_prevention": _global_prevention(predicted),
        },
        "project_risk_board": {
            "project_id": project_id,
            "high_risk_items": high_risk_items,
            "updated_at": _now(),
        },
        "policy": {
            "risk_hint_only": True,
            "auto_fail_decision_enabled": False,
        },
    }


def _build_gate_stats(rows: list[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    out: Dict[str, Dict[str, int]] = {}
    for row in rows:
        gid = str(row.get("gate_id") or row.get("gateId") or "unknown_gate").strip()
        passed = bool(row.get("passed", row.get("result") in {"PASS", "pass"}))
        stat = out.setdefault(gid, {"total": 0, "failed": 0})
        stat["total"] += 1
        if not passed:
            stat["failed"] += 1
    return out


def _sensor_anomaly_ratio(rows: list[Dict[str, Any]]) -> float:
    if not rows:
        return 0.0
    abnormal = 0
    for row in rows:
        if bool(row.get("anomaly", False)):
            abnormal += 1
    return abnormal / max(1, len(rows))


def _phase_factor(phase: str) -> float:
    p = phase.strip().lower()
    if p in {"critical", "pouring", "final_acceptance"}:
        return 1.0
    if p in {"mid", "structural"}:
        return 0.6
    return 0.3


def _reason(fail_ratio: float, anomaly_ratio: float, missing_count: int, override_count: int, phase: str) -> str:
    return (
        f"fail_ratio={fail_ratio:.2f}, sensor_anomaly_ratio={anomaly_ratio:.2f}, "
        f"proof_missing={missing_count}, overrides={override_count}, phase={phase}"
    )


def _prevention(fail_ratio: float, anomaly_ratio: float, missing_count: int, override_count: int) -> list[str]:
    out: list[str] = []
    if fail_ratio >= 0.4:
        out.append("Pre-check gate inputs and run dry-run evaluation before next execution.")
    if anomaly_ratio > 0.2:
        out.append("Investigate abnormal sensor streams and validate calibration status.")
    if missing_count > 0:
        out.append("Complete missing proofs and anchor evidence before critical operations.")
    if override_count > 0:
        out.append("Review override rationale and add reviewer sign-off checkpoints.")
    if not out:
        out.append("Continue monitoring; current risk signals are mild.")
    return out


def _global_prevention(predicted: list[Dict[str, Any]]) -> list[str]:
    if not predicted:
        return ["No high risk signal detected. Keep continuous monitoring."]
    return [
        "Focus on top-ranked risky gates in project risk board.",
        "Run preventive gate rehearsal with latest sensor and proof inputs.",
        "Escalate manual review for gates with frequent overrides.",
    ]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

